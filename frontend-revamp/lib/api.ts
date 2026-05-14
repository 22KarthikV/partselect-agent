/**
 * @file API client for the PartSelect AI chat frontend.
 *
 * All network calls go through the Next.js route handlers (/api/*) rather than
 * directly to the FastAPI backend.  This keeps the backend URL server-side only
 * and lets Vercel handle CORS automatically.
 */

import type { ChatMessage, ConversationSummary, RichCard, SSEEvent, SaveMessage, UIMessage } from "./types";

/**
 * Stream a chat request to the Next.js proxy route and yield parsed SSE events.
 *
 * The function opens a POST request and reads the response body as a
 * ReadableStream.  Chunks are decoded and accumulated in a string buffer.
 * Complete SSE messages (delimited by \n\n) are parsed and yielded one at a
 * time; the generator exits early when a "done" event is received.
 *
 * @param messages - Full conversation history to send as context.
 * @param sessionId - Opaque ID used by the backend to correlate turns within a session.
 * @yields Parsed {@link SSEEvent} objects in the order they arrive from the server.
 * @throws {Error} If the HTTP request fails or the response body is absent.
 */
export async function* streamChat(
  messages: ChatMessage[],
  sessionId: string = ""
): AsyncGenerator<SSEEvent> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, session_id: sessionId }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`Chat request failed (${response.status}): ${text}`);
  }

  if (!response.body) {
    throw new Error("No response body received from server");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by \n\n — split on that boundary.
      const lines = buffer.split("\n\n");
      // The last element is kept in the buffer because it may be an incomplete frame.
      buffer = lines.pop() ?? "";

      for (const chunk of lines) {
        const line = chunk.trim();
        if (!line.startsWith("data: ")) continue;

        const json = line.slice("data: ".length);
        try {
          const event = JSON.parse(json) as SSEEvent;
          yield event;
          if (event.type === "done") return;
        } catch {
          // skip malformed lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Generate a cryptographically unique ID for UI messages. */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Fetch the list of saved conversations for the given user.
 * Returns an empty array on any network or HTTP error so callers never need
 * to handle a rejection.
 *
 * @param userId - Client-side UUID stored in localStorage.
 */
export async function fetchConversations(userId: string): Promise<ConversationSummary[]> {
  try {
    const res = await fetch(`/api/conversations?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/**
 * Load all messages for a previously saved conversation and convert them to
 * UIMessage objects suitable for direct insertion into component state.
 *
 * @param convId - The conversation UUID.
 */
export async function fetchConversationMessages(convId: string): Promise<UIMessage[]> {
  try {
    const res = await fetch(`/api/conversations/${encodeURIComponent(convId)}/messages`);
    if (!res.ok) return [];
    const records: { id: string; role: "user" | "assistant"; content: string; rich_cards?: RichCard[] }[] = await res.json();
    return records.map((r) => ({
      id: r.id,
      role: r.role,
      text: r.content,
      richCards: r.rich_cards ?? [],
      isStreaming: false,
    }));
  } catch {
    return [];
  }
}

/**
 * Persist a completed conversation to the backend.  Failures are swallowed
 * intentionally — persistence is best-effort and must never interrupt the UI.
 *
 * @param sessionId - Session UUID used as the conversation's stable identifier.
 * @param userId - Client-side user UUID.
 * @param title - Human-readable title derived from the first user message.
 * @param messages - The serialisable form of all messages to store.
 */
export async function saveConversation(
  sessionId: string,
  userId: string,
  title: string,
  messages: SaveMessage[]
): Promise<void> {
  try {
    await fetch(`/api/conversations/${encodeURIComponent(sessionId)}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, title, messages }),
    });
  } catch {
    // best-effort — never block the UI
  }
}
