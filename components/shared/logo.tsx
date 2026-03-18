import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "icon" | "full" | "stacked";
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}

export function Logo({
  variant = "full",
  className,
  iconClassName,
  textClassName,
}: LogoProps) {
  const isStacked = variant === "stacked";

  return (
    <div
      className={cn(
        "flex items-center",
        isStacked ? "flex-col gap-2" : "gap-3",
        className,
      )}
    >
      {/* Icon SVG */}
      <svg
        viewBox="0 0 363.13 361.9"
        className={cn("w-8 h-8", iconClassName)}
        aria-label="GateCtr Logo"
      >
        {/* Main circle part - primary color */}
        <path
          className="fill-primary transition-colors"
          d="M347.98,171.57c.25,18.28-2.32,35.91-7.3,52.51l-65.45-28.01c1.16-6.34,1.77-12.88,1.77-19.57,0-58.27-46.11-105.5-103-105.5-13.51,0-26.41,2.66-38.23,7.51-7.92,3.24-15.35,7.46-22.15,12.51-9.46,7.02-17.7,15.64-24.34,25.48-4.41,6.5-8.11,13.53-11,20.98-4.7,12.07-7.28,25.23-7.28,39.02,0,58.27,46.11,105.5,103,105.5,7.81,0,15.43-.89,22.74-2.58l27.06,61.34c-16.51,4.93-34.04,7.47-52.21,7.22C76.65,346.7-.23,268.52,0,173.57c.05-22.71,4.46-44.4,12.43-64.27,2.95-7.36,6.39-14.47,10.27-21.29,14.8-26,36.11-47.8,61.71-63.2,7.21-4.34,14.76-8.18,22.61-11.45C126.95,5.04,148.76.32,171.64.02c95.67-1.27,175.04,75.89,176.35,171.56Z"
        />
        {/* Triangle part - accent color (cyan) */}
        <path
          className="fill-accent transition-colors"
          d="M355.84,290.8l-63.81,63.81c-11.5,11.5-30.97,7.86-37.54-7.02l-6.99-15.83-26.96-61.12-15.61-35.39c-8.48-19.22,10.97-38.89,30.28-30.62l33.16,14.19,63.99,27.39,16.22,6.94c15.06,6.44,18.84,26.06,7.26,37.65Z"
        />
      </svg>

      {/* Text - shown in 'full' and 'stacked' variants */}
      {(variant === "full" || variant === "stacked") && (
        <span
          className={cn(
            "font-display text-2xl font-bold tracking-tight",
            "text-foreground transition-colors",
            textClassName,
          )}
        >
          Gate<span className="text-accent">C</span>tr
        </span>
      )}
    </div>
  );
}
