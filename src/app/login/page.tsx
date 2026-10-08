import { redirect } from "next/navigation";
import { WelcomeScreen } from "@/components/auth/WelcomeScreen";
import { getCurrentUser, getPostAuthPath } from "@/lib/auth/session";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect(await getPostAuthPath(user.id));
  }

  const { error } = await searchParams;
  return <WelcomeScreen error={error} />;
}
