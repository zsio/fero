import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-[var(--muted-foreground)] transition-colors focus:border-[var(--accent)]",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
