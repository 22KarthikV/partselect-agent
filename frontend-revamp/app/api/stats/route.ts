import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(_req: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/stats`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Backend error" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Backend unreachable" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}
