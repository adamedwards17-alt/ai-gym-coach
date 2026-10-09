"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { getLocalLoggedDate, isValidLoggedDate } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  isValidWeightKg,
  type WeightMeasurementRecord,
  type WeightMeasurementSource,
} from "@/lib/weight-measurements";

export type LogWeightResult =
  | { status: "saved"; measurement: WeightMeasurementRecord; currentWeightKg: number }
  | { status: "error"; message: string };

export type ListWeightResult =
  | { status: "ok"; measurements: WeightMeasurementRecord[] }
  | { status: "error"; message: string };

function toMeasurement(
  row: Record<string, unknown>,
): WeightMeasurementRecord | null {
  if (
    typeof row.id !== "string" ||
    typeof row.measured_on !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  const weight =
    typeof row.weight_kg === "number"
      ? row.weight_kg
      : Number(row.weight_kg);
  if (!isValidWeightKg(weight)) {
    return null;
  }
  const source = row.source;
  if (
    source !== "onboarding" &&
    source !== "profile" &&
    source !== "progress" &&
    source !== "weekly_checkin" &&
    source !== "manual" &&
    source !== "import"
  ) {
    return null;
  }
  return {
    id: row.id,
    measured_on: row.measured_on,
    weight_kg: weight,
    source,
    notes: typeof row.notes === "string" ? row.notes : null,
    created_at: row.created_at,
  };
}

export async function listWeightMeasurements(input?: {
  limit?: number;
}): Promise<ListWeightResult> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("weight_measurements")
      .select("id, measured_on, weight_kg, source, notes, created_at")
      .eq("user_id", user.id)
      .order("measured_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(input?.limit ?? 60);

    if (error) {
      console.error("[weight] List failed:", error.message);
      return { status: "error", message: "Weight history couldn’t be loaded." };
    }

    const measurements = (data ?? [])
      .map((row) => toMeasurement(row as Record<string, unknown>))
      .filter((row): row is WeightMeasurementRecord => row !== null);

    return { status: "ok", measurements };
  } catch (error) {
    console.error("[weight] List failed:", error);
    return { status: "error", message: "Weight history couldn’t be loaded." };
  }
}

/**
 * Log a weight measurement and sync profiles.weight_kg to the latest value.
 */
export async function logWeightMeasurement(input: {
  measuredOn?: string;
  weightKg: number;
  source?: WeightMeasurementSource;
  notes?: string | null;
  measurementId?: string | null;
}): Promise<LogWeightResult> {
  const measuredOn = input.measuredOn ?? getLocalLoggedDate();
  if (!isValidLoggedDate(measuredOn)) {
    return { status: "error", message: "That date isn’t valid." };
  }
  if (!isValidWeightKg(input.weightKg)) {
    return { status: "error", message: "Enter a valid weight." };
  }
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const source = input.source ?? "manual";
  const weightKg = Math.round(input.weightKg * 10) / 10;

  try {
    const supabase = await createClient();

    let measurement: WeightMeasurementRecord | null = null;

    if (input.measurementId) {
      const { data, error } = await supabase
        .from("weight_measurements")
        .update({
          measured_on: measuredOn,
          weight_kg: weightKg,
          notes: input.notes?.trim() || null,
        })
        .eq("id", input.measurementId)
        .eq("user_id", user.id)
        .select("id, measured_on, weight_kg, source, notes, created_at")
        .single();
      if (error || !data) {
        return { status: "error", message: "That measurement couldn’t be updated." };
      }
      measurement = toMeasurement(data as Record<string, unknown>);
    } else {
      const { data, error } = await supabase
        .from("weight_measurements")
        .insert({
          user_id: user.id,
          measured_on: measuredOn,
          weight_kg: weightKg,
          source,
          notes: input.notes?.trim() || null,
        })
        .select("id, measured_on, weight_kg, source, notes, created_at")
        .single();
      if (error || !data) {
        console.error("[weight] Insert failed:", error?.message);
        return { status: "error", message: "That weight couldn’t be saved." };
      }
      measurement = toMeasurement(data as Record<string, unknown>);
    }

    if (!measurement) {
      return { status: "error", message: "That weight couldn’t be saved." };
    }

    // Sync current profile weight to the latest measurement overall.
    const { data: latestRows } = await supabase
      .from("weight_measurements")
      .select("weight_kg, measured_on, created_at")
      .eq("user_id", user.id)
      .order("measured_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    const latestKg =
      latestRows && latestRows[0]
        ? Number(latestRows[0].weight_kg)
        : weightKg;

    await supabase
      .from("profiles")
      .update({ weight_kg: latestKg })
      .eq("id", user.id);

    return {
      status: "saved",
      measurement,
      currentWeightKg: latestKg,
    };
  } catch (error) {
    console.error("[weight] Save failed:", error);
    return { status: "error", message: "That weight couldn’t be saved." };
  }
}
