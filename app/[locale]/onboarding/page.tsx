"use client";

import { useUser } from "@clerk/nextjs";
import { useAuth } from "@clerk/nextjs";
import { useTranslations, useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { completeOnboarding } from "./_actions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { RequiredFormLabel } from "@/components/shared/required-form-label";

// ─── Types ────────────────────────────────────────────────────────────────────

type OnboardingValues = {
  orgName: string;
  usageType: "personal" | "team" | "enterprise";
  useCase: "chatbot" | "analytics" | "content" | "code" | "other";
  teamSize: "solo" | "small" | "medium" | "large";
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const { user } = useUser();
  const { getToken } = useAuth();
  const locale = useLocale();

  const onboardingSchema = z.object({
    orgName: z
      .string()
      .min(1, t("errors.orgName"))
      .min(2, t("errors.orgNameMin")),
    usageType: z.enum(["personal", "team", "enterprise"]),
    useCase: z.enum(["chatbot", "analytics", "content", "code", "other"]),
    teamSize: z.enum(["solo", "small", "medium", "large"]),
  });

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      orgName: "",
      usageType: "team",
      useCase: "chatbot",
      teamSize: "small",
    },
  });

  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  useEffect(() => {
    if (redirectTo) {
      window.location.href = redirectTo;
    }
  }, [redirectTo]);

  const { isSubmitting } = form.formState;
  const isLocked = isSubmitting || redirectTo !== null;

  async function onSubmit(values: OnboardingValues) {
    const formData = new FormData();
    Object.entries(values).forEach(([k, v]) => formData.set(k, v));

    const res = await completeOnboarding(formData);

    if (res?.error) {
      form.setError("root", {
        message:
          res.error === "orgName_required"
            ? t("errors.orgName")
            : t("errors.failed"),
      });
      return;
    }

    try {
      await user?.reload();
      await getToken({ skipCache: true });
      setRedirectTo(locale === "fr" ? "/fr/dashboard" : "/dashboard");
    } catch {
      form.setError("root", { message: t("errors.failed") });
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl">{t("page.title")}</CardTitle>
        <CardDescription className="text-base">
          {t("page.subtitle")}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* ── Section 1 : Organisation ── */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("section.organization")}
              </p>

              {/* Org name — full width */}
              <FormField
                control={form.control}
                name="orgName"
                render={({ field }) => (
                  <FormItem>
                    <RequiredFormLabel required>
                      {t("form.orgName.label")}
                    </RequiredFormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("form.orgName.placeholder")}
                        autoFocus
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{t("form.orgName.hint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Usage type + Team size — side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="usageType"
                  render={({ field }) => (
                    <FormItem>
                      <RequiredFormLabel>
                        {t("form.usageType.label")}
                      </RequiredFormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="personal">
                            {t("form.usageType.personal")}
                          </SelectItem>
                          <SelectItem value="team">
                            {t("form.usageType.team")}
                          </SelectItem>
                          <SelectItem value="enterprise">
                            {t("form.usageType.enterprise")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="teamSize"
                  render={({ field }) => (
                    <FormItem>
                      <RequiredFormLabel>
                        {t("form.teamSize.label")}
                      </RequiredFormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="solo">
                            {t("form.teamSize.solo")}
                          </SelectItem>
                          <SelectItem value="small">
                            {t("form.teamSize.small")}
                          </SelectItem>
                          <SelectItem value="medium">
                            {t("form.teamSize.medium")}
                          </SelectItem>
                          <SelectItem value="large">
                            {t("form.teamSize.large")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* ── Section 2 : Usage ── */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("section.usage")}
              </p>

              {/* Use case — full width */}
              <FormField
                control={form.control}
                name="useCase"
                render={({ field }) => (
                  <FormItem>
                    <RequiredFormLabel>
                      {t("form.useCase.label")}
                    </RequiredFormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="chatbot">
                          {t("form.useCase.chatbot")}
                        </SelectItem>
                        <SelectItem value="analytics">
                          {t("form.useCase.analytics")}
                        </SelectItem>
                        <SelectItem value="content">
                          {t("form.useCase.content")}
                        </SelectItem>
                        <SelectItem value="code">
                          {t("form.useCase.code")}
                        </SelectItem>
                        <SelectItem value="other">
                          {t("form.useCase.other")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>{t("form.useCase.hint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Root / server error */}
            {form.formState.errors.root && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {form.formState.errors.root.message}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              variant="cta-accent"
              disabled={isLocked}
              className="w-full"
              size="lg"
            >
              {isLocked ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("form.submitting")}
                </>
              ) : (
                t("form.submit")
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
