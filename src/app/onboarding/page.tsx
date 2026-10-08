import type { Metadata } from "next";
import { OnboardingExperience } from "@/components/onboarding/OnboardingExperience";

export const metadata: Metadata = { title: "Onboarding" };

export default function OnboardingPage() {
  return <OnboardingExperience />;
}
