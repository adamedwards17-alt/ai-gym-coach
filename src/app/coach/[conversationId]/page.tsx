import type { Metadata } from "next";
import { CoachConversationExperience } from "@/components/coach/CoachConversationExperience";
import { requireAppUser } from "@/lib/auth/require-app-user";

export const metadata: Metadata = { title: "Coach" };

type CoachConversationPageProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function CoachConversationPage({
  params,
}: CoachConversationPageProps) {
  await requireAppUser();
  const { conversationId } = await params;

  return <CoachConversationExperience conversationId={conversationId} />;
}
