/**
 * @file ChatWidget — the core chat orchestrator component.
 *
 * Manages the full message lifecycle: user input → SSE streaming → rich-card
 * accumulation → persistence → follow-up suggestion generation.  Also handles
 * inactivity timeouts, demo triggers from the parent page, and the backend
 * health banner.
 *
 * Key design decisions documented inline:
 *   - messagesRef / inputRef avoid stale-closure captures inside useCallback.
 *   - sendingRef prevents double-sends from rapid clicks before React state settles.
 *   - justStoppedStreamingRef gates the post-stream side-effect so it runs once
 *     with the fully-accumulated message text rather than on every render.
 *   - Suggestion chips use event delegation (document click) so they work even
 *     when rendered inside the virtualisable MessageList scroll container.
 */

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { UIMessage, ChatMessage, RichCard, SaveMessage } from "@/lib/types";
import { streamChat, generateId, saveConversation } from "@/lib/api";
import MessageList from "./MessageList";
import InputBar from "./InputBar";

const WARN_MS = 3 * 60 * 1000;
const RESET_MS = 5 * 60 * 1000;

function generateSuggestions(messages: UIMessage[]): string[] {
  const lastAssistant = [...messages].reverse().find(
    (m) => m.role === "assistant" && !m.isStreaming
  );
  if (!lastAssistant) return [];

  const combinedText = messages.map((m) => m.text).join(" ");
  const lastText = lastAssistant.text.toLowerCase();

  const partNumbers = [...combinedText.matchAll(/\b(PS\d{5,})\b/gi)].map((m) => m[1]);
  const partNumber = partNumbers[partNumbers.length - 1];

  const modelPattern = /\b([A-Z]{2,4}[0-9]{3,4}[A-Z0-9]{3,8})\b/g;
  const models = [...combinedText.matchAll(modelPattern)]
    .map((m) => m[1])
    .filter((m) => !m.startsWith("PS") && !m.startsWith("WP"));
  const model = models[models.length - 1];

  const suggestions: string[] = [];

  if (partNumber) {
    if (!lastText.includes("install") && !lastText.includes("step")) {
      suggestions.push(`How do I install ${partNumber}?`);
    }
    if (model && !lastText.includes("compatib")) {
      suggestions.push(`Is ${partNumber} compatible with my ${model}?`);
    }
    if (suggestions.length < 2) {
      suggestions.push(`Where can I order ${partNumber}?`);
    }
  }

  if (lastText.includes("diagnos") || lastText.includes("symptom") || lastText.includes("cause") || lastText.includes("check")) {
    suggestions.push("What part do I need to replace?");
  }

  if ((lastText.includes("step") || lastText.includes("install") || lastText.includes("replac")) && suggestions.length < 3) {
    suggestions.push("What tools do I need?");
  }

  if (model && !partNumber) {
    suggestions.push(`What common parts fail on ${model}?`);
    suggestions.push(`Find replacement parts for ${model}`);
  }

  if (suggestions.length === 0) {
    suggestions.push("Can you help me find a specific part?");
    suggestions.push("What parts do you carry for dishwashers?");
  }

  return suggestions.slice(0, 3);
}

interface ChatWidgetProps {
  demoTrigger?: { text: string; id: number } | null;
  userId: string;
  initialMessages?: UIMessage[];
  initialSessionId?: string;
}

function buildTitle(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New conversation";
  return first.text.length > 60 ? first.text.slice(0, 60) + "…" : first.text;
}

