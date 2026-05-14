import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const upstream = await fetch(
    `${BACKEND_URL}/api/conversations/${encodeURIComponent(id)}/messages`
  ).catch(() => null);
  if (!upstream?.ok) {
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const data = await upstream.text();
  return new Response(data, { status: 200, headers: { "Content-Type": "application/json" } });
}
