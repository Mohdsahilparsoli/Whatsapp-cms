"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Info, Loader2, Send } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import StatusBadge from "@/components/ui/StatusBadge";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import { conversations as seed } from "@/data/campaigns";
import type { Conversation } from "@/types";

export default function InboxPage() {
  const [threads, setThreads] = useState<Conversation[]>(seed);
  const [activeId, setActiveId] = useState<string>(seed[0].id);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [showDetails, setShowDetails] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

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

  function openThread(id: string) {
    setActiveId(id);
    setSendError(null);
    setThreads((prev) =>
      prev.map((thread) => (thread.id === id ? { ...thread, unread: 0 } : thread))
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
        body: JSON.stringify({ to: active.phone, message: text }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSendError(data.error ?? "Could not send message.");
        return;
      }

      const time = new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === active.id
            ? {
                ...thread,
                lastMessageAt: time,
                messages: [
                  ...thread.messages,
                  { id: `m${Date.now()}`, from: "agent", text, time },
                ],
              }
            : thread
        )
      );
      setDraft("");
    } finally {
      setSending(false);
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
          test number in the last 24 hours.
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
                          {thread.messages[thread.messages.length - 1]?.text}
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
                      <p className="leading-relaxed">{message.text}</p>
                      <p className="mt-1 text-right text-[11px] text-slate-400">{message.time}</p>
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
