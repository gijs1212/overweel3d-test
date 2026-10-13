import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold tracking-[-0.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary shadow-overweel-sm hover:bg-primary/86 hover:shadow-overweel-md active:translate-y-px",
        destructive:
          "bg-destructive text-destructive-foreground shadow-overweel-sm hover:bg-destructive/90",
        outline:
          "border border-primary/25 bg-white text-primary hover:border-primary hover:bg-primary hover:text-primary-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-overweel-sm hover:bg-secondary/80",
        ghost:
          "hover:bg-foreground/[0.06] hover:text-foreground",
        link: 
          "text-primary underline-offset-4 hover:underline",
        hero:
          "bg-white text-black border border-white shadow-overweel-glow hover:bg-white/90 active:translate-y-px font-bold",
        ice:
          "bg-overweel-ice text-primary border border-border hover:bg-secondary hover:shadow-overweel-sm",
        deep:
          "bg-black text-white border border-black shadow-overweel-md hover:bg-black/85 hover:shadow-overweel-lg",
      },
      size: {
        default: "h-11 px-6 py-2",
        sm: "h-9 rounded-md px-4 text-xs",
        lg: "h-14 rounded-xl px-8 text-base",
        xl: "h-16 rounded-xl px-10 text-lg",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...(!asChild ? { type: type ?? "button" } : {})}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
