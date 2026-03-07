"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PhoneInput } from "@/components/ui/phone-input"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, Mail, Phone, Edit2, Camera, LogOut } from "lucide-react"
import { ImagePreview } from "@/components/ui/image-preview"
import { useAuthStore } from "@/lib/store/auth-store"
import { cn } from "@/lib/utils"
import { getEmailValidationError } from "@/lib/validation/email"
import { formatPhoneForDisplay, getPhoneValidationError } from "@/lib/validation/phone"

interface WorkerProfileProps {
  onBack: () => void
  onLogout: () => void
  hideHeader?: boolean
  variant?: "page" | "sheet"
}

export default function WorkerProfile({
  onBack,
  onLogout,
  hideHeader = false,
  variant = "page",
}: WorkerProfileProps) {
  const { updateUser } = useAuthStore()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [emailTouched, setEmailTouched] = useState(false)
  const [emailValidationRequested, setEmailValidationRequested] = useState(false)
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [phoneValidationRequested, setPhoneValidationRequested] = useState(false)
  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    phone: null as string | null,
    avatarUrl: "",
    positions: [] as string[],
  })
  const emailError = getEmailValidationError(profileData.email)
  const phoneError = getPhoneValidationError(profileData.phone)
  const showEmailError = isEditing && Boolean(emailError) && (emailTouched || emailValidationRequested)
  const showPhoneError = isEditing && Boolean(phoneError) && (phoneTouched || phoneValidationRequested)

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

  const resetValidationState = () => {
    setEmailTouched(false)
    setEmailValidationRequested(false)
    setPhoneTouched(false)
    setPhoneValidationRequested(false)
  }

  const requestEmailValidation = () => {
    setEmailTouched(true)
    setEmailValidationRequested(true)
  }

  const requestPhoneValidation = () => {
    setPhoneTouched(true)
    setPhoneValidationRequested(true)
  }

  const handleEmailChange = (value: string) => {
    setProfileData((prev) => ({ ...prev, email: value }))
    setSaveError(null)
    setEmailTouched(true)
  }

  const handlePhoneChange = (value: string) => {
    setProfileData((prev) => ({ ...prev, phone: value || null }))
    setSaveError(null)
    setPhoneTouched(true)
  }

  const finishEditing = async () => {
    if (isSaving) return

    if (emailError) {
      requestEmailValidation()
      return
    }
    if (phoneError) {
      requestPhoneValidation()
      return
    }

    const trimmedEmail = profileData.email.trim()
    const trimmedPhone = profileData.phone?.trim() || null

    setSaveError(null)
    setIsSaving(true)

    try {
      await updateUser({ email: trimmedEmail, phone: trimmedPhone })
      setProfileData((prev) => ({ ...prev, email: trimmedEmail, phone: trimmedPhone }))
      resetValidationState()
      setIsEditing(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось сохранить профиль")
    } finally {
      setIsSaving(false)
    }
  }

  const handleEditToggle = async () => {
    if (isSaving) return

    if (!isEditing) {
      resetValidationState()
      setSaveError(null)
      setIsEditing(true)
      return
    }

    await finishEditing()
  }

  return (
    <div
      className={cn(
        variant === "page" ? "min-h-screen bg-background max-w-md mx-auto pb-6" : "pb-2",
      )}
    >
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
                onClick={handleEditToggle}
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
              onClick={handleEditToggle}
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
                  aria-describedby={showEmailError ? "worker-email-error" : undefined}
                  className="h-9"
                />
                {showEmailError && (
                  <p id="worker-email-error" className="text-xs text-destructive">
                    {emailError}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                <span className="text-sm truncate">{profileData.email}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className={`text-xs ${showPhoneError ? "text-destructive" : "text-muted-foreground"}`}>
              Телефон
            </Label>
            {isEditing ? (
              <div className="space-y-1.5">
                <PhoneInput
                  id="phone"
                  value={profileData.phone}
                  onChange={handlePhoneChange}
                  onBlur={() => setPhoneTouched(true)}
                  ariaInvalid={showPhoneError}
                  ariaDescribedBy={showPhoneError ? "worker-phone-error" : undefined}
                />
                {showPhoneError && (
                  <p id="worker-phone-error" className="text-xs text-destructive">
                    {phoneError}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                <span className="text-sm truncate">{formatPhoneForDisplay(profileData.phone) || "Не указан"}</span>
              </div>
            )}
          </div>
        </Card>

        {isEditing && (
          <div className="space-y-2">
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            <Button className="w-full h-10" onClick={finishEditing} disabled={Boolean(emailError || phoneError) || isSaving}>
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
