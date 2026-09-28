import type { ReactNode } from "react";
import React from "react";
import { Button, EmptyState, Skeleton, StatGridSkeleton, TableSkeleton } from "@ledgerlab/ui";

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-6 text-sm text-zinc-500">
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600"
      />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      title="Something went wrong"
      description={message}
      action={onRetry ? <Button onClick={onRetry}>Try again</Button> : undefined}
    />
  );
}

export type SkeletonType = "card" | "table" | "stat" | ReactNode;

/** Render loading / error / content with a consistent contract and modern skeletons. */
export function Async<T>({
  loading,
  error,
  data,
  onRetry,
  skeleton,
  children,
}: {
  loading: boolean;
  error: string | undefined;
  data: T | undefined;
  onRetry?: () => void;
  skeleton?: SkeletonType;
  children: (data: T) => ReactNode;
}) {
  if (loading) {
    if (skeleton === "card" || skeleton === "stat") {
      return <StatGridSkeleton />;
    }
    if (skeleton === "table") {
      return <TableSkeleton rows={5} cols={5} />;
    }
    if (React.isValidElement(skeleton)) {
      return <>{skeleton}</>;
    }
    return (
      <div className="flex flex-col gap-3.5 py-4 w-full">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) return <ErrorBlock message={error} onRetry={onRetry} />;
  if (data === undefined) return <ErrorBlock message="No data returned" onRetry={onRetry} />;
  return <>{children(data)}</>;
}
