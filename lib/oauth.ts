import "server-only";
import { createPrivateKey, sign } from "node:crypto";

export type OAuthProvider = "google" | "facebook" | "apple";
export const OAUTH_PROVIDERS: OAuthProvider[] = ["google", "facebook", "apple"];
export const OAUTH_STATE_COOKIE = "wacms.oauth";

export interface OAuthProfile {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export function isProvider(v: string): v is OAuthProvider {
  return (OAUTH_PROVIDERS as string[]).includes(v);
}

const FB_VERSION = "v25.0";

/** Facebook Login reuses the Meta app already used for WhatsApp. */
function creds(provider: OAuthProvider) {
  if (provider === "google") {
    const id = process.env.GOOGLE_CLIENT_ID;
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    return id && secret ? { id, secret } : null;
  }
  if (provider === "facebook") {
    const id = process.env.FACEBOOK_APP_ID ?? process.env.META_APP_ID ?? process.env.NEXT_PUBLIC_META_APP_ID;
    const secret = process.env.FACEBOOK_APP_SECRET ?? process.env.META_APP_SECRET;
    return id && secret ? { id, secret } : null;
  }
  const id = process.env.APPLE_CLIENT_ID;
  const ok = id && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY;
  return ok ? { id: id!, secret: "" } : null;
}

export function isConfigured(provider: OAuthProvider) {
  return creds(provider) !== null;
}

export function callbackUrl(origin: string, provider: OAuthProvider) {
  return `${origin}/api/auth/oauth/${provider}/callback`;
}

export function authorizeUrl(provider: OAuthProvider, origin: string, state: string, nonce: string) {
  const c = creds(provider)!;
  const redirect_uri = callbackUrl(origin, provider);
  const p = new URLSearchParams({ client_id: c.id, redirect_uri, response_type: "code", state });
  if (provider === "google") {
    p.set("scope", "openid email profile");
    p.set("prompt", "select_account");
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  }
  if (provider === "facebook") {
    p.set("scope", "email,public_profile");
    return `https://www.facebook.com/${FB_VERSION}/dialog/oauth?${p}`;
  }
  p.set("scope", "name email");
  p.set("response_mode", "form_post");
  p.set("nonce", nonce);
  return `https://appleid.apple.com/auth/authorize?${p}`;
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

/** Apple wants a short-lived JWT signed (ES256) with your .p8 key as the
 * client secret. */
function appleClientSecret(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: process.env.APPLE_KEY_ID }));
  const payload = b64url(
    JSON.stringify({
      iss: process.env.APPLE_TEAM_ID,
      iat: now,
      exp: now + 300,
      aud: "https://appleid.apple.com",
      sub: process.env.APPLE_CLIENT_ID,
    })
  );
  const key = createPrivateKey(process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n"));
  const sig = sign("sha256", Buffer.from(`${header}.${payload}`), { key, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${b64url(sig)}`;
}

async function postForm(url: string, params: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  return json as Record<string, string>;
}

/** Exchanges the authorization code and returns who the user is. Throws on
 * any problem — callers turn that into a generic sign-in error. */
export async function fetchProfile(
  provider: OAuthProvider,
  code: string,
  origin: string,
  nonce: string,
  appleUser?: string | null
): Promise<OAuthProfile> {
  const c = creds(provider)!;
  const redirect_uri = callbackUrl(origin, provider);

  if (provider === "google") {
    const t = await postForm("https://oauth2.googleapis.com/token", {
      code, client_id: c.id, client_secret: c.secret, redirect_uri, grant_type: "authorization_code",
    });
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${t.access_token}` },
    });
    const u = await res.json();
    if (!res.ok || !u.sub) throw new Error("google userinfo failed");
    return { id: u.sub, email: u.email ?? null, emailVerified: u.email_verified === true, name: u.name ?? null };
  }

  if (provider === "facebook") {
    const tokenUrl = new URL(`https://graph.facebook.com/${FB_VERSION}/oauth/access_token`);
    tokenUrl.search = new URLSearchParams({ client_id: c.id, client_secret: c.secret, redirect_uri, code }).toString();
    const tr = await fetch(tokenUrl);
    const t = await tr.json();
    if (!tr.ok || !t.access_token) throw new Error("facebook token failed");
    const me = await fetch(
      `https://graph.facebook.com/${FB_VERSION}/me?fields=id,name,email&access_token=${encodeURIComponent(t.access_token)}`
    );
    const u = await me.json();
    if (!me.ok || !u.id) throw new Error("facebook profile failed");
    // Facebook only returns an email it has already confirmed.
    return { id: u.id, email: u.email ?? null, emailVerified: Boolean(u.email), name: u.name ?? null };
  }

  const t = await postForm("https://appleid.apple.com/auth/token", {
    code, client_id: c.id, client_secret: appleClientSecret(), redirect_uri, grant_type: "authorization_code",
  });
  // Received straight from Apple over TLS, so per OpenID Core §3.1.3.7 the
  // signature check can be skipped; we still check issuer, audience, nonce.
  const claims = JSON.parse(Buffer.from(String(t.id_token).split(".")[1], "base64url").toString());
  if (claims.iss !== "https://appleid.apple.com" || claims.aud !== c.id || claims.nonce !== nonce) {
    throw new Error("apple id_token mismatch");
  }
  let name: string | null = null;
  try {
    const n = appleUser ? JSON.parse(appleUser)?.name : null;
    if (n) name = [n.firstName, n.lastName].filter(Boolean).join(" ") || null;
  } catch {}
  return {
    id: claims.sub,
    email: claims.email ?? null,
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    name,
  };
}
