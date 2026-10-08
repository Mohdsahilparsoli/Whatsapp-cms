import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Simple public health-check endpoint — hit it directly in a browser to
 * confirm the deployed backend can actually reach the real Postgres
 * database, not just that the app booted. Runs a trivial `SELECT 1` through
 * Prisma; if that succeeds, the connection is genuinely live.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "connected",
      message: "Database connection successful.",
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        message: "Could not connect to the database.",
        error: err instanceof Error ? err.message : String(err),
        checkedAt: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
