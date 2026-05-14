import { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? "http://localhost:8000";

// Validate that the body has the expected shape before forwarding.
// This guards against request-smuggling and oversized payloads.
function isValidChatBody(body: unknown): body is { messages: { role: string; content: string }[]; session_id?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.messages)) return false;
  if (b.messages.length === 0 || b.messages.length > 200) return false;
  for (const msg of b.messages) {
    if (!msg || typeof msg !== "object") return false;
    const m = msg as Record<string, unknown>;
    if (m.role !== "user" && m.role !== "assistant") return false;
    if (typeof m.content !== "string" || m.content.length > 20_000) return false;
  }
  if ("session_id" in b && typeof b.session_id !== "string") return false;
  return true;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isValidChatBody(body)) {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }

  const upstream = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text, { status: upstream.status });
  }

  // Pass the SSE stream straight through to the browser
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
