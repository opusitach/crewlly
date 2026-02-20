"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

type ImagePreviewProps = {
  src: string
  alt: string
  imageClassName?: string
  triggerClassName?: string
  fullscreenImageClassName?: string
  closeLabel?: string
  disabled?: boolean
}

export function ImagePreview({
  src,
  alt,
  imageClassName,
  triggerClassName,
  fullscreenImageClassName,
  closeLabel = "Закрыть",
  disabled = false,
}: ImagePreviewProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false)
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  const canOpen = !disabled && Boolean(src.trim())

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!canOpen) return
          setIsOpen(true)
        }}
        disabled={!canOpen}
        className={cn(
          "relative block overflow-hidden p-0 text-left transition-opacity disabled:cursor-not-allowed disabled:opacity-100",
          canOpen && "cursor-zoom-in",
          triggerClassName,
        )}
      >
        <img src={src} alt={alt} className={imageClassName} />
      </button>

      {isMounted && isOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] bg-black/95">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="absolute inset-0 cursor-zoom-out"
                aria-label={closeLabel}
              />

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 sm:p-6">
                <img
                  src={src}
                  alt={alt}
                  className={cn("pointer-events-auto max-h-full max-w-full object-contain", fullscreenImageClassName)}
                />
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="absolute right-3 top-3 z-10 rounded-full bg-black/70 p-2 text-white transition hover:bg-black/85"
                aria-label={closeLabel}
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
