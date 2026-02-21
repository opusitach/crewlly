function copyWithExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false

  // Force clipboard payload via copy event to avoid copying currently selected UI text.
  let copiedFromEvent = false
  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return
    event.preventDefault()
    event.stopPropagation()
    event.clipboardData.setData("text/plain", text)
    copiedFromEvent = true
  }

  document.addEventListener("copy", onCopy)
  try {
    document.execCommand("copy")
  } catch {
    // Ignore and continue to DOM-selection fallback below.
  } finally {
    document.removeEventListener("copy", onCopy)
  }

  if (copiedFromEvent) {
    return true
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.top = "0"
  textarea.style.left = "0"
  textarea.style.width = "1px"
  textarea.style.height = "1px"
  textarea.style.padding = "0"
  textarea.style.border = "0"
  textarea.style.outline = "0"
  textarea.style.boxShadow = "none"
  textarea.style.background = "transparent"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)

  const selection = document.getSelection()
  const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  let copied = false
  try {
    copied = document.execCommand("copy")
  } catch {
    copied = false
  }

  if (selection) {
    selection.removeAllRanges()
    if (selectedRange) {
      try {
        selection.addRange(selectedRange)
      } catch {
        // Ignore restore failures if original selection target no longer exists.
      }
    }
  }

  document.body.removeChild(textarea)
  return copied
}

export async function copyToClipboard(rawText: string): Promise<boolean> {
  const text = rawText.trim()
  if (!text) return false

  // Keep this first: in some mobile/webview contexts fallback only works inside direct user gesture.
  if (copyWithExecCommand(text)) {
    return true
  }

  if (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText
  ) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  return false
}
