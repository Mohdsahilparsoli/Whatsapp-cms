"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Loader2, Pause, Play, XCircle } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardHeader } from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import DemoNotice from "@/components/ui/DemoNotice";
import FormField, { SelectField } from "@/components/ui/FormField";
import { queueJobs as seed } from "@/data/campaigns";
import type { QueueJob } from "@/types";

export default function QueuePage() {
  const [jobs, setJobs] = useState<QueueJob[]>(seed);
  const [running, setRunning] = useState(true);
  const [perMinute, setPerMinute] = useState("250");
  const [batchSize, setBatchSize] = useState("250");
  const [retries, setRetries] = useState("3");
  const [saved, setSaved] = useState(false);

  const count = (status: QueueJob["status"]) => jobs.filter((j) => j.status === status).length;

  function retry(job: QueueJob) {
    setJobs((prev) =>
      prev.map((item) =>
        item.id === job.id
          ? { ...item, status: "queued", attempts: item.attempts + 1, error: undefined }
          : item
      )
    );
  }

  const columns: Column<QueueJob>[] = [
    {
      key: "campaign",
      header: "Job",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.campaignName}</p>
          <p className="font-mono text-xs text-slate-400">{row.id}</p>
        </div>
      ),
    },
    { key: "batch", header: "Batch size", render: (row) => row.batchSize },
    { key: "attempts", header: "Attempts", render: (row) => `${row.attempts} / ${retries}` },
    { key: "last", header: "Last run", render: (row) => row.lastRunAt },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div>
          <StatusBadge status={row.status} />
          {row.error && <p className="mt-1 max-w-xs text-xs text-red-600">{row.error}</p>}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (row) =>
        row.status === "failed" ? (
          <Button size="sm" onClick={() => retry(row)}>
            Retry
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
        description="Batches waiting to be delivered, and how fast the CMS sends them."
        actions={
          <Button
            variant={running ? "secondary" : "primary"}
            onClick={() => setRunning((r) => !r)}
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? "Pause queue" : "Resume queue"}
          </Button>
        }
      />

      <DemoNotice>
        The queue is simulated. Real sending speed is capped by your WhatsApp Business messaging tier
        and Meta&apos;s per-second limits.
      </DemoNotice>

      {!running && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Queue is paused. Jobs stay in place until you resume.
        </div>
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
            emptyTitle="The queue is empty"
            emptyDescription="Start a campaign to see batches appear here."
          />
        </Card>

        <Card className="h-fit">
          <CardHeader title="Rate limit settings" description="Demo values only" />
          <div className="space-y-4 px-5 py-4">
            <FormField
              label="Messages per minute"
              type="number"
              value={perMinute}
              onChange={(v) => {
                setPerMinute(v);
                setSaved(false);
              }}
              hint="Keep this under your Meta messaging tier."
            />
            <FormField
              label="Batch size"
              type="number"
              value={batchSize}
              onChange={(v) => {
                setBatchSize(v);
                setSaved(false);
              }}
            />
            <SelectField
              label="Max retry attempts"
              value={retries}
              onChange={(v) => {
                setRetries(v);
                setSaved(false);
              }}
              options={[
                { label: "1 attempt", value: "1" },
                { label: "2 attempts", value: "2" },
                { label: "3 attempts", value: "3" },
                { label: "5 attempts", value: "5" },
              ]}
            />
            <Button variant="primary" className="w-full" onClick={() => setSaved(true)}>
              Save settings
            </Button>
            {saved && <p className="text-xs text-emerald-700">Settings saved in this session.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
