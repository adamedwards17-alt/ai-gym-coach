import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { MobileNav } from "@/components/MobileNav";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/auth/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: {
    default: "AI Gym Coach",
    template: "%s · AI Gym Coach",
  },
  description:
    "An AI-powered personal fitness coach to help you get leaner, build muscle, and stay consistent.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const signedIn = Boolean(await getCurrentUser());

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <SiteHeader signedIn={signedIn} />
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
