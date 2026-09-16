"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { campaigns as seed } from "@/data/campaigns";
import { clientIdFor, useAuth } from "@/lib/auth";
import { addDays, startOfToday, toISODate } from "@/lib/utils";
import type { Campaign } from "@/types";

const STORAGE_KEY = "wacms.demo.campaigns";

/** "2026-09-20T18:30" → "2026-09-20 18:30" for display in tables. */
export function scheduleLabel(scheduledAt: string) {
  return scheduledAt ? scheduledAt.replace("T", " ") : "—";
}

/** A schedule is only valid if it is parsable and in the future. */
export function validateSchedule(scheduledAt: string): string | null {
  if (!scheduledAt.trim()) return "Pick the date and time to send this campaign.";
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) return "That date and time is not valid.";
  if (when.getTime() <= Date.now())
    return "Pick a date and time in the future.";
  return null;
}

function seedCampaigns(): Campaign[] {
  const today = startOfToday();
  const inDays = (days: number, time: string) =>
    `${toISODate(addDays(today, days))}T${time}`;

  // Existing demo campaigns belong to the demo client account (c6).
  const mine: Campaign[] = seed.map((campaign) => {
    const scheduled = campaign.status === "scheduled";
    const scheduledAt = scheduled ? inDays(3, "18:30") : undefined;
    return {
      ...campaign,
      clientId: "c6",
      templateSource: "meta" as const,
      scheduledAt,
      schedule: scheduledAt ? scheduleLabel(scheduledAt) : campaign.schedule,
    };
  });

  // A second client's campaign — a Client Admin must never see this row.
  const otherClient: Campaign = {
    id: "cm-other-1",
    clientId: "c1",
    name: "Sharma service reminders",
    audience: "Service due — September",
    audienceSize: 1420,
    templateId: "t2",
    templateName: "order_shipped_update",
    templateSource: "meta",
    schedule: scheduleLabel(inDays(5, "10:00")),
    scheduledAt: inDays(5, "10:00"),
    status: "scheduled",
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    createdAt: toISODate(today),
  };

  return [...mine, otherClient];
}

/** Reads the saved demo campaigns. Returns null on first run or bad data. */
function restore(): Campaign[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Campaign[];
    return Array.isArray(saved) && saved.length > 0 ? saved : null;
  } catch {
    return null;
  }
}

export type NewCampaignInput = Omit<
  Campaign,
  "id" | "clientId" | "sent" | "delivered" | "read" | "failed" | "createdAt"
>;

interface CampaignStoreValue {
  /** Scoped to the signed-in client; Super Admin sees every campaign. */
  campaigns: Campaign[];
  add: (input: NewCampaignInput) => Campaign | null;
  update: (id: string, patch: Partial<Campaign>) => void;
  remove: (id: string) => void;
  setStatus: (id: string, status: Campaign["status"]) => void;
  duplicate: (campaign: Campaign) => void;
}

const CampaignStoreContext = createContext<CampaignStoreValue | null>(null);

export function CampaignStoreProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const clientId = clientIdFor(user);
  const isSuperAdmin = user?.role === "super_admin";
  const [all, setAll] = useState<Campaign[]>(() => restore() ?? seedCampaigns());

  const persist = useCallback((next: Campaign[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — demo state stays in memory only
    }
  }, []);

  const mine = useMemo(() => {
    if (isSuperAdmin) return all;
    if (!clientId) return [];
    return all.filter((campaign) => campaign.clientId === clientId);
  }, [all, clientId, isSuperAdmin]);

  /** Guards every mutation so one client can't change another's campaign. */
  const owns = useCallback(
    (campaign: Campaign) => isSuperAdmin || campaign.clientId === clientId,
    [clientId, isSuperAdmin]
  );

  const add = useCallback(
    (input: NewCampaignInput) => {
      if (!clientId) return null;
      const campaign: Campaign = {
        ...input,
        id: `cm-${Date.now()}`,
        clientId,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        createdAt: toISODate(startOfToday()),
      };
      setAll((prev) => {
        const next = [campaign, ...prev];
        persist(next);
        return next;
      });
      return campaign;
    },
    [clientId, persist]
  );

  const update = useCallback(
    (id: string, patch: Partial<Campaign>) => {
      setAll((prev) => {
        const next = prev.map((campaign) =>
          campaign.id === id && owns(campaign)
            ? { ...campaign, ...patch }
            : campaign
        );
        persist(next);
        return next;
      });
    },
    [owns, persist]
  );

  const remove = useCallback(
    (id: string) => {
      setAll((prev) => {
        const next = prev.filter(
          (campaign) => !(campaign.id === id && owns(campaign))
        );
        persist(next);
        return next;
      });
    },
    [owns, persist]
  );

  const setStatus = useCallback(
    (id: string, status: Campaign["status"]) => update(id, { status }),
    [update]
  );

  const duplicate = useCallback(
    (campaign: Campaign) => {
      setAll((prev) => {
        const next = [
          {
            ...campaign,
            id: `cm-${Date.now()}`,
            name: `${campaign.name} (copy)`,
            status: "draft" as const,
            schedule: "—",
            scheduledAt: undefined,
            sent: 0,
            delivered: 0,
            read: 0,
            failed: 0,
          },
          ...prev,
        ];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const value = useMemo<CampaignStoreValue>(
    () => ({ campaigns: mine, add, update, remove, setStatus, duplicate }),
    [mine, add, update, remove, setStatus, duplicate]
  );

  return (
    <CampaignStoreContext.Provider value={value}>
      {children}
    </CampaignStoreContext.Provider>
  );
}

export function useCampaignStore() {
  const ctx = useContext(CampaignStoreContext);
  if (!ctx)
    throw new Error("useCampaignStore must be used inside <CampaignStoreProvider>");
  return ctx;
}
