/**
 * @file Next.js Route Handler — GET /api/health
 *
 * Proxies a health-check request to the FastAPI backend and returns the result
 * to the client.  The ChatWidget polls this endpoint on mount to decide whether
 * to show the "backend offline" banner.  Using a proxy rather than a direct
 * browser call keeps the backend URL server-side and avoids CORS issues.
 */

import { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * Forward a health-check to the FastAPI backend and relay the JSON response.
 *
 * @param req - The incoming Next.js GET request (unused but required by the signature).
 * @returns JSON with the backend's health payload, or { status: "error" } on failure.
 */
export async function GET(req: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ status: "error" }), {
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
    return new Response(JSON.stringify({ status: "error", message: "Backend unreachable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}
