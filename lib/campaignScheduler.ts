import "server-only";
import { prisma } from "@/lib/db";
import { runCampaign } from "@/lib/campaignRunner";

const CHECK_INTERVAL_MS = 30_000; // 30 seconds

/**
 * ⚠️ Real, but with a real limitation: this is a `setInterval` inside the
 * Next.js server process, not an external cron/queue. It only fires while
 * the server is actually running (`npm run dev` / `npm start` kept up) —
 * on a serverless host (Vercel, etc.) the process can go idle between
 * requests and this interval won't tick reliably. For a self-hosted,
 * always-on Node server this works correctly: a scheduled campaign is
 * picked up within CHECK_INTERVAL_MS of its scheduled time and actually
 * sent via Meta's API (see lib/campaignRunner.ts).
 */
const globalForScheduler = globalThis as unknown as {
  campaignSchedulerStarted?: boolean;
};

async function checkDueCampaigns() {
  try {
    const due = await prisma.campaign.findMany({
      where: { status: "scheduled", scheduledAt: { lte: new Date() } },
      select: { id: true },
    });
    for (const campaign of due) {
      await runCampaign(campaign.id);
    }
  } catch {
    // Swallow errors so a transient DB hiccup doesn't kill the interval —
    // it'll just try again on the next tick.
  }
}

/** Idempotent — safe to call from every request; the interval is only
 * actually created once per server process (guarded via globalThis, same
 * pattern as the Prisma client singleton in lib/db.ts). */
export function ensureCampaignSchedulerStarted() {
  if (globalForScheduler.campaignSchedulerStarted) return;
  globalForScheduler.campaignSchedulerStarted = true;
  setInterval(checkDueCampaigns, CHECK_INTERVAL_MS);
}
