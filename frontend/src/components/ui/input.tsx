import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-2xl border border-transparent bg-fog px-4 text-[15px] text-ink transition-[background-color,box-shadow] outline-none placeholder:text-slate focus-visible:border-hairline focus-visible:bg-paper focus-visible:ring-3 focus-visible:ring-cobalt/25 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/60 aria-invalid:bg-paper aria-invalid:ring-3 aria-invalid:ring-destructive/15",
        className
      )}
      {...props}
    />
  )
}

export { Input }
