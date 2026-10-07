import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return (
    <PlaceholderPage
      title="Progress"
      description="Body stats, consistency, and how you are trending will live here."
    />
  );
}
