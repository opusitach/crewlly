"use client"

import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

type BottomSheetProps = {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  showCloseButton?: boolean
  /** Accessible label for the sheet dialog */
  title?: string
}

export function BottomSheet({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = false,
  title,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const prevBodyOverflow = useRef<string | null>(null)

  // Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      prevBodyOverflow.current = document.body.style.overflow
      document.body.style.overflow = "hidden"
      // Auto-focus the sheet for keyboard users
      sheetRef.current?.focus()
    } else if (prevBodyOverflow.current !== null) {
      document.body.style.overflow = prevBodyOverflow.current
      prevBodyOverflow.current = null
    }
    return () => {
      if (prevBodyOverflow.current !== null) {
        document.body.style.overflow = prevBodyOverflow.current
        prevBodyOverflow.current = null
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    // HIG overlay: lighter than 50% — 25-30% is iOS standard
    <div
      className="fixed inset-0 z-[70] flex items-end bg-black/30 dark:bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        ref={sheetRef}
        tabIndex={-1}
        className={cn(
          // Glass card, rounded-t-[28px] per HIG sheets
          "relative mx-auto flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden",
          "rounded-t-[1.75rem] rounded-b-none",
          "glass-card border border-b-0 border-white/25 dark:border-white/10",
          "shadow-elev-modal",
          "animate-in slide-in-from-bottom duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          "outline-none",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Drag handle (HIG) */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0" aria-hidden="true">
          <div className="h-1 w-9 rounded-full bg-separator-opaque dark:bg-fill-2" />
        </div>

        {showCloseButton && (
          <div className="flex justify-end px-5 pb-1 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-fill-3 text-muted-foreground transition-colors hover:bg-fill-2 hover:text-foreground active:bg-fill-1"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        )}

        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 [padding-bottom:max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  )
}
