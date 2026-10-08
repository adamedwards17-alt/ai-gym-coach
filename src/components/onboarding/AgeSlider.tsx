"use client";

import { useState } from "react";

type AgeSliderProps = {
  value: number;
  onContinue: (age: number) => void;
};

export function AgeSlider({ value, onContinue }: AgeSliderProps) {
  const [age, setAge] = useState(value);

  return (
    <div className="today-reveal">
      <p className="mb-3 font-serif text-3xl tracking-tight">{age}</p>
      <input
        type="range"
        min={16}
        max={80}
        value={age}
        aria-label="Age"
        className="w-full accent-accent"
        onChange={(event) => setAge(Number(event.target.value))}
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>16</span>
        <span>80</span>
      </div>
      <button
        type="button"
        className="mt-5 inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
        onClick={() => onContinue(age)}
      >
        Continue
      </button>
    </div>
  );
}
