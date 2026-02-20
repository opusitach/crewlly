"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, Mail, Phone, Edit2, Camera, LogOut } from "lucide-react"
import { ImagePreview } from "@/components/ui/image-preview"

interface WorkerProfileProps {
  onBack: () => void
  onLogout: () => void
  hideHeader?: boolean
}

export default function WorkerProfile({ onBack, onLogout, hideHeader = false }: WorkerProfileProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    phone: null as string | null,
    avatarUrl: "",
    positions: [] as string[],
  })

  useEffect(() => {
    const loadProfile = async () => {
      const res = await fetch("/api/onboarding/employee", { cache: "no-store" })
      if (!res.ok) return
      const json = await res.json().catch(() => null)
      const user = json?.data?.user
      const employeePositions = Array.isArray(json?.data?.employee?.employeePositions)
        ? json.data.employee.employeePositions
        : []

      const positions: string[] = Array.from(
        new Set(
          employeePositions
            .map((ep: any) => ep?.position)
            .filter((pos: any): pos is { name: string; isActive?: boolean } => typeof pos?.name === "string")
            .filter((pos: { name: string; isActive?: boolean }) => pos.isActive !== false)
            .map((pos: { name: string }) => pos.name),
        ),
      )

      setProfileData((prev) => ({
        ...prev,
        name: user?.fullName ?? prev.name,
        email: user?.email ?? prev.email,
        phone: user?.phone ?? null,
        avatarUrl: user?.avatarUrl ?? prev.avatarUrl,
        positions,
      }))
    }

    void loadProfile()
  }, [])

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-6">
      {!hideHeader && (
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="p-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-9 w-9">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <h1 className="text-lg font-semibold">Профиль</h1>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditing(!isEditing)}
                className="rounded-full h-9 w-9"
              >
                <Edit2 className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="p-3 space-y-3">
        {hideHeader && (
          <div className="flex justify-end">
            <Button
              variant={isEditing ? "default" : "outline"}
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              <Edit2 className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
              {isEditing ? "Готово" : "Редактировать"}
            </Button>
          </div>
        )}

        <Card className="p-4 flex flex-col items-center gap-3 overflow-hidden">
          <div className="relative">
            {profileData.avatarUrl ? (
              <ImagePreview
                src={profileData.avatarUrl || "/placeholder.svg"}
                alt={profileData.name || "User"}
                triggerClassName="h-20 w-20 rounded-full"
                imageClassName="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white text-2xl font-semibold">
                {getInitials(profileData.name || "Без имени")}
              </div>
            )}
            {isEditing && (
              <button className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-primary text-white flex items-center justify-center shadow-lg">
                <Camera className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold">{profileData.name || "Без имени"}</h2>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {profileData.positions.map((position) => (
                <Badge key={position} variant="secondary" className="text-xs">
                  {position}
                </Badge>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-3 space-y-3 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted-foreground">Контактная информация</h3>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs text-muted-foreground">
              Email
            </Label>
            {isEditing ? (
              <Input
                id="email"
                type="email"
                value={profileData.email}
                onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                className="h-9"
              />
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                <span className="text-sm truncate">{profileData.email}</span>
              </div>
            )}
          </div>

          {profileData.phone ? (
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-xs text-muted-foreground">
                Телефон
              </Label>
              {isEditing ? (
                <Input
                  id="phone"
                  type="tel"
                  value={profileData.phone}
                  onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                  className="h-9"
                />
              ) : (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                  <span className="text-sm truncate">{profileData.phone}</span>
                </div>
              )}
            </div>
          ) : null}
        </Card>

        {isEditing && (
          <Button className="w-full h-10" onClick={() => setIsEditing(false)}>
            Сохранить изменения
          </Button>
        )}

        <Button variant="destructive" className="w-full h-10 mt-2" onClick={onLogout}>
          <LogOut className="h-4 w-4 mr-2" strokeWidth={1.5} />
          Выйти
        </Button>
      </div>
    </div>
  )
}
