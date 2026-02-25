"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChevronLeft, Mail, Phone, Building2, Edit2, Camera, ChevronRight, LogOut } from "lucide-react"
import { ImagePreview } from "@/components/ui/image-preview"
import { useAuthStore } from "@/lib/store/auth-store"
import { getEmailValidationError } from "@/lib/validation/email"

interface OwnerProfileProps {
  onBack: () => void
  onLogout: () => void
  onEdit?: () => void
}

export default function OwnerProfile({ onBack, onLogout, onEdit }: OwnerProfileProps) {
  const router = useRouter()
  const { user, venues, selectedVenueId, selectVenue, updateUser, updateVenue, isHydrated, hydrate } = useAuthStore()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [emailTouched, setEmailTouched] = useState(false)
  const [emailValidationRequested, setEmailValidationRequested] = useState(false)
  const [profileData, setProfileData] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: "+7 (999) 123-45-67",
    avatarUrl: "",
  })
  const currentVenue = useMemo(
    () => venues.find((venue) => venue.id === selectedVenueId) ?? venues[0] ?? null,
    [venues, selectedVenueId],
  )
  const [venueName, setVenueName] = useState(currentVenue?.name ?? "")
  const currentVenueId = currentVenue?.id ?? null
  const emailError = getEmailValidationError(profileData.email)
  const showEmailError = isEditing && Boolean(emailError) && (emailTouched || emailValidationRequested)

  // Ensure hydration
  useEffect(() => {
    if (!isHydrated) {
      void hydrate()
    }
  }, [isHydrated, hydrate])

  useEffect(() => {
    setProfileData((prev) => ({
      ...prev,
      name: user?.name ?? "",
      email: user?.email ?? "",
    }))
    if (currentVenue) {
      setVenueName(currentVenue.name)
    }
  }, [user, currentVenue])

  const resetEmailValidation = () => {
    setEmailTouched(false)
    setEmailValidationRequested(false)
  }

  const requestEmailValidation = () => {
    setEmailTouched(true)
    setEmailValidationRequested(true)
  }

  const handleEmailChange = (value: string) => {
    setProfileData((prev) => ({ ...prev, email: value }))
    setSaveError(null)
    setEmailTouched(true)
  }

  const handleEditToggle = () => {
    if (isSaving) return

    if (!isEditing) {
      resetEmailValidation()
      setSaveError(null)
      setIsEditing(true)
      return
    }

    if (emailError) {
      requestEmailValidation()
      return
    }

    setProfileData((prev) => ({ ...prev, email: prev.email.trim() }))
    resetEmailValidation()
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (isSaving) return

    if (emailError) {
      requestEmailValidation()
      return
    }

    const trimmedEmail = profileData.email.trim()
    setSaveError(null)
    setIsSaving(true)

    try {
      await updateUser({ name: profileData.name, email: trimmedEmail })
      if (currentVenueId) {
        await updateVenue(currentVenueId, { name: venueName })
        await selectVenue(currentVenueId)
      }
      setProfileData((prev) => ({ ...prev, email: trimmedEmail }))
      resetEmailValidation()
      setIsEditing(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось сохранить профиль")
    } finally {
      setIsSaving(false)
    }
  }

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
              onClick={handleEditToggle}
              className="rounded-full h-9 w-9"
            >
              <Edit2 className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3">
        <Card className="p-4 flex flex-col items-center gap-3 overflow-hidden">
          <div className="relative">
            {profileData.avatarUrl ? (
              <ImagePreview
                src={profileData.avatarUrl || "/placeholder.svg"}
                alt={profileData.name}
                triggerClassName="h-20 w-20 rounded-full"
                imageClassName="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white text-2xl font-semibold">
                {getInitials(profileData.name)}
              </div>
            )}
            {isEditing && (
              <button className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-primary text-white flex items-center justify-center shadow-lg">
                <Camera className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold">{profileData.name}</h2>
            <p className="text-sm text-muted-foreground">Владелец</p>
          </div>
        </Card>

        <Card className="p-3 space-y-3 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted-foreground">Контактная информация</h3>

          <div className="space-y-2">
            <Label htmlFor="email" className={`text-xs ${showEmailError ? "text-destructive" : "text-muted-foreground"}`}>
              Email
            </Label>
            {isEditing ? (
              <div className="space-y-1.5">
                <Input
                  id="email"
                  type="email"
                  value={profileData.email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  autoComplete="email"
                  placeholder="name@example.com"
                  title="Введите email латиницей в формате name@example.com"
                  aria-invalid={showEmailError || undefined}
                  aria-describedby={showEmailError ? "owner-email-error" : undefined}
                  className="h-9"
                />
                {showEmailError && (
                  <p id="owner-email-error" className="text-xs text-destructive">
                    {emailError}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                <span className="text-sm truncate">{profileData.email || "Не указан"}</span>
              </div>
            )}
          </div>

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
        </Card>

        <Card className="p-3 space-y-3 overflow-hidden">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">Заведения</h3>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => router.push("/app/venues/new")}
            >
              Добавить заведение
            </Button>
          </div>

          <div className="space-y-2">
            {venues.length === 0 && <p className="text-sm text-muted-foreground">Заведений нет</p>}
            {venues.map((venue) => (
              <button
                key={venue.id}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                onClick={() => void selectVenue(venue.id)}
              >
                <Building2 className="h-4 w-4 text-primary flex-shrink-0" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{venue.name}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
              </button>
            ))}
          </div>
        </Card>

        {isEditing && (
          <div className="space-y-2">
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            <Button className="w-full h-10" onClick={handleSave} disabled={Boolean(emailError) || isSaving}>
              {isSaving ? "Сохраняем..." : "Сохранить изменения"}
            </Button>
          </div>
        )}

        <Button variant="destructive" className="w-full h-10 mt-2" onClick={onLogout}>
          <LogOut className="h-4 w-4 mr-2" strokeWidth={1.5} />
          Выйти
        </Button>
      </div>
    </div>
  )
}
