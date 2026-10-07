import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <PlaceholderPage
      title="Today"
      description="Daily coach check-ins will live here — sleep, how you feel, and what to do next."
    />
  );
}
