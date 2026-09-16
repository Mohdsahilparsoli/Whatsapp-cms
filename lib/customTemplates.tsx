"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { templates as metaTemplates } from "@/data/campaigns";
import { clientIdFor, useAuth } from "@/lib/auth";
import { startOfToday, toISODate } from "@/lib/utils";
import type { CustomTemplate, TemplateView } from "@/types";

const STORAGE_KEY = "wacms.demo.customTemplates";

/**
 * Seed custom templates. Note the two owners — c6 is the demo login and c1 is a
 * different client, which is what proves templates are not shared across
 * clients in the Templates page and the Bulk Message Sender.
 */
function seedTemplates(): CustomTemplate[] {
  const today = toISODate(startOfToday());
  return [
    {
      id: "custom-1",
      clientId: "c6",
      name: "diwali_store_invite",
      language: "English",
      category: "Marketing",
      status: "custom",
      header: "You're invited",
      body: "Hi {{1}}, our Diwali showcase opens on {{2}} at our {{3}} store. Walk in for an exclusive preview and a welcome gift.",
      footer: "Reply STOP to opt out",
      media: {
        kind: "image",
        url: "https://example.com/demo/diwali-invite.jpg",
      },
      buttons: [
        {
          id: "b1",
          kind: "url",
          label: "View collection",
          url: "https://example.com/diwali",
        },
        {
          id: "b2",
          kind: "whatsapp",
          label: "Chat with us",
          url: "https://wa.me/919000000000",
        },
      ],
      variables: ["Customer name", "Event date", "Store location"],
      createdAt: today,
      updatedAt: today,
    },
    {
      id: "custom-2",
      clientId: "c6",
      name: "loyalty_points_update",
      language: "English",
      category: "Utility",
      status: "draft",
      body: "Hi {{1}}, you now have {{2}} loyalty points. Redeem them on your next order.",
      media: { kind: "none", url: "" },
      buttons: [],
      variables: ["Customer name", "Points balance"],
      createdAt: today,
      updatedAt: today,
    },
    {
      id: "custom-3",
      clientId: "c1",
      name: "sharma_service_reminder",
      language: "English",
      category: "Utility",
      status: "custom",
      body: "Hi {{1}}, your appliance service is due on {{2}}. Book a slot in a tap.",
      media: { kind: "none", url: "" },
      buttons: [
        {
          id: "b1",
          kind: "url",
          label: "Book a slot",
          url: "https://example.com/book",
        },
      ],
      variables: ["Customer name", "Service date"],
      createdAt: today,
      updatedAt: today,
    },
  ];
}

/** Normalises a Meta-approved template into the shared view model. */
export function metaToView(
  template: (typeof metaTemplates)[number]
): TemplateView {
  return {
    id: template.id,
    source: "meta",
    name: template.name,
    language: template.language,
    category: template.category,
    status: template.status,
    header: template.header,
    body: template.body,
    footer: template.footer,
    media: { kind: "none", url: "" },
    buttons: [],
    variables: template.variables,
    updatedAt: template.updatedAt,
  };
}

export function customToView(template: CustomTemplate): TemplateView {
  return {
    id: template.id,
    source: "custom",
    name: template.name,
    language: template.language,
    category: template.category,
    status: template.status,
    header: template.header,
    body: template.body,
    footer: template.footer,
    media: template.media,
    buttons: template.buttons,
    variables: template.variables,
    updatedAt: template.updatedAt,
  };
}

export const metaTemplateViews: TemplateView[] = metaTemplates.map(metaToView);

/** Reads the saved demo templates. Returns null on first run or bad data. */
function restore(): CustomTemplate[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as CustomTemplate[];
    return Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

export type CustomTemplateDraft = Omit<
  CustomTemplate,
  "id" | "clientId" | "createdAt" | "updatedAt"
>;

export function emptyDraft(): CustomTemplateDraft {
  return {
    name: "",
    language: "English",
    category: "Marketing",
    status: "draft",
    header: "",
    body: "",
    footer: "",
    media: { kind: "none", url: "" },
    buttons: [],
    variables: [],
  };
}

interface CustomTemplatesContextValue {
  /** Only the signed-in client's templates. Never another client's. */
  templates: CustomTemplate[];
  views: TemplateView[];
  create: (draft: CustomTemplateDraft) => CustomTemplate | null;
  update: (id: string, draft: CustomTemplateDraft) => void;
  remove: (id: string) => void;
  /** True when another template of this client already uses the name. */
  nameTaken: (name: string, ignoreId?: string) => boolean;
}

const CustomTemplatesContext =
  createContext<CustomTemplatesContextValue | null>(null);

export function CustomTemplatesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const clientId = clientIdFor(user);
  const [all, setAll] = useState<CustomTemplate[]>(() => restore() ?? seedTemplates());

  const persist = useCallback((next: CustomTemplate[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — demo state stays in memory only
    }
  }, []);

  const mine = useMemo(
    () =>
      clientId ? all.filter((template) => template.clientId === clientId) : [],
    [all, clientId]
  );

  const create = useCallback(
    (draft: CustomTemplateDraft) => {
      if (!clientId) return null;
      const now = toISODate(startOfToday());
      const template: CustomTemplate = {
        ...draft,
        id: `custom-${Date.now()}`,
        clientId,
        createdAt: now,
        updatedAt: now,
      };
      setAll((prev) => {
        const next = [template, ...prev];
        persist(next);
        return next;
      });
      return template;
    },
    [clientId, persist]
  );

  const update = useCallback(
    (id: string, draft: CustomTemplateDraft) => {
      setAll((prev) => {
        const next = prev.map((template) =>
          // The clientId guard stops an edit ever touching another client's row.
          template.id === id && template.clientId === clientId
            ? { ...template, ...draft, updatedAt: toISODate(startOfToday()) }
            : template
        );
        persist(next);
        return next;
      });
    },
    [clientId, persist]
  );

  const remove = useCallback(
    (id: string) => {
      setAll((prev) => {
        const next = prev.filter(
          (template) => !(template.id === id && template.clientId === clientId)
        );
        persist(next);
        return next;
      });
    },
    [clientId, persist]
  );

  const nameTaken = useCallback(
    (name: string, ignoreId?: string) =>
      mine.some(
        (template) =>
          template.id !== ignoreId &&
          template.name.trim().toLowerCase() === name.trim().toLowerCase()
      ),
    [mine]
  );

  const value = useMemo<CustomTemplatesContextValue>(
    () => ({
      templates: mine,
      views: mine.map(customToView),
      create,
      update,
      remove,
      nameTaken,
    }),
    [mine, create, update, remove, nameTaken]
  );

  return (
    <CustomTemplatesContext.Provider value={value}>
      {children}
    </CustomTemplatesContext.Provider>
  );
}

export function useCustomTemplates() {
  const ctx = useContext(CustomTemplatesContext);
  if (!ctx)
    throw new Error(
      "useCustomTemplates must be used inside <CustomTemplatesProvider>"
    );
  return ctx;
}
