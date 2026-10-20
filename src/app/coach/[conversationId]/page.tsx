import type { Metadata } from "next";
import { CoachConversationExperience } from "@/components/coach/CoachConversationExperience";
import { requireAppUser } from "@/lib/auth/require-app-user";

export const metadata: Metadata = { title: "Coach" };

type CoachConversationPageProps = {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ draft?: string }>;
};

export default async function CoachConversationPage({
  params,
  searchParams,
}: CoachConversationPageProps) {
  await requireAppUser();
  const { conversationId } = await params;
  const { draft } = await searchParams;
  const initialDraft =
    typeof draft === "string" ? draft.replace(/\s+/g, " ").trim().slice(0, 180) : "";

  return (
    <CoachConversationExperience
      conversationId={conversationId}
      initialDraft={initialDraft}
    />
  );
}
