import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata: Metadata = { title: "Train" };

export default function TrainPage() {
  return (
    <PlaceholderPage
      title="Train"
      description="Your training plan and workout tracking will live here."
    />
  );
}
