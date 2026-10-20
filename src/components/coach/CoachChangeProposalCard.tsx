"use client";

import { useState } from "react";
import {
  acceptCoachChangeProposal,
  rejectCoachChangeProposal,
} from "@/app/actions/coach-changes";
import { buttonClassName } from "@/components/ui/Button";
import { cardClass } from "@/components/ui/surfaces";
import {
  describeCoachChangeProposal,
  type CoachChangeProposalRecord,
} from "@/lib/coach-change-proposals";

const KIND_LABEL: Record<CoachChangeProposalRecord["kind"], string> = {
  nutrition_targets: "Proposed nutrition targets",
  programme_phases: "Proposed programme update",
  activity_pattern: "Proposed activity update",
  goal: "Proposed goal update",
  weekly_schedule: "Proposed weekly schedule",
};

export function CoachChangeProposalCard({
  proposal,
  onResolved,
}: {
  proposal: CoachChangeProposalRecord;
  onResolved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"accepted" | "rejected" | null>(null);

  if (done === "accepted") {
    return (
      <div className={`${cardClass} px-4 py-3`}>
        <p className="text-[13px] text-foreground">Change saved.</p>
      </div>
    );
  }
  if (done === "rejected") {
    return (
      <div className={`${cardClass} px-4 py-3`}>
        <p className="text-[13px] text-muted">Original settings kept.</p>
      </div>
    );
  }

  const lines = describeCoachChangeProposal(proposal);

  return (
    <div className={`${cardClass} px-4 py-4`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
        {KIND_LABEL[proposal.kind]}
      </p>
      {proposal.reason ? (
        <p className="mt-2 text-[14px] leading-6 text-foreground">
          {proposal.reason}
        </p>
      ) : null}
      <ul className="mt-3 space-y-1.5 text-[13px] text-muted">
        {lines.map((line) => (
          <li key={line}>{line}</li>
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
          className={buttonClassName()}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setError(null);
              const result = await acceptCoachChangeProposal({
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
          className={buttonClassName("secondary")}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setError(null);
              const result = await rejectCoachChangeProposal({
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
          Keep current
        </button>
      </div>
    </div>
  );
}
