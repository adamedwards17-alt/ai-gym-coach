"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadEveningCheckIn,
  saveEveningCheckIn,
  type EveningCheckInPayload,
} from "@/app/actions/evening-check-in";
import { estimateNutritionFood, saveNutritionEntry } from "@/app/actions/nutrition";
import { copyNutritionEntriesToDate, loadQuickMealContext } from "@/app/actions/nutrition-quick-log";
import { loadSavedFoodDefinitions } from "@/app/actions/saved-food";
import { buttonClassName } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/surfaces";
import {
  buildEveningPlan,
  foodAlreadyLogged,
  type EveningAnswers,
  type EveningMainMeal,
  type EveningStep,
} from "@/lib/evening-check-in";
import {
  entryDisplayTitle,
  labelForMealType,
  type NutritionEntryRecord,
  type NutritionEstimate,
} from "@/lib/nutrition";
import { RecentFoodPicker } from "@/components/nutrition/RecentFoodPicker";
import { SavedFoodEditor } from "@/components/nutrition/SavedFoodEditor";
import {
  compareUsualsByRecency,
  formatUsualServing,
  LOGGED_TODAY_LABEL,
  recentUsualsForMeal,
} from "@/lib/nutrition-usuals";
import {
  findSavedFood,
  overlaySavedFoods,
  savedFoodLoggedToday,
  upsertSavedFood,
  type SavedFoodDefinition,
} from "@/lib/saved-food";

