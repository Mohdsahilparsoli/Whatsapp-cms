import "server-only";

export type OAuthProvider = "google" | "facebook";
export const OAUTH_PROVIDERS: OAuthProvider[] = ["google", "facebook"];
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
    const id = process.env.FACEBOOK_APP_ID || process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID;
    const secret = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET;
    return id && secret ? { id, secret } : null;
  }
  return null;
}

export function isConfigured(provider: OAuthProvider) {
  return creds(provider) !== null;
}

export function callbackUrl(origin: string, provider: OAuthProvider) {
  return `${origin}/api/auth/oauth/${provider}/callback`;
}

export function authorizeUrl(provider: OAuthProvider, origin: string, state: string) {
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
  throw new Error("unsupported provider");
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

/** Providers whose keys are set, in display order. */
export function configuredProviders(): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter(isConfigured);
}

/** Exchanges the authorization code and returns who the user is. Throws on
 * any problem — callers turn that into a generic sign-in error. */
export async function fetchProfile(
  provider: OAuthProvider,
  code: string,
  origin: string
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

  throw new Error("unsupported provider");
}
