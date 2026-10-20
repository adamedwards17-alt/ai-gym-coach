import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { WelcomeScreen } from "@/components/auth/WelcomeScreen";
import {
  localPreviewHostAllowed,
  localPreviewRuntimeAllowed,
} from "@/lib/auth/local-preview";
import { getCurrentUser, getPostAuthPath } from "@/lib/auth/session";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(await getPostAuthPath(user.id));
  }

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const allowLocalPreview =
    localPreviewRuntimeAllowed({
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL,
    }) && localPreviewHostAllowed(host);

  return <WelcomeScreen allowLocalPreview={allowLocalPreview} />;
}
