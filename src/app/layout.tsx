import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { MobileNav } from "@/components/MobileNav";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentUser, isLocalPreviewActive } from "@/lib/auth/session";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "AI Gym Coach",
    template: "%s · AI Gym Coach",
  },
  description:
    "An AI-powered personal fitness coach to help you get leaner, build muscle, and stay consistent.",
  applicationName: "AI Gym Coach",
  appleWebApp: {
    capable: true,
    title: "AI Gym Coach",
    statusBarStyle: "default",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const signedIn = Boolean(await getCurrentUser());
  const preview = await isLocalPreviewActive();

  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <SiteHeader signedIn={signedIn} />
        {preview ? (
          <p className="border-b border-border bg-primary/10 px-4 py-2 text-center text-[13px] text-foreground">
            Local preview with sample data. Nothing is saved. Sign out to leave
            it.
          </p>
        ) : null}
        <main
          className={
            signedIn
              ? "flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px)+0.75rem)] md:pb-0"
              : "flex-1"
          }
        >
          {children}
        </main>
        {signedIn ? <SiteFooter /> : null}
        <MobileNav signedIn={signedIn} />
      </body>
    </html>
  );
}
