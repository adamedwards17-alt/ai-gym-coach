"use server";

import {
  GeminiProvider,
  isGeminiConfigured,
} from "@/lib/ai/providers/gemini";
import { applySavedFoodsToEntries } from "@/app/actions/saved-food";
import { getCurrentUser, isLocalPreviewActive } from "@/lib/auth/session";
import { previewNutritionEntries } from "@/lib/local-preview-data";
import {
  ensureNutritionTargetsForUser,
  NUTRITION_ENTRY_SELECT,
  summariseNutritionDay,
  toNutritionEntryRecord,
} from "@/lib/nutrition-day";
import { shiftCoachDate } from "@/lib/coach";
import {
  buildSearchAliases,
  deriveDisplayName,
  entryMatchesQuery,
  normalizeFoodText,
} from "@/lib/food-naming";
import {
  fetchOpenFoodFactsProduct,
  isPlausibleBarcode,
  normalizeBarcode,
  type LookupBarcodeResult,
} from "@/lib/open-food-facts";
import {
  entryDisplayTitle,
  getLocalLoggedDate,
  isMealTypeId,
  isNutritionEntryStatus,
  isValidLoggedDate,
  parseFoodEstimationResponse,
  type MealTypeId,
  type NutritionDaySummary,
  type NutritionEntryRecord,
  type NutritionEntryStatus,
  type NutritionEstimate,
} from "@/lib/nutrition";
import {
  estimateFromMealDraft,
  mealDraftTotals,
  type MealDraft,
} from "@/lib/meal-builder";
import { parseGramsFromText } from "@/lib/nutrition-quantity";
import { resolveReuseFromRecentFoods } from "@/lib/nutrition-reuse";
import {
  confidenceAfterSanity,
  validateNutritionMacros,
} from "@/lib/nutrition-sanity";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type ListNutritionResult =
  | { status: "ok"; entries: NutritionEntryRecord[] }
  | { status: "error"; message: string };

export type NutritionDayResult =
  | { status: "ok"; summary: NutritionDaySummary; recent: NutritionEntryRecord[] }
  | { status: "error"; message: string };

export type EstimateNutritionResult =
  | { status: "ok"; estimate: NutritionEstimate; reusedEntryId?: string }
  | {
      status: "needs_review";
      estimate: NutritionEstimate;
      message: string;
    }
  | { status: "needs_clarification"; question: string }
  | { status: "error"; message: string };

export type SearchNutritionResult =
  | { status: "ok"; entries: NutritionEntryRecord[] }
  | { status: "error"; message: string };

export type UpdateNutritionResult =
  | { status: "updated"; entry: NutritionEntryRecord }
  | { status: "error"; message: string };

export type SaveNutritionResult =
  | { status: "saved"; entry: NutritionEntryRecord }
  | { status: "error"; message: string };

export type UpdateNutritionStatusResult =
  | { status: "updated"; entry: NutritionEntryRecord }
  | { status: "error"; message: string };

export type DeleteNutritionResult =
  | { status: "deleted" }
  | { status: "error"; message: string };

export type ListHabitPrefsResult =
  | { status: "ok"; stoppedKeys: string[] }
  | { status: "error"; message: string };

export type StopHabitResult =
  | { status: "stopped"; habitKey: string }
  | { status: "error"; message: string };

