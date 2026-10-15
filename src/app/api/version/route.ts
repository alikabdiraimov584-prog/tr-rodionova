import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public, non-sensitive deployment marker.
 * Exposes only the short Git commit and build timestamp so external monitoring
 * can confirm that server-side auto-update has picked up the current main.
 * Never include environment variables, database state, or credentials here.
 */
export async function GET() {
  return NextResponse.json(
    {
      commit: process.env.GIT_SHA ?? "unknown",
      builtAt: process.env.BUILD_AT ?? null,
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
