"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, CheckCheck, FileText, Info, Loader2, Paperclip, Send } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import StatusBadge from "@/components/ui/StatusBadge";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import { conversations as seed } from "@/data/campaigns";
import type { ChatMessage, Conversation } from "@/types";

function Ticks({ status }: { status?: ChatMessage["status"] }) {
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" aria-label="Read" />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 text-slate-400" aria-label="Delivered" />;
  if (status === "sent") return <Check className="h-3.5 w-3.5 text-slate-400" aria-label="Sent" />;
  if (status === "failed") return <span className="text-[11px] text-red-500">Failed</span>;
  return null; // still sending — no tick yet
}

export default function InboxPage() {
  const [threads, setThreads] = useState<Conversation[]>(seed);
  const [activeId, setActiveId] = useState<string>(seed[0].id);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [showDetails, setShowDetails] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads.filter(
      (thread) =>
        !q ||
        thread.contactName.toLowerCase().includes(q) ||
        thread.phone.includes(q)
    );
  }, [threads, query]);

  const active = threads.find((thread) => thread.id === activeId) ?? null;

  // Real WhatsApp-style ticks: poll the status of our own sent messages
  // (the ones we have a messageRecordId for) until each is read or failed.
  useEffect(() => {
    const pending = threads
      .flatMap((t) => t.messages)
      .filter((m) => m.messageRecordId && m.status !== "read" && m.status !== "failed");
    if (pending.length === 0) return;

    const interval = setInterval(async () => {
      const ids = pending.map((m) => m.messageRecordId!).join(",");
      try {
        const res = await fetch(`/api/whatsapp/message-status?ids=${ids}`);
        const data = await res.json();
        const statuses: Record<string, ChatMessage["status"]> = data.statuses ?? {};
        if (Object.keys(statuses).length === 0) return;
        setThreads((prev) =>
          prev.map((t) => ({
            ...t,
            messages: t.messages.map((m) =>
              m.messageRecordId && statuses[m.messageRecordId]
                ? { ...m, status: statuses[m.messageRecordId] }
                : m
            ),
          }))
        );
      } catch {
        // transient — next tick will retry
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [threads]);

  function openThread(id: string) {
    setActiveId(id);
    setSendError(null);
    setThreads((prev) =>
      prev.map((thread) => (thread.id === id ? { ...thread, unread: 0 } : thread))
    );
  }

  function appendMessage(message: ChatMessage) {
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === activeId
          ? { ...thread, lastMessageAt: message.time, messages: [...thread.messages, message] }
          : thread
      )
    );
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
        body: JSON.stringify({ to: active.phone, message: text, name: active.contactName }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSendError(data.error ?? "Could not send message.");
        return;
      }

      const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      appendMessage({
        id: `m${Date.now()}`,
        from: "agent",
        text,
        time,
        messageRecordId: data.messageRecordId,
        status: "sent",
      });
      setDraft("");
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
          to: active.phone,
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

      const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      appendMessage({
        id: `m${Date.now()}`,
        from: "agent",
        text: "",
        time,
        messageRecordId: sendData.messageRecordId,
        status: "sent",
        media: { kind: uploadData.kind, url: uploadData.url, fileName: uploadData.fileName },
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="WhatsApp Inbox"
        description="Conversations started by your customers — replies send a real WhatsApp message."
      />

      {/* Hidden for the App Review demo video — restore after review is
          submitted. Was: InlineAlert explaining this is a shared test
          number / demo-only sending. */}
      {false && (
        <InlineAlert tone="warning" className="mb-5">
          Replies here send a <strong>real</strong> WhatsApp message via Meta&apos;s test number —
          this is for testing/demo purposes only (one shared test number, not yet a real per-client
          WhatsApp connection). A reply only delivers as plain text if this contact has messaged the
          test number in the last 24 hours. Ticks (✓ sent, ✓✓ delivered, blue ✓✓ read) only advance
          past &quot;sent&quot; if Meta&apos;s delivery webhook is configured — see Message Status.
          Sending photos/documents needs this app on a public URL (ngrok for local dev) so Meta can
          fetch the file.
        </InlineAlert>
      )}

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr]">
          {/* Conversation list */}
          <div className="border-b border-slate-200 lg:border-b-0 lg:border-r">
            <div className="border-b border-slate-200 p-3">
              <SearchInput value={query} onChange={setQuery} placeholder="Search conversations" />
            </div>
            <ul className="max-h-[420px] overflow-y-auto lg:max-h-[560px]">
              {filtered.length === 0 && (
                <li>
                  <EmptyState title="No conversations found" description="Try a different name or number." />
                </li>
              )}
              {filtered.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => openThread(thread.id)}
                    aria-current={thread.id === activeId}
                    className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors ${
                      thread.id === activeId ? "bg-indigo-50/70" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
                      {thread.contactName[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">
                          {thread.contactName}
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {thread.lastMessageAt}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                          {thread.messages[thread.messages.length - 1]?.media
                            ? thread.messages[thread.messages.length - 1]?.media?.kind === "image"
                              ? "📷 Photo"
                              : "📄 Document"
                            : thread.messages[thread.messages.length - 1]?.text}
                        </span>
                        {thread.unread > 0 && (
                          <span className="shrink-0 rounded-full bg-indigo-600 px-1.5 text-[11px] text-white">
                            {thread.unread}
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
                    <p className="text-sm font-semibold text-slate-900">{active.contactName}</p>
                    <p className="text-xs text-slate-400">{active.phone}</p>
                  </div>
                  <Button size="sm" onClick={() => setShowDetails((s) => !s)}>
                    <Info className="h-3.5 w-3.5" />
                    {showDetails ? "Hide details" : "Show details"}
                  </Button>
                </div>

                {showDetails && (
                  <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      Consent <StatusBadge status={active.consent} />
                    </span>
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
                  </div>
                )}

                <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50/60 px-5 py-4">
                  {active.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                        message.from === "agent"
                          ? "ml-auto rounded-tr-sm bg-emerald-100 text-slate-800"
                          : "rounded-tl-sm bg-white text-slate-800 ring-1 ring-slate-200"
                      }`}
                    >
                      {message.media?.kind === "image" && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={message.media.url}
                          alt={message.media.fileName ?? "Photo"}
                          className="mb-1.5 max-h-64 w-full rounded-lg object-cover"
                        />
                      )}
                      {message.media?.kind === "document" && (
                        <a
                          href={message.media.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mb-1.5 flex items-center gap-2 rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-slate-200 hover:bg-white"
                        >
                          <FileText className="h-6 w-6 shrink-0 text-indigo-500" />
                          <span className="truncate text-xs font-medium text-slate-700">
                            {message.media.fileName ?? "Document"}
                          </span>
                        </a>
                      )}
                      {message.text && <p className="leading-relaxed">{message.text}</p>}
                      <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-slate-400">
                        {message.time}
                        {message.from === "agent" && <Ticks status={message.status} />}
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
