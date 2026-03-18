import { cn } from "@/lib/utils";

interface BrandNameProps {
  className?: string;
}

/**
 * Renders "GateCtr" with the branded accent "C" — consistent with the logo.
 * Use this anywhere the product name appears as plain text.
 */
export function BrandName({ className }: BrandNameProps) {
  return (
    <span className={cn("font-display font-bold tracking-tight", className)}>
      Gate<span className="text-accent">C</span>tr
    </span>
  );
}
