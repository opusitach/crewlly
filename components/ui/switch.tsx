'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    // Wrapper ensures 44pt tap target even though visual is smaller
    <span className="inline-flex items-center justify-center min-w-[44px] min-h-[44px]">
      <SwitchPrimitive.Root
        data-slot="switch"
        className={cn(
          // HIG-size: 31×51pt visually (scaled down for density), full 44pt tap via wrapper
          'peer inline-flex h-[1.9375rem] w-[3.1875rem] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs',
          'transition-colors outline-none',
          'focus-visible:ring-[3px] focus-visible:border-ring focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[state=checked]:bg-primary data-[state=unchecked]:bg-fill-1',
          'dark:data-[state=unchecked]:bg-fill-2',
          className,
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(
            'pointer-events-none block size-[1.5625rem] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.20)]',
            'ring-0 transition-transform duration-200',
            'data-[state=checked]:translate-x-[1.25rem] data-[state=unchecked]:translate-x-0',
          )}
        />
      </SwitchPrimitive.Root>
    </span>
  )
}

export { Switch }
