"use client";

import { useState } from "react";
import type { HeightAnswer, WeightAnswer } from "@/lib/onboarding";

type MeasureInputProps =
  | {
      kind: "height";
      value: HeightAnswer;
      onContinue: (value: HeightAnswer) => void;
    }
  | {
      kind: "weight";
      value: WeightAnswer;
      onContinue: (value: WeightAnswer) => void;
    };

function UnitToggle({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mb-4 flex gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          className={`h-9 rounded-full border px-3 text-[13px] ${
            option.id === value
              ? "border-white/20 bg-white/8 text-foreground"
              : "border-border text-muted"
          }`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1.5 block text-[11px] text-muted">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        className="h-12 w-full rounded-2xl border border-border bg-surface/60 px-3 text-[15px] outline-none focus:border-white/20"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function MeasureInput(props: MeasureInputProps) {
  const [height, setHeight] = useState(
    props.kind === "height" ? props.value : { unit: "cm" as const, cm: 175 },
  );
  const [weight, setWeight] = useState(
    props.kind === "weight" ? props.value : { unit: "kg" as const, kg: 80 },
  );

  const canContinue =
    props.kind === "height"
      ? height.unit === "cm"
        ? Boolean(height.cm && height.cm > 100)
        : Boolean(height.feet && height.feet > 0)
      : weight.unit === "kg"
        ? Boolean(weight.kg && weight.kg > 30)
        : Boolean(weight.stone && weight.stone > 0);

  return (
    <div className="today-reveal">
      {props.kind === "height" ? (
        <>
          <UnitToggle
            options={[
              { id: "cm", label: "cm" },
              { id: "ft", label: "ft / in" },
            ]}
            value={height.unit}
            onChange={(unit) =>
              setHeight({ ...height, unit: unit as HeightAnswer["unit"] })
            }
          />
          {height.unit === "cm" ? (
            <NumberField
              label="Centimetres"
              min={120}
              max={220}
              value={height.cm}
              onChange={(cm) => setHeight({ ...height, cm })}
            />
          ) : (
            <div className="flex gap-3">
              <NumberField
                label="Feet"
                min={4}
                max={7}
                value={height.feet}
                onChange={(feet) => setHeight({ ...height, feet })}
              />
              <NumberField
                label="Inches"
                min={0}
                max={11}
                value={height.inches}
                onChange={(inches) => setHeight({ ...height, inches })}
              />
            </div>
          )}
        </>
      ) : (
        <>
          <UnitToggle
            options={[
              { id: "kg", label: "kg" },
              { id: "st", label: "st / lb" },
            ]}
            value={weight.unit}
            onChange={(unit) =>
              setWeight({ ...weight, unit: unit as WeightAnswer["unit"] })
            }
          />
          {weight.unit === "kg" ? (
            <NumberField
              label="Kilograms"
              min={40}
              max={200}
              step={0.1}
              value={weight.kg}
              onChange={(kg) => setWeight({ ...weight, kg })}
            />
          ) : (
            <div className="flex gap-3">
              <NumberField
                label="Stone"
                min={6}
                max={30}
                value={weight.stone}
                onChange={(stone) => setWeight({ ...weight, stone })}
              />
              <NumberField
                label="Pounds"
                min={0}
                max={13}
                value={weight.pounds}
                onChange={(pounds) => setWeight({ ...weight, pounds })}
              />
            </div>
          )}
        </>
      )}
      {canContinue ? (
        <button
          type="button"
          className="mt-5 inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
          onClick={() => {
            if (props.kind === "height") {
              props.onContinue(height);
            } else {
              props.onContinue(weight);
            }
          }}
        >
          Continue
        </button>
      ) : null}
    </div>
  );
}
