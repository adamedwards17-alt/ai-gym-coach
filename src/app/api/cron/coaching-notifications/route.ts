import { timingSafeEqual } from "node:crypto";
import {
  claimCoachingEvent,
  coachingPushReady,
  deliverCoachingEvent,
  loadCoachingSnapshots,
  recordCoachingResult,
} from "@/lib/coaching-notification-data";
import { runCoachingPass } from "@/lib/coaching-notification-run";
import {
  coachingDedupeKey,
  zonedClock,
} from "@/lib/coaching-notifications";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) {
    return false;
  }
  const token = header.slice("Bearer ".length);
  const left = Buffer.from(token);
  const right = Buffer.from(secret);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error("[coaching] Server database key is not configured.");
    return Response.json({ ok: false }, { status: 503 });
  }

  const ready = coachingPushReady();
  if (!ready.ok) {
    console.error("[coaching] Push is not configured.");
    return Response.json({ ok: false }, { status: 503 });
  }

  const now = new Date();
  const claims = new Map<string, string>();
  const result = await runCoachingPass({
    now,
    loadSnapshots: () => loadCoachingSnapshots(admin, now),
    claim: async (facts, decision) => {
      const id = await claimCoachingEvent(admin, facts, decision);
      if (!id) {
        return false;
      }
      claims.set(
        coachingDedupeKey(
          facts.userId,
          decision.purpose,
          zonedClock(facts.now, facts.timeZone).date,
        ),
        id,
      );
      return true;
    },
    deliver: (facts, decision) => deliverCoachingEvent(admin, facts, decision),
    recordResult: async (facts, decision, delivery) => {
      const id = claims.get(
        coachingDedupeKey(
          facts.userId,
          decision.purpose,
          zonedClock(facts.now, facts.timeZone).date,
        ),
      );
      if (!id) {
        return;
      }
      await recordCoachingResult(admin, facts, id, delivery);
    },
  });

  return Response.json({ ok: true, considered: result.considered, sent: result.sent });
}
