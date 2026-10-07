/**
 * Temporary stand-in for the signed-in user.
 * Later, replace this with the name from authentication / Supabase.
 */
export const previewProfile = {
  displayName: "Adam",
};

export function getDisplayName(): string {
  return previewProfile.displayName.trim();
}
