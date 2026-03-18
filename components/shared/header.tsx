"use client";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/shared/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Menu } from "lucide-react";
import { useState, useEffect } from "react";

export type HeaderVariant = "marketing" | "auth" | "dashboard" | "minimal";

export interface HeaderProps {
  variant?: HeaderVariant;
  rightSlot?: React.ReactNode;
  className?: string;
}

const NAV_LINKS = [
  { key: "features", href: "/features" },
  { key: "pricing", href: "/pricing" },
  { key: "docs", href: "/docs" },
  { key: "changelog", href: "/changelog" },
] as const;

function DesktopNav() {
  const t = useTranslations("common.nav");
  return (
    <nav className="hidden md:flex items-center gap-1">
      {NAV_LINKS.map(({ key, href }) => (
        <Link
          key={key}
          href={href}
          className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50 transition-colors"
        >
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}

function DesktopActions() {
  const t = useTranslations("common.nav");
  return (
    <div className="hidden md:flex items-center gap-1">
      <LanguageSwitcher />
      <ThemeToggle />
      <div className="w-px h-4 bg-border mx-1" aria-hidden />
      <Button variant="cta-ghost" size="sm" asChild>
        <Link href="/sign-in">{t("signIn")}</Link>
      </Button>
      <Button variant="cta-primary" size="sm" asChild>
        <Link href="/sign-up">{t("signUp")}</Link>
      </Button>
    </div>
  );
}

function MobileSheet() {
  const t = useTranslations("common.nav");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </Button>
      <SheetContent side="right" className="w-72 p-0">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
          <SheetTitle asChild>
            <SheetClose asChild>
              <Link href="/" aria-label="GateCtr home">
                <Logo variant="full" />
              </Link>
            </SheetClose>
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col px-3 py-4 gap-1">
          {NAV_LINKS.map(({ key, href }) => (
            <SheetClose key={key} asChild>
              <Link
                href={href}
                className="px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50 transition-colors"
              >
                {t(key)}
              </Link>
            </SheetClose>
          ))}
        </nav>
        <div className="px-4 pb-6 mt-auto border-t border-border flex flex-col gap-2">
          <div className="flex items-center gap-2 py-3">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <Button variant="cta-secondary" size="sm" asChild className="w-full">
            <SheetClose asChild>
              <Link href="/sign-in">{t("signIn")}</Link>
            </SheetClose>
          </Button>
          <Button variant="cta-primary" size="sm" asChild className="w-full">
            <SheetClose asChild>
              <Link href="/sign-up">{t("signUp")}</Link>
            </SheetClose>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Header({
  variant = "marketing",
  rightSlot,
  className,
}: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "w-full bg-background/80 backdrop-blur-sm sticky top-0 z-50 transition-[border-color,box-shadow] duration-200",
        scrolled
          ? "border-b border-border shadow-sm"
          : "border-b border-transparent",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center h-16 px-4 md:px-6",
          variant === "auth"
            ? "justify-center"
            : "justify-between max-w-7xl mx-auto",
        )}
      >
        <Link href="/" aria-label="GateCtr home">
          <Logo variant="full" />
        </Link>

        {variant === "marketing" && <DesktopNav />}

        {variant === "marketing" && (
          <>
            <DesktopActions />
            <MobileSheet />
          </>
        )}

        {(variant === "dashboard" || variant === "minimal") && (
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            {rightSlot}
          </div>
        )}
      </div>
    </header>
  );
}
