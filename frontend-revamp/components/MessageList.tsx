/**
 * @file MessageList — scrollable container for all chat messages.
 *
 * Renders the welcome screen when the conversation is empty, or the ordered
 * list of MessageBubble components plus the TypingIndicator while streaming.
 * Follow-up suggestion chips are rendered at the bottom after streaming ends;
 * they carry data-suggestion attributes that ChatWidget's event-delegation
 * listener picks up to fire sends without prop drilling.
 */

"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "@/lib/types";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

interface MessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
  streamingLabel?: string;
  suggestions?: string[];
}

const WELCOME_SUGGESTIONS = [
  {
    text: "How do I install part PS11752778?",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
        <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 6.5A.75.75 0 012.75 10.5h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 11.25zM2 7.75A.75.75 0 012.75 7.5h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 8.25z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    text: "Is part PS11752778 compatible with WDT780SAEM1?",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
        <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 01.208 1.04l-5 7.5a.75.75 0 01-1.154.114l-3-3a.75.75 0 011.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 011.04-.207z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    text: "My Whirlpool fridge ice maker isn't working",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
        <path fillRule="evenodd" d="M8.75 1a.75.75 0 00-1.5 0v1.69L6.22 1.66a.75.75 0 00-1.06 1.06L6.44 4H4.75A.75.75 0 004 4.75v.5a.75.75 0 00.75.75h.5v1.19L3.97 8.47a.75.75 0 001.06 1.06L6 8.56V9.5h-.75A.75.75 0 004.5 10.25v.5a.75.75 0 00.75.75H6v1.69l-1.28 1.28a.75.75 0 001.06 1.06L7 14.31V15a.75.75 0 001.5 0v-.69l1.22 1.22a.75.75 0 001.06-1.06L9.5 13.19V11.5h.75a.75.75 0 00.75-.75v-.5a.75.75 0 00-.75-.75H9.5V8.56l.97.97a.75.75 0 001.06-1.06L10.25 7.19V6h.5a.75.75 0 00.75-.75v-.5A.75.75 0 0011.25 4H9.56l1.28-1.28A.75.75 0 009.78 1.66L8.75 2.69V1z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    text: "What parts does my WRS325SDHZ01 need?",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
        <path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
        <path fillRule="evenodd" d="M1.38 8a6.62 6.62 0 1113.24 0A6.62 6.62 0 011.38 8zM8 3a5 5 0 100 10A5 5 0 008 3z" clipRule="evenodd" />
      </svg>
    ),
  },
];

const CAPABILITIES = [
  { label: "Part lookup", desc: "Search by PS or model number" },
  { label: "Compatibility", desc: "Check if a part fits your appliance" },
  { label: "Installation", desc: "Step-by-step repair guidance" },
  { label: "Diagnosis", desc: "Symptom → likely parts" },
];

