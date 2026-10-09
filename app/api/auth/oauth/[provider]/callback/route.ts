import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { createSession } from "@/lib/session";
import { getAppOrigin } from "@/lib/appUrl";
import { findClientsByEmail, generateUserId, trialDates } from "@/lib/clientAccounts";
import { OAUTH_STATE_COOKIE, fetchProfile, isConfigured, isProvider } from "@/lib/oauth";

async function complete(
  request: Request,
  providerParam: string,
  input: { code?: string | null; state?: string | null; error?: string | null }
) {
  const origin = process.env.APP_URL ? getAppOrigin() : new URL(request.url).origin;
  const go = (path: string) => NextResponse.redirect(new URL(path, origin), 303);
  const fail = (code: string) => go(`/login?error=${code}`);

  if (!isProvider(providerParam) || !isConfigured(providerParam)) return fail("oauth_unknown");
  const provider = providerParam;

  const store = await cookies();
  const raw = store.get(OAUTH_STATE_COOKIE)?.value;
  store.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth/oauth" });
  let saved: { state: string } | null = null;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {}

  if (input.error) return fail("oauth_cancelled");
  if (!input.code || !input.state || !saved || saved.state !== input.state) return fail("oauth_state");

  let profile;
  try {
    profile = await fetchProfile(provider, input.code, origin);
  } catch (err) {
    console.error(`[oauth:${provider}]`, err);
    return fail("oauth_failed");
  }

  // 1) Already linked → straight in.
  const linked = await prisma.oAuthIdentity.findUnique({
    where: { provider_providerUserId: { provider, providerUserId: profile.id } },
    include: { client: true },
  });
  let client = linked?.client ?? null;

  if (!client) {
    if (!profile.email || !profile.emailVerified) return fail("oauth_no_email");
    // 2) Same verified email as an existing account → link to it.
    const sameEmail = await findClientsByEmail(profile.email);
    if (sameEmail.length > 1) return fail("oauth_email_ambiguous");
    client = sameEmail[0] ?? null;

    // 3) Otherwise create a fresh trial account.
    if (!client) {
      const local = profile.email.split("@")[0];
      client = await prisma.client.create({
        data: {
          name: profile.name?.trim() || local,
          userId: await generateUserId(local),
          // Nobody knows this; they can set a real one via "Forgot password".
          passwordHash: await hashPassword(randomBytes(24).toString("hex")),
          email: profile.email,
          phone: "",
          ...trialDates(),
          status: "active",
          plan: "Free Trial",
        },
      });
    }
    await prisma.oAuthIdentity.create({
      data: { provider, providerUserId: profile.id, clientId: client.id, email: profile.email },
    });
  }

  if (client.status === "suspended") return fail("suspended");
  await createSession(client.id, true);
  return go("/dashboard");
}

export async function GET(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const q = new URL(request.url).searchParams;
  return complete(request, provider, { code: q.get("code"), state: q.get("state"), error: q.get("error") });
}
