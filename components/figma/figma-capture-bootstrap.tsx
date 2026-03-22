"use client"

import { useEffect } from "react"

const FIGMA_CAPTURE_SCRIPT_ID = "figma-html-to-design-capture"
const FIGMA_CAPTURE_SCRIPT_SRC = "https://mcp.figma.com/mcp/html-to-design/capture.js"

export default function FigmaCaptureBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!window.location.hash.includes("figmacapture=")) return
    if (window.location.pathname.startsWith("/figma-capture/")) return
    if (document.getElementById(FIGMA_CAPTURE_SCRIPT_ID)) return

    const script = document.createElement("script")
    script.id = FIGMA_CAPTURE_SCRIPT_ID
    script.src = FIGMA_CAPTURE_SCRIPT_SRC
    script.async = true
    document.head.appendChild(script)

    return () => {
      script.remove()
    }
  }, [])

  return null
}
