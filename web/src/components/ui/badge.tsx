import * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border border-transparent px-3 py-1 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-[color:var(--app-surface-muted)] text-[color:var(--app-text)]",
        success: "bg-[color:var(--app-success-soft)] text-[color:var(--app-success)]",
        warning: "bg-[color:var(--app-warning-soft)] text-[color:var(--app-warning)]",
        danger: "bg-[color:var(--app-danger-soft)] text-[color:var(--app-danger)]",
        info: "bg-[color:var(--app-info-soft)] text-[color:var(--app-info)]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
