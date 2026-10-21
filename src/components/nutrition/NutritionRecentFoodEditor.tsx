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
import {
  looksAlreadyPortioned,
  parseGramsFromText,
  rewriteDescriptionForQuantity,
  scaleMacrosByFactor,
} from "@/lib/nutrition-quantity";

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
  /**
   * When the base estimate already includes a chosen portion (e.g. barcode grams),
   * quantity multipliers are relative to that portion — default stays 1×.
   */
  alreadyPortioned?: boolean;
  /** Shown above the rows, for a label read or barcode match. */
  notice?: string | null;
  /** Macros the source did not provide. They stay blank until the user types them. */
  missingFields?: MacroField[];
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

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export function NutritionRecentFoodEditor({
  entry,
  baseEstimate,
  initialMealType = null,
  promptMealSelection = false,
  alreadyPortioned = false,
  notice = null,
  missingFields = [],
  saving,
  error,
  onCancel,
  onLog,
}: NutritionRecentFoodEditorProps) {
  const portioned =
    alreadyPortioned || looksAlreadyPortioned(entry.description);
  const baseGrams = parseGramsFromText(entry.description);

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
    missingFields[0] ?? (promptMealSelection ? "mealType" : null),
  );
  const [manualSource, setManualSource] = useState(false);
  const [entered, setEntered] = useState<Partial<Record<MacroField, string>>>(
    {},
  );

  const macros = useMemo(
    () => scaleMacrosByFactor(perServing, quantity),
    [perServing, quantity],
  );

  function setMacro(field: MacroField, raw: string) {
    setManualSource(true);
    if (missingFields.includes(field)) {
      setEntered((current) => ({ ...current, [field]: raw }));
    }
    const parsed = Number(raw.replace(",", "."));
    if (raw.trim() === "" || !Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    setPerServing((current) => ({
      ...current,
      [field]: roundMacro(parsed / Math.max(quantity, 0.01), field),
    }));
  }

  function macroUnresolved(field: MacroField): boolean {
    if (!missingFields.includes(field)) {
      return false;
    }
    const raw = entered[field];
    if (raw == null || raw.trim() === "") {
      return true;
    }
    const parsed = Number(raw.replace(",", "."));
    return !Number.isFinite(parsed) || parsed < 0;
  }

  const unresolved = (["calories", "proteinG", "carbsG", "fatG"] as const).filter(
    (field) => macroUnresolved(field),
  );

  function toggleRow(row: EditorRow) {
    setExpanded((current) => (current === row ? null : row));
  }

  const mealLabel = mealType ? labelForMealType(mealType) : "No meal type";
  const statusLabel =
    nutritionStatusOptions.find((option) => option.id === status)?.label ??
    status;

  return (
    <section className="today-reveal rounded-2xl border border-border/80 bg-surface/35 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            {notice ? "Review" : "Recent food"}
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
          {notice ? (
            <p className="mt-2 text-[13px] leading-5 text-muted">{notice}</p>
          ) : null}
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
          label={
            portioned
              ? baseGrams != null
                ? `Quantity (relative to ${formatQuantity(baseGrams)} g)`
                : "Quantity (relative to scanned portion)"
              : "Quantity / serving"
          }
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
                      ? "border-primary/40 bg-primary/10 text-foreground"
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

        {(
          [
            ["calories", "Calories", "kcal"],
            ["proteinG", "Protein", "g"],
            ["carbsG", "Carbs", "g"],
            ["fatG", "Fat", "g"],
          ] as const
        ).map(([field, label, unit]) => (
          <MacroLine
            key={field}
            label={label}
            display={
              macroUnresolved(field)
                ? "Add"
                : unit === "kcal"
                  ? `${macros[field]} kcal`
                  : `${macros[field]} g`
            }
            expanded={expanded === field}
            onToggle={() => toggleRow(field)}
            value={
              macroUnresolved(field)
                ? (entered[field] ?? "")
                : String(macros[field])
            }
            unit={unit}
            placeholder={macroUnresolved(field) ? "From the label" : undefined}
            onChange={(value) => setMacro(field, value)}
          />
        ))}

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
                      ? "border-primary/40 bg-primary/10 text-foreground"
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
                      ? "border-primary/40 bg-primary/10 text-foreground"
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

      {unresolved.length > 0 ? (
        <p className="mt-4 text-[13px] leading-5 text-muted">
          Add the missing values from the label. Nothing is assumed.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-[13px] text-muted">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={saving || unresolved.length > 0}
        className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-[15px] font-medium text-white disabled:opacity-60"
        onClick={() => {
          const toGrams =
            baseGrams != null && quantity !== 1
              ? Math.round(baseGrams * quantity * 10) / 10
              : null;
          const description = rewriteDescriptionForQuantity(
            entry.description,
            {
              factor: quantity,
              fromGrams: baseGrams,
              toGrams,
            },
          );
          onLog({
            description,
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
              displayName:
                baseEstimate.displayName ?? entry.display_name ?? null,
              searchAliases: entry.search_aliases ?? [],
              items: [],
            },
          });
        }}
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
  placeholder,
  onChange,
}: {
  label: string;
  display: string;
  expanded: boolean;
  onToggle: () => void;
  value: string;
  unit: string;
  placeholder?: string;
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
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 flex-1 rounded-full border border-border bg-surface px-4 text-[15px] text-foreground outline-none focus:border-primary"
        />
        <span className="w-10 text-[13px] text-muted">{unit}</span>
      </label>
    </EditorLine>
  );
}
