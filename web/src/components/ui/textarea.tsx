import * as React from "react";

import { cn } from "../../lib/cn";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[120px] w-full rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-4 py-3 text-sm leading-7 text-[color:var(--app-text)] shadow-sm outline-none transition placeholder:text-[color:var(--app-text-muted)] focus:border-[color:var(--app-link)]",
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";
