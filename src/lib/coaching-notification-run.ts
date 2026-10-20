import {
  claimCoachingDedupe,
  coachingDedupeKey,
  decideCoachingNotification,
  type CoachingDecision,
  type CoachingFacts,
} from "@/lib/coaching-notifications";

export type CoachingDeliveryResult = {
  delivered: boolean;
  expiredSubscriptionIds: string[];
  lastStatus?: number;
};

export type CoachingRunDeps = {
  now: Date;
  loadSnapshots: () => Promise<CoachingFacts[]>;
  claim: (facts: CoachingFacts, decision: CoachingDecision) => Promise<boolean>;
  deliver: (
    facts: CoachingFacts,
    decision: CoachingDecision,
  ) => Promise<CoachingDeliveryResult>;
  recordResult: (
    facts: CoachingFacts,
    decision: CoachingDecision,
    result: CoachingDeliveryResult,
  ) => Promise<void>;
};

export async function runCoachingPass(deps: CoachingRunDeps): Promise<{
  considered: number;
  sent: number;
}> {
  const snapshots = await deps.loadSnapshots();
  let sent = 0;
  for (const snapshot of snapshots) {
    const decision = decideCoachingNotification({ ...snapshot, now: deps.now });
    if (!decision) {
      continue;
    }
    const claimed = await deps.claim(snapshot, decision);
    if (!claimed) {
      continue;
    }
    const result = await deps.deliver(snapshot, decision);
    await deps.recordResult(snapshot, decision, result);
    if (result.delivered) {
      sent += 1;
    }
  }
  return { considered: snapshots.length, sent };
}

export function claimInMemory(
  claimed: Set<string>,
  facts: CoachingFacts,
  decision: CoachingDecision,
  localDate: string,
): boolean {
  return claimCoachingDedupe(
    claimed,
    coachingDedupeKey(facts.userId, decision.purpose, localDate),
  );
}
