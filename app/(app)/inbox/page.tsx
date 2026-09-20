"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Check, CheckCheck, FileText, Info, Loader2, Paperclip, Send } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/utils";

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
  type: "text" | "image" | "document";
  text: string;
  mediaUrl: string | null;
  mediaFileName: string | null;
  whatsappMessageId: string | null;
  status: string;
  createdAt: string;
}

function Ticks({ status }: { status: string }) {
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" aria-label="Read" />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 text-slate-400" aria-label="Delivered" />;
  if (status === "failed") return <span className="text-[11px] text-red-500">Failed</span>;
  return <Check className="h-3.5 w-3.5 text-slate-400" aria-label="Sent" />;
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<RealMessage[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [showDetails, setShowDetails] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/conversations");
      const data = await res.json();
      setConversations(data.conversations ?? []);
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
    const interval = setInterval(() => loadActiveMessages(activeId), 4000);
    return () => clearInterval(interval);
  }, [activeId, loadActiveMessages]);

  const filtered = conversations.filter((c) => {
    const q = query.trim().toLowerCase();
    return !q || (c.contactName ?? "").toLowerCase().includes(q) || c.contactPhone.includes(q);
  });

  const active = conversations.find((c) => c.id === activeId) ?? null;

  async function openConversation(id: string) {
    setActiveId(id);
    setSendError(null);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
    fetch(`/api/inbox/conversations/${id}/read`, { method: "POST" }).catch(() => {});
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
        body: JSON.stringify({ to: active.contactPhone, message: text, name: active.contactName }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSendError(data.error ?? "Could not send message.");
        return;
      }

      setDraft("");
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

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr]">
          {/* Conversation list */}
          <div className="border-b border-slate-200 lg:border-b-0 lg:border-r">
            <div className="border-b border-slate-200 p-3">
              <SearchInput value={query} onChange={setQuery} placeholder="Search conversations" />
            </div>
            <ul className="max-h-[420px] overflow-y-auto lg:max-h-[560px]">
              {!loading && filtered.length === 0 && (
                <li>
                  <EmptyState
                    title="No conversations yet"
                    description="Real customer replies will appear here once someone messages your connected WhatsApp number."
                  />
                </li>
              )}
              {filtered.map((thread) => (
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
          <div className="flex min-h-[480px] flex-col">
            {active ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {active.contactName || active.contactPhone}
                    </p>
                    <p className="text-xs text-slate-400">{active.contactPhone}</p>
                  </div>
                  <Button size="sm" onClick={() => setShowDetails((s) => !s)}>
                    <Info className="h-3.5 w-3.5" />
                    {showDetails ? "Hide details" : "Show details"}
                  </Button>
                </div>

                {showDetails && (
                  <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs">
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

                <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50/60 px-5 py-4">
                  {activeMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                        message.direction === "outbound"
                          ? "ml-auto rounded-tr-sm bg-emerald-100 text-slate-800"
                          : "rounded-tl-sm bg-white text-slate-800 ring-1 ring-slate-200"
                      }`}
                    >
                      {message.type === "image" && message.mediaUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={message.mediaUrl}
                          alt={message.mediaFileName ?? "Photo"}
                          className="mb-1.5 max-h-64 w-full rounded-lg object-cover"
                        />
                      )}
                      {message.type === "image" && !message.mediaUrl && (
                        <p className="mb-1 text-xs text-slate-400">📷 Photo received (not downloaded)</p>
                      )}
                      {message.type === "document" && message.mediaUrl && (
                        <a
                          href={message.mediaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
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
                      {message.text && <p className="leading-relaxed">{message.text}</p>}
                      <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-slate-400">
                        {formatDateTime(message.createdAt)}
                        {message.direction === "outbound" && <Ticks status={message.status} />}
                      </p>
                    </div>
                  ))}
                </div>

                {sendError && (
                  <div className="border-t border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
                    {sendError}
                  </div>
                )}

                <form onSubmit={sendReply} className="flex items-center gap-2 border-t border-slate-200 px-4 py-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={handleFilePick}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    aria-label="Attach a photo or document"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={active.consent === "opted_out" || uploading}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </Button>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label="Type a reply"
                    placeholder={
                      active.consent === "opted_out"
                        ? "This contact opted out of messages"
                        : "Type a reply"
                    }
                    disabled={active.consent === "opted_out" || sending}
                    className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!draft.trim() || active.consent === "opted_out" || sending}
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
    </div>
  );
}