export function EveningCheckInExperience({ date }: { date: string | null }) {
  const router = useRouter();
  const [data, setData] = useState<EveningCheckInPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loggingMeal, setLoggingMeal] = useState<EveningMainMeal | "snack" | null>(null);

  const reload = useCallback(async () => {
    const result = await loadEveningCheckIn(date);
    if (result.status !== "ok") {
      setError(result.message);
      return;
    }
    setData(result.data);
    setError(null);
  }, [date]);

  useEffect(() => {
    queueMicrotask(() => {
      void reload();
    });
  }, [reload]);

  const plan = useMemo(
    () => (data ? buildEveningPlan(data.day, data.answers) : null),
    [data],
  );

  async function persist(answers: EveningAnswers, complete = false) {
    if (!data) {
      return;
    }
    setBusy(true);
    const result = await saveEveningCheckIn({
      date: data.date,
      answers,
      complete,
    });
    setBusy(false);
    if (result.status !== "ok") {
      setError(result.message);
      return;
    }
    setData(result.data);
    setError(null);
  }

  if (!data || !plan) {
    return (
      <p className="px-5 py-16 text-center text-[13px] text-muted">
        {error ?? "Loading…"}
      </p>
    );
  }

  const step = plan.steps[0] ?? null;
  const total = plan.answered + plan.remaining;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-28 pt-8 sm:max-w-lg sm:px-6">
      <PageHeader
        eyebrow="Today"
        title="Evening check-in"
        detail="A short look at the day you actually logged."
        action={
          <Link href="/today" className="text-[13px] font-medium text-primary">
            Close
          </Link>
        }
      />

      {total > 0 ? (
        <p className="text-[13px] text-muted">
          {plan.mode === "review"
            ? "This check-in is already complete."
            : plan.remaining === 0
              ? "Ready to finish."
              : `${plan.remaining} question${plan.remaining === 1 ? "" : "s"} left`}
        </p>
      ) : null}

      {plan.loggedWorkout ? (
        <Card>
          <SectionTitle>Training</SectionTitle>
          <p className="mt-2 text-[16px] font-semibold text-foreground">
            {plan.loggedWorkout.title}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            Logged
            {plan.loggedWorkout.durationMinutes
              ? ` · ${plan.loggedWorkout.durationMinutes} min`
              : ""}
          </p>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Food diary</SectionTitle>
        <p className="mt-2 text-[20px] font-semibold tracking-tight text-foreground">
          {plan.totals.calories.toLocaleString()}
          <span className="text-[14px] font-medium text-muted"> kcal</span>
          <span className="ml-3 text-[14px] font-medium text-muted">
            {plan.totals.proteinG}g protein
          </span>
        </p>
        {plan.diary.length === 0 ? (
          <EmptyState>Nothing logged for this day yet.</EmptyState>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {plan.diary.map((group) => (
              <div key={group.id}>
                <p className="text-[13px] font-semibold text-foreground">{group.label}</p>
                <ul className="mt-1 divide-y divide-border">
                  {group.items.map((item) => (
                    <li key={item.id} className="py-2">
                      <p className="text-[14px] text-foreground">
                        {item.title}
                        {item.planned ? " · planned" : ""}
                      </p>
                      <p className="text-[12px] text-muted">
                        {item.serving}
                        {item.nutrition ? ` · ${item.nutrition}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      {error ? (
        <p role="alert" className="text-[13px] text-danger-text">{error}</p>
      ) : null}

      {plan.mode === "review" ? (
        <Card>
          <SectionTitle>Saved</SectionTitle>
          <p className="mt-2 text-[14px] leading-6 text-muted">
            Your answers are kept. You don’t need to go through the questions again.
          </p>
          <Link href="/today" className={`${buttonClassName()} mt-3`}>
            Back to Today
          </Link>
        </Card>
      ) : loggingMeal ? (
        <FoodLogger
          date={data.date}
          meal={loggingMeal}
          existing={data.day.meals}
          busy={busy}
          onCancel={() => setLoggingMeal(null)}
          onSaved={() => {
            setLoggingMeal(null);
            void reload();
          }}
        />
      ) : step ? (
        <QuestionCard
          step={step}
          busy={busy}
          onTraining={(answer) => {
            void persist({ ...data.answers, training: answer }).then(() => {
              if (answer === "forgot") {
                router.push("/train");
              }
            });
          }}
          onMeal={(meal, answer) => {
            if (answer === "had") {
              setLoggingMeal(meal);
              return;
            }
            void persist({
              ...data.answers,
              meals: { ...data.answers.meals, [meal]: answer },
            });
          }}
          onExtras={(answer) => {
            if (answer === "more") {
              setLoggingMeal("snack");
              return;
            }
            void persist({ ...data.answers, extras: "none" });
          }}
          onChoice={(id, value) => {
            void persist({ ...data.answers, [id]: value });
          }}
        />
      ) : (
        <Card>
          <SectionTitle>That’s the day</SectionTitle>
          <p className="mt-2 text-[14px] leading-6 text-muted">
            Training, food and recovery are recorded.
          </p>
          <button
            type="button"
            disabled={busy}
            className={`${buttonClassName()} mt-3`}
            onClick={() => void persist(data.answers, true)}
          >
            {busy ? "Saving…" : "Finish check-in"}
          </button>
        </Card>
      )}
    </div>
  );
}

function QuestionCard({
  step,
  busy,
  onTraining,
  onMeal,
  onExtras,
  onChoice,
}: {
  step: EveningStep;
  busy: boolean;
  onTraining: (answer: "rest" | "forgot") => void;
  onMeal: (meal: EveningMainMeal, answer: "had" | "skipped" | "later") => void;
  onExtras: (answer: "none" | "more") => void;
  onChoice: (id: EveningStep["id"], value: string | number) => void;
}) {
  return (
    <Card>
      <SectionTitle>Question</SectionTitle>
      <p className="mt-2 text-[16px] font-semibold leading-6 text-foreground">
        {step.kind === "training" || step.kind === "meal" || step.kind === "extras" || step.kind === "choice"
          ? step.prompt
          : ""}
      </p>
      {step.kind === "training" && step.detail ? (
        <p className="mt-1 text-[13px] leading-5 text-muted">{step.detail}</p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2">
        {step.kind === "training" ? (
          <>
            <button
              type="button"
              disabled={busy}
              className={buttonClassName()}
              onClick={() => onTraining("forgot")}
            >
              I trained — log it
            </button>
            <button
              type="button"
              disabled={busy}
              className={buttonClassName("secondary")}
              onClick={() => onTraining("rest")}
            >
              Rest day
            </button>
          </>
        ) : null}
        {step.kind === "meal" ? (
          <>
            <button type="button" className={buttonClassName()} onClick={() => onMeal(step.meal, "had")}>
              Log {labelForMealType(step.meal).toLowerCase()}
            </button>
            <button
              type="button"
              disabled={busy}
              className={buttonClassName("secondary")}
              onClick={() => onMeal(step.meal, "skipped")}
            >
              I skipped it
            </button>
            <button
              type="button"
              disabled={busy}
              className={buttonClassName("secondary")}
              onClick={() => onMeal(step.meal, "later")}
            >
              Not yet
            </button>
          </>
        ) : null}
        {step.kind === "extras" ? (
          <>
            <button type="button" className={buttonClassName()} onClick={() => onExtras("more")}>
              Add a snack or drink
            </button>
            <button
              type="button"
              disabled={busy}
              className={buttonClassName("secondary")}
              onClick={() => onExtras("none")}
            >
              Diary is complete
            </button>
          </>
        ) : null}
        {step.kind === "choice"
          ? step.options.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={busy}
                className={buttonClassName("secondary")}
                onClick={() =>
                  onChoice(
                    step.id,
                    step.id === "energy" ? Number(option.id) : option.id,
                  )
                }
              >
                {option.label}
              </button>
            ))
          : null}
      </div>
    </Card>
  );
}

function FoodLogger({
  date,
  meal,
  existing,
  busy,
  onCancel,
  onSaved,
}: {
  date: string;
  meal: EveningMainMeal | "snack";
  existing: EveningCheckInPayload["day"]["meals"];
  busy: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [history, setHistory] = useState<NutritionEntryRecord[]>([]);
  const [savedFoods, setSavedFoods] = useState<SavedFoodDefinition[]>([]);
  const [editingSaved, setEditingSaved] = useState<NutritionEntryRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [estimate, setEstimate] = useState<NutritionEstimate | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadQuickMealContext(date).then((result) => {
      if (cancelled || result.status !== "ok") {
        return;
      }
      setHistory(result.context.history);
    });
    void loadSavedFoodDefinitions().then((result) => {
      if (cancelled || result.status !== "ok" || result.foods.length === 0) {
        return;
      }
      setSavedFoods(result.foods);
    });
    return () => {
      cancelled = true;
    };
  }, [date, meal]);

  const usuals = useMemo(() => {
    const entries = overlaySavedFoods(history, savedFoods);
    if (meal === "snack") {
      return [
        ...recentUsualsForMeal(entries, "snack"),
        ...recentUsualsForMeal(entries, "drink"),
      ].sort(compareUsualsByRecency);
    }
    return recentUsualsForMeal(entries, meal);
  }, [history, meal, savedFoods]);

  async function addSelected() {
    const chosen = usuals.filter((item) => selectedIds.includes(item.sourceEntryId));
    if (working || busy || chosen.length === 0) {
      return;
    }
    setWorking(true);
    const result = await copyNutritionEntriesToDate({
      loggedDate: date,
      sourceEntryIds: chosen.map((item) => item.sourceEntryId),
      allowDuplicates: true,
      mealType: meal,
    });
    setWorking(false);
    if (result.status !== "ok") {
      setNote(result.message);
      return;
    }
    if (result.added === 0) {
      setNote("Those foods couldn’t be added.");
      return;
    }
    setSelectedIds([]);
    onSaved();
  }

  async function reviewDescription() {
    const text = description.trim();
    if (!text) {
      return;
    }
    setWorking(true);
    const result = await estimateNutritionFood({ description: text });
    setWorking(false);
    if (result.status === "ok" || result.status === "needs_review") {
      setEstimate(result.estimate);
      setNote(null);
      return;
    }
    setNote(result.status === "needs_clarification" ? result.question : result.message);
  }

  async function confirmEstimate() {
    if (!estimate) {
      return;
    }
    setWorking(true);
    const result = await saveNutritionEntry({
      loggedDate: date,
      description: description.trim(),
      mealType: meal,
      status: "eaten",
      estimate,
      portions: 1,
    });
    setWorking(false);
    if (result.status !== "saved") {
      setNote(result.message);
      return;
    }
    onSaved();
  }

  return (
    <>
    <Card>
      <SectionTitle>Add {labelForMealType(meal).toLowerCase()}</SectionTitle>
      {usuals.length > 0 ? (
        <div className="mt-3">
          <RecentFoodPicker
            label={`${labelForMealType(meal)} foods`}
            busy={working || busy}
            selectedIds={selectedIds}
            items={usuals.map((item) => {
              const todayKeys = new Set(
                existing
                  .filter((entry) => entry.meal_type === meal && entry.status === "eaten")
                  .map((entry) => entryDisplayTitle(entry).trim().toLowerCase()),
              );
              const logged =
                savedFoodLoggedToday(item.key, todayKeys, savedFoods) ||
                foodAlreadyLogged(
                  existing.filter((entry) => entry.meal_type === meal),
                  item.name,
                );
              const saved = findSavedFood(savedFoods, { name: item.name });
              return {
                id: item.sourceEntryId,
                title: item.name,
                note: logged ? LOGGED_TODAY_LABEL : undefined,
                detail: `${saved?.servingLabel ?? formatUsualServing(item.portions)} · ${Math.round(item.calories)} kcal · ${Math.round(item.proteinG)}g protein`,
              };
            })}
            onEdit={(id) => {
              const entry = history.find((item) => item.id === id);
              if (entry) {
                setEditingSaved(entry);
              }
            }}
            onToggle={(id) =>
              setSelectedIds((current) =>
                current.includes(id)
                  ? current.filter((item) => item !== id)
                  : [...current, id],
              )
            }
            onAdd={() => {
              void addSelected();
            }}
          />
        </div>
      ) : null}
      <label className="mt-3 block text-[13px] text-muted">
        Or describe it
        <input
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setEstimate(null);
          }}
          className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-[15px] text-foreground"
        />
      </label>
      {estimate ? (
        <div className="mt-3 rounded-xl bg-background px-3 py-3">
          <p className="text-[14px] font-semibold text-foreground">
            {estimate.displayName || description}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {estimate.calories} kcal · {estimate.proteinG}g protein · 1 serving
          </p>
          <button
            type="button"
            disabled={working}
            className={`${buttonClassName()} mt-3`}
            onClick={() => void confirmEstimate()}
          >
            {working ? "Saving…" : "Save to diary"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={working || !description.trim()}
          className={`${buttonClassName()} mt-3`}
          onClick={() => void reviewDescription()}
        >
          {working ? "Checking…" : "Review food"}
        </button>
      )}
      {note ? <p className="mt-2 text-[13px] text-muted">{note}</p> : null}
      <button type="button" className={`${buttonClassName("ghost")} mt-2`} onClick={onCancel}>
        Back
      </button>
    </Card>
    {editingSaved ? (
      <SavedFoodEditor
        entry={editingSaved}
        definition={findSavedFood(savedFoods, {
          mealId: editingSaved.meal_id,
          name: entryDisplayTitle(editingSaved),
        })}
        onClose={() => setEditingSaved(null)}
        onSaved={(food) => {
          setSavedFoods((current) => upsertSavedFood(current, food));
          setEditingSaved(null);
        }}
      />
    ) : null}
    </>
  );
}
