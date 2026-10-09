"use client";

import { useState } from "react";
import {
  acceptTrainingPlanProposal,
  rejectTrainingPlanProposal,
} from "@/app/actions/training";
import type { TrainingPlanProposalRecord } from "@/lib/training-plan";

export function PlanProposalCard({
  proposal,
  onResolved,
}: {
  proposal: TrainingPlanProposalRecord;
  onResolved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"accepted" | "rejected" | null>(null);

  if (done === "accepted") {
    return (
      <div className="rounded-2xl border border-border/80 bg-surface/40 px-4 py-3">
        <p className="text-[13px] text-foreground">Plan updated.</p>
      </div>
    );
  }
  if (done === "rejected") {
    return (
      <div className="rounded-2xl border border-border/80 bg-surface/40 px-4 py-3">
        <p className="text-[13px] text-muted">Original plan kept.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-surface/40 px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
        Proposed changes
      </p>
      {proposal.reason ? (
        <p className="mt-2 text-[14px] leading-6 text-foreground">
          {proposal.reason}
        </p>
      ) : null}
      <ul className="mt-3 space-y-1.5 text-[13px] text-muted">
        {proposal.changes.map((change) => (
          <li key={`${change.entryId}-${change.action}`}>
            {describeChange(change.action, change.toDate, change.plannedDurationMinutes)}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-muted">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-[13px] font-medium text-background disabled:opacity-60"
          onClick={() => {
            void (async () => {
              setBusy(true);
              setError(null);
              const result = await acceptTrainingPlanProposal({
                proposalId: proposal.id,
              });
              setBusy(false);
              if (result.status === "error") {
                setError(result.message);
                return;
              }
              setDone("accepted");
              onResolved?.();
            })();
          }}
        >
          Accept changes
        </button>
        <button
          type="button"
          disabled={busy}
          className="inline-flex h-10 items-center rounded-full border border-border px-4 text-[13px] text-foreground disabled:opacity-60"
          onClick={() => {
            void (async () => {
              setBusy(true);
              setError(null);
              const result = await rejectTrainingPlanProposal({
                proposalId: proposal.id,
              });
              setBusy(false);
              if (result.status === "error") {
                setError(result.message);
                return;
              }
              setDone("rejected");
              onResolved?.();
            })();
          }}
        >
          Keep original plan
        </button>
      </div>
    </div>
  );
}

function describeChange(
  action: string,
  toDate?: string | null,
  minutes?: number | null,
): string {
  switch (action) {
    case "move":
      return toDate ? `Move workout to ${toDate}` : "Move workout";
    case "shorten":
      return minutes != null
        ? `Shorten to ${minutes} minutes`
        : "Shorten workout";
    case "skip":
    case "leave_skipped":
      return "Leave workout skipped";
    case "replace":
      return "Replace with a different session";
    default:
      return action;
  }
}
