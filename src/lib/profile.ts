/**
 * Profile display helpers. The signed-in name is loaded from Supabase
 * on the Today page and passed into the check-in.
 */

export function getDisplayName(displayName: string): string {
  return displayName.trim();
}
