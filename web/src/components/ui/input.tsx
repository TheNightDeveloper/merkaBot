import * as React from "react";

import { cn } from "../../lib/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-4 text-sm text-[color:var(--app-text)] shadow-sm outline-none transition placeholder:text-[color:var(--app-text-muted)] focus:border-[color:var(--app-link)]",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";
