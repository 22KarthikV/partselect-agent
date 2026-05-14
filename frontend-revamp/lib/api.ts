import type { ChatMessage, ConversationSummary, RichCard, SSEEvent, SaveMessage, UIMessage } from "./types";

/**
 * Stream a chat request to the Next.js proxy route and yield parsed SSE events.
 *
 * Usage:
 *   for await (const event of streamChat(messages)) {
 *     // handle event
 *   }
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

      // SSE lines are separated by \n\n
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? ""; // last element may be incomplete

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

export async function fetchConversations(userId: string): Promise<ConversationSummary[]> {
  try {
    const res = await fetch(`/api/conversations?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

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
