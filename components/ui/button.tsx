import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // ── shadcn base variants ──────────────────────────────────────────
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",

        // ── GateCtr CTA Design System ─────────────────────────────────────
        // Primary CTA — main action per page
        "cta-primary":
          "rounded-sm bg-primary-500 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm",

        // Secondary CTA — alternative, less urgent
        "cta-secondary":
          "rounded-sm border-[1.5px] border-primary-500 text-primary-500 bg-transparent hover:bg-primary-500/8 active:bg-primary-500/15 dark:border-primary-400 dark:text-primary-400 dark:hover:bg-primary-500/20",

        // Accent CTA — promotions, upsell, onboarding
        "cta-accent":
          "rounded-sm bg-secondary-500 text-white hover:bg-secondary-600 hover:shadow-[0_0_16px_color-mix(in_srgb,var(--color-secondary-500)_45%,transparent)] active:bg-secondary-700 transition-shadow",

        // Ghost CTA — tertiary actions (skip, cancel)
        "cta-ghost":
          "rounded-sm text-muted-foreground bg-transparent hover:underline hover:text-foreground underline-offset-4",

        // Danger CTA — delete, irreversible actions
        "cta-danger":
          "rounded-sm bg-error-500 text-white hover:bg-error-600 active:bg-destructive focus-visible:ring-error-500/30",

        // Code CTA — npm commands, copy snippet
        "cta-code":
          "rounded-sm font-mono text-xs bg-grey-100 text-grey-800 border border-grey-300 hover:bg-grey-200 dark:bg-grey-700 dark:text-grey-100 dark:border-grey-600 dark:hover:bg-grey-700/80",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
