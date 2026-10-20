import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isExpiredPushStatus,
  pushEndpointHost,
  pushProviderReason,
} from "@/lib/push-subscription";
import {
  resolveTimeZone,
  zonedClock,
  type CoachingCheckIn,
  type CoachingDecision,
  type CoachingEvent,
  type CoachingFacts,
  type CoachingMeal,
  type CoachingMessage,
  type CoachingPlanEntry,
  type CoachingSession,
} from "@/lib/coaching-notifications";
import { configureWebPush, sendWebPush } from "@/lib/web-push-server";

type AdminClient = SupabaseClient;

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function rows(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

export async function loadCoachingSnapshots(
  admin: AdminClient,
  now: Date,
): Promise<CoachingFacts[]> {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sinceDate = since.slice(0, 10);
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, timezone, coaching_notifications_enabled")
    .eq("coaching_notifications_enabled", true);

  if (profileError) {
    console.error("[coaching] Profiles failed:", profileError.message);
    return [];
  }

  const enabled = rows(profiles).filter(
    (row) => typeof row.id === "string" && row.coaching_notifications_enabled !== false,
  );
  if (enabled.length === 0) {
    return [];
  }

  const ids = enabled.map((row) => row.id as string);
  const [
    subscriptions,
    checkIns,
    meals,
    sessions,
    plans,
    targets,
    messages,
    events,
  ] = await Promise.all([
    admin.from("push_subscriptions").select("user_id").in("user_id", ids),
    admin
      .from("daily_check_ins")
      .select("user_id, check_in_date, created_at, planned_training")
      .in("user_id", ids)
      .gte("check_in_date", sinceDate),
    admin
      .from("nutrition_entries")
      .select("user_id, logged_date, created_at, status, protein_g_estimated")
      .in("user_id", ids)
      .gte("logged_date", sinceDate),
    admin
      .from("training_sessions")
      .select("user_id, session_date, created_at, training_type")
      .in("user_id", ids)
      .gte("session_date", sinceDate),
    admin
      .from("training_plan_entries")
      .select("user_id, plan_date, training_type, status")
      .in("user_id", ids)
      .gte("plan_date", sinceDate),
    admin
      .from("nutrition_targets")
      .select("user_id, protein_g")
      .in("user_id", ids),
    admin
      .from("coach_messages")
      .select("user_id, created_at, role")
      .in("user_id", ids)
      .eq("role", "user")
      .gte("created_at", since),
    admin
      .from("coaching_notification_events")
      .select("user_id, purpose, status, created_at, local_date")
      .in("user_id", ids)
      .gte("created_at", new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const failed = [
    subscriptions.error,
    checkIns.error,
    meals.error,
    sessions.error,
    plans.error,
    targets.error,
    messages.error,
    events.error,
  ].find((error) => error);
  if (failed) {
    console.error("[coaching] History failed:", failed.message);
    return [];
  }

  const subscribed = new Set(
    rows(subscriptions.data)
      .map((row) => row.user_id)
      .filter((id): id is string => typeof id === "string"),
  );

  return enabled
    .filter((row) => subscribed.has(row.id as string))
    .map((row) =>
      snapshotForUser(row.id as string, row.timezone, now, {
        checkIns: rows(checkIns.data),
        meals: rows(meals.data),
        sessions: rows(sessions.data),
        plans: rows(plans.data),
        targets: rows(targets.data),
        messages: rows(messages.data),
        events: rows(events.data),
      }),
    );
}

function snapshotForUser(
  userId: string,
  timeZone: unknown,
  now: Date,
  source: {
    checkIns: Record<string, unknown>[];
    meals: Record<string, unknown>[];
    sessions: Record<string, unknown>[];
    plans: Record<string, unknown>[];
    targets: Record<string, unknown>[];
    messages: Record<string, unknown>[];
    events: Record<string, unknown>[];
  },
): CoachingFacts {
  const own = (row: Record<string, unknown>) => row.user_id === userId;
  const checkInRows: CoachingCheckIn[] = source.checkIns.filter(own).flatMap((row) => {
    if (
      typeof row.check_in_date !== "string" ||
      typeof row.created_at !== "string" ||
      typeof row.planned_training !== "string"
    ) {
      return [];
    }
    return [
      {
        checkInDate: row.check_in_date,
        createdAt: row.created_at,
        plannedTraining: row.planned_training,
      },
    ];
  });
  const mealRows: CoachingMeal[] = source.meals.filter(own).flatMap((row) => {
    if (typeof row.logged_date !== "string" || typeof row.created_at !== "string") {
      return [];
    }
    return [
      {
        loggedDate: row.logged_date,
        createdAt: row.created_at,
        status: typeof row.status === "string" ? row.status : "eaten",
        proteinG: asNumber(row.protein_g_estimated),
      },
    ];
  });
  const sessionRows: CoachingSession[] = source.sessions.filter(own).flatMap((row) => {
    if (
      typeof row.session_date !== "string" ||
      typeof row.created_at !== "string" ||
      typeof row.training_type !== "string"
    ) {
      return [];
    }
    return [
      {
        sessionDate: row.session_date,
        createdAt: row.created_at,
        trainingType: row.training_type,
      },
    ];
  });
  const planRows: CoachingPlanEntry[] = source.plans.filter(own).flatMap((row) => {
    if (
      typeof row.plan_date !== "string" ||
      typeof row.training_type !== "string" ||
      typeof row.status !== "string"
    ) {
      return [];
    }
    return [
      {
        planDate: row.plan_date,
        trainingType: row.training_type,
        status: row.status,
      },
    ];
  });
  const messageRows: CoachingMessage[] = source.messages.filter(own).flatMap((row) => {
    if (typeof row.created_at !== "string") {
      return [];
    }
    return [{ createdAt: row.created_at }];
  });
  const eventRows: CoachingEvent[] = source.events.filter(own).flatMap((row) => {
    if (
      typeof row.purpose !== "string" ||
      typeof row.status !== "string" ||
      typeof row.created_at !== "string" ||
      typeof row.local_date !== "string"
    ) {
      return [];
    }
    return [
      {
        purpose: row.purpose,
        status: row.status,
        createdAt: row.created_at,
        localDate: row.local_date,
      },
    ];
  });
  const target = source.targets.find(own);

  return {
    userId,
    timeZone: resolveTimeZone(typeof timeZone === "string" ? timeZone : null),
    coachingEnabled: true,
    now,
    checkIns: checkInRows,
    meals: mealRows,
    sessions: sessionRows,
    planEntries: planRows,
    proteinTargetG: asNumber(target?.protein_g),
    coachMessages: messageRows,
    events: eventRows,
  };
}

export async function claimCoachingEvent(
  admin: AdminClient,
  facts: CoachingFacts,
  decision: CoachingDecision,
): Promise<string | null> {
  const localDate = zonedClock(facts.now, facts.timeZone).date;
  const { data, error } = await admin
    .from("coaching_notification_events")
    .insert({
      user_id: facts.userId,
      purpose: decision.purpose,
      local_date: localDate,
      status: "claimed",
      title: decision.title,
      body: decision.body,
      destination: decision.url,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code !== "23505") {
      console.error("[coaching] Claim failed:", error.message);
    }
    return null;
  }

  return data && typeof data.id === "string" ? data.id : null;
}

export async function deliverCoachingEvent(
  admin: AdminClient,
  facts: CoachingFacts,
  decision: CoachingDecision,
): Promise<{
  delivered: boolean;
  expiredSubscriptionIds: string[];
  lastStatus?: number;
}> {
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", facts.userId);

  if (error) {
    console.error("[coaching] Subscriptions failed:", error.message);
    return { delivered: false, expiredSubscriptionIds: [] };
  }

  let delivered = false;
  let lastStatus: number | undefined;
  const expiredSubscriptionIds: string[] = [];

  for (const row of rows(data)) {
    if (
      typeof row.id !== "string" ||
      typeof row.endpoint !== "string" ||
      typeof row.p256dh !== "string" ||
      typeof row.auth !== "string"
    ) {
      continue;
    }

    try {
      await sendWebPush(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        decision,
      );
      delivered = true;
    } catch (sendError) {
      const statusCode =
        sendError &&
        typeof sendError === "object" &&
        "statusCode" in sendError &&
        typeof sendError.statusCode === "number"
          ? sendError.statusCode
          : undefined;
      const reason =
        sendError && typeof sendError === "object" && "body" in sendError
          ? pushProviderReason(sendError.body)
          : undefined;
      lastStatus = statusCode;
      console.error(
        "[coaching] Send failed:",
        decision.purpose,
        statusCode ?? "unknown",
        reason ?? "no-reason",
        pushEndpointHost(row.endpoint),
      );
      if (isExpiredPushStatus(statusCode)) {
        expiredSubscriptionIds.push(row.id);
        await admin
          .from("push_subscriptions")
          .delete()
          .eq("id", row.id)
          .eq("user_id", facts.userId);
      }
    }
  }

  return { delivered, expiredSubscriptionIds, lastStatus };
}

export async function recordCoachingResult(
  admin: AdminClient,
  facts: CoachingFacts,
  eventId: string,
  result: { delivered: boolean; lastStatus?: number },
): Promise<void> {
  const { error } = await admin
    .from("coaching_notification_events")
    .update({
      status: result.delivered ? "sent" : "failed",
      provider_status: result.lastStatus ?? null,
    })
    .eq("id", eventId)
    .eq("user_id", facts.userId);

  if (error) {
    console.error("[coaching] Result update failed:", error.message);
  }
}

export function coachingPushReady(): { ok: true } | { ok: false; message: string } {
  const configured = configureWebPush();
  if (!configured.ok) {
    return configured;
  }
  return { ok: true };
}
