import type { Metadata } from "next";
import { DailyCheckIn } from "@/components/today/DailyCheckIn";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return <DailyCheckIn />;
}
