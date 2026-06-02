import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "../../lib/cn";

export const Tabs = TabsPrimitive.Root;

export const TabsList = ({ className, ...props }: TabsPrimitive.TabsListProps) => (
  <TabsPrimitive.List
    className={cn("inline-flex rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)] p-1", className)}
    {...props}
  />
);

export const TabsTrigger = ({ className, ...props }: TabsPrimitive.TabsTriggerProps) => (
  <TabsPrimitive.Trigger
    className={cn(
      "inline-flex min-w-[92px] items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-[color:var(--app-text-muted)] transition data-[state=active]:bg-[color:var(--app-surface)] data-[state=active]:text-[color:var(--app-text)] data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
);

export const TabsContent = ({ className, ...props }: TabsPrimitive.TabsContentProps) => (
  <TabsPrimitive.Content className={cn("mt-4 outline-none", className)} {...props} />
);
