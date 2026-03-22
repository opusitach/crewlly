import type { Metadata } from "next"

import FigmaShowcase from "@/components/showcase/figma-showcase"

export const metadata: Metadata = {
  title: "Figma Showcase | Crewlly",
  description: "Визуальный showcase-экран для демонстрации UI-направления Crewlly.",
}

export default function FigmaShowcasePage() {
  return <FigmaShowcase />
}
