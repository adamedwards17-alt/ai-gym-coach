export const LOGIN_PATH = "/login";
export const TODAY_PATH = "/today";
export const ONBOARDING_PATH = "/onboarding";

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === LOGIN_PATH ||
    pathname.startsWith("/auth/")
  );
}
