"use client";

import { useEffect, useMemo, useState } from "react";
import {
  copyNutritionEntriesToDate,
  loadQuickMealContext,
} from "@/app/actions/nutrition-quick-log";
import { labelForMealType, type NutritionEntryRecord } from "@/lib/nutrition";
import {
  buildNutritionUsuals,
  entriesNotAlreadyLogged,
  formatUsualServing,
  groupNutritionUsuals,
  nutritionUsualKey,
  type NutritionUsual,
} from "@/lib/nutrition-usuals";

type MyUsualsPanelProps = {
  loggedDate: string;
  existingEntries: NutritionEntryRecord[];
  onAdded: () => Promise<void> | void;
};

function macroLine(item: NutritionUsual): string {
  return `${Math.round(item.calories)} kcal · ${Math.round(item.proteinG)}g P · ${Math.round(item.carbsG)}g C · ${Math.round(item.fatG)}g F`;
}

export function MyUsualsPanel({
  loggedDate,
  existingEntries,
  onAdded,
}: MyUsualsPanelProps) {
  const [history, setHistory] = useState<NutritionEntryRecord[]>([]);
  const [yesterday, setYesterday] = useState<NutritionEntryRecord[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [repeatIds, setRepeatIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadQuickMealContext(loggedDate).then((result) => {
      if (cancelled || result.status !== "ok") {
        return;
      }
      setHistory(result.context.history);
      setYesterday(result.context.yesterday);
    });
    return () => {
      cancelled = true;
    };
  }, [loggedDate, existingEntries.length]);

  const usuals = useMemo(() => buildNutritionUsuals(history), [history]);
  const groups = useMemo(() => groupNutritionUsuals(usuals), [usuals]);
  const alreadyLogged = useMemo(
    () => new Set(existingEntries.map((entry) => nutritionUsualKey(entry))),
    [existingEntries],
  );
  const yesterdayChoices = useMemo(
    () => entriesNotAlreadyLogged(yesterday, existingEntries),
    [yesterday, existingEntries],
  );

  function toggle(id: string, list: string[], setList: (next: string[]) => void) {
    setList(
      list.includes(id) ? list.filter((item) => item !== id) : [...list, id],
    );
  }

  async function addSources(
    ids: string[],
    clear: () => void,
    preserveStatus = false,
  ) {
    if (busy || ids.length === 0) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await copyNutritionEntriesToDate({
      loggedDate,
      sourceEntryIds: ids,
      preserveStatus,
    });
    setBusy(false);
    if (result.status !== "ok") {
      setError(result.message);
      return;
    }
    clear();
    if (result.added === 0) {
      setMessage("Those foods are already in this day.");
    } else {
      setMessage(
        result.skipped > 0
          ? `Added ${result.added}. ${result.skipped} already logged.`
          : `Added ${result.added} ${result.added === 1 ? "food" : "foods"}.`,
      );
    }
    await onAdded();
  }

  if (groups.length === 0 && yesterday.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.25rem] border border-border px-4 py-4">
      <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-muted">
        My usuals
      </h2>
      {groups.length === 0 ? (
        <p className="mt-3 text-[14px] leading-6 text-muted">
          Foods you log will show up here for next time.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-[13px] font-medium text-foreground">{group.label}</p>
              <ul className="mt-1">
                {group.items.map((item) => {
                  const checked = selected.includes(item.sourceEntryId);
                  const logged = alreadyLogged.has(item.key);
                  return (
                    <li key={item.key}>
                      <label
                        className={`mt-1 flex items-start gap-3 rounded-xl px-2 py-2 ${checked ? "bg-foreground/5" : ""}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          disabled={busy || logged}
                          onChange={() => toggle(item.sourceEntryId, selected, setSelected)}
                        />
                        <span className="min-w-0">
                          <span className="block text-[15px] text-foreground">{item.name}</span>
                          <span className="block text-[12px] leading-5 text-muted">
                            {formatUsualServing(item.portions)} · {macroLine(item)} · adds to {group.label}
                            {logged ? " · already logged" : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <button
            type="button"
            disabled={busy || selected.length === 0}
            onClick={() => {
              void addSources(selected, () => setSelected([]));
            }}
            className="inline-flex h-11 w-fit items-center rounded-full bg-foreground px-4 text-[14px] font-medium text-background disabled:opacity-50"
          >
            {busy ? "Adding…" : `Add selected${selected.length ? ` (${selected.length})` : ""}`}
          </button>
        </div>
      )}

      <div className="mt-5 border-t border-border pt-4">
        {repeatIds == null ? (
          <button
            type="button"
            disabled={busy || yesterdayChoices.length === 0}
            onClick={() => setRepeatIds(yesterdayChoices.map((entry) => entry.id))}
            className="text-[14px] text-foreground underline-offset-4 hover:underline disabled:text-muted disabled:no-underline"
          >
            {yesterdayChoices.length === 0
              ? "Nothing new from yesterday"
              : "Repeat yesterday"}
          </button>
        ) : (
          <div>
            <p className="text-[13px] font-medium text-foreground">Add from yesterday</p>
            <ul className="mt-2">
              {yesterdayChoices.map((entry) => {
                const checked = repeatIds.includes(entry.id);
                return (
                  <li key={entry.id}>
                    <label className={`mt-1 flex items-start gap-3 rounded-xl px-2 py-2 ${checked ? "bg-foreground/5" : ""}`}>
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        disabled={busy}
                        onChange={() => toggle(entry.id, repeatIds, setRepeatIds)}
                      />
                      <span>
                        <span className="block text-[15px] text-foreground">
                          {entry.display_name?.trim() || entry.description}
                        </span>
                        <span className="block text-[12px] leading-5 text-muted">
                          {entry.meal_type ? labelForMealType(entry.meal_type) : "No meal type"}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || repeatIds.length === 0}
                onClick={() => {
                  void addSources(repeatIds, () => setRepeatIds(null), true);
                }}
                className="inline-flex h-11 items-center rounded-full bg-foreground px-4 text-[14px] font-medium text-background disabled:opacity-50"
              >
                {busy ? "Adding…" : "Add to this day"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRepeatIds(null)}
                className="inline-flex h-11 items-center rounded-full border border-border px-4 text-[14px] text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {message ? <p className="mt-3 text-[13px] leading-6 text-foreground">{message}</p> : null}
      {error ? (
        <p role="alert" className="mt-3 text-[13px] leading-6 text-muted">
          {error}
        </p>
      ) : null}
    </section>
  );
}
