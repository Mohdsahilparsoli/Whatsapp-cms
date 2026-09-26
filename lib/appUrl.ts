import "server-only";

/**
 * Prefers APP_URL from .env (set this to your real public URL once you have
 * one — e.g. https://app.growvika.com or the Vercel URL). Falls back to
 * Vercel's own auto-provided VERCEL_URL when deployed there without APP_URL
 * set, then to localhost for local dev (media links built from that won't
 * actually be fetchable by Meta, same known limitation documented
 * everywhere else media is sent from this app).
 */
export function getAppOrigin(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
