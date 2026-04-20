import * as React from 'react'

import { DEFAULT_EMAIL_PATTERN } from '@/lib/validation/email'
import { cn } from '@/lib/utils'

function Input({ className, type, pattern, ...props }: React.ComponentProps<'input'>) {
  const resolvedPattern = pattern ?? (type === 'email' ? DEFAULT_EMAIL_PATTERN : undefined)

  return (
    <input
      type={type}
      pattern={resolvedPattern}
      data-slot="input"
      className={cn(
        // HIG: 44pt height, rounded-xl, SF Pro text size (17pt = 1.0625rem on mobile)
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground',
        'dark:bg-surface-tertiary border-border h-11 w-full min-w-0 rounded-xl border bg-input px-4 py-2.5',
        'text-[1.0625rem] leading-[1.375rem] tracking-[-0.025em] shadow-elev-1',
        'transition-[color,box-shadow,border-color] outline-none',
        'file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
