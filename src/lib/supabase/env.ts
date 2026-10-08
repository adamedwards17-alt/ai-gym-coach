/**
 * Public Supabase values from .env.local.
 * These are safe to use in the browser (they are not the secret key).
 */

const PLACEHOLDER = "PASTE_";

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  return (
    url.startsWith("https://") &&
    publishableKey.length > 20 &&
    !url.includes(PLACEHOLDER) &&
    !publishableKey.includes(PLACEHOLDER)
  );
}

export function getSupabasePublicEnv(): {
  url: string;
  publishableKey: string;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!isSupabaseConfigured() || !url || !publishableKey) {
    throw new Error(
      "Supabase is not configured yet. Put your Project URL and publishable key in .env.local, then restart the app.",
    );
  }

  return { url, publishableKey };
}
