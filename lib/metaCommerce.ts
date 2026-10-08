import "server-only";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";

/**
 * Meta-side lookups for the two "rich" WhatsApp features the Inbox can send:
 *
 *  - Catalog products (WhatsApp Commerce): the product catalog connected to
 *    the client's WhatsApp Business Account, so an agent can send a product
 *    card or a multi-product message.
 *  - WhatsApp Flows: in-chat forms/mini-apps built in Meta's Flow Builder.
 *    This app lists and SENDS existing flows and shows the customer's answers
 *    in the thread; building a flow's screens still happens in Meta's builder.
 *
 * Both need extra Meta permissions on the client's access token
 * (catalog_management for products, whatsapp_business_management for
 * flows) and a catalog / published flow to exist on their WABA — when that's
 * missing the functions return Meta's own message instead of failing opaquely.
 */

interface GraphError {
  error?: { message?: string; code?: number };
}

async function graphGet<T>(url: string, accessToken: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = (await res.json().catch(() => ({}))) as T & GraphError;
    if (!res.ok) return { ok: false, error: data.error?.message ?? `Meta returned ${res.status}.` };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Could not reach Meta's API." };
  }
}

export interface CatalogProduct {
  /** Meta's retailer id for the product — what a product message references. */
  retailerId: string;
  name: string;
  price: string | null;
  imageUrl: string | null;
  availability: string | null;
}

export type CatalogOutcome =
  | { ok: true; catalogId: string; catalogName: string | null; products: CatalogProduct[] }
  | { ok: false; error: string; status: number };

export async function listCatalogProducts(clientId: string): Promise<CatalogOutcome> {
  const credentials = await getWhatsAppCredentials(clientId);
  if (!credentials) {
    return { ok: false, status: 400, error: "No WhatsApp number available — connect one in WhatsApp Account Setup first." };
  }
  if (!credentials.wabaId) {
    return { ok: false, status: 400, error: "Catalog needs your WhatsApp Business Account ID — reconnect your account in WhatsApp Account Setup." };
  }

  const catalogs = await graphGet<{ data?: { id: string; name?: string }[] }>(
    `https://graph.facebook.com/v25.0/${credentials.wabaId}/product_catalogs?fields=id,name`,
    credentials.accessToken
  );
  if (!catalogs.ok) {
    return { ok: false, status: 502, error: `Could not load your catalog from Meta: ${catalogs.error}` };
  }
  const catalog = catalogs.data.data?.[0];
  if (!catalog) {
    return {
      ok: false,
      status: 404,
      error:
        "No product catalog is connected to your WhatsApp Business Account. Connect one in Meta Business Manager (Commerce Manager → Catalog → WhatsApp Business Account) and try again.",
    };
  }

  const products = await graphGet<{
    data?: { retailer_id?: string; name?: string; price?: string; image_url?: string; availability?: string }[];
  }>(
    `https://graph.facebook.com/v25.0/${catalog.id}/products?fields=retailer_id,name,price,image_url,availability&limit=100`,
    credentials.accessToken
  );
  if (!products.ok) {
    return { ok: false, status: 502, error: `Could not load products from your catalog: ${products.error}` };
  }

  return {
    ok: true,
    catalogId: catalog.id,
    catalogName: catalog.name ?? null,
    products: (products.data.data ?? [])
      .filter((p) => p.retailer_id)
      .map((p) => ({
        retailerId: p.retailer_id!,
        name: p.name ?? p.retailer_id!,
        price: p.price ?? null,
        imageUrl: p.image_url ?? null,
        availability: p.availability ?? null,
      })),
  };
}

export interface FlowSummary {
  id: string;
  name: string;
  /** DRAFT | PUBLISHED | DEPRECATED | BLOCKED | THROTTLED */
  status: string;
  categories: string[];
}

export type FlowsOutcome = { ok: true; flows: FlowSummary[] } | { ok: false; error: string; status: number };

export async function listFlows(clientId: string): Promise<FlowsOutcome> {
  const credentials = await getWhatsAppCredentials(clientId);
  if (!credentials) {
    return { ok: false, status: 400, error: "No WhatsApp number available — connect one in WhatsApp Account Setup first." };
  }
  if (!credentials.wabaId) {
    return { ok: false, status: 400, error: "Flows need your WhatsApp Business Account ID — reconnect your account in WhatsApp Account Setup." };
  }

  const res = await graphGet<{ data?: { id: string; name?: string; status?: string; categories?: string[] }[] }>(
    `https://graph.facebook.com/v25.0/${credentials.wabaId}/flows?fields=id,name,status,categories&limit=100`,
    credentials.accessToken
  );
  if (!res.ok) return { ok: false, status: 502, error: `Could not load your Flows from Meta: ${res.error}` };

  return {
    ok: true,
    flows: (res.data.data ?? [])
      // A deprecated/blocked flow can't be sent, so don't offer it.
      .filter((f) => ["PUBLISHED", "DRAFT", "THROTTLED"].includes((f.status ?? "").toUpperCase()))
      .map((f) => ({
        id: f.id,
        name: f.name ?? f.id,
        status: (f.status ?? "").toUpperCase(),
        categories: f.categories ?? [],
      })),
  };
}

/**
 * The id of a flow's first screen — Meta requires it as
 * flow_action_payload.screen when a flow is sent with the default
 * "navigate" action. Read from the flow's own JSON asset.
 */
export async function getFlowFirstScreen(
  clientId: string,
  flowId: string
): Promise<{ ok: true; screen: string } | { ok: false; error: string }> {
  const credentials = await getWhatsAppCredentials(clientId);
  if (!credentials) return { ok: false, error: "No WhatsApp number available." };

  const assets = await graphGet<{ data?: { asset_type?: string; download_url?: string }[] }>(
    `https://graph.facebook.com/v25.0/${flowId}/assets`,
    credentials.accessToken
  );
  if (!assets.ok) return { ok: false, error: `Could not read the Flow from Meta: ${assets.error}` };

  const flowJson = assets.data.data?.find((a) => a.asset_type === "FLOW_JSON");
  if (!flowJson?.download_url) return { ok: false, error: "That Flow has no screens yet — finish building it in Meta's Flow Builder." };

  try {
    const res = await fetch(flowJson.download_url);
    const json: { screens?: { id?: string }[] } = await res.json();
    const screen = json.screens?.[0]?.id;
    if (!screen) return { ok: false, error: "That Flow has no screens yet — finish building it in Meta's Flow Builder." };
    return { ok: true, screen };
  } catch {
    return { ok: false, error: "Could not read the Flow's screens from Meta." };
  }
}