export default function ChatWidget({ demoTrigger, userId, initialMessages, initialSessionId }: ChatWidgetProps) {
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingLabel, setStreamingLabel] = useState<string | undefined>();
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [backendOffline, setBackendOffline] = useState(false);
  const [detectedModel, setDetectedModel] = useState<string | undefined>();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const sessionId = useRef(initialSessionId ?? generateId());
  // Ref-based guard prevents two concurrent sendMessage calls — isStreaming is
  // React state (async) so two calls can both see false before the first one
  // sets it to true. A ref updates synchronously within the same microtask.
  const sendingRef = useRef(false);
  // Signals the post-stream useEffect to fire suggestion/model/persist logic
  // exactly once after streaming ends, using the freshly-rendered messages.
  const justStoppedStreamingRef = useRef(false);

  /**
   * Extract the most recent appliance model number from conversation history.
   *
   * Pattern: 2-4 uppercase letters + 3-4 digits + 3-8 alphanumeric chars
   * (e.g. WDT780SAEM1, WRS325SDHZ01).
   * PS-prefixed tokens (PartSelect part numbers) and WP-prefixed tokens
   * (Whirlpool OEM part numbers) are explicitly excluded to avoid false matches.
   */
  function extractModelFromHistory(msgs: UIMessage[]): string | undefined {
    const modelPattern = /\b([A-Z]{2,4}[0-9]{3,4}[A-Z0-9]{3,8})\b/g;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const matches = [...(msgs[i].text.matchAll(modelPattern))];
      // Filter PS/WP prefixes — those are part numbers, not appliance models.
      const model = matches.find((m) => !m[1].startsWith("PS") && !m[1].startsWith("WP"));
      if (model) return model[1];
    }
    return undefined;
  }

  // Keep a ref to messages so sendMessage always reads the current list
  // without needing to include `messages` in its useCallback dep array.
  const messagesRef = useRef<UIMessage[]>(messages);
  messagesRef.current = messages;

  // Keep a ref to input so sendMessage doesn't need `input` in its dep array.
  const inputRef = useRef(input);
  inputRef.current = input;

  // Health check on mount — show offline banner if FastAPI is unreachable or unhealthy.
  useEffect(() => {
    fetch("/api/health")
      .then((res) => { if (!res.ok) setBackendOffline(true); })
      .catch(() => setBackendOffline(true));
  }, []);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setTimeoutWarning(false);
  }, []);

  const persistSession = useCallback((msgs: UIMessage[]) => {
    if (!userId) return;
    const saveMsgs: SaveMessage[] = msgs
      .filter((m) => m.text.trim())
      .map((m) => ({ role: m.role, content: m.text, rich_cards: m.richCards }));
    if (saveMsgs.length < 2) return;
    saveConversation(sessionId.current, userId, buildTitle(msgs), saveMsgs);
  }, [userId]);

  // After streaming ends, React re-renders with the fully-accumulated message
  // text. This effect fires on that render (isStreaming just became false) and
  // reads the fresh `messages` from the closure — never a stale snapshot.
  useEffect(() => {
    if (!justStoppedStreamingRef.current || isStreaming) return;
    justStoppedStreamingRef.current = false;
    setDetectedModel(extractModelFromHistory(messages));
    setSuggestions(generateSuggestions(messages));
    persistSession(messages);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, messages]);

  const resetSession = useCallback(() => {
    persistSession(messagesRef.current);
    setMessages([]);
    setSuggestions([]);
    setTimeoutWarning(false);
    setDetectedModel(undefined);
    sessionId.current = generateId();
    lastActivityRef.current = Date.now();
  }, [persistSession]);

  useEffect(() => {
    const interval = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= RESET_MS) {
        resetSession();
      } else if (idle >= WARN_MS) {
        setTimeoutWarning(true);
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [resetSession]);

  const sendMessage = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? inputRef.current).trim();
    // Use a ref guard rather than isStreaming state — state updates are async
    // so two rapid calls can both see isStreaming===false and both proceed.
    if (!text || sendingRef.current) return;
    sendingRef.current = true;

    resetActivity();
    setSuggestions([]);

    // Only clear the controlled input when the user typed the message;
    // demo calls pass textOverride and manage state themselves.
    if (!textOverride) setInput("");
    setIsStreaming(true);
    setStreamingLabel("Thinking...");

    // Append user message
    const userMsg: UIMessage = {
      id: generateId(),
      role: "user",
      text,
      richCards: [],
      isStreaming: false,
    };
    setMessages((prev) => [...prev, userMsg]);

    // Build conversation history from the ref (avoids stale closure).
    const history: ChatMessage[] = [
      ...messagesRef.current
        .filter((m) => !m.isStreaming)
        .map((m) => ({ role: m.role, content: m.text })),
      { role: "user", content: text },
    ];

    const assistantId = generateId();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        text: "",
        richCards: [],
        isStreaming: true,
      },
    ]);

    const pendingRichCards: RichCard[] = [];

    try {
      for await (const event of streamChat(history, sessionId.current)) {
        if (event.type === "tool_call") {
          const label = event.label ?? `Using ${event.tool}...`;
          setStreamingLabel(label);
          // Accumulate completed steps for the reasoning breadcrumb
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, completedSteps: [...(m.completedSteps ?? []), label] }
                : m
            )
          );
        } else if (event.type === "token") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, text: m.text + event.content }
                : m
            )
          );
        } else if (event.type === "rich_content") {
          const newCard = { content_type: event.content_type, data: event.data };
          const existingIdx = pendingRichCards.findIndex(
            (c) => c.content_type === event.content_type
          );
          if (existingIdx >= 0) {
            pendingRichCards[existingIdx] = newCard;
          } else {
            pendingRichCards.push(newCard);
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, richCards: [...pendingRichCards] }
                : m
            )
          );
        } else if (event.type === "error") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    text:
                      event.message ||
                      "Something went wrong. Please try again.",
                  }
                : m
            )
          );
        } else if (event.type === "done") {
          break;
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                text: "I'm having trouble connecting right now. Please try again in a moment.",
              }
            : m
        )
      );
    } finally {
      sendingRef.current = false;
      // Use a functional update so React applies it on top of ALL previously
      // queued token/richCard updates — never on a stale messagesRef snapshot.
      // Reading messagesRef.current here would be stale: React hasn't re-rendered
      // yet with the accumulated tokens, so the snapshot would have text:"".
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
      );
      setIsStreaming(false);
      setStreamingLabel(undefined);
      setFocusTrigger((n) => n + 1);
      // Signal the post-stream effect to run suggestion/model/persist logic
      // once React has flushed and re-rendered with the final message text.
      justStoppedStreamingRef.current = true;
    }
  }, [isStreaming, resetActivity, persistSession]);

  // Event delegation: a single document-level listener handles all suggestion chip
  // clicks.  This avoids attaching per-chip handlers inside the scroll container
  // and ensures chips rendered after the effect mounts are also handled correctly.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const suggestion = target.closest("[data-suggestion]");
      if (suggestion) {
        const text = (suggestion as HTMLElement).dataset.suggestion ?? "";
        if (text && !isStreaming) {
          sendMessage(text);
        }
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [isStreaming, sendMessage]);

  // React to demo triggers from the parent page.  The effect depends on
  // demoTrigger?.id (not .text) so it fires even when the same query is selected
  // twice in a row.  The isStreaming guard prevents wiping an active conversation.
  useEffect(() => {
    if (!demoTrigger?.text || isStreaming) return;
    setMessages([]);
    sendMessage(demoTrigger.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoTrigger?.id]);

  return (
    <div className="flex flex-col h-full">
      {backendOffline && (
        <div
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium"
          style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
          role="alert"
        >
          <span>⚠</span>
          Backend offline — check that the server is running on port 8000.
        </div>
      )}

      {timeoutWarning && (
        <div
          className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
          style={{
            background: "rgba(212,168,83,0.08)",
            borderBottom: "1px solid rgba(212,168,83,0.2)",
          }}
          role="alert"
        >
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-amber)" }}>
              <path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 11.5A.875.875 0 108 9.75a.875.875 0 000 1.75z" clipRule="evenodd" />
            </svg>
            <span style={{ color: "var(--color-text-2)" }}>
              Still there? Your session will reset in 2 minutes due to inactivity.
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={resetActivity}
              className="px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200"
              style={{
                background: "rgba(212,168,83,0.15)",
                border: "1px solid rgba(212,168,83,0.3)",
                color: "var(--color-amber)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(212,168,83,0.25)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(212,168,83,0.15)"; }}
            >
              Keep chatting
            </button>
            <button
              onClick={resetSession}
              className="px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all duration-200"
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "var(--color-text-3)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-text-1)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-text-3)"; }}
            >
              Reset now
            </button>
          </div>
        </div>
      )}

      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        streamingLabel={streamingLabel}
        suggestions={suggestions}
      />
      <InputBar
        value={input}
        onChange={setInput}
        onSend={sendMessage}
        disabled={isStreaming}
        focusTrigger={focusTrigger}
        detectedModel={detectedModel}
      />
    </div>
  );
}
