"use client"

import * as React from "react"
import { GlassCalendar } from "@/components/ui/glass-calendar"

export default function GlassCalendarDemo() {
  const [selectedDate, setSelectedDate] = React.useState(new Date())
  const backgroundImageUrl =
    "https://plus.unsplash.com/premium_photo-1673873438024-81d29f555b95?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NjM2fHxjb2xvcnxlbnwwfHwwfHx8MA%3D%3D"

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-slate-950 bg-cover bg-center p-4"
      style={{ backgroundImage: `url(${backgroundImageUrl})` }}
    >
      <GlassCalendar
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        className="max-w-[420px] transition-transform duration-500 hover:scale-[1.02]"
      />
    </div>
  )
}
