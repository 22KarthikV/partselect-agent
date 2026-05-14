import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const upstream = await fetch(
    `${BACKEND_URL}/api/conversations?user_id=${encodeURIComponent(userId)}`
  ).catch(() => null);
  if (!upstream?.ok) {
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const data = await upstream.text();
  return new Response(data, { status: 200, headers: { "Content-Type": "application/json" } });
}
