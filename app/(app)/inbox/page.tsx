"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  CornerUpLeft,
  Download,
  FileText,
  Info,
  ListChecks,
  Loader2,
  Maximize2,
  MoreVertical,
  Paperclip,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatDateTime } from "@/lib/utils";
import { formatWindowLeft, getSessionWindow } from "@/lib/sessionWindow";

interface ConversationSummary {
  id: string;
  contactPhone: string;
  contactName: string | null;
  unreadCount: number;
  lastMessageAt: string;
  lastMessagePreview: string;
  consent: "opted_in" | "opted_out" | "pending" | null;
  tags: string[];
}

interface RealMessage {
  id: string;
  direction: "inbound" | "outbound";
  type: "text" | "image" | "document" | "video" | "audio";
  text: string;
  mediaUrl: string | null;
  mediaFileName: string | null;
  whatsappMessageId: string | null;
  status: string;
  /** Which campaign/template this OUTBOUND message came from, if it was a
   * campaign/bulk send — null for manual replies and all inbound messages.
   * Shown as a small context badge so a reply like "I am interested" can be
   * traced back to what it's actually replying to. */
  campaignName: string | null;
  templateName: string | null;
  /** Swipe-to-reply / quote-reply, same as real WhatsApp — a snapshot of
   * whatever message this one replied to, so the Inbox can show the quoted
   * preview even if the original message is later deleted. */
  replyToId: string | null;
  replyToText: string | null;
  replyToType: string | null;
  replyToDirection: string | null;
  createdAt: string;
}

/** The page's own fixed vertical chrome above the Card (Topbar + main's own
 * padding + PageHeader) — subtracted from 100vh so the Card fills exactly
 * the rest of the viewport instead of pushing the whole page into scroll.
 * Only the conversation list and the message thread scroll internally. */
const CHROME_HEIGHT = "13.5rem";

function Ticks({ status }: { status: string }) {
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" aria-label="Read" />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 text-slate-400" aria-label="Delivered" />;
  if (status === "failed") return <span className="text-[11px] text-red-500">Failed</span>;
  return <Check className="h-3.5 w-3.5 text-slate-400" aria-label="Sent" />;
}

// useSearchParams (used to deep-link straight into a conversation from a
// dashboard/header "new message" notification, e.g. /inbox?c=<id>) requires
// a Suspense boundary — this wrapper is that boundary, the real page is
// InboxPageInner below.
export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxPageInner />
    </Suspense>
  );
}

function InboxPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // The conversation id a notification link asked us to jump straight to —
  // cleared once we've actually opened it (or the moment the person picks
  // a different conversation themselves) so it never fights normal use.
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(() => searchParams.get("c"));

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<RealMessage[]>([]);
  // True only for the moment a conversation is first opened — set in
  // openConversation, cleared once its first message fetch lands — so
  // switching chats shows a real loading state instead of an empty pane
  // that suddenly pops full of messages.
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [showDetails, setShowDetails] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Interactive (tap-to-reply buttons / list menu) composer. The text typed
  // in the normal reply box becomes the message body.
  const [interactiveOpen, setInteractiveOpen] = useState(false);
  const [interactiveKind, setInteractiveKind] = useState<"buttons" | "list">("buttons");
  const [buttonTitles, setButtonTitles] = useState<string[]>(["", ""]);
  const [listLabel, setListLabel] = useState("Choose an option");
  const [listRows, setListRows] = useState<string[]>(["", ""]);
  // Ticks every 30s so the 24h-window countdown stays current on its own.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Throttles the real "typing…" indicator shown on the customer's own
  // WhatsApp — Meta dismisses it after ~25s, so there's no point re-firing
  // on every keystroke; this just remembers when it was last sent.
  const lastTypingSentAtRef = useRef(0);
  const typingRenewIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // In-chat search — real WhatsApp doesn't hide non-matching messages, it
  // highlights matches and lets you step through them, so that's what this
  // does too (no new API call needed: every message for an open conversation
  // is already loaded).
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"clear" | "delete" | null>(null);

  // Swipe-to-reply — the message currently picked to quote in the next
  // outgoing reply (see the quoted preview bar above the compose form).
  const [replyTo, setReplyTo] = useState<RealMessage | null>(null);

  // Tap-to-open media viewer, same as real WhatsApp — Save/Delete/Close.
  const [lightbox, setLightbox] = useState<{
    url: string;
    kind: "image" | "video";
    fileName: string | null;
    messageId: string;
  } | null>(null);

  // Per-message delete (from the hover actions or the lightbox) and
  // multi-select delete (from "Select messages") share one confirm dialog.
  const [messageDeleteTarget, setMessageDeleteTarget] = useState<
    { kind: "single"; id: string } | { kind: "bulk" } | null
  >(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  // Mirrors activeId for use inside loadConversations without making that
  // callback depend on (and get recreated by) activeId changing.
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/conversations");
      const data = await res.json();
      const list: ConversationSummary[] = data.conversations ?? [];
      // The conversation the agent currently has open is being marked read
      // in real time (see the polling effect below) — if a message lands
      // between that read call and this refresh, don't let the server's
      // still-stale count flash the sidebar back to "unread" for a chat
      // that's sitting open right in front of the agent.
      setConversations(
        list.map((c) => (c.id === activeIdRef.current ? { ...c, unreadCount: 0 } : c))
      );
    } catch {
      // keep whatever was already shown
    }
  }, []);

  const loadActiveMessages = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/inbox/conversations/${id}`);
      const data = await res.json();
      setActiveMessages(data.messages ?? []);
    } catch {
      // keep whatever was already shown
    } finally {
      // Only matters the first time a conversation is opened — every later
      // call here is this same effect's background 4s poll, by which point
      // messagesLoading is already false and this is a no-op.
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadConversations();
      setLoading(false);
    })();

    // Real incoming messages arrive via webhook at any time — poll so new
    // conversations/replies show up without a manual refresh.
    const interval = setInterval(loadConversations, 8000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId) return;
    // False positive — see the identical note on this pattern in
    // app/(app)/clients/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadActiveMessages(activeId);
    // Keep telling Meta (and our own unreadCount) that this conversation is
    // read for as long as it's sitting open — otherwise a message arriving
    // while the agent is already looking at the chat would still bump the
    // sidebar's unread count, even though nothing here is actually unread.
    fetch(`/api/inbox/conversations/${activeId}/read`, { method: "POST" }).catch(() => {});
    const interval = setInterval(() => {
      loadActiveMessages(activeId);
      fetch(`/api/inbox/conversations/${activeId}/read`, { method: "POST" }).catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [activeId, loadActiveMessages]);

  // Stop the typing-indicator renewal timer if the Inbox tab/page unmounts
  // mid-draft — otherwise it would keep firing against a conversation this
  // component no longer shows.
  useEffect(() => {
    return () => {
      if (typingRenewIntervalRef.current) clearInterval(typingRenewIntervalRef.current);
    };
  }, []);

  // Real WhatsApp always opens a chat scrolled to the newest message, and
  // stays pinned there as new messages arrive — this mirrors that instead
  // of leaving the reader wherever the scroll happened to be.
  const messageCount = activeMessages.length;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [activeId, messageCount]);

  function scrollToTop() {
    messagesContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }
  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return activeMessages.filter((m) => m.text.toLowerCase().includes(q)).map((m) => m.id);
  }, [activeMessages, searchQuery]);

  // Reset back to the first match whenever the query or the open chat
  // changes. Done during render (React's documented pattern for "adjusting
  // state when a prop/input changes") rather than in an effect, since
  // setState synchronously inside an effect body triggers an extra render.
  const searchResetKey = `${activeId ?? ""}:${searchQuery}`;
  const [prevSearchResetKey, setPrevSearchResetKey] = useState(searchResetKey);
  if (searchResetKey !== prevSearchResetKey) {
    setPrevSearchResetKey(searchResetKey);
    setMatchIndex(0);
  }

  useEffect(() => {
    if (searchMatches.length === 0) return;
    const id = searchMatches[Math.min(matchIndex, searchMatches.length - 1)];
    document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [matchIndex, searchMatches]);

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    setMatchIndex(0);
  }

  async function clearChat() {
    if (!active) return;
    const res = await fetch(`/api/inbox/conversations/${active.id}/clear`, { method: "POST" });
    if (res.ok) {
      setActiveMessages([]);
      await loadConversations();
    }
  }

  async function deleteChat() {
    if (!active) return;
    const res = await fetch(`/api/inbox/conversations/${active.id}`, { method: "DELETE" });
    if (res.ok) {
      setActiveId(null);
      setActiveMessages([]);
      await loadConversations();
    }
  }

  async function deleteSingleMessage(id: string) {
    if (!active) return;
    const res = await fetch(`/api/inbox/conversations/${active.id}/messages/${id}`, { method: "DELETE" });
    if (res.ok) {
      setActiveMessages((prev) => prev.filter((m) => m.id !== id));
      if (replyTo?.id === id) setReplyTo(null);
      await loadConversations();
    }
  }

  async function deleteSelectedMessages() {
    if (!active || selectedIds.size === 0) return;
    const res = await fetch(`/api/inbox/conversations/${active.id}/messages/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageIds: Array.from(selectedIds) }),
    });
    if (res.ok) {
      setActiveMessages((prev) => prev.filter((m) => !selectedIds.has(m.id)));
      exitSelectMode();
      await loadConversations();
    }
  }

  const filtered = conversations.filter((c) => {
    const q = query.trim().toLowerCase();
    return !q || (c.contactName ?? "").toLowerCase().includes(q) || c.contactPhone.includes(q);
  });

  const active = conversations.find((c) => c.id === activeId) ?? null;

  // WhatsApp's 24-hour window — measured from the customer's last inbound
  // message. Outside it, Meta only accepts an approved template, so the
  // composer says so up front instead of failing after you press Send.
  const lastInboundAt = useMemo(() => {
    for (let i = activeMessages.length - 1; i >= 0; i--) {
      if (activeMessages[i].direction === "inbound") return activeMessages[i].createdAt;
    }
    return null;
  }, [activeMessages]);
  const sessionWindow = getSessionWindow(lastInboundAt, nowTick);
  // Don't flash "closed" while a freshly opened chat's messages are loading.
  const windowClosed = Boolean(active) && !messagesLoading && !sessionWindow.open;
  const windowClosingSoon = !windowClosed && !messagesLoading && sessionWindow.open && sessionWindow.msLeft < 4 * 60 * 60 * 1000;

  async function openConversation(id: string) {
    // Only show the loading skeleton when actually switching conversations
    // — reopening the same one (e.g. a stray re-click) shouldn't wipe the
    // messages already on screen.
    if (id !== activeId) {
      setMessagesLoading(true);
      setActiveMessages([]);
    }
    setActiveId(id);
    setSendError(null);
    setMenuOpen(false);
    closeSearch();
    setReplyTo(null);
    setLightbox(null);
    exitSelectMode();
    lastTypingSentAtRef.current = 0;
    if (typingRenewIntervalRef.current) {
      clearInterval(typingRenewIntervalRef.current);
      typingRenewIntervalRef.current = null;
    }
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
    fetch(`/api/inbox/conversations/${id}/read`, { method: "POST" }).catch(() => {});
  }

  // Deep-link support: a "new message" notification (dashboard card, header
  // bell) links to /inbox?c=<id> — once that conversation has actually
  // loaded into the list, jump straight into it and drop the query param so
  // refreshing or switching chats afterward behaves normally.
  useEffect(() => {
    if (!pendingOpenId) return;
    const match = conversations.find((c) => c.id === pendingOpenId);
    if (!match) return;
    // False positive — see the identical note on this pattern in
    // app/(app)/clients/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    openConversation(match.id);
    setPendingOpenId(null);
    router.replace("/inbox", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenId, conversations]);

  // Fires the real Meta "typing…" indicator on the customer's own WhatsApp —
  // used both right on a keystroke and by the renewal timer below. Silent by
  // design: this is a one-way courtesy signal to the customer, not something
  // that needs to be reported back in this Inbox.
  const sendTypingIndicator = useCallback(async (conversationId: string) => {
    lastTypingSentAtRef.current = Date.now();
    try {
      await fetch(`/api/inbox/conversations/${conversationId}/typing`, { method: "POST" });
    } catch {
      // best-effort — a missed typing indicator isn't worth surfacing
    }
  }, []);

  // Only fire the indicator once every ~20s of active typing (Meta shows it
  // for ~25s, so this keeps it continuously lit without wasting calls on
  // every keystroke) — unless `force` is set, for the very first character.
  const maybeSendTypingIndicator = useCallback(
    (conversationId: string, force: boolean) => {
      if (force || Date.now() - lastTypingSentAtRef.current > 20000) {
        sendTypingIndicator(conversationId);
      }
    },
    [sendTypingIndicator]
  );

  function handleDraftChange(value: string) {
    const hadText = draft.trim().length > 0;
    setDraft(value);
    if (!active) return;

    const hasText = value.trim().length > 0;
    if (!hasText) {
      // Box emptied out — stop pretending we're still typing, and let the
      // next keystroke start a fresh indicator instantly instead of waiting
      // out the throttle window.
      lastTypingSentAtRef.current = 0;
      if (typingRenewIntervalRef.current) {
        clearInterval(typingRenewIntervalRef.current);
        typingRenewIntervalRef.current = null;
      }
      return;
    }

    // Fire the moment typing starts (empty → non-empty) instantly, rather
    // than waiting out the throttle window.
    maybeSendTypingIndicator(active.id, !hadText);

    // Keep it alive on its own even if the agent pauses typing without
    // clearing the box (reading the chat, thinking about a reply) — real
    // WhatsApp keeps "typing…" up the whole time there's a draft, not just
    // while keys are being pressed.
    if (!typingRenewIntervalRef.current) {
      typingRenewIntervalRef.current = setInterval(() => {
        if (active) sendTypingIndicator(active.id);
      }, 20000);
    }
  }

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  async function sendInteractive() {
    const text = draft.trim();
    if (!text || !active) return;

    setSendError(null);
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send-interactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: active.contactPhone,
          name: active.contactName,
          message: text,
          kind: interactiveKind,
          buttons: buttonTitles,
          listButtonLabel: listLabel,
          rows: listRows.map((title) => ({ title })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error ?? "Could not send message.");
        return;
      }

      setDraft("");
      setInteractiveOpen(false);
      setButtonTitles(["", ""]);
      setListRows(["", ""]);
      lastTypingSentAtRef.current = 0;
      if (typingRenewIntervalRef.current) {
        clearInterval(typingRenewIntervalRef.current);
        typingRenewIntervalRef.current = null;
      }
      await Promise.all([loadActiveMessages(active.id), loadConversations()]);
    } finally {
      setSending(false);
    }
  }

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !active) return;

    setSendError(null);
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: active.contactPhone,
          message: text,
          name: active.contactName,
          replyToId: replyTo?.id,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSendError(data.error ?? "Could not send message.");
        return;
      }

      setDraft("");
      setReplyTo(null);
      lastTypingSentAtRef.current = 0;
      if (typingRenewIntervalRef.current) {
        clearInterval(typingRenewIntervalRef.current);
        typingRenewIntervalRef.current = null;
      }
      await Promise.all([loadActiveMessages(active.id), loadConversations()]);
    } finally {
      setSending(false);
    }
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file || !active) return;

    setSendError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/whatsapp/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        setSendError(uploadData.error ?? "Could not upload file.");
        return;
      }

      const sendRes = await fetch("/api/whatsapp/send-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: active.contactPhone,
          name: active.contactName,
          mediaUrl: uploadData.url,
          mediaKind: uploadData.kind,
          fileName: uploadData.fileName,
        }),
      });
      const sendData = await sendRes.json();
      if (!sendRes.ok) {
        setSendError(sendData.error ?? "Could not send file.");
        return;
      }

      await Promise.all([loadActiveMessages(active.id), loadConversations()]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="WhatsApp Inbox"
        description="Real conversations — customer replies arrive via Meta's webhook, and replies send a real WhatsApp message."
      />

      <Card
        className="overflow-hidden"
        style={{ height: `calc(100vh - ${CHROME_HEIGHT})`, minHeight: "480px" }}
      >
        <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[320px_1fr]">
          {/* Conversation list */}
          <div className="flex min-h-0 flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
            <div className="shrink-0 border-b border-slate-200 p-3">
              <SearchInput value={query} onChange={setQuery} placeholder="Search conversations" />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {loading && (
                <li>
                  <LoadingState rows={6} label="Loading conversations" />
                </li>
              )}
              {!loading && filtered.length === 0 && (
                <li>
                  <EmptyState
                    title="No conversations yet"
                    description="Real customer replies will appear here once someone messages your connected WhatsApp number."
                  />
                </li>
              )}
              {!loading && filtered.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => openConversation(thread.id)}
                    aria-current={thread.id === activeId}
                    className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors ${
                      thread.id === activeId ? "bg-indigo-50/70" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
                      {(thread.contactName || thread.contactPhone)[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">
                          {thread.contactName || thread.contactPhone}
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {formatDateTime(thread.lastMessageAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                          {thread.lastMessagePreview}
                        </span>
                        {thread.unreadCount > 0 && (
                          <span className="shrink-0 rounded-full bg-indigo-600 px-1.5 text-[11px] text-white">
                            {thread.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Thread */}
          <div className="flex h-full min-h-0 flex-col">
            {active ? (
              <>
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {active.contactName || active.contactPhone}
                    </p>
                    <p className="text-xs text-slate-400">{active.contactPhone}</p>
                  </div>
                  <div className="relative flex shrink-0 items-center gap-2">
                    <Button size="sm" aria-label="Search in this chat" onClick={() => setSearchOpen((s) => !s)}>
                      <Search className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" onClick={() => setShowDetails((s) => !s)}>
                      <Info className="h-3.5 w-3.5" />
                      {showDetails ? "Hide details" : "Show details"}
                    </Button>
                    <Button size="sm" aria-label="More options" onClick={() => setMenuOpen((m) => !m)}>
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                    {menuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                        <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              setSelectMode(true);
                              setSelectedIds(new Set());
                            }}
                            className="flex w-full items-center px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                          >
                            Select messages
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              setConfirmAction("clear");
                            }}
                            className="flex w-full items-center px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                          >
                            Clear chat
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              setConfirmAction("delete");
                            }}
                            className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete chat
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {selectMode && (
                  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-indigo-50 px-4 py-2 text-sm">
                    <span className="font-medium text-indigo-900">{selectedIds.size} selected</span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={exitSelectMode}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={selectedIds.size === 0}
                        onClick={() => setMessageDeleteTarget({ kind: "bulk" })}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </div>
                )}

                {searchOpen && (
                  <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
                    <Search className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      autoFocus
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search in this chat"
                      className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                    {searchQuery.trim() && (
                      <span className="shrink-0 text-xs text-slate-500">
                        {searchMatches.length > 0 ? `${matchIndex + 1} / ${searchMatches.length}` : "0 / 0"}
                      </span>
                    )}
                    <Button
                      size="sm"
                      aria-label="Previous match"
                      disabled={searchMatches.length === 0}
                      onClick={() =>
                        setMatchIndex((i) => (i - 1 + searchMatches.length) % searchMatches.length)
                      }
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      aria-label="Next match"
                      disabled={searchMatches.length === 0}
                      onClick={() => setMatchIndex((i) => (i + 1) % searchMatches.length)}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" aria-label="Close search" onClick={closeSearch}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}

                {showDetails && (
                  <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      Consent{" "}
                      {active.consent ? (
                        <StatusBadge status={active.consent} />
                      ) : (
                        <span className="text-slate-400">Unknown (not in Contacts)</span>
                      )}
                    </span>
                    {active.tags.length > 0 && (
                      <span className="text-slate-500">
                        Tags:{" "}
                        {active.tags.map((tag) => (
                          <span
                            key={tag}
                            className="ml-1 rounded bg-white px-1.5 py-0.5 text-slate-600 ring-1 ring-slate-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                )}

                <div
                  ref={messagesContainerRef}
                  className="relative min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/60 px-5 py-4"
                >
                  {messagesLoading && <LoadingState rows={6} label="Loading messages" />}
                  {!messagesLoading && activeMessages.map((message) => (
                    <div key={message.id} id={`msg-${message.id}`} className="group flex items-start gap-1.5">
                      {selectMode && (
                        <input
                          type="checkbox"
                          aria-label="Select message"
                          checked={selectedIds.has(message.id)}
                          onChange={() => toggleSelected(message.id)}
                          className="mt-2.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      )}

                      <div
                        className={`w-fit max-w-[75%] min-w-[3.5rem] overflow-hidden break-words rounded-2xl text-sm transition-colors ${
                          message.direction === "outbound"
                            ? "ml-auto rounded-tr-sm bg-emerald-100 text-slate-800"
                            : "rounded-tl-sm bg-white text-slate-800 ring-1 ring-slate-200"
                        } ${
                          searchMatches[matchIndex] === message.id
                            ? "ring-2 ring-amber-400"
                            : ""
                        }`}
                      >
                        {/* Quoted preview of whatever this message replied
                            to, same as real WhatsApp — click it to jump to
                            the original. */}
                        {(message.replyToText || message.replyToType) && (
                          <button
                            type="button"
                            onClick={() =>
                              message.replyToId &&
                              document
                                .getElementById(`msg-${message.replyToId}`)
                                ?.scrollIntoView({ block: "center", behavior: "smooth" })
                            }
                            className={`block w-full border-l-4 px-2.5 pb-1.5 pt-2 text-left text-xs ${
                              message.direction === "outbound"
                                ? "border-emerald-600/60 bg-emerald-50/80"
                                : "border-indigo-400 bg-slate-50"
                            }`}
                          >
                            <p className="font-medium text-slate-600">
                              {message.replyToDirection === "outbound"
                                ? "You"
                                : active.contactName || active.contactPhone}
                            </p>
                            <p className="truncate text-slate-500">
                              {message.replyToType === "image"
                                ? "📷 Photo"
                                : message.replyToType === "video"
                                  ? "🎥 Video"
                                  : message.replyToType === "audio"
                                    ? "🎤 Voice message"
                                    : message.replyToType === "document"
                                      ? "📄 Document"
                                      : message.replyToText || ""}
                            </p>
                          </button>
                        )}

                        {/* Real WhatsApp shows a photo/video edge-to-edge in the
                            bubble, with padding only around the caption/text
                            below it — not padded like a regular text message. */}
                        {message.type === "image" && message.mediaUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={message.mediaUrl}
                            alt={message.mediaFileName ?? "Photo"}
                            onClick={() =>
                              setLightbox({
                                url: message.mediaUrl!,
                                kind: "image",
                                fileName: message.mediaFileName,
                                messageId: message.id,
                              })
                            }
                            // object-contain + auto height (capped, not forced)
                            // shows the whole image at its own aspect ratio
                            // instead of cropping it into a fixed box.
                            className="block h-auto max-h-80 w-auto max-w-full cursor-pointer object-contain"
                          />
                        )}
                        {message.type === "video" && message.mediaUrl && (
                          <div className="relative">
                            <video
                              key={message.mediaUrl}
                              src={message.mediaUrl}
                              controls
                              className="block h-auto max-h-80 w-auto max-w-full bg-black object-contain"
                            />
                            {/* Native <video> controls already handle
                                play/pause on click, so opening the same real
                                WhatsApp-style viewer (Save/Delete) is a
                                separate small button instead of an onClick
                                on the video itself. */}
                            <button
                              type="button"
                              aria-label="Open video"
                              onClick={() =>
                                setLightbox({
                                  url: message.mediaUrl!,
                                  kind: "video",
                                  fileName: message.mediaFileName,
                                  messageId: message.id,
                                })
                              }
                              className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
                            >
                              <Maximize2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        <div className="px-3.5 py-2">
                          {message.direction === "outbound" && (message.campaignName || message.templateName) && (
                            <p className="mb-1 truncate text-[11px] font-medium text-emerald-700">
                              Sent via {message.campaignName ?? "campaign"}
                              {/* A bulk send's campaign name already embeds the
                                  template name ("Bulk send — <template>"), so
                                  only append it separately when it isn't
                                  already part of the campaign name. */}
                              {message.templateName && !(message.campaignName ?? "").includes(message.templateName)
                                ? ` · ${message.templateName}`
                                : ""}
                            </p>
                          )}
                          {message.type === "audio" && message.mediaUrl && (
                            <audio
                              key={message.mediaUrl}
                              src={message.mediaUrl}
                              controls
                              preload="metadata"
                              className="mb-1.5 h-10 w-60 max-w-full"
                            />
                          )}
                          {message.type === "audio" && !message.mediaUrl && (
                            <p className="mb-1 text-xs text-slate-400">🎤 Voice message (not downloaded)</p>
                          )}
                          {message.type === "image" && !message.mediaUrl && (
                            <p className="mb-1 text-xs text-slate-400">📷 Photo received (not downloaded)</p>
                          )}
                          {message.type === "video" && !message.mediaUrl && (
                            <p className="mb-1 text-xs text-slate-400">🎥 Video (not downloaded)</p>
                          )}
                          {message.type === "document" && message.mediaUrl && (
                            <a
                              href={`/api/inbox/media/${message.id}/download`}
                              className="mb-1.5 flex items-center gap-2 rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-slate-200 hover:bg-white"
                            >
                              <FileText className="h-6 w-6 shrink-0 text-indigo-500" />
                              <span className="truncate text-xs font-medium text-slate-700">
                                {message.mediaFileName ?? "Document"}
                              </span>
                            </a>
                          )}
                          {message.type === "document" && !message.mediaUrl && (
                            <p className="mb-1 text-xs text-slate-400">
                              📄 {message.mediaFileName ?? "Document"} received (not downloaded)
                            </p>
                          )}
                          {message.text && <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>}
                          <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-slate-400">
                            {formatDateTime(message.createdAt)}
                            {message.direction === "outbound" && <Ticks status={message.status} />}
                          </p>
                        </div>
                      </div>

                      {!selectMode && (
                        <div className="flex shrink-0 items-start gap-1 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            aria-label="Reply"
                            onClick={() => setReplyTo(message)}
                            className="rounded-full p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-600"
                          >
                            <CornerUpLeft className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete message"
                            onClick={() => setMessageDeleteTarget({ kind: "single", id: message.id })}
                            className="rounded-full p-1 text-slate-400 hover:bg-red-100 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />

                  {/* Jump to top/bottom — one click to the other end of a
                      long chat, instead of manual scrolling. */}
                  <div className="pointer-events-none sticky bottom-1 flex justify-end gap-1.5 pr-1">
                    <button
                      type="button"
                      aria-label="Jump to first message"
                      onClick={scrollToTop}
                      className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-500 shadow ring-1 ring-slate-200 hover:bg-slate-50"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Jump to latest message"
                      onClick={scrollToBottom}
                      className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-500 shadow ring-1 ring-slate-200 hover:bg-slate-50"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {sendError && (
                  <div className="shrink-0 border-t border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
                    {sendError}
                  </div>
                )}

                {windowClosed && (
                  <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                    <p className="font-medium">24-hour reply window closed</p>
                    <p className="mt-0.5">
                      {lastInboundAt
                        ? "This customer hasn't messaged you in the last 24 hours, so WhatsApp only allows an approved template now."
                        : "This customer hasn't messaged you yet, so WhatsApp only allows an approved template to start the conversation."}{" "}
                      <a href="/bulk-sender" className="font-medium underline">
                        Send a template
                      </a>
                      . Once they reply, you can chat freely again.
                    </p>
                  </div>
                )}
                {windowClosingSoon && (
                  <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
                    Reply window closes in {formatWindowLeft(sessionWindow.msLeft)} — after that only a template can be sent.
                  </div>
                )}


                {replyTo && (
                  <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2">
                    <div className="min-w-0 flex-1 border-l-4 border-indigo-400 pl-2.5 text-xs">
                      <p className="font-medium text-slate-600">
                        Replying to {replyTo.direction === "outbound" ? "yourself" : active.contactName || active.contactPhone}
                      </p>
                      <p className="truncate text-slate-500">
                        {replyTo.type === "image"
                          ? "📷 Photo"
                          : replyTo.type === "video"
                            ? "🎥 Video"
                            : replyTo.type === "audio"
                              ? "🎤 Voice message"
                              : replyTo.type === "document"
                                ? "📄 Document"
                                : replyTo.text || ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Cancel reply"
                      onClick={() => setReplyTo(null)}
                      className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {interactiveOpen && !windowClosed && (
                  <div className="shrink-0 space-y-2.5 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                        {(["buttons", "list"] as const).map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setInteractiveKind(k)}
                            className={`rounded-md px-3 py-1 font-medium ${
                              interactiveKind === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {k === "buttons" ? "Reply buttons" : "List menu"}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        aria-label="Close interactive composer"
                        onClick={() => setInteractiveOpen(false)}
                        className="rounded-full p-1 text-slate-400 hover:bg-slate-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="text-slate-500">
                      The text in the reply box below is the message. Add the options the customer can tap.
                    </p>

                    {interactiveKind === "list" && (
                      <input
                        value={listLabel}
                        onChange={(e) => setListLabel(e.target.value)}
                        maxLength={20}
                        aria-label="Menu button label"
                        placeholder="Menu button label"
                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    )}

                    {(interactiveKind === "buttons" ? buttonTitles : listRows).map((value, i) => {
                      const setValues = interactiveKind === "buttons" ? setButtonTitles : setListRows;
                      const values = interactiveKind === "buttons" ? buttonTitles : listRows;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            value={value}
                            onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))}
                            maxLength={interactiveKind === "buttons" ? 20 : 24}
                            aria-label={`Option ${i + 1}`}
                            placeholder={`Option ${i + 1}`}
                            className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          />
                          {values.length > 1 && (
                            <button
                              type="button"
                              aria-label={`Remove option ${i + 1}`}
                              onClick={() => setValues(values.filter((_, j) => j !== i))}
                              className="rounded-full p-1 text-slate-400 hover:bg-slate-200"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          interactiveKind === "buttons"
                            ? setButtonTitles((v) => (v.length < 3 ? [...v, ""] : v))
                            : setListRows((v) => (v.length < 10 ? [...v, ""] : v))
                        }
                        disabled={interactiveKind === "buttons" ? buttonTitles.length >= 3 : listRows.length >= 10}
                        className="font-medium text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                      >
                        + Add option
                        {interactiveKind === "buttons" ? " (max 3)" : " (max 10)"}
                      </button>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={sendInteractive}
                        disabled={
                          !draft.trim() ||
                          sending ||
                          (interactiveKind === "buttons" ? buttonTitles : listRows).every((v) => !v.trim())
                        }
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Send {interactiveKind === "buttons" ? "buttons" : "list"}
                      </Button>
                    </div>
                  </div>
                )}

                <form
                  onSubmit={sendReply}
                  className="flex shrink-0 items-center gap-2 border-t border-slate-200 px-4 py-3"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.mp3,.m4a,.aac,.amr,.ogg,audio/mpeg,audio/mp4,audio/aac,audio/ogg"
                    onChange={handleFilePick}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    aria-label="Attach a photo or document"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={active.consent === "opted_out" || uploading || windowClosed}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    aria-label="Send reply buttons or a list"
                    title="Reply buttons / list menu"
                    onClick={() => setInteractiveOpen((o) => !o)}
                    disabled={active.consent === "opted_out" || windowClosed}
                  >
                    <ListChecks className="h-4 w-4" />
                  </Button>
                  <input
                    value={draft}
                    onChange={(e) => handleDraftChange(e.target.value)}
                    aria-label="Type a reply"
                    placeholder={
                      active.consent === "opted_out"
                        ? "This contact opted out of messages"
                        : windowClosed
                          ? "24-hour window closed — send a template instead"
                          : "Type a reply"
                    }
                    disabled={active.consent === "opted_out" || sending || windowClosed}
                    className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!draft.trim() || active.consent === "opted_out" || sending || windowClosed}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </form>
              </>
            ) : (
              <EmptyState
                title="Pick a conversation"
                description="Choose someone from the list to read their messages."
              />
            )}
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === "delete" ? "Delete this chat?" : "Clear this chat?"}
        message={
          confirmAction === "delete"
            ? `This permanently deletes the whole conversation with ${
                active?.contactName || active?.contactPhone || "this contact"
              }, including every message. A new message from them later starts a fresh conversation.`
            : `This permanently deletes every message with ${
                active?.contactName || active?.contactPhone || "this contact"
              }, but keeps the conversation itself.`
        }
        confirmLabel={confirmAction === "delete" ? "Delete chat" : "Clear chat"}
        destructive
        onConfirm={() => (confirmAction === "delete" ? deleteChat() : clearChat())}
        onClose={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={messageDeleteTarget !== null}
        title={
          messageDeleteTarget?.kind === "bulk"
            ? `Delete ${selectedIds.size} message${selectedIds.size === 1 ? "" : "s"}?`
            : "Delete this message?"
        }
        message={
          messageDeleteTarget?.kind === "bulk"
            ? "This permanently deletes the selected messages. This can't be undone."
            : "This permanently deletes this message. This can't be undone."
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (messageDeleteTarget?.kind === "bulk") return deleteSelectedMessages();
          if (messageDeleteTarget?.kind === "single") return deleteSingleMessage(messageDeleteTarget.id);
        }}
        onClose={() => setMessageDeleteTarget(null)}
      />

      {/* Media viewer — tap a photo/video to open it full-screen with
          Save/Delete/Close, same as real WhatsApp. */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={() => setLightbox(null)}>
          <div className="flex shrink-0 items-center justify-end gap-2 p-3" onClick={(e) => e.stopPropagation()}>
            <a
              href={`/api/inbox/media/${lightbox.messageId}/download`}
              aria-label="Save"
              className="rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
            >
              <Download className="h-5 w-5" />
            </a>
            <button
              type="button"
              aria-label="Delete"
              onClick={() => {
                setMessageDeleteTarget({ kind: "single", id: lightbox.messageId });
                setLightbox(null);
              }}
              className="rounded-full bg-white/10 p-2.5 text-white hover:bg-red-500/80"
            >
              <Trash2 className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setLightbox(null)}
              className="rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div
            className="flex flex-1 items-center justify-center overflow-hidden p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {lightbox.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lightbox.url}
                alt={lightbox.fileName ?? "Photo"}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <video src={lightbox.url} controls autoPlay className="max-h-full max-w-full object-contain" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
