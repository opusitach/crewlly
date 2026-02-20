"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type BottomSheetProps = {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
}

export function BottomSheet({ isOpen, onClose, children, className }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const startYRef = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)
  const threshold = 120
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

  const startDrag = (clientY: number) => {
    startYRef.current = clientY
  }

  const moveDrag = (clientY: number) => {
    if (startYRef.current === null) return
    const delta = clientY - startYRef.current
    setDragY(delta > 0 ? delta : 0)
  }

  const endDrag = () => {
    if (dragY > threshold) {
      onClose()
    }
    setDragY(0)
    startYRef.current = null
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    // guard for non-pointer environments or synthetic events without preventDefault
    try {
      e.preventDefault()
    } catch {
      // ignore
    }
    try {
      ;(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId)
    } catch {
      // ignore
    }
    startDrag(e.clientY)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (startYRef.current !== null) {
      moveDrag(e.clientY)
    }
  }

  const handlePointerUp = () => {
    endDrag()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div
        ref={sheetRef}
        className={cn(
          "bg-card text-card-foreground flex flex-col gap-3 rounded-xl border py-4 rounded-t-3xl rounded-b-none border-b-0 shadow-2xl max-w-md mx-auto w-full animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-hidden",
          className,
        )}
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
      >
        <div
          className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="h-1.5 w-14 rounded-full bg-muted" />
        </div>
        <div className="px-5 pb-4 overflow-auto max-h-[calc(90vh-56px)]">{children}</div>
      </div>
    </div>
  )
}

