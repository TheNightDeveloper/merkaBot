import { cn } from "../../lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-[color:var(--app-surface-muted)] opacity-80", className)} />;
}