export default function MessageList({ messages, isStreaming, streamingLabel, suggestions = [] }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to the invisible sentinel div at the end of the list whenever a new
  // message arrives or streaming state changes, keeping the latest content visible.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const showWelcome = messages.length === 0 && !isStreaming;

  return (
    <div
      className="flex-1 overflow-y-auto"
      role="log"
      aria-live="polite"
      style={{ background: "var(--color-bg)" }}
    >
      {showWelcome ? (
        <div className="flex flex-col items-center justify-center min-h-full px-4 sm:px-6 py-8 sm:py-12 text-center gap-6 sm:gap-8">

          {/* Ambient orb + PS mark */}
          <div className="flex flex-col items-center gap-5">
            <div className="relative">
              {/* Animated glow orb */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: "120px",
                  height: "120px",
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(212,168,83,0.35) 0%, rgba(42,159,163,0.15) 50%, transparent 75%)",
                  filter: "blur(24px)",
                  animation: "glow-float 6s ease-in-out infinite",
                  pointerEvents: "none",
                }}
              />
              {/* PS mark */}
              <div
                className="relative w-16 h-16 rounded-2xl flex items-center justify-center font-bold select-none"
                style={{
                  background: "linear-gradient(135deg, #d4a853 0%, #e8c070 55%, #c9993a 100%)",
                  boxShadow: "0 4px 32px rgba(212,168,83,0.4), 0 0 0 1px rgba(212,168,83,0.3)",
                  color: "#0d0f14",
                  fontFamily: "var(--font-display)",
                  fontSize: "22px",
                  fontStyle: "italic",
                  letterSpacing: "-0.02em",
                }}
              >
                PS
              </div>
            </div>

            {/* Headlines */}
            <div className="stagger-1 animate-slide-up">
              <h2
                className="text-2xl sm:text-3xl font-bold mb-2 leading-tight"
                style={{
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                  color: "var(--color-text-1)",
                  letterSpacing: "-0.02em",
                }}
              >
                Your appliance parts expert
              </h2>
              <p className="text-sm font-medium" style={{ color: "var(--color-text-2)" }}>
                Refrigerators &amp; dishwashers — parts, compatibility &amp; repair
              </p>
            </div>
          </div>

          {/* Capability chips */}
          <div className="flex flex-wrap justify-center gap-2 max-w-md stagger-2 animate-slide-up">
            {CAPABILITIES.map((cap) => (
              <div
                key={cap.label}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  background: "rgba(212,168,83,0.08)",
                  border: "1px solid rgba(212,168,83,0.18)",
                  color: "var(--color-amber)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: "var(--color-amber)" }}
                />
                {cap.label}
              </div>
            ))}
          </div>

          {/* Suggestion prompts */}
          <div className="w-full max-w-lg stagger-3 animate-slide-up">
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "var(--color-text-4)" }}
            >
              Try asking
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {WELCOME_SUGGESTIONS.map((s, i) => (
                <button
                  key={s.text}
                  className="flex items-start gap-2.5 text-left px-3.5 py-3 rounded-xl text-sm cursor-pointer transition-all duration-200"
                  style={{
                    background: "rgba(26,24,32,0.7)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    color: "var(--color-text-2)",
                    backdropFilter: "blur(8px)",
                    animationDelay: `${i * 60 + 200}ms`,
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "rgba(212,168,83,0.3)";
                    el.style.color = "var(--color-amber)";
                    el.style.background = "rgba(212,168,83,0.08)";
                    el.style.boxShadow = "0 4px 16px rgba(0,0,0,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "rgba(255,255,255,0.07)";
                    el.style.color = "var(--color-text-2)";
                    el.style.background = "rgba(26,24,32,0.7)";
                    el.style.boxShadow = "none";
                  }}
                  data-suggestion={s.text}
                >
                  <span style={{ color: "var(--color-amber)", opacity: 0.8, marginTop: "1px" }}>
                    {s.icon}
                  </span>
                  <span className="leading-snug">{s.text}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Fine print */}
          <p
            className="text-xs font-medium px-3 py-1.5 rounded-full"
            style={{
              color: "var(--color-amber)",
              background: "rgba(212,168,83,0.1)",
              border: "1px solid rgba(212,168,83,0.22)",
            }}
          >
            Scoped to refrigerators &amp; dishwashers only
          </p>
        </div>
      ) : (
        <div className="py-4 space-y-0.5">
          {messages.map((msg) => {
            // Skip the empty streaming shell — TypingIndicator fills that slot
            if (msg.isStreaming && !msg.text && msg.richCards.length === 0) return null;
            return <MessageBubble key={msg.id} message={msg} />;
          })}
          {isStreaming && !messages.some((m) => m.isStreaming && m.richCards.length > 0) && (
            <TypingIndicator
              label={streamingLabel ?? "Thinking..."}
              completedSteps={
                [...messages].reverse().find(
                  (m) => m.isStreaming && m.role === "assistant"
                )?.completedSteps
              }
            />
          )}

          {/* Follow-up suggestion chips */}
          {!isStreaming && suggestions.length > 0 && (
            <div className="px-3 sm:px-4 pt-2 pb-1">
              <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text-4)" }}>
                Suggested follow-ups
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    data-suggestion={s}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all duration-200"
                    style={{
                      background: "rgba(26,24,32,0.7)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "var(--color-text-2)",
                      backdropFilter: "blur(8px)",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = "rgba(212,168,83,0.4)";
                      el.style.color = "var(--color-amber)";
                      el.style.background = "rgba(212,168,83,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = "rgba(255,255,255,0.1)";
                      el.style.color = "var(--color-text-2)";
                      el.style.background = "rgba(26,24,32,0.7)";
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 flex-shrink-0 opacity-60">
                      <path d="M6 1a.5.5 0 01.5.5v3H10a.5.5 0 010 1H6.5v3a.5.5 0 01-1 0v-3H2a.5.5 0 010-1h3.5v-3A.5.5 0 016 1z" />
                    </svg>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
