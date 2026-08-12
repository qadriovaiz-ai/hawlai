"use client";

import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "block w-full px-3 py-2 pr-9 text-sm text-slate-900 bg-slate-100 border border-slate-300 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition-all duration-150",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  )
);
Select.displayName = "Select";
