"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  entryDisplayTitle,
  labelForMealType,
  mealTypeOptions,
  nutritionStatusOptions,
  type MealTypeId,
  type NutritionEntryRecord,
  type NutritionEntryStatus,
  type NutritionEstimate,
} from "@/lib/nutrition";

const QUANTITY_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3] as const;

type MacroField = "calories" | "proteinG" | "carbsG" | "fatG";

type EditorRow =
  | "quantity"
  | "calories"
  | "proteinG"
  | "carbsG"
  | "fatG"
  | "mealType"
  | "status";

export type RecentFoodLogValues = {
  description: string;
  mealType: MealTypeId | null;
  status: NutritionEntryStatus;
  estimate: NutritionEstimate;
};

type NutritionRecentFoodEditorProps = {
  entry: NutritionEntryRecord;
  baseEstimate: NutritionEstimate;
  initialMealType?: MealTypeId | null;
  /** When true, expand meal selection and ask "Which meal is this for?" */
  promptMealSelection?: boolean;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onLog: (values: RecentFoodLogValues) => void;
};

function roundMacro(value: number, field: MacroField): number {
  if (field === "calories") {
    return Math.max(0, Math.round(value));
  }
  return Math.max(0, Math.round(value * 10) / 10);
}

function scaleEstimate(
  base: Pick<NutritionEstimate, "calories" | "proteinG" | "carbsG" | "fatG">,
  quantity: number,
): Pick<NutritionEstimate, "calories" | "proteinG" | "carbsG" | "fatG"> {
  return {
    calories: roundMacro(base.calories * quantity, "calories"),
    proteinG: roundMacro(base.proteinG * quantity, "proteinG"),
    carbsG: roundMacro(base.carbsG * quantity, "carbsG"),
    fatG: roundMacro(base.fatG * quantity, "fatG"),
  };
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export function NutritionRecentFoodEditor({
  entry,
  baseEstimate,
  initialMealType = null,
  promptMealSelection = false,
  saving,
  error,
  onCancel,
  onLog,
}: NutritionRecentFoodEditorProps) {
  const [quantity, setQuantity] = useState(1);
  const [perServing, setPerServing] = useState({
    calories: baseEstimate.calories,
    proteinG: baseEstimate.proteinG,
    carbsG: baseEstimate.carbsG,
    fatG: baseEstimate.fatG,
  });
  const [mealType, setMealType] = useState<MealTypeId | null>(
    initialMealType ?? entry.meal_type,
  );
  const [status, setStatus] = useState<NutritionEntryStatus>("eaten");
  const [expanded, setExpanded] = useState<EditorRow | null>(
    promptMealSelection ? "mealType" : null,
  );
  const [manualSource, setManualSource] = useState(false);

  const macros = useMemo(
    () => scaleEstimate(perServing, quantity),
    [perServing, quantity],
  );

  function setMacro(field: MacroField, raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    setManualSource(true);
    setPerServing((current) => ({
      ...current,
      [field]: roundMacro(parsed / Math.max(quantity, 0.01), field),
    }));
  }

  function toggleRow(row: EditorRow) {
    setExpanded((current) => (current === row ? null : row));
  }

  const mealLabel = mealType ? labelForMealType(mealType) : "No meal type";
  const statusLabel =
    nutritionStatusOptions.find((option) => option.id === status)?.label ??
    status;

  return (
    <section className="today-reveal rounded-[1.75rem] border border-border/80 bg-surface/35 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            Recent food
          </p>
          <h2 className="mt-2 font-serif text-[1.55rem] leading-tight tracking-tight">
            {entryDisplayTitle(entry)}
          </h2>
          {entry.display_name &&
          entry.display_name.trim().toLowerCase() !==
            entry.description.trim().toLowerCase() ? (
            <p className="mt-1 text-[13px] leading-5 text-muted">
              {entry.description}
            </p>
          ) : null}
          <p className="mt-1 text-[14px] text-muted">{mealLabel}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 pt-1 text-[13px] text-muted transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="mt-5 divide-y divide-border/70 rounded-2xl border border-border/70 bg-background/40">
        <EditorLine
          label="Quantity / serving"
          value={`${formatQuantity(quantity)}×`}
          expanded={expanded === "quantity"}
          onToggle={() => toggleRow("quantity")}
        >
          <div className="flex flex-wrap gap-2 pb-3">
            {QUANTITY_PRESETS.map((preset) => {
              const selected = quantity === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setQuantity(preset)}
                  className={`min-h-10 min-w-12 rounded-full border px-3 text-[13px] transition-colors ${
                    selected
                      ? "border-white/20 bg-white/10 text-foreground"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {formatQuantity(preset)}×
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 pb-4">
            <button
              type="button"
              aria-label="Decrease quantity"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-[18px] text-foreground"
              onClick={() =>
                setQuantity((current) =>
                  Math.max(0.5, Math.round((current - 0.5) * 10) / 10),
                )
              }
            >
              −
            </button>
            <span className="min-w-12 text-center text-[15px] tabular-nums">
              {formatQuantity(quantity)}×
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-[18px] text-foreground"
              onClick={() =>
                setQuantity((current) =>
                  Math.min(6, Math.round((current + 0.5) * 10) / 10),
                )
              }
            >
              +
            </button>
          </div>
        </EditorLine>

        <MacroLine
          label="Calories"
          display={`${macros.calories} kcal`}
          expanded={expanded === "calories"}
          onToggle={() => toggleRow("calories")}
          value={String(macros.calories)}
          unit="kcal"
          onChange={(value) => setMacro("calories", value)}
        />
        <MacroLine
          label="Protein"
          display={`${macros.proteinG} g`}
          expanded={expanded === "proteinG"}
          onToggle={() => toggleRow("proteinG")}
          value={String(macros.proteinG)}
          unit="g"
          onChange={(value) => setMacro("proteinG", value)}
        />
        <MacroLine
          label="Carbs"
          display={`${macros.carbsG} g`}
          expanded={expanded === "carbsG"}
          onToggle={() => toggleRow("carbsG")}
          value={String(macros.carbsG)}
          unit="g"
          onChange={(value) => setMacro("carbsG", value)}
        />
        <MacroLine
          label="Fat"
          display={`${macros.fatG} g`}
          expanded={expanded === "fatG"}
          onToggle={() => toggleRow("fatG")}
          value={String(macros.fatG)}
          unit="g"
          onChange={(value) => setMacro("fatG", value)}
        />

        <EditorLine
          label={
            promptMealSelection ? "Which meal is this for?" : "Meal type"
          }
          value={mealLabel}
          expanded={expanded === "mealType"}
          onToggle={() => toggleRow("mealType")}
        >
          <div className="flex flex-wrap gap-2 pb-4">
            {mealTypeOptions.map((option) => {
              const selected =
                option.id === "skip"
                  ? mealType === null
                  : mealType === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    if (option.id === "skip") {
                      setMealType(null);
                    } else {
                      setMealType(option.id);
                    }
                  }}
                  className={`min-h-10 rounded-full border px-3 text-[13px] transition-colors ${
                    selected
                      ? "border-white/20 bg-white/10 text-foreground"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </EditorLine>

        <EditorLine
          label="Status"
          value={statusLabel}
          expanded={expanded === "status"}
          onToggle={() => toggleRow("status")}
        >
          <div className="flex flex-wrap gap-2 pb-4">
            {nutritionStatusOptions.map((option) => {
              const selected = status === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setStatus(option.id)}
                  className={`min-h-10 rounded-full border px-3 text-[13px] transition-colors ${
                    selected
                      ? "border-white/20 bg-white/10 text-foreground"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </EditorLine>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-[13px] text-muted">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={saving}
        className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-medium text-background disabled:opacity-60"
        onClick={() =>
          onLog({
            description: entry.description,
            mealType,
            status,
            estimate: {
              calories: macros.calories,
              proteinG: Math.round(macros.proteinG),
              carbsG: Math.round(macros.carbsG),
              fatG: Math.round(macros.fatG),
              confidence: baseEstimate.confidence,
              source:
                manualSource || quantity !== 1 ? "user" : baseEstimate.source,
              items: [],
            },
          })
        }
      >
        {saving ? "Logging…" : "Log food"}
      </button>
    </section>
  );
}

function EditorLine({
  label,
  value,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  value: string;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
        aria-expanded={expanded}
      >
        <span className="text-[14px] text-muted">{label}</span>
        <span className="flex items-center gap-2 text-[14px] text-foreground">
          {value}
          <span className="text-muted" aria-hidden>
            {expanded ? "▾" : "›"}
          </span>
        </span>
      </button>
      {expanded ? <div className="px-4">{children}</div> : null}
    </div>
  );
}

function MacroLine({
  label,
  display,
  expanded,
  onToggle,
  value,
  unit,
  onChange,
}: {
  label: string;
  display: string;
  expanded: boolean;
  onToggle: () => void;
  value: string;
  unit: string;
  onChange: (value: string) => void;
}) {
  return (
    <EditorLine
      label={label}
      value={display}
      expanded={expanded}
      onToggle={onToggle}
    >
      <label className="flex items-center gap-2 pb-4">
        <input
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 flex-1 rounded-full border border-border bg-surface/60 px-4 text-[15px] text-foreground outline-none focus:border-white/20"
        />
        <span className="w-10 text-[13px] text-muted">{unit}</span>
      </label>
    </EditorLine>
  );
}
