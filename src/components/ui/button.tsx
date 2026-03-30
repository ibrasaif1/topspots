import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:-translate-y-0.5 active:translate-y-0.5",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-b from-white to-zinc-100 text-zinc-900 dark:from-zinc-800 dark:to-zinc-950 dark:text-zinc-50 hover:from-zinc-50 hover:to-zinc-100 dark:hover:from-zinc-700 dark:hover:to-zinc-900 active:from-zinc-100 active:to-zinc-200 dark:active:from-zinc-900 dark:active:to-zinc-950 shadow-[0_3px_0_0_#b0b0b8] hover:shadow-[0_4px_0_0_#a8a8b0] active:shadow-[0_1px_0_0_#c0c0c8] dark:shadow-[0_3px_0_0_#0d0d0f] dark:hover:shadow-[0_4px_0_0_#080809] dark:active:shadow-[0_1px_0_0_#151517]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_3px_0_0_var(--shadow-destructive)] hover:shadow-[0_4px_0_0_var(--shadow-destructive)] active:shadow-[0_1px_0_0_var(--shadow-destructive)]",
        outline:
          "border border-input bg-gradient-to-b from-white to-zinc-50/80 dark:from-zinc-800/50 dark:to-zinc-900/50 hover:from-zinc-50 hover:to-zinc-100/80 dark:hover:from-zinc-700/50 dark:hover:to-zinc-800/50 active:from-zinc-100/80 active:to-zinc-50 dark:active:from-zinc-900/50 dark:active:to-zinc-950/50 shadow-[0_3px_0_0_var(--shadow-outline)] hover:shadow-[0_4px_0_0_var(--shadow-outline)] active:shadow-[0_1px_0_0_var(--shadow-outline)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-[0_3px_0_0_var(--shadow-outline)] hover:shadow-[0_4px_0_0_var(--shadow-outline)] active:shadow-[0_1px_0_0_var(--shadow-outline)]",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
