import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata: Metadata = { title: "Coach" };

export default function CoachPage() {
  return (
    <PlaceholderPage
      title="Coach"
      description="Conversations with your AI coach will live here. The coach will be able to check in with you, not only answer questions."
    />
  );
}
