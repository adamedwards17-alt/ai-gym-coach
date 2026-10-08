import { CoachMark } from "@/components/CoachMark";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

const errorCopy: Record<string, string> = {
  config:
    "Supabase isn’t connected yet. Check .env.local and restart the app.",
  google:
    "Google sign-in didn’t start. Enable the Google provider in the Supabase dashboard.",
  callback: "Sign-in didn’t finish. Try Continue with Google again.",
  session: "We couldn’t confirm your session. Try signing in again.",
};

export function WelcomeScreen({ error }: { error?: string }) {
  const message = error ? errorCopy[error] ?? errorCopy.callback : null;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center sm:min-h-[calc(100dvh-6.5rem)]">
      <CoachMark size="md" />
      <h1 className="mt-8 font-serif text-5xl leading-none tracking-tight sm:text-7xl">
        <span className="coach-text">Meet your coach.</span>
      </h1>
      <p className="mt-7 max-w-md text-base leading-8 text-muted sm:text-lg sm:leading-8">
        Personal training, nutrition and accountability built around you.
      </p>

      <div className="mt-10 flex w-full flex-col items-center gap-4">
        <GoogleSignInButton />
        <p className="max-w-xs text-[13px] leading-6 text-muted">
          New here or already with us — Google covers both. We’ll pick up from
          your profile if you have one.
        </p>
      </div>

      {message ? (
        <p
          role="alert"
          className="mt-8 max-w-sm text-[13px] leading-6 text-muted"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
