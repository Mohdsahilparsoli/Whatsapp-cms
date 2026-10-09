import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAppOrigin } from "@/lib/appUrl";
import { OAUTH_STATE_COOKIE, authorizeUrl, isConfigured, isProvider } from "@/lib/oauth";

/** Starts "Continue with Google / Facebook / Apple". */
export async function GET(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const origin = process.env.APP_URL ? getAppOrigin() : new URL(request.url).origin;
  const back = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, origin));

  if (!isProvider(provider)) return back("oauth_unknown");
  if (!isConfigured(provider)) return back(`oauth_not_configured_${provider}`);

  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(provider, origin, state));
  const prod = process.env.NODE_ENV === "production";
  res.cookies.set(OAUTH_STATE_COOKIE, JSON.stringify({ state }), {
    httpOnly: true,
    secure: prod,
    sameSite: "lax",
    path: "/api/auth/oauth",
    maxAge: 600,
  });
  return res;
}
