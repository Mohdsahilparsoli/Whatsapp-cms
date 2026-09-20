"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, Pause, Play, XCircle } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardHeader } from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import InlineAlert from "@/components/ui/InlineAlert";
import FormField from "@/components/ui/FormField";
import { formatDateTime } from "@/lib/utils";
import type { QueueJob } from "@/types";

interface Settings {
  messagesPerMinute: number;
  batchSize: number;
  maxRetryAttempts: number;
  paused: boolean;
}

export default function QueuePage() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({ messagesPerMinute: "250", batchSize: "250", maxRetryAttempts: "3" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/queue/jobs");
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch {
      // keep whatever was already shown
    }
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/queue/settings");
    const data = await res.json();
    if (data.settings) {
      setSettings(data.settings);
      setForm({
        messagesPerMinute: String(data.settings.messagesPerMinute),
        batchSize: String(data.settings.batchSize),
        maxRetryAttempts: String(data.settings.maxRetryAttempts),
      });
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadJobs(), loadSettings()]);
      setLoading(false);
    })();

    // Batches can be created/processed by a scheduled campaign firing in the
    // background — poll so the page reflects that without a manual refresh.
    const interval = setInterval(loadJobs, 5000);
    return () => clearInterval(interval);
  }, [loadJobs, loadSettings]);

  const count = (status: QueueJob["status"]) => jobs.filter((j) => j.status === status).length;

  async function saveSettings() {
    setFormErrors({});
    setSavedMsg(false);
    setSavingSettings(true);
    try {
      const res = await fetch("/api/queue/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messagesPerMinute: Number(form.messagesPerMinute),
          batchSize: Number(form.batchSize),
          maxRetryAttempts: Number(form.maxRetryAttempts),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.errors) setFormErrors(data.errors);
        return;
      }
      setSettings(data.settings);
      setSavedMsg(true);
    } finally {
      setSavingSettings(false);
    }
  }

  async function togglePause() {
    if (!settings) return;
    setTogglingPause(true);
    try {
      const res = await fetch(settings.paused ? "/api/queue/resume" : "/api/queue/pause", {
        method: "POST",
      });
      const data = await res.json();
      setSettings((prev) => (prev ? { ...prev, paused: data.paused } : prev));
    } finally {
      setTogglingPause(false);
    }
  }

  async function retry(job: QueueJob) {
    setRetryingId(job.id);
    try {
      const res = await fetch(`/api/queue/jobs/${job.id}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error ?? "Could not retry that batch.");
        return;
      }
      await loadJobs();
      setToast(
        data.job?.status === "completed"
          ? `Retry succeeded — ${data.job.sentCount} sent.`
          : `Retry finished — still failed (attempt ${data.job.attempts}/${job.maxAttempts}).`
      );
    } finally {
      setRetryingId(null);
    }
  }

  const columns: Column<QueueJob>[] = [
    {
      key: "job",
      header: "Job",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="font-mono text-xs text-slate-400">{row.id}</p>
        </div>
      ),
    },
    { key: "batch", header: "Batch size", render: (row) => row.batchSize },
    {
      key: "sent",
      header: "Result",
      render: (row) =>
        row.status === "completed" || row.status === "failed" ? (
          <span className="text-xs text-slate-600">
            {row.sentCount} sent · {row.failedCount} failed
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    { key: "attempts", header: "Attempts", render: (row) => `${row.attempts} / ${row.maxAttempts}` },
    {
      key: "last",
      header: "Last run",
      render: (row) => (row.lastRunAt ? formatDateTime(row.lastRunAt) : "—"),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div>
          <StatusBadge status={row.status} label={row.status === "processing" ? "Processing…" : undefined} />
          {row.errorMessage && <p className="mt-1 max-w-xs text-xs text-red-600">{row.errorMessage}</p>}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (row) =>
        row.status === "failed" && row.attempts < row.maxAttempts ? (
          <Button size="sm" onClick={() => retry(row)} disabled={retryingId === row.id}>
            {retryingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Retry"}
          </Button>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Queue & Rate Limiting"
        description="Real batches from Campaigns and Bulk Sender, and how fast they're sent."
        actions={
          settings && (
            <Button
              variant={settings.paused ? "primary" : "secondary"}
              onClick={togglePause}
              disabled={togglingPause}
            >
              {togglingPause ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : settings.paused ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
              {settings.paused ? "Resume queue" : "Pause queue"}
            </Button>
          )
        }
      />

      {settings?.paused && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Queue is paused. New Campaign/Bulk Sender sends won&apos;t go out until you resume —
          existing batches already shown below already ran before the pause.
        </div>
      )}

      {toast && (
        <InlineAlert
          tone="success"
          className="mb-5"
          action={
            <Button size="sm" onClick={() => setToast(null)}>
              Dismiss
            </Button>
          }
        >
          {toast}
        </InlineAlert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Queued" value={count("queued")} icon={Clock} />
        <StatCard label="Processing" value={count("processing")} icon={Loader2} />
        <StatCard label="Completed" value={count("completed")} icon={CheckCircle2} tone="positive" />
        <StatCard label="Failed" value={count("failed")} icon={XCircle} tone="negative" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Queue jobs" description="Most recent batches first" />
          <DataTable
            columns={columns}
            rows={jobs}
            rowKey={(row) => row.id}
            loading={loading}
            emptyTitle="The queue is empty"
            emptyDescription="Send a campaign or bulk message to see batches appear here."
          />
        </Card>

        <Card className="h-fit">
          <CardHeader title="Rate limit settings" description="Applies to every real send" />
          <div className="space-y-4 px-5 py-4">
            <FormField
              label="Messages per minute"
              type="number"
              value={form.messagesPerMinute}
              error={formErrors.messagesPerMinute}
              onChange={(v) => {
                setForm((f) => ({ ...f, messagesPerMinute: v }));
                setSavedMsg(false);
              }}
              hint="Keep this under your Meta messaging tier."
            />
            <FormField
              label="Batch size"
              type="number"
              value={form.batchSize}
              error={formErrors.batchSize}
              onChange={(v) => {
                setForm((f) => ({ ...f, batchSize: v }));
                setSavedMsg(false);
              }}
              hint="Contacts grouped per queue job."
            />
            <FormField
              label="Max retry attempts"
              type="number"
              value={form.maxRetryAttempts}
              error={formErrors.maxRetryAttempts}
              onChange={(v) => {
                setForm((f) => ({ ...f, maxRetryAttempts: v }));
                setSavedMsg(false);
              }}
              hint="For batches that fail entirely (e.g. rate limit)."
            />
            <Button variant="primary" className="w-full" onClick={saveSettings} disabled={savingSettings}>
              {savingSettings ? "Saving…" : "Save settings"}
            </Button>
            {savedMsg && <p className="text-xs text-emerald-700">Settings saved.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
