"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuthStore } from "@/lib/store/auth-store"
import { useToast } from "@/hooks/use-toast"

export default function VenueSetupScreen({ onReady }: { onReady: () => void }) {
  const { addVenue } = useAuthStore()
  const { toast } = useToast()
  const [venueName, setVenueName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isValid = venueName.trim().length > 1

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return
    try {
      setIsSubmitting(true)
      await addVenue({ name: venueName.trim() })
      toast({ title: "Заведение создано" })
      onReady()
    } catch (error) {
      toast({ title: "Ошибка", description: "Не удалось создать заведение", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Создайте заведение</h1>
          <p className="text-sm text-muted-foreground">Это будет видно во всех экранах</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="venue">Название заведения</Label>
            <Input id="venue" value={venueName} onChange={(e) => setVenueName(e.target.value)} required />
          </div>

          <Button type="submit" className="w-full" disabled={!isValid || isSubmitting}>
            Далее
          </Button>
        </form>
      </Card>
    </div>
  )
}

