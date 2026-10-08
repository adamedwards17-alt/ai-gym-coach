import type { Metadata } from "next";
import { CoachHome } from "@/components/coach/CoachHome";
import { requireAppUser } from "@/lib/auth/require-app-user";

export const metadata: Metadata = { title: "Coach" };

export default async function CoachPage() {
  await requireAppUser();
  return <CoachHome />;
}
