import { enUS, frFR } from "@clerk/localizations";

type ClerkLocalization = typeof enUS;

/**
 * GateCtr branded Clerk localization — English.
 * Extends enUS with brand-specific wording.
 */
export const clerkLocalizationEn: ClerkLocalization = {
  ...enUS,
  signIn: {
    ...enUS.signIn,
    start: {
      ...enUS.signIn?.start,
      title: "Sign in to GateCtr",
      subtitle: "Welcome back — control your LLM costs",
    },
  },
  signUp: {
    ...enUS.signUp,
    start: {
      ...enUS.signUp?.start,
      title: "Create your GateCtr account",
      subtitle: "Start controlling your LLM costs today",
    },
  },
};

/**
 * GateCtr branded Clerk localization — French.
 * Extends frFR with brand-specific wording.
 */
export const clerkLocalizationFr: ClerkLocalization = {
  ...frFR,
  signIn: {
    ...frFR.signIn,
    start: {
      ...frFR.signIn?.start,
      title: "Connexion à GateCtr",
      subtitle: "Bon retour — maîtrisez vos coûts LLM",
    },
  },
  signUp: {
    ...frFR.signUp,
    start: {
      ...frFR.signUp?.start,
      title: "Créer votre compte GateCtr",
      subtitle: "Commencez à contrôler vos coûts LLM dès aujourd'hui",
    },
  },
};

export function getClerkLocalization(locale: string): ClerkLocalization {
  return locale === "fr" ? clerkLocalizationFr : clerkLocalizationEn;
}