export async function listRecentNutritionEntries(
  limit = 20,
  options?: {
    mealType?: MealTypeId | null;
    /** Exclusive upper bound (e.g. today) so suggestions stay historical. */
    beforeDate?: string | null;
  },
): Promise<ListNutritionResult> {
  if (!isSupabaseConfigured() && !(await isLocalPreviewActive())) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so nutrition history can’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const mealType = options?.mealType ?? null;
  if (await isLocalPreviewActive()) {
    const entries = previewNutritionEntries(getLocalLoggedDate())
      .filter((entry) => (mealType ? entry.meal_type === mealType : true))
      .filter((entry) =>
        options?.beforeDate ? entry.logged_date < options.beforeDate : true,
      );
    return { status: "ok", entries: entries.slice(0, limit) };
  }
  if (mealType != null && !isMealTypeId(mealType)) {
    return { status: "error", message: "That meal category isn’t valid." };
  }
  if (
    options?.beforeDate != null &&
    !isValidLoggedDate(options.beforeDate)
  ) {
    return { status: "error", message: "That date isn’t valid." };
  }

  try {
    const supabase = await createClient();
    let request = supabase
      .from("nutrition_entries")
      .select(NUTRITION_ENTRY_SELECT)
      .eq("user_id", user.id)
      .order("logged_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 80));

    if (mealType) {
      request = request.eq("meal_type", mealType);
    }
    if (options?.beforeDate) {
      request = request.lt("logged_date", options.beforeDate);
    }

    const { data, error } = await request;

    if (error) {
      console.error("[nutrition] List failed:", error.message);
      return {
        status: "error",
        message: "Nutrition history couldn’t be loaded. Try again.",
      };
    }

    const seen = new Set<string>();
    const entries: NutritionEntryRecord[] = [];
    for (const row of data ?? []) {
      const entry = toNutritionEntryRecord(
        row as unknown as Record<string, unknown>,
      );
      if (!entry || entry.calories_estimated == null) {
        continue;
      }
      const key = entryDisplayTitle(entry).trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      entries.push(entry);
      if (entries.length >= Math.min(Math.max(limit, 1), 40)) {
        break;
      }
    }

    return { status: "ok", entries: await applySavedFoodsToEntries(entries) };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown nutrition list error";
    console.error("[nutrition] List failed:", message);
    return {
      status: "error",
      message: "Nutrition history couldn’t be loaded. Try again.",
    };
  }
}

export async function loadNutritionDay(
  localDate: string,
): Promise<NutritionDayResult> {
  if (!isValidLoggedDate(localDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  if (await isLocalPreviewActive()) {
    const entries = previewNutritionEntries(localDate);
    const goal = {
      daily_calories: 2400,
      protein_g: 160,
      carbs_g: 250,
      fat_g: 70,
      methodology_version: "v1",
      calculated_at: "2026-10-01T08:00:00.000Z",
      is_manual: false,
    } as const;
    return {
      status: "ok",
      recent: entries,
      summary: summariseNutritionDay({
        localDate,
        targets: { ...goal },
        targetsStatus: "ok",
        targetsMessage: null,
        entries,
      }),
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so nutrition can’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const ensured = await ensureNutritionTargetsForUser(supabase, user.id);

    const { data, error } = await supabase
      .from("nutrition_entries")
      .select(NUTRITION_ENTRY_SELECT)
      .eq("user_id", user.id)
      .order("logged_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) {
      console.error("[nutrition] Day load failed:", error.message);
      return {
        status: "error",
        message: "Nutrition couldn’t be loaded. Try again.",
      };
    }

    const entries = (data ?? [])
      .map((row) =>
        toNutritionEntryRecord(row as unknown as Record<string, unknown>),
      )
      .filter((entry): entry is NutritionEntryRecord => entry !== null);

    const summary = summariseNutritionDay({
      localDate,
      targets: ensured.targets,
      targetsStatus: ensured.status,
      targetsMessage: ensured.message,
      entries,
    });

    return { status: "ok", summary, recent: entries };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown nutrition day error";
    console.error("[nutrition] Day load failed:", message);
    return {
      status: "error",
      message: "Nutrition couldn’t be loaded. Try again.",
    };
  }
}

export async function estimateNutritionFood(input: {
  description: string;
  clarificationAnswer?: string | null;
  skipClarification?: boolean;
  /** When true, skip recent-food reuse and always call the model. */
  forceAi?: boolean;
}): Promise<EstimateNutritionResult> {
  const description = input.description.trim();
  if (!description) {
    return { status: "error", message: "Tell me what you’ve eaten." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  // Prefer scaling a saved food over an AI guess whenever possible.
  if (!input.forceAi && !input.clarificationAnswer?.trim()) {
    const recent = await listRecentNutritionEntries(40);
    if (recent.status === "ok") {
      const reused = resolveReuseFromRecentFoods({
        description,
        recent: recent.entries,
      });
      if (reused && (reused.method === "grams" || reused.method === "exact")) {
        const aliases =
          reused.estimate.searchAliases &&
          reused.estimate.searchAliases.length > 0
            ? reused.estimate.searchAliases
            : reused.entry.search_aliases;
        const estimate: NutritionEstimate = {
          ...reused.estimate,
          displayName:
            reused.estimate.displayName ?? reused.entry.display_name,
          searchAliases: aliases,
        };
        return {
          status: "ok",
          estimate,
          reusedEntryId: reused.entry.id,
        };
      }
    }
  }

  if (!isGeminiConfigured()) {
    return {
      status: "error",
      message:
        "Food estimation isn’t connected right now. Check GEMINI_API_KEY and try again.",
    };
  }

  try {
    const provider = new GeminiProvider();
    const { rawText } = await provider.estimateFoodNutrition({
      description,
      clarificationAnswer: input.clarificationAnswer,
      skipClarification: input.skipClarification,
    });
    const parsed = parseFoodEstimationResponse(rawText);
    if (parsed.kind === "clarification") {
      if (input.skipClarification || input.clarificationAnswer?.trim()) {
        return {
          status: "error",
          message: "That estimate couldn’t be finished. Try again.",
        };
      }
      return { status: "needs_clarification", question: parsed.question };
    }
    if (parsed.kind !== "estimate") {
      return {
        status: "error",
        message: "That estimate couldn’t be read. Try again.",
      };
    }

    const quantityGrams = parseGramsFromText(
      [description, input.clarificationAnswer ?? ""].join(" "),
    );
    const sanity = validateNutritionMacros(
      {
        calories: parsed.estimate.calories,
        proteinG: parsed.estimate.proteinG,
        carbsG: parsed.estimate.carbsG,
        fatG: parsed.estimate.fatG,
      },
      { quantityGrams },
    );
    const estimate: NutritionEstimate = {
      ...parsed.estimate,
      confidence: confidenceAfterSanity(parsed.estimate.confidence, sanity),
    };

    if (!sanity.ok) {
      return {
        status: "needs_review",
        estimate,
        message:
          sanity.issues[0]?.message ??
          "That estimate looks off — please review before saving.",
      };
    }
    if (sanity.needsReview) {
      return {
        status: "needs_review",
        estimate,
        message:
          sanity.issues[0]?.message ??
          "Please double-check this estimate before saving.",
      };
    }

    return { status: "ok", estimate };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown estimate error";
    console.error("[nutrition] Estimate failed:", message);
    return {
      status: "error",
      message: "That food couldn’t be estimated. Try again.",
    };
  }
}

export async function estimateNutritionFromPhoto(input: {
  imageBase64: string;
  mimeType: string;
  note?: string | null;
}): Promise<
  | {
      status: "ok" | "needs_review";
      estimate: NutritionEstimate;
      description: string;
      message?: string;
    }
  | { status: "needs_clarification"; question: string }
  | { status: "error"; message: string }
> {
  const imageBase64 = input.imageBase64.trim();
  const mimeType = input.mimeType.trim() || "image/jpeg";
  if (!imageBase64) {
    return { status: "error", message: "Choose a photo of your meal." };
  }
  if (imageBase64.length > 12_000_000) {
    return {
      status: "error",
      message: "That image is too large. Try a smaller photo.",
    };
  }

  if (!isGeminiConfigured()) {
    return {
      status: "error",
      message:
        "Photo estimation isn’t connected right now. Log the food another way.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const provider = new GeminiProvider();
    const { rawText } = await provider.estimateFoodNutritionFromPhoto({
      imageBase64,
      mimeType,
      note: input.note,
    });
    const parsed = parseFoodEstimationResponse(rawText);
    if (parsed.kind === "clarification") {
      return { status: "needs_clarification", question: parsed.question };
    }
    if (parsed.kind !== "estimate") {
      return {
        status: "error",
        message: "That photo estimate couldn’t be read. Try again.",
      };
    }

    const description =
      parsed.estimate.displayName ||
      (parsed.estimate.items.length > 0
        ? parsed.estimate.items.map((item) => item.description).join(", ")
        : "Meal from photo");

    const estimate: NutritionEstimate = {
      ...parsed.estimate,
      confidence:
        parsed.estimate.confidence === "high"
          ? "medium"
          : parsed.estimate.confidence,
      source: "gemini",
    };

    const sanity = validateNutritionMacros({
      calories: estimate.calories,
      proteinG: estimate.proteinG,
      carbsG: estimate.carbsG,
      fatG: estimate.fatG,
    });
    estimate.confidence = confidenceAfterSanity(estimate.confidence, sanity);

    if (!sanity.ok || sanity.needsReview) {
      return {
        status: "needs_review",
        estimate,
        description,
        message:
          sanity.issues[0]?.message ??
          "Photo estimates are approximate — please review before saving.",
      };
    }

    return {
      status: "ok",
      estimate,
      description,
      message:
        "Photo estimates are approximate — please review before saving.",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown photo estimate error";
    console.error("[nutrition] Photo estimate failed:", message);
    return {
      status: "error",
      message: "That photo couldn’t be estimated. Try again or log manually.",
    };
  }
}

export async function searchRecentNutritionEntries(input: {
  query: string;
  localDate: string;
  /** When set, only return foods previously logged in this meal category. */
  mealType?: MealTypeId | null;
  /** When true with mealType, ignore category filter (search all saved foods). */
  searchAllCategories?: boolean;
}): Promise<SearchNutritionResult> {
  const query = input.query.trim();
  if (query.length < 2) {
    return { status: "ok", entries: [] };
  }

  if (!isValidLoggedDate(input.localDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  if (
    input.mealType != null &&
    !input.searchAllCategories &&
    !isMealTypeId(input.mealType)
  ) {
    return { status: "error", message: "That meal category isn’t valid." };
  }

  if (await isLocalPreviewActive()) {
    const previewMeal =
      input.mealType && !input.searchAllCategories ? input.mealType : null;
    const entries = previewNutritionEntries(input.localDate).filter((entry) => {
      if (previewMeal && entry.meal_type !== previewMeal) {
        return false;
      }
      return entry.logged_date <= input.localDate && entryMatchesQuery(entry, query);
    });
    return { status: "ok", entries: entries.slice(0, 6) };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so suggestions can’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const fromDate = shiftCoachDate(input.localDate, -28);
  const normalizedQuery = normalizeFoodText(query);
  const filterMealType =
    input.mealType && !input.searchAllCategories ? input.mealType : null;

  try {
    const supabase = await createClient();
    // Fetch recent days without a SQL text filter, then match client-side so
    // display names and aliases (not just the raw description) are searchable.
    let request = supabase
      .from("nutrition_entries")
      .select(NUTRITION_ENTRY_SELECT)
      .eq("user_id", user.id)
      .gte("logged_date", fromDate)
      .lte("logged_date", input.localDate)
      .order("logged_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (filterMealType) {
      request = request.eq("meal_type", filterMealType);
    }
    const { data, error } = await request;

    if (error) {
      console.error("[nutrition] Search failed:", error.message);
      return {
        status: "error",
        message: "Suggestions couldn’t be loaded.",
      };
    }

    type Ranked = { entry: NutritionEntryRecord; rank: number; order: number };
    const seen = new Map<string, number>();
    const ranked: Ranked[] = [];
    let order = 0;

    for (const row of data ?? []) {
      const entry = toNutritionEntryRecord(
        row as unknown as Record<string, unknown>,
      );
      if (!entry || !entryMatchesQuery(entry, query)) {
        continue;
      }

      // Lower rank = better match. Display name / alias beats raw description.
      const displayNorm = normalizeFoodText(entry.display_name ?? "");
      const aliasMatch = entry.search_aliases.some((alias) =>
        normalizeFoodText(alias).includes(normalizedQuery),
      );
      const rank = displayNorm.startsWith(normalizedQuery)
        ? 0
        : displayNorm.includes(normalizedQuery)
          ? 1
          : aliasMatch
            ? 2
            : 3;

      const key = `${displayNorm}|${normalizeFoodText(entry.description)}`;
      const existingIndex = seen.get(key);
      if (existingIndex !== undefined) {
        // Prefer a duplicate that still has saved macros for structured re-logging.
        const existing = ranked[existingIndex];
        if (
          existing.entry.calories_estimated == null &&
          entry.calories_estimated != null
        ) {
          ranked[existingIndex] = { entry, rank, order: existing.order };
        }
        continue;
      }
      seen.set(key, ranked.length);
      ranked.push({ entry, rank, order: order++ });
    }

    ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);
    const entries = ranked.slice(0, 6).map((item) => item.entry);

    return { status: "ok", entries: await applySavedFoodsToEntries(entries) };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown nutrition search error";
    console.error("[nutrition] Search failed:", message);
    return {
      status: "error",
      message: "Suggestions couldn’t be loaded.",
    };
  }
}

export async function updateNutritionEntry(input: {
  entryId: string;
  description: string;
  /** When set, renames the diary title without requiring a description change. */
  displayName?: string | null;
  /** When provided, updates the meal category (including null to clear). */
  mealType?: MealTypeId | null;
  /** Move the entry to another local calendar date (must be ≤ today). */
  loggedDate?: string;
  /** Portions eaten for this log only — does not rewrite meal definitions. */
  portions?: number | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): Promise<UpdateNutritionResult> {
  const description = input.description.trim();
  if (!description) {
    return { status: "error", message: "Add a short food description." };
  }

  if (
    input.mealType !== undefined &&
    input.mealType !== null &&
    !isMealTypeId(input.mealType)
  ) {
    return { status: "error", message: "That meal category isn’t valid." };
  }

  if (
    input.loggedDate !== undefined &&
    !isValidLoggedDate(input.loggedDate)
  ) {
    return { status: "error", message: "That date isn’t valid." };
  }

  const calories = Math.round(input.calories);
  const proteinG = Math.round(input.proteinG);
  const carbsG = Math.round(input.carbsG);
  const fatG = Math.round(input.fatG);

  if (
    ![calories, proteinG, carbsG, fatG].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  ) {
    return { status: "error", message: "Nutrition values must be zero or more." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so that entry couldn’t be updated.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();

    const { data: existing, error: existingError } = await supabase
      .from("nutrition_entries")
      .select("description, display_name, brand")
      .eq("id", input.entryId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError || !existing) {
      console.error(
        "[nutrition] Update lookup failed:",
        existingError?.message ?? "No row",
      );
      return {
        status: "error",
        message: "That entry couldn’t be updated. Try again.",
      };
    }

    // Prefer an explicit rename. Otherwise keep the existing display name when
    // only macros/ingredients change, so nutrition edits don't wipe titles.
    const brand =
      typeof existing.brand === "string" && existing.brand.trim()
        ? existing.brand.trim()
        : null;
    const explicitName = input.displayName?.trim();
    const existingName =
      typeof existing.display_name === "string" && existing.display_name.trim()
        ? existing.display_name.trim()
        : null;
    const displayName = explicitName
      ? deriveDisplayName(description, explicitName)
      : existingName ?? deriveDisplayName(description);

    const updatePayload: Record<string, unknown> = {
      description,
      display_name: displayName,
      search_aliases: buildSearchAliases({ displayName, description, brand }),
      calories_estimated: calories,
      protein_g_estimated: proteinG,
      carbs_g_estimated: carbsG,
      fat_g_estimated: fatG,
      estimation_source: "user",
      estimation_confidence: null,
    };
    if (input.mealType !== undefined) {
      updatePayload.meal_type = input.mealType;
    }
    if (input.loggedDate !== undefined) {
      updatePayload.logged_date = input.loggedDate;
    }
    if (input.portions !== undefined) {
      updatePayload.portions =
        typeof input.portions === "number" &&
        Number.isFinite(input.portions) &&
        input.portions > 0
          ? Math.round(input.portions * 10) / 10
          : null;
    }

    const { data, error } = await supabase
      .from("nutrition_entries")
      .update(updatePayload)
      .eq("id", input.entryId)
      .eq("user_id", user.id)
      .select(NUTRITION_ENTRY_SELECT)
      .single();

    if (error || !data) {
      console.error(
        "[nutrition] Update failed:",
        error?.message ?? "No row",
      );
      return {
        status: "error",
        message: "That entry couldn’t be updated. Try again.",
      };
    }

    const entry = toNutritionEntryRecord(
      data as unknown as Record<string, unknown>,
    );
    if (!entry) {
      return {
        status: "error",
        message: "That entry couldn’t be updated. Try again.",
      };
    }

    return { status: "updated", entry };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown nutrition update error";
    console.error("[nutrition] Update failed:", message);
    return {
      status: "error",
      message: "That entry couldn’t be updated. Try again.",
    };
  }
}

export async function saveMealDraftEntry(input: {
  loggedDate: string;
  mealType: MealTypeId | null;
  status: NutritionEntryStatus;
  draft: MealDraft;
  description: string;
  /** Persist the 1-portion recipe for future reuse. */
  saveDefinition: boolean;
  barcode?: string | null;
  brand?: string | null;
}): Promise<SaveNutritionResult> {
  if (!isValidLoggedDate(input.loggedDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }
  if (input.mealType !== null && !isMealTypeId(input.mealType)) {
    return { status: "error", message: "That meal type isn’t valid." };
  }
  if (!isNutritionEntryStatus(input.status)) {
    return { status: "error", message: "That meal status isn’t valid." };
  }
  if (!input.draft.title.trim() || input.draft.ingredients.length === 0) {
    return { status: "error", message: "Add a meal title and at least one ingredient." };
  }
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so that meal couldn’t be saved.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const estimate = estimateFromMealDraft(input.draft);
  const totals = mealDraftTotals(input.draft);
  const sanity = validateNutritionMacros(totals, { allowPartial: true });
  if (!sanity.ok) {
    return {
      status: "error",
      message:
        sanity.issues[0]?.message ??
        "Those nutrition values look invalid. Please review.",
    };
  }

  try {
    const supabase = await createClient();
    let mealId: string | null = null;

    if (input.saveDefinition) {
      const perPortion = mealDraftTotals({
        ...input.draft,
        portionsEaten: 1,
      });
      const { data: mealRow, error: mealError } = await supabase
        .from("nutrition_meals")
        .insert({
          user_id: user.id,
          name: input.draft.title.trim().slice(0, 120),
          search_aliases: input.draft.searchAliases.slice(0, 12),
          brand: input.brand?.trim().slice(0, 80) || null,
          estimation_source: input.draft.source,
          estimation_confidence: input.draft.confidence,
          calories_per_portion: perPortion.calories,
          protein_g_per_portion: perPortion.proteinG,
          carbs_g_per_portion: perPortion.carbsG,
          fat_g_per_portion: perPortion.fatG,
        })
        .select("id")
        .single();

      if (mealError || !mealRow) {
        console.error(
          "[nutrition] Meal definition save failed:",
          mealError?.message ?? "No row",
        );
        return {
          status: "error",
          message: "That meal couldn’t be saved. Try again.",
        };
      }

      mealId = String((mealRow as { id: string }).id);
      const ingredientRows = input.draft.ingredients.map((item, index) => ({
        meal_id: mealId,
        user_id: user.id,
        sort_order: index,
        name: item.name.trim().slice(0, 160) || "Ingredient",
        quantity_amount: item.quantityAmount,
        quantity_unit: item.quantityUnit,
        quantity_label: item.quantityLabel,
        calories: item.calories,
        protein_g: item.proteinG,
        carbs_g: item.carbsG,
        fat_g: item.fatG,
        estimated: item.estimated,
      }));

      const { error: ingredientsError } = await supabase
        .from("nutrition_meal_ingredients")
        .insert(ingredientRows);
      if (ingredientsError) {
        console.error(
          "[nutrition] Meal ingredients save failed:",
          ingredientsError.message,
        );
        // Definition without ingredients is still usable via entry snapshot.
      }
    }

    return saveNutritionEntry({
      loggedDate: input.loggedDate,
      description: input.description,
      mealType: input.mealType,
      status: input.status,
      estimate: {
        ...estimate,
        displayName: input.draft.title.trim(),
      },
      barcode: input.barcode,
      brand: input.brand,
      mealId,
      portions: input.draft.portionsEaten,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown meal save error";
    console.error("[nutrition] Meal draft save failed:", message);
    return {
      status: "error",
      message: "That meal couldn’t be saved. Try again.",
    };
  }
}

export async function saveNutritionEntry(input: {
  loggedDate: string;
  description: string;
  mealType: MealTypeId | null;
  status: NutritionEntryStatus;
  estimate: NutritionEstimate | null;
  /** Optional Open Food Facts product metadata. */
  barcode?: string | null;
  brand?: string | null;
  mealId?: string | null;
  portions?: number | null;
}): Promise<SaveNutritionResult> {
  if (!isValidLoggedDate(input.loggedDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  const description = input.description.trim();
  if (!description) {
    return { status: "error", message: "Tell me what you’ve eaten." };
  }

  if (input.mealType !== null && !isMealTypeId(input.mealType)) {
    return { status: "error", message: "That meal type isn’t valid." };
  }

  if (!isNutritionEntryStatus(input.status)) {
    return { status: "error", message: "That meal status isn’t valid." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so that entry couldn’t be saved.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const estimate = input.estimate;

    const barcodeDigits = input.barcode ? normalizeBarcode(input.barcode) : "";
    const barcode = isPlausibleBarcode(barcodeDigits) ? barcodeDigits : null;
    const brand = input.brand?.trim().slice(0, 80) || null;
    const displayName = deriveDisplayName(description, estimate?.displayName);
    const searchAliases = buildSearchAliases({
      displayName,
      description,
      brand,
      extra: estimate?.searchAliases,
    });

    const portions =
      typeof input.portions === "number" &&
      Number.isFinite(input.portions) &&
      input.portions > 0
        ? Math.round(input.portions * 10) / 10
        : null;

    const { data, error } = await supabase
      .from("nutrition_entries")
      .insert({
        user_id: user.id,
        logged_date: input.loggedDate,
        meal_type: input.mealType,
        description,
        display_name: displayName,
        search_aliases: searchAliases,
        barcode,
        brand,
        status: input.status,
        calories_estimated: estimate?.calories ?? null,
        protein_g_estimated: estimate?.proteinG ?? null,
        carbs_g_estimated: estimate?.carbsG ?? null,
        fat_g_estimated: estimate?.fatG ?? null,
        estimation_confidence: estimate?.confidence ?? null,
        estimation_source: estimate?.source ?? (estimate ? "gemini" : "none"),
        meal_id: input.mealId ?? null,
        portions,
      })
      .select(NUTRITION_ENTRY_SELECT)
      .single();

    if (error || !data) {
      console.error(
        "[nutrition] Save failed:",
        error?.message ?? "No row returned",
      );
      return {
        status: "error",
        message: "That entry couldn’t be saved. Try again.",
      };
    }

    const entry = toNutritionEntryRecord(
      data as unknown as Record<string, unknown>,
    );
    if (!entry) {
      return {
        status: "error",
        message: "That entry couldn’t be saved. Try again.",
      };
    }

    return { status: "saved", entry };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown nutrition save error";
    console.error("[nutrition] Save failed:", message);
    return {
      status: "error",
      message: "That entry couldn’t be saved. Try again.",
    };
  }
}

export async function markNutritionEntryEaten(input: {
  entryId: string;
}): Promise<UpdateNutritionStatusResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so that entry couldn’t be updated.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("nutrition_entries")
      .update({ status: "eaten" })
      .eq("id", input.entryId)
      .eq("user_id", user.id)
      .select(NUTRITION_ENTRY_SELECT)
      .single();

    if (error || !data) {
      console.error(
        "[nutrition] Mark eaten failed:",
        error?.message ?? "No row",
      );
      return {
        status: "error",
        message: "That entry couldn’t be updated. Try again.",
      };
    }

    const entry = toNutritionEntryRecord(
      data as unknown as Record<string, unknown>,
    );
    if (!entry) {
      return {
        status: "error",
        message: "That entry couldn’t be updated. Try again.",
      };
    }

    return { status: "updated", entry };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown nutrition update error";
    console.error("[nutrition] Mark eaten failed:", message);
    return {
      status: "error",
      message: "That entry couldn’t be updated. Try again.",
    };
  }
}

export async function deleteNutritionEntry(input: {
  entryId: string;
}): Promise<DeleteNutritionResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so that entry couldn’t be deleted.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("nutrition_entries")
      .delete()
      .eq("id", input.entryId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[nutrition] Delete failed:", error.message);
      return {
        status: "error",
        message: "That entry couldn’t be deleted. Try again.",
      };
    }

    return { status: "deleted" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown nutrition delete error";
    console.error("[nutrition] Delete failed:", message);
    return {
      status: "error",
      message: "That entry couldn’t be deleted. Try again.",
    };
  }
}

export async function lookupBarcodeProduct(input: {
  barcode: string;
}): Promise<LookupBarcodeResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  return fetchOpenFoodFactsProduct(input.barcode);
}

export async function listNutritionHabitPrefs(): Promise<ListHabitPrefsResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so habit preferences can’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("nutrition_habit_prefs")
      .select("habit_key")
      .eq("user_id", user.id)
      .eq("status", "stopped");

    if (error) {
      console.error("[nutrition] Habit prefs list failed:", error.message);
      return {
        status: "error",
        message: "Habit preferences couldn’t be loaded.",
      };
    }

    const stoppedKeys = (data ?? [])
      .map((row) => (row as { habit_key?: unknown }).habit_key)
      .filter((key): key is string => typeof key === "string");

    return { status: "ok", stoppedKeys };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown habit prefs error";
    console.error("[nutrition] Habit prefs list failed:", message);
    return {
      status: "error",
      message: "Habit preferences couldn’t be loaded.",
    };
  }
}

export async function stopNutritionHabit(input: {
  habitKey: string;
}): Promise<StopHabitResult> {
  const habitKey = input.habitKey.trim();
  if (!habitKey || habitKey.length > 120) {
    return { status: "error", message: "That habit isn’t valid." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so that preference couldn’t be saved.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("nutrition_habit_prefs").upsert(
      {
        user_id: user.id,
        habit_key: habitKey,
        status: "stopped",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,habit_key" },
    );

    if (error) {
      console.error("[nutrition] Stop habit failed:", error.message);
      return {
        status: "error",
        message: "That preference couldn’t be saved. Try again.",
      };
    }

    return { status: "stopped", habitKey };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown stop habit error";
    console.error("[nutrition] Stop habit failed:", message);
    return {
      status: "error",
      message: "That preference couldn’t be saved. Try again.",
    };
  }
}
