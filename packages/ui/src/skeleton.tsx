import type { HTMLAttributes } from "react";
import { cn } from "./cn";
import { Card } from "./card";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-zinc-200/80", className)} {...props} />
  );
}

export function CardSkeleton() {
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="mt-1 h-3 w-28" />
      </div>
    </Card>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full divide-y divide-zinc-200 overflow-hidden">
      <div className="flex items-center gap-4 bg-zinc-50 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-zinc-100 bg-white">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn("h-4 flex-1", c === 0 ? "max-w-[100px]" : c === cols - 1 ? "max-w-[80px]" : "")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
