import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingLoading() {
  return (
    <div className="w-full max-w-lg rounded-xl border border-border p-6 space-y-6">
      {/* Card header */}
      <div className="text-center space-y-2">
        <Skeleton className="h-7 w-48 mx-auto" />
        <Skeleton className="h-5 w-64 mx-auto" />
      </div>

      {/* Section label */}
      <Skeleton className="h-3 w-32" />

      {/* Org name field */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Two selects side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>

      <Skeleton className="h-px w-full" />

      {/* Section label */}
      <Skeleton className="h-3 w-24" />

      {/* Use case select */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
      </div>

      {/* Submit button */}
      <Skeleton className="h-11 w-full" />
    </div>
  );
}
