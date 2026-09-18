"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { templates as metaTemplates } from "@/data/campaigns";
import { clientIdFor, useAuth } from "@/lib/auth";
import type { CustomTemplate, TemplateView } from "@/types";

/** Normalises a Meta-approved template into the shared view model. Still
 * mock data (data/campaigns.ts) — real Meta sync is a later phase. */
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

export type SaveTemplateResult =
  | { ok: true; template: CustomTemplate }
  | { ok: false; errors?: Record<string, string>; error?: string };

/** @deprecated kept as an alias — use SaveTemplateResult. */
export type CreateTemplateResult = SaveTemplateResult;

interface CustomTemplatesContextValue {
  /** Only the signed-in client's templates. Never another client's. */
  templates: CustomTemplate[];
  views: TemplateView[];
  loading: boolean;
  refresh: () => void;
  create: (draft: CustomTemplateDraft) => Promise<SaveTemplateResult>;
  update: (id: string, draft: CustomTemplateDraft) => Promise<SaveTemplateResult>;
  remove: (id: string) => Promise<{ ok: true } | { ok: false; error?: string }>;
  /** True when another template of this client already uses the name
   * (client-side check for instant feedback — the server re-checks too). */
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
  const [mine, setMine] = useState<CustomTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!clientId) {
      setMine([]);
      return;
    }
    setLoading(true);
    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => setMine(data.templates ?? []))
      .catch(() => setMine([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    // False positive — see the identical note on this pattern in
    // app/(app)/clients/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const create = useCallback(
    async (draft: CustomTemplateDraft): Promise<SaveTemplateResult> => {
      try {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, errors: data.errors, error: data.error };
        }
        setMine((prev) => [data.template, ...prev]);
        return { ok: true, template: data.template };
      } catch {
        return { ok: false, error: "Could not reach the server. Please try again." };
      }
    },
    []
  );

  const update = useCallback(
    async (id: string, draft: CustomTemplateDraft): Promise<SaveTemplateResult> => {
      try {
        const res = await fetch(`/api/templates/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, errors: data.errors, error: data.error };
        }
        setMine((prev) => prev.map((t) => (t.id === id ? data.template : t)));
        return { ok: true, template: data.template };
      } catch {
        return { ok: false, error: "Could not reach the server. Please try again." };
      }
    },
    []
  );

  const remove = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) return { ok: false as const, error: data.error };
      setMine((prev) => prev.filter((t) => t.id !== id));
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: "Could not reach the server. Please try again." };
    }
  }, []);

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
      loading,
      refresh: load,
      create,
      update,
      remove,
      nameTaken,
    }),
    [mine, loading, load, create, update, remove, nameTaken]
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
