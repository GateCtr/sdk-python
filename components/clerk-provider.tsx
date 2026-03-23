import { ClerkProvider as ClerkNextJSProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/themes";
import { getClerkLocalization } from "@/lib/clerk-localization";

type ClerkProviderProps = React.ComponentProps<typeof ClerkNextJSProvider> & {
  locale?: string;
};

export function ClerkProvider({
  children,
  appearance,
  locale = "en",
  ...props
}: ClerkProviderProps) {
  return (
    <ClerkNextJSProvider
      localization={getClerkLocalization(locale)}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/onboarding"
      afterSignOutUrl="/sign-in"
      // Ensure cookies are scoped to the root domain so they work across
      // app.gatectr.com and gatectr.com without handshake loops
      domain={
        typeof window !== "undefined"
          ? window.location.hostname.split(".").slice(-2).join(".")
          : undefined
      }
      appearance={{
        theme: shadcn,
        ...appearance,
      }}
      {...props}
    >
      {children}
    </ClerkNextJSProvider>
  );
}
