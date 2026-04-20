import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // Base — HIG 44pt minimum touch target, rounded-full for pill/icon, rounded-xl for rect
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive select-none active:scale-[0.97] transition-[background-color,color,box-shadow,transform]",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-elev-1 hover:bg-primary/90 active:bg-primary/80',
        destructive:
          'bg-destructive text-destructive-foreground shadow-elev-1 hover:bg-destructive/90 active:bg-destructive/80 focus-visible:outline-destructive dark:bg-destructive/70',
        outline:
          'border border-border bg-card shadow-elev-1 hover:bg-fill-3 hover:text-foreground active:bg-fill-2 dark:bg-surface-elevated dark:border-separator-opaque dark:hover:bg-fill-3',
        secondary:
          'bg-fill-3 text-foreground hover:bg-fill-2 active:bg-fill-1',
        ghost:
          'hover:bg-fill-3 hover:text-foreground active:bg-fill-2 dark:hover:bg-fill-3',
        link:
          'text-primary-text underline-offset-4 hover:underline active:opacity-70',
        tinted:
          'bg-primary/10 text-primary-text hover:bg-primary/15 active:bg-primary/20 dark:bg-primary/15 dark:text-primary',
      },
      size: {
        default: 'h-11 px-5 py-2.5 has-[>svg]:px-4',       // 44pt — HIG minimum
        sm:      'h-9 rounded-lg px-4 gap-1.5 has-[>svg]:px-3 text-[0.8125rem]',
        lg:      'h-14 rounded-2xl px-8 text-base has-[>svg]:px-6',
        icon:    'size-11 rounded-full',                      // 44pt icon button
        'icon-sm': 'size-9 rounded-full',
        'icon-lg': 'size-14 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
