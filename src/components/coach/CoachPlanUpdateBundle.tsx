"use client";

import { useState } from "react";
import {
  acceptCoachChangeProposal,
  acceptPendingCoachChangesForConversation,
  rejectCoachChangeProposal,
} from "@/app/actions/coach-changes";
import {
  acceptTrainingPlanProposal,
  rejectTrainingPlanProposal,
} from "@/app/actions/training";
import {
  describeCoachChangeProposal,
  type CoachChangeProposalRecord,
} from "@/lib/coach-change-proposals";
import type { TrainingPlanProposalRecord } from "@/lib/training-plan";

const KIND_LABEL: Record<CoachChangeProposalRecord["kind"], string> = {
  nutrition_targets: "Nutrition",
  programme_phases: "Programme",
  activity_pattern: "Activity",
  goal: "Goal",
  weekly_schedule: "Weekly schedule",
};

export function CoachPlanUpdateBundle({
  conversationId,
  changeProposals,
  planProposals,
  onResolved,
}: {
  conversationId: string;
  changeProposals: CoachChangeProposalRecord[];
  planProposals: TrainingPlanProposalRecord[];
  onResolved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"accepted" | "rejected" | null>(null);

  if (changeProposals.length === 0 && planProposals.length === 0) {
    return null;
  }

  if (done === "accepted") {
    return (
      <div className="rounded-2xl border border-border/80 bg-surface/40 px-4 py-3">
        <p className="text-[13px] text-foreground">Plan updates saved.</p>
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

  const hasGoal = changeProposals.some((p) => p.kind === "goal");
  const title = hasGoal
    ? "Proposed plan update"
    : changeProposals.length + planProposals.length > 1
      ? "Proposed changes"
      : "Proposed change";

  return (
    <div className="rounded-2xl border border-border/80 bg-surface/40 px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
        {title}
      </p>
      <p className="mt-2 text-[13px] leading-6 text-muted">
        Related recommendations are grouped so goal, training and nutrition stay
        aligned. Nothing is saved until you confirm.
      </p>

      <div className="mt-4 space-y-4">
        {changeProposals.map((proposal) => (
          <div key={proposal.id}>
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
              {KIND_LABEL[proposal.kind]}
            </p>
            {proposal.reason ? (
              <p className="mt-1 text-[14px] leading-6 text-foreground">
                {proposal.reason}
              </p>
            ) : null}
            <ul className="mt-2 space-y-1 text-[13px] text-muted">
              {describeCoachChangeProposal(proposal).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}

        {planProposals.map((proposal) => (
          <div key={proposal.id}>
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
              Weekly schedule
            </p>
            {proposal.reason ? (
              <p className="mt-1 text-[14px] leading-6 text-foreground">
                {proposal.reason}
              </p>
            ) : null}
            <ul className="mt-2 space-y-1 text-[13px] text-muted">
              {proposal.changes.map((change) => (
                <li key={`${change.entryId}-${change.action}`}>
                  {change.action}
                  {change.toDate ? ` → ${change.toDate}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-muted">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-white disabled:opacity-60"
          onClick={() => {
            void (async () => {
              setBusy(true);
              setError(null);

              // Apply goal first, then nutrition/programme, then weekly plan moves.
              const ordered = [...changeProposals].sort((a, b) => {
                const rank = (kind: CoachChangeProposalRecord["kind"]) =>
                  kind === "goal"
                    ? 0
                    : kind === "programme_phases"
                      ? 1
                      : kind === "nutrition_targets"
                        ? 2
                        : kind === "weekly_schedule"
                          ? 3
                          : 4;
                return rank(a.kind) - rank(b.kind);
              });

              for (const proposal of ordered) {
                const result = await acceptCoachChangeProposal({
                  proposalId: proposal.id,
                });
                if (result.status === "error") {
                  setBusy(false);
                  setError(result.message);
                  return;
                }
              }

              // Catch any siblings created in the same conversation turn.
              const remaining = await acceptPendingCoachChangesForConversation({
                conversationId,
              });
              if (remaining.status === "error") {
                setBusy(false);
                setError(
                  remaining.message ?? "Some changes couldn’t be saved.",
                );
                return;
              }

              for (const proposal of planProposals) {
                const result = await acceptTrainingPlanProposal({
                  proposalId: proposal.id,
                });
                if (result.status === "error") {
                  setBusy(false);
                  setError(result.message);
                  return;
                }
              }

              setBusy(false);
              setDone("accepted");
              onResolved?.();
            })();
          }}
        >
          Accept all changes
        </button>
        <button
          type="button"
          disabled={busy}
          className="inline-flex h-10 items-center rounded-full border border-border px-4 text-[13px] text-foreground disabled:opacity-60"
          onClick={() => {
            void (async () => {
              setBusy(true);
              setError(null);
              for (const proposal of changeProposals) {
                const result = await rejectCoachChangeProposal({
                  proposalId: proposal.id,
                });
                if (result.status === "error") {
                  setBusy(false);
                  setError(result.message);
                  return;
                }
              }
              for (const proposal of planProposals) {
                const result = await rejectTrainingPlanProposal({
                  proposalId: proposal.id,
                });
                if (result.status === "error") {
                  setBusy(false);
                  setError(result.message);
                  return;
                }
              }
              setBusy(false);
              setDone("rejected");
              onResolved?.();
            })();
          }}
        >
          Keep current plan
        </button>
      </div>
    </div>
  );
}
