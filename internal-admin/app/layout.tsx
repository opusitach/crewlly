import type { ReactNode } from "react"
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Crewlly Internal Admin",
  description: "Internal-only platform administration.",
  // Prevent search engines from indexing any page of the admin app, even if
  // accidentally exposed publicly.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
}

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Belt-and-braces: a meta tag in addition to the response header so the
            directive survives caching/proxying mishaps. */}
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="referrer" content="no-referrer" />
      </head>
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  )
}
