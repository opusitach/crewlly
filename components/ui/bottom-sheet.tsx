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
}

export function BottomSheet({ isOpen, onClose, children, className, showCloseButton = false }: BottomSheetProps) {
  const prevBodyOverflow = useRef<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) {
      prevBodyOverflow.current = document.body.style.overflow
      document.body.style.overflow = "hidden"
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
    <div className="fixed inset-0 z-[70] flex items-end bg-black/50" onClick={onClose}>
      <div
        className={cn(
          "bg-card text-card-foreground relative mx-auto flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-xl rounded-t-3xl rounded-b-none border border-b-0 py-4 shadow-2xl animate-in slide-in-from-bottom duration-300",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {showCloseButton && (
          <div className="flex justify-end px-5 pt-2 pb-1">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        )}
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 [padding-bottom:max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  )
}
