import type React from "react"
import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import FigmaCaptureBootstrap from "@/components/figma/figma-capture-bootstrap"
import { Toaster } from "@/components/ui/toaster"
import { LanguageProviderWrapper } from "@/components/providers/language-provider-wrapper"
import "./globals.css"

export const metadata: Metadata = {
  title: "Crewlly — Управление персоналом",
  description: "Современное приложение для управления сменами и персоналом",
  generator: "v0.app",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Crewlly",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-touch-icon.png",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)",  color: "#1a1714" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru">
      <body className="font-sans antialiased">
        <FigmaCaptureBootstrap />
        <LanguageProviderWrapper>
          {children}
          <Toaster />
          <Analytics />
        </LanguageProviderWrapper>
      </body>
    </html>
  )
}
