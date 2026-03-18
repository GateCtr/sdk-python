"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectGroup,
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
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/shared/logo";
import { RequiredFormLabel } from "@/components/shared/required-form-label";

// ─── Schema ───────────────────────────────────────────────────────────────────

type WaitlistValues = {
  email: string;
  name?: string;
  company?: string;
  useCase?: string;
};

// ─── Success state ─────────────────────────────────────────────────────────────

function SuccessCard({ position }: { position: number | null }) {
  const t = useTranslations("waitlist");
  const router = useRouter();

  return (
    <Card className="w-full max-w-md text-center">
      <CardHeader className="pb-4">
        <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-2">
          <Check className="w-8 h-8 text-secondary" />
        </div>
        <CardTitle className="text-2xl">{t("success.title")}</CardTitle>
        <CardDescription className="text-base">
          {t("success.message", { position: position ?? 0 })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {position && (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-full">
            <span className="text-sm text-muted-foreground">Position</span>
            <span className="text-lg font-semibold text-foreground">
              #{position}
            </span>
          </div>
        )}
        <Button variant="cta-ghost" onClick={() => router.push("/")}>
          {t("success.cta")}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

export function WaitlistForm() {
  const t = useTranslations("waitlist");
  const [position, setPosition] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const waitlistSchema = z.object({
    email: z
      .string()
      .min(1, t("form.email.required"))
      .email(t("form.email.invalid")),
    name: z.string().optional(),
    company: z.string().optional(),
    useCase: z.string().optional(),
  });

  const form = useForm<WaitlistValues>({
    resolver: zodResolver(waitlistSchema),
    defaultValues: { email: "", name: "", company: "", useCase: "" },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: WaitlistValues) {
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (!response.ok) {
        form.setError("root", {
          message:
            response.status === 409
              ? t("errors.duplicate")
              : t("errors.failed"),
        });
        return;
      }

      setPosition(data.position);
      setSubmitted(true);
    } catch {
      form.setError("root", { message: t("errors.network") });
    }
  }

  if (submitted) return <SuccessCard position={position} />;

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center space-y-3 pb-2">
        <div className="flex justify-center">
          <Logo
            variant="stacked"
            iconClassName="w-10 h-10"
            textClassName="text-2xl"
          />
        </div>
        <div>
          <CardTitle className="text-2xl">{t("page.title")}</CardTitle>
          <CardDescription className="text-base mt-1">
            {t("page.subtitle")}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* ── Section 1 : Contact ── */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("section.contact")}
              </p>

              {/* Email — full width */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <RequiredFormLabel required>
                      {t("form.email.label")}
                    </RequiredFormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder={t("form.email.placeholder")}
                        autoFocus
                        autoComplete="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Name + Company — side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <RequiredFormLabel>
                        {t("form.name.label")}
                      </RequiredFormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("form.name.placeholder")}
                          autoComplete="name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <RequiredFormLabel>
                        {t("form.company.label")}
                      </RequiredFormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("form.company.placeholder")}
                          autoComplete="organization"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* ── Section 2 : Use case ── */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("section.useCase")}
              </p>

              <FormField
                control={form.control}
                name="useCase"
                render={({ field }) => (
                  <FormItem>
                    <RequiredFormLabel>
                      {t("form.useCase.label")}
                    </RequiredFormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("form.useCase.placeholder")}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="saas">
                            {t("form.useCase.options.saas")}
                          </SelectItem>
                          <SelectItem value="agent">
                            {t("form.useCase.options.agent")}
                          </SelectItem>
                          <SelectItem value="enterprise">
                            {t("form.useCase.options.enterprise")}
                          </SelectItem>
                          <SelectItem value="dev">
                            {t("form.useCase.options.dev")}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Root / server error */}
            {form.formState.errors.root && (
              <Alert variant="destructive">
                <AlertDescription>
                  {form.formState.errors.root.message}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              variant="cta-accent"
              disabled={isSubmitting}
              className="w-full group"
              size="lg"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("form.submitting")}
                </>
              ) : (
                <>
                  {t("form.submit")}
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              {t("page.description")}
            </p>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
