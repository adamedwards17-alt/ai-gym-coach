import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const metadata: Metadata = { title: "Nutrition" };

export default function NutritionPage() {
  return (
    <PlaceholderPage
      title="Nutrition"
      description="Meal guidance and simple food check-ins will live here."
    />
  );
}
