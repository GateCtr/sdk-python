"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { WorkspaceStep } from "./steps/workspace-step";
import { ProviderStep } from "./steps/provider-step";
import { BudgetStep } from "./steps/budget-step";
import { ProjectStep } from "./steps/project-step";
import { finalizeOnboarding } from "./_actions";
import type { OnboardingStep } from "@/types/onboarding";

const STEPS: OnboardingStep[] = ["workspace", "provider", "budget", "project"];
const STORAGE_KEY = "gatectr_onboarding_step";

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const { user } = useUser();
  const { getToken } = useAuth();
  const locale = useLocale();

  const [step, setStep] = useState<OnboardingStep>(() => {
    if (typeof window === "undefined") return "workspace";
    const saved = localStorage.getItem(STORAGE_KEY) as OnboardingStep | null;
    return saved && STEPS.includes(saved) ? saved : "workspace";
  });
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [animating, setAnimating] = useState(false);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  // Persist step to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, step);
  }, [step]);

  // Redirect after finalize
  useEffect(() => {
    if (!redirectTo) return;
    localStorage.removeItem(STORAGE_KEY);
    window.location.href = redirectTo;
  }, [redirectTo]);

  const navigate = useCallback(
    (target: OnboardingStep, dir: "forward" | "back") => {
      setDirection(dir);
      setAnimating(true);
      setTimeout(() => {
        setStep(target);
        setAnimating(false);
      }, 180);
    },
    [],
  );

  function goNext() {
    const idx = STEPS.indexOf(step);
    const next = STEPS[idx + 1];
    if (next) navigate(next, "forward");
  }

  function goBack() {
    const idx = STEPS.indexOf(step);
    const prev = STEPS[idx - 1];
    if (prev) navigate(prev, "back");
  }

  async function finish() {
    const fd = new FormData();
    fd.set("locale", locale);
    const result = await finalizeOnboarding(fd);
    if (result?.error) return;

    try {
      await user?.reload();
      await getToken({ skipCache: true });
    } catch {
      // best-effort
    }

    localStorage.removeItem(STORAGE_KEY);
    const dashPath = locale === "fr" ? "/fr/dashboard" : "/dashboard";
    // Use the refresh endpoint to force a new JWT before hitting the middleware gate
    window.location.href = `/api/auth/refresh?redirect=${encodeURIComponent(dashPath)}`;
  }

  const currentIndex = STEPS.indexOf(step);

  const stepMeta: Record<OnboardingStep, { title: string; subtitle: string }> =
    {
      workspace: {
        title: t("workspace.title"),
        subtitle: t("workspace.subtitle"),
      },
      provider: {
        title: t("provider.title"),
        subtitle: t("provider.subtitle"),
      },
      budget: { title: t("budget.title"), subtitle: t("budget.subtitle") },
      project: { title: t("project.title"), subtitle: t("project.subtitle") },
    };

  return (
    <div className="space-y-8">
      {/* Progress */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">
            {t("progress.step", {
              current: currentIndex + 1,
              total: STEPS.length,
            })}
          </p>
          <p className="text-sm font-semibold text-foreground">
            {t(`progress.${step}`)}
          </p>
        </div>
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-all duration-500 relative overflow-hidden",
                i < currentIndex
                  ? "bg-primary"
                  : i === currentIndex
                    ? "bg-primary/20"
                    : "bg-muted",
              )}
            >
              {i === currentIndex && (
                <div className="absolute inset-0 bg-primary animate-[progress_2s_ease-in-out_infinite]" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Card */}
      <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden backdrop-blur-sm">
        {/* Card header with gradient */}
        <div className="border-b border-border bg-linear-to-br from-primary/5 via-primary/3 to-transparent px-6 py-5">
          <h1 className="text-lg font-semibold text-foreground leading-tight">
            {stepMeta[step].title}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {stepMeta[step].subtitle}
          </p>
        </div>

        {/* Step content with slide animation */}
        <div
          className={cn(
            "px-6 py-6 transition-all duration-180",
            animating
              ? direction === "forward"
                ? "opacity-0 translate-x-4"
                : "opacity-0 -translate-x-4"
              : "opacity-100 translate-x-0",
          )}
        >
          {step === "workspace" && <WorkspaceStep onComplete={goNext} />}
          {step === "provider" && (
            <ProviderStep onComplete={goNext} onSkip={goNext} onBack={goBack} />
          )}
          {step === "budget" && (
            <BudgetStep onComplete={goNext} onBack={goBack} />
          )}
          {step === "project" && (
            <ProjectStep onComplete={finish} onSkip={finish} onBack={goBack} />
          )}
        </div>
      </div>

      {/* Step dots */}
      <div className="flex justify-center gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={cn(
              "rounded-full transition-all duration-300",
              i === currentIndex
                ? "h-2 w-6 bg-primary shadow-sm shadow-primary/50"
                : i < currentIndex
                  ? "h-2 w-2 bg-primary/40"
                  : "h-2 w-2 bg-muted",
            )}
          />
        ))}
      </div>
    </div>
  );
}
