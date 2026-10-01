import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-transparent font-medium whitespace-nowrap transition-[background-color,opacity,box-shadow,transform] outline-none select-none focus-visible:ring-3 focus-visible:ring-cobalt/40 active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper hover:bg-ink/85",
        outline: "border-hairline bg-paper text-ink hover:bg-fog aria-expanded:bg-fog",
        secondary: "bg-fog text-ink hover:bg-fog-strong aria-expanded:bg-fog-strong",
        ghost: "text-ink hover:bg-fog aria-expanded:bg-fog",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        link: "rounded-md px-0 text-ink underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 text-[14px]",
        xs: "h-7 px-2.5 text-[12px] [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 px-3 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 px-6 text-[15px]",
        xl: "h-14 px-7 text-[17px]",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
