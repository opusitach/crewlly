"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { useTranslation } from "@/lib/i18n/context"
import { useShiftStore } from "@/lib/store/shift-store"
import { Camera, ChevronLeft, GripVertical, ListChecks, Pencil, Plus, ReceiptText, Sparkles, Trash2, Type } from "lucide-react"

type WeekdayValue = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"
type ListDayFilterValue = "default" | WeekdayValue

type RuleTemplate = {
  id: string
  when: "OPEN" | "CLOSE"
  type: "CHECKLIST" | "INPUT" | "PHOTO" | "CASH"
  title: string
  required: boolean
  order: number
  dayOfWeek: WeekdayValue | null
  checklistItems: { id: string; title: string; order: number }[]
}

type Position = {
  id: string
  organizationId: string
  name: string
  sortOrder: number
  defaultOpenRulesCount?: number
  defaultCloseRulesCount?: number
  needsRulesSetup?: boolean
}

const DAY_FILTER_VALUES = ["default", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const satisfies ReadonlyArray<ListDayFilterValue>
const WEEKDAY_VALUES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const satisfies ReadonlyArray<WeekdayValue>

const CASH_RULE_TITLE = "Касса"

const emptyForm = {
  id: null as string | null,
  title: "",
  type: "CHECKLIST" as RuleTemplate["type"],
  required: true,
  order: 0,
  checklistItems: [{ title: "", order: 0, placeholder: "" }],
}

export default function PositionRulesView({ onBack }: { onBack?: () => void } = {}) {
  const { t } = useTranslation()
  const router = useRouter()
  const { toast } = useToast()
  const refreshShiftPositions = useShiftStore((state) => state.refreshPositions)
  const lastTapRef = useRef<{ positionId: string; at: number } | null>(null)

  const [positions, setPositions] = useState<Position[]>([])
  const [selectedPositionId, setSelectedPositionId] = useState<string>("")
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")
  const [isCreatingRole, setIsCreatingRole] = useState(false)

  const [rules, setRules] = useState<RuleTemplate[]>([])
  const [isRulesLoading, setIsRulesLoading] = useState(false)
  const [selectedWhen, setSelectedWhen] = useState<RuleTemplate["when"]>("OPEN")
  const [selectedListDay, setSelectedListDay] = useState<ListDayFilterValue>("default")
  const [isDefaultFormScope, setIsDefaultFormScope] = useState(true)
  const [selectedFormDays, setSelectedFormDays] = useState<WeekdayValue[]>([])
  const [formState, setFormState] = useState({ ...emptyForm })
  const [isSaving, setIsSaving] = useState(false)
  const [isReordering, setIsReordering] = useState(false)
  const [draggingRuleId, setDraggingRuleId] = useState<string | null>(null)
  const [touchDraggingRuleId, setTouchDraggingRuleId] = useState<string | null>(null)
  const [touchDropTargetRuleId, setTouchDropTargetRuleId] = useState<string | null>(null)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)
  const touchDraggingRuleIdRef = useRef<string | null>(null)
  const touchDropTargetRuleIdRef = useRef<string | null>(null)

  const setTouchDraggingRule = useCallback((ruleId: string | null) => {
    touchDraggingRuleIdRef.current = ruleId
    setTouchDraggingRuleId(ruleId)
  }, [])

  const setTouchDropTargetRule = useCallback((ruleId: string | null) => {
    touchDropTargetRuleIdRef.current = ruleId
    setTouchDropTargetRuleId(ruleId)
  }, [])

  const resetFormFields = useCallback(() => setFormState({ ...emptyForm }), [])
  const applyFormScope = useCallback((nextScope: { default: true } | { default: false; days: WeekdayValue[] }) => {
    if (nextScope.default) {
      setIsDefaultFormScope(true)
      setSelectedFormDays([])
      return
    }
    const nextDays = Array.from(new Set(nextScope.days))
    setIsDefaultFormScope(false)
    setSelectedFormDays(nextDays)
  }, [])
  const syncFormScopeWithListFilter = useCallback(() => {
    if (selectedListDay === "default") {
      applyFormScope({ default: true })
      return
    }
    applyFormScope({ default: false, days: [selectedListDay] })
  }, [applyFormScope, selectedListDay])
  const resetFormDraft = useCallback(() => {
    resetFormFields()
    syncFormScopeWithListFilter()
  }, [resetFormFields, syncFormScopeWithListFilter])
  const resetTouchDragState = useCallback(() => {
    setTouchDraggingRule(null)
    setTouchDropTargetRule(null)
  }, [setTouchDraggingRule, setTouchDropTargetRule])

  const dayLabel = useCallback(
    (value: ListDayFilterValue) => {
      const labels: Record<ListDayFilterValue, string> = {
        default: t("position_rules_default"),
        MON: t("position_rules_day_monday"),
        TUE: t("position_rules_day_tuesday"),
        WED: t("position_rules_day_wednesday"),
        THU: t("position_rules_day_thursday"),
        FRI: t("position_rules_day_friday"),
        SAT: t("position_rules_day_saturday"),
        SUN: t("position_rules_day_sunday"),
      }
      return labels[value]
    },
    [t],
  )

  const shortDayLabel = useCallback(
    (value: ListDayFilterValue) => {
      const labels: Record<ListDayFilterValue, string> = {
        default: t("position_rules_default"),
        MON: t("position_rules_short_monday"),
        TUE: t("position_rules_short_tuesday"),
        WED: t("position_rules_short_wednesday"),
        THU: t("position_rules_short_thursday"),
        FRI: t("position_rules_short_friday"),
        SAT: t("position_rules_short_saturday"),
        SUN: t("position_rules_short_sunday"),
      }
      return labels[value]
    },
    [t],
  )

  const whenLabel = useCallback(
    (value: RuleTemplate["when"]) => (value === "OPEN" ? t("position_rules_when_open") : t("position_rules_when_close")),
    [t],
  )

  const ruleTypeLabel = useCallback(
    (value: RuleTemplate["type"]) => {
      if (value === "CHECKLIST") return t("position_rules_type_checklist")
      if (value === "INPUT") return t("position_rules_type_input")
      if (value === "PHOTO") return t("position_rules_type_photo")
      return t("position_rules_type_cash")
    },
    [t],
  )

  const displayRuleTitle = useCallback(
    (rule: Pick<RuleTemplate, "type" | "title">) => (rule.type === "CASH" ? t("position_rules_type_cash") : rule.title),
    [t],
  )

  const loadPositions = useCallback(async () => {
    const res = await fetch("/api/positions", { credentials: "include", cache: "no-store" })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      toast({ title: t("common_error"), description: json?.error || t("position_rules_load_positions_error"), variant: "destructive" })
      return
    }

    const data = (json?.data ?? []) as Position[]
    setPositions(data)

    if (data.length === 0) {
      setSelectedPositionId("")
      setIsEditorOpen(false)
      return
    }

    setSelectedPositionId((prev) => {
      if (prev && data.some((position) => position.id === prev)) return prev
      const firstNeedsSetup = data.find((position) => position.needsRulesSetup)
      return firstNeedsSetup?.id ?? data[0].id
    })
  }, [t, toast])

  const loadRules = useCallback(
    async (positionId: string) => {
      if (!positionId) return
      setIsRulesLoading(true)
      const res = await fetch(`/api/positions/${positionId}/rules`, { credentials: "include", cache: "no-store" })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        toast({ title: t("common_error"), description: json?.error || t("position_rules_load_rules_error"), variant: "destructive" })
        setRules([])
        setIsRulesLoading(false)
        return
      }
      setRules((json?.data ?? []) as RuleTemplate[])
      setIsRulesLoading(false)
    },
    [t, toast],
  )

  useEffect(() => {
    void loadPositions()
  }, [loadPositions])

  useEffect(() => {
    if (!selectedPositionId) return
    void loadRules(selectedPositionId)
  }, [selectedPositionId, loadRules])

  useEffect(() => {
    if (selectedWhen !== "CLOSE") return
    setFormState((prev) => ({ ...prev, required: true }))
  }, [selectedWhen])

  useEffect(() => {
    if (formState.type !== "CASH") return
    if (isDefaultFormScope && selectedFormDays.length === 0) return
    applyFormScope({ default: true })
  }, [applyFormScope, formState.type, isDefaultFormScope, selectedFormDays.length])

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return

    const media = window.matchMedia("(pointer: coarse)")
    const update = () => setIsCoarsePointer(media.matches)
    update()

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update)
      return () => media.removeEventListener("change", update)
    }

    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  const selectedPosition = useMemo(
    () => positions.find((position) => position.id === selectedPositionId) ?? null,
    [positions, selectedPositionId],
  )

  const filteredRules = useMemo(() => {
    return rules
      .filter((rule) => rule.when === selectedWhen)
      .filter((rule) => (selectedListDay === "default" ? rule.dayOfWeek == null : rule.dayOfWeek === selectedListDay))
      .sort((a, b) => a.order - b.order)
  }, [rules, selectedWhen, selectedListDay])

  const nextOrder = useMemo(() => {
    if (filteredRules.length === 0) return 1
    return Math.max(...filteredRules.map((rule) => rule.order)) + 1
  }, [filteredRules])

  const openEditorForPosition = useCallback(
    (positionId: string) => {
      setSelectedPositionId(positionId)
      setSelectedWhen("OPEN")
      setSelectedListDay("default")
      resetFormFields()
      applyFormScope({ default: true })
      setIsEditorOpen(true)
    },
    [applyFormScope, resetFormFields],
  )

  const handleCreateRole = async () => {
    const normalizedName = newRoleName.trim()
    if (!normalizedName) {
      toast({ title: t("position_rules_name_required"), variant: "destructive" })
      return
    }

    const nextSortOrder = positions.length > 0 ? Math.max(...positions.map((position) => position.sortOrder ?? 0)) + 1 : 0
    const payload: { name: string; sortOrder: number; organizationId?: string } = {
      name: normalizedName,
      sortOrder: nextSortOrder,
    }
    const organizationId = positions[0]?.organizationId
    if (organizationId) {
      payload.organizationId = organizationId
    }

    setIsCreatingRole(true)
    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || t("position_rules_create_role_error"))
      }

      const createdPositionId = typeof json?.data?.id === "string" ? json.data.id : null
      setIsCreateRoleOpen(false)
      setNewRoleName("")

      await Promise.all([loadPositions(), refreshShiftPositions()])
      if (createdPositionId) {
        setSelectedPositionId(createdPositionId)
      }

      toast({ title: t("position_rules_role_created"), description: t("position_rules_role_created_desc", { name: normalizedName }) })
    } catch (err: any) {
      toast({ title: t("common_error"), description: err?.message || t("position_rules_create_role_error"), variant: "destructive" })
    } finally {
      setIsCreatingRole(false)
    }
  }

  const handleRoleTap = (positionId: string) => {
    setSelectedPositionId(positionId)

    const now = Date.now()
    const lastTap = lastTapRef.current
    if (lastTap && lastTap.positionId === positionId && now - lastTap.at <= 320) {
      openEditorForPosition(positionId)
      lastTapRef.current = null
      return
    }

    lastTapRef.current = { positionId, at: now }
  }

  const startEdit = (rule: RuleTemplate) => {
    const normalizedTitle = rule.type === "CASH" ? t("position_rules_type_cash") : rule.title
    if (rule.dayOfWeek == null) {
      applyFormScope({ default: true })
    } else {
      applyFormScope({ default: false, days: [rule.dayOfWeek] })
    }
    setFormState({
      id: rule.id,
      title: normalizedTitle,
      type: rule.type,
      required: rule.required,
      order: rule.order,
      checklistItems: rule.checklistItems.map((item, index) => ({
        title: item.title,
        order: item.order,
        placeholder: "",
      })),
    })
  }

  const toggleFormDay = useCallback((day: WeekdayValue) => {
    setSelectedFormDays((prev) => {
      const nextSet = new Set(isDefaultFormScope ? [] : prev)
      if (nextSet.has(day)) {
        nextSet.delete(day)
      } else {
        nextSet.add(day)
      }
      const nextDays = WEEKDAY_VALUES.filter((value) => nextSet.has(value))

      if (nextDays.length === WEEKDAY_VALUES.length) {
        setIsDefaultFormScope(true)
        return []
      }

      setIsDefaultFormScope(false)
      return nextDays
    })
  }, [isDefaultFormScope])

  const formScopeSummary = useMemo(() => {
    if (isDefaultFormScope) return t("position_rules_default_scope_summary")
    if (selectedFormDays.length === 0) return t("position_rules_select_weekday")
    if (selectedFormDays.length === 1) return t("position_rules_only_day", { day: dayLabel(selectedFormDays[0]).toLowerCase() })
    return t("position_rules_days_selected", { count: selectedFormDays.length })
  }, [dayLabel, isDefaultFormScope, selectedFormDays, t])

  const formScopeTargetCount = isDefaultFormScope ? 1 : selectedFormDays.length
  const isFormScopeValid = isDefaultFormScope || selectedFormDays.length > 0
  const isFormScopeLockedByCash = formState.type === "CASH"

  const handleSave = async () => {
    if (!selectedPositionId) return
    const normalizedTitle = formState.type === "CASH" ? CASH_RULE_TITLE : formState.title.trim()

    if (!normalizedTitle) {
      toast({ title: t("position_rules_name_required"), variant: "destructive" })
      return
    }
    if (formState.type === "CHECKLIST" && formState.checklistItems.length === 0) {
      toast({ title: t("position_rules_checklist_required"), variant: "destructive" })
      return
    }
    if (!isFormScopeValid) {
      toast({ title: t("position_rules_save_scope_required"), variant: "destructive" })
      return
    }

    setIsSaving(true)
    try {
      const targetWeekdays = isDefaultFormScope ? [] : selectedFormDays
      const payload = {
        when: selectedWhen,
        type: formState.type,
        title: normalizedTitle,
        required: selectedWhen === "CLOSE" ? true : formState.required,
        order: formState.id ? formState.order : nextOrder,
        ...(isDefaultFormScope
          ? { dayOfWeek: null as null }
          : targetWeekdays.length === 1
            ? { dayOfWeek: targetWeekdays[0] }
            : { dayOfWeeks: targetWeekdays }),
        checklistItems:
          formState.type === "CHECKLIST"
            ? formState.checklistItems.map((item, index) => ({
                title: item.title.trim(),
                order: item.order ?? index,
              }))
            : undefined,
      }

      const endpoint = formState.id
        ? `/api/positions/${selectedPositionId}/rules/${formState.id}`
        : `/api/positions/${selectedPositionId}/rules`
      const method = formState.id ? "PATCH" : "POST"

      const res = await fetch(endpoint, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || t("position_rules_save_rule_error"))
      }

      toast({ title: t("position_rules_saved") })
      resetFormFields()
      await Promise.all([loadPositions(), loadRules(selectedPositionId)])
    } catch (err: any) {
      toast({ title: t("common_error"), description: err?.message || t("position_rules_save_error"), variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (ruleId: string) => {
    if (!selectedPositionId) return
    const res = await fetch(`/api/positions/${selectedPositionId}/rules/${ruleId}`, {
      method: "DELETE",
      credentials: "include",
    })
    if (!res.ok) {
      toast({ title: t("common_error"), description: t("position_rules_delete_error"), variant: "destructive" })
      return
    }
    setRules((prev) => prev.filter((rule) => rule.id !== ruleId))
    await loadPositions()
  }

  const applyRuleReorder = useCallback(
    async (sourceRuleId: string, targetRuleId: string) => {
      if (!selectedPositionId || sourceRuleId === targetRuleId) return

      const sourceIndex = filteredRules.findIndex((rule) => rule.id === sourceRuleId)
      const targetIndex = filteredRules.findIndex((rule) => rule.id === targetRuleId)
      if (sourceIndex < 0 || targetIndex < 0) return

      const reordered = [...filteredRules]
      const [moved] = reordered.splice(sourceIndex, 1)
      reordered.splice(targetIndex, 0, moved)

      const updates = reordered.map((rule, index) => ({ id: rule.id, order: index + 1 }))
      const changed = updates.filter((update) => {
        const original = filteredRules.find((rule) => rule.id === update.id)
        return original && original.order !== update.order
      })

      if (changed.length === 0) return

      const updateMap = new Map(updates.map((update) => [update.id, update.order]))
      setRules((prev) =>
        prev.map((rule) => {
          const nextOrderValue = updateMap.get(rule.id)
          return nextOrderValue == null ? rule : { ...rule, order: nextOrderValue }
        }),
      )

      setIsReordering(true)
      try {
        for (const update of changed) {
          const res = await fetch(`/api/positions/${selectedPositionId}/rules/${update.id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: update.order }),
          })
          const json = await res.json().catch(() => null)
          if (!res.ok) {
            throw new Error(json?.error || t("position_rules_reorder_save_error"))
          }
        }
        await loadPositions()
      } catch (err: any) {
        toast({
          title: t("common_error"),
          description: err?.message || t("position_rules_reorder_error"),
          variant: "destructive",
        })
        await loadRules(selectedPositionId)
      } finally {
        setIsReordering(false)
      }
    },
    [filteredRules, loadPositions, loadRules, selectedPositionId, t, toast],
  )

  const resolveRuleIdFromPoint = useCallback((clientX: number, clientY: number) => {
    if (typeof document === "undefined") return null
    const element = document.elementFromPoint(clientX, clientY)
    if (!(element instanceof HTMLElement)) return null
    const container = element.closest<HTMLElement>("[data-rule-id]")
    return container?.dataset.ruleId ?? null
  }, [])

  const typeIconByRule: Record<RuleTemplate["type"], ReactNode> = {
    CHECKLIST: <ListChecks className="h-4 w-4" />,
    INPUT: <Type className="h-4 w-4" />,
    PHOTO: <Camera className="h-4 w-4" />,
    CASH: <ReceiptText className="h-4 w-4" />,
  }

  return (
    <div className="min-h-screen bg-background pb-10 max-w-3xl mx-auto">
      <div className="sticky top-0 z-10 bg-background">
        <div className="p-4 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => (onBack ? onBack() : router.back())} className="rounded-full">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">{t("position_rules_title")}</h1>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-4">
        <Card className="p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>{t("position_rules_venue_roles")}</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 border-primary/30 bg-primary/5 hover:bg-primary/10"
                onClick={() => setIsCreateRoleOpen(true)}
                disabled={isCreatingRole}
              >
                <Plus className="h-4 w-4" />
                {t("position_rules_create_role")}
              </Button>
            </div>
            <div className="grid gap-2">
              {positions.map((position) => {
                const isActive = selectedPositionId === position.id
                const needsSetup = Boolean(position.needsRulesSetup)
                return (
                  <div
                    key={position.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleRoleTap(position.id)}
                    onDoubleClick={() => openEditorForPosition(position.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        openEditorForPosition(position.id)
                      }
                    }}
                    className={`rounded-lg border p-3 text-left transition cursor-pointer ${
                      isActive ? "border-primary bg-primary/5" : "border-border bg-background"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm">{position.name}</div>
                      <div className="flex items-center gap-2">
                        <div className="text-[11px] text-muted-foreground">
                          {whenLabel("OPEN")} {position.defaultOpenRulesCount ?? 0} • {whenLabel("CLOSE")}{" "}
                          {position.defaultCloseRulesCount ?? 0}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={(event) => {
                            event.stopPropagation()
                            openEditorForPosition(position.id)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {needsSetup && (
                      <div className="mt-1 text-xs text-destructive font-medium">{t("position_rules_setup_needed")}</div>
                    )}
                  </div>
                )
              })}
            </div>
            {positions.length === 0 && (
              <div className="text-xs text-muted-foreground">{t("position_rules_no_positions")}</div>
            )}
            {selectedPosition && !selectedPosition.needsRulesSetup && (
              <div className="text-xs text-emerald-700">{t("position_rules_defaults_ready")}</div>
            )}
          </div>
        </Card>
      </div>

      <Dialog
        open={isCreateRoleOpen}
        onOpenChange={(open) => {
          if (isCreatingRole) return
          setIsCreateRoleOpen(open)
          if (!open) setNewRoleName("")
        }}
      >
        <DialogContent className="max-w-md p-0 gap-0">
          <div className="border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-background px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <DialogHeader className="gap-1 text-left">
                <DialogTitle className="text-lg">{t("position_rules_create_role")}</DialogTitle>
                <DialogDescription className="text-xs">{t("position_rules_create_role_desc")}</DialogDescription>
              </DialogHeader>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="create-role-name">{t("position_rules_role_name")}</Label>
              <Input
                id="create-role-name"
                value={newRoleName}
                onChange={(event) => setNewRoleName(event.target.value)}
                placeholder={t("position_rules_role_placeholder")}
                className="h-11"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !isCreatingRole) {
                    event.preventDefault()
                    void handleCreateRole()
                  }
                }}
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setIsCreateRoleOpen(false)
                  setNewRoleName("")
                }}
                disabled={isCreatingRole}
              >
                {t("common_cancel")}
              </Button>
              <Button type="button" className="flex-1" onClick={() => void handleCreateRole()} disabled={isCreatingRole || !newRoleName.trim()}>
                {isCreatingRole ? t("position_rules_creating") : t("position_rules_create_role")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditorOpen}
        onOpenChange={(open) => {
          setIsEditorOpen(open)
          if (!open) {
            resetFormDraft()
            resetTouchDragState()
          }
        }}
      >
        <DialogContent className="max-w-2xl h-[90vh] z-[60] pointer-events-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedPosition ? t("position_rules_for_role", { name: selectedPosition.name }) : t("position_rules_role_rules")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y pr-1 pointer-events-auto">
            <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["OPEN", "CLOSE"] as RuleTemplate["when"][]).map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={selectedWhen === item ? "default" : "outline"}
                  onClick={() => {
                    setSelectedWhen(item)
                    resetFormDraft()
                  }}
                >
                  {whenLabel(item)}
                </Button>
              ))}
            </div>

            <Card className="p-4 space-y-3">
              <div className="text-sm font-semibold">{formState.id ? t("position_rules_edit_rule") : t("position_rules_new_rule")}</div>

              <div className="space-y-2">
                <Label>{t("position_rules_name")}</Label>
                <Input
                  value={formState.title}
                  onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                  disabled={formState.type === "CASH"}
                  placeholder={t("position_rules_name_placeholder")}
                  className="placeholder:opacity-60"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div className="space-y-2">
                  <Label>{t("position_rules_type")}</Label>
                  <Select
                    value={formState.type}
                    onValueChange={(value) =>
                      setFormState((prev) => {
                        const nextType = value as RuleTemplate["type"]
                        if (nextType === "CASH") {
                          return { ...prev, type: nextType, title: t("position_rules_type_cash") }
                        }
                        if (prev.type === "CASH") {
                          return { ...prev, type: nextType, title: "" }
                        }
                        return { ...prev, type: nextType }
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[80]">
                      <SelectItem value="CHECKLIST">{ruleTypeLabel("CHECKLIST")}</SelectItem>
                      <SelectItem value="INPUT">{ruleTypeLabel("INPUT")}</SelectItem>
                      <SelectItem value="PHOTO">{ruleTypeLabel("PHOTO")}</SelectItem>
                      <SelectItem value="CASH">{ruleTypeLabel("CASH")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 md:pb-2">
                  <Switch
                    checked={selectedWhen === "CLOSE" ? true : formState.required}
                    onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, required: checked }))}
                    disabled={selectedWhen === "CLOSE"}
                  />
                  <Label>{selectedWhen === "CLOSE" ? t("position_rules_required_close") : t("position_rules_required")}</Label>
                </div>
              </div>

              {formState.type === "CHECKLIST" && (
                <div className="space-y-2">
                  <Label>{t("position_rules_checklist_items")}</Label>
                  <div className="space-y-2">
                    {formState.checklistItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={item.title}
                          placeholder={
                            item.placeholder || (index === 0 ? t("position_rules_checklist_first_placeholder") : t("position_rules_checklist_new_placeholder"))
                          }
                          className="placeholder:opacity-60"
                          onChange={(event) => {
                            const nextTitle = event.target.value
                            setFormState((prev) => {
                              const next = [...prev.checklistItems]
                              const current = next[index]
                              if (!current) return prev
                              next[index] = { ...current, title: nextTitle, order: index + 1 }
                              return { ...prev, checklistItems: next }
                            })
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setFormState((prev) => ({
                              ...prev,
                              checklistItems: prev.checklistItems.filter((_, idx) => idx !== index),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setFormState((prev) => ({
                          ...prev,
                          checklistItems: [
                            ...prev.checklistItems,
                            {
                              title: "",
                              order: prev.checklistItems.length + 1,
                              placeholder: "",
                            },
                          ],
                        }))
                      }
                    >
                      {t("position_rules_add_item")}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>{t("position_rules_scope")}</Label>
                  {formState.id ? (
                    <Badge variant="outline">{t("position_rules_edit_copying")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("position_rules_new_rule")}</Badge>
                  )}
                </div>

                <div className="relative rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div
                    className={`space-y-3 transition ${
                      isFormScopeLockedByCash ? "pointer-events-none select-none blur-[3px] opacity-70" : ""
                    }`}
                    aria-disabled={isFormScopeLockedByCash}
                  >
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={isDefaultFormScope ? "default" : "outline"}
                        onClick={() => applyFormScope({ default: true })}
                        disabled={isSaving || isReordering || isFormScopeLockedByCash}
                      >
                        {t("position_rules_default")}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">
                        {t("position_rules_choose_days_hint")}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {WEEKDAY_VALUES.map((day) => {
                          const isSelected = !isDefaultFormScope && selectedFormDays.includes(day)
                          return (
                            <Button
                              key={day}
                              type="button"
                              size="sm"
                              variant={isSelected ? "default" : "outline"}
                              onClick={() => toggleFormDay(day)}
                              disabled={isSaving || isReordering || isFormScopeLockedByCash}
                              className="min-w-[108px] justify-start"
                            >
                              {dayLabel(day)}
                            </Button>
                          )
                        })}
                      </div>
                    </div>

                    <div className={`text-xs ${isFormScopeValid ? "text-muted-foreground" : "text-destructive"}`}>
                      {formScopeSummary}
                      {!isDefaultFormScope && selectedFormDays.length > 1 && (
                        <span> • {t("position_rules_will_update_count", { count: formScopeTargetCount })}</span>
                      )}
                    </div>
                  </div>

                  {isFormScopeLockedByCash && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/35 backdrop-blur-[1px] px-4 text-center">
                      <div className="rounded-md border border-border/70 bg-background/90 px-3 py-2 text-xs font-medium text-foreground shadow-sm">
                        {t("position_rules_cash_locked")}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleSave} disabled={isSaving || isReordering}>
                  {isSaving ? t("position_rules_saving") : formState.id ? t("position_rules_save_changes") : t("position_rules_add_rule")}
                </Button>
                {formState.id && (
                  <Button variant="outline" onClick={resetFormDraft} className="flex-1" disabled={isSaving || isReordering}>
                    {t("common_cancel")}
                  </Button>
                )}
              </div>
            </Card>

            <div className="space-y-3">
              <div className="space-y-2">
                <div className="text-sm font-semibold">{t("position_rules_created_rules")}</div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2">
                  <Label className="text-xs">{t("position_rules_filter_label")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAY_FILTER_VALUES.map((day) => (
                      <Button
                        key={day}
                        type="button"
                        size="sm"
                        variant={selectedListDay === day ? "default" : "outline"}
                        onClick={() => setSelectedListDay(day)}
                        disabled={isSaving || isReordering}
                      >
                        {dayLabel(day)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {isRulesLoading && <Card className="p-4 text-sm text-muted-foreground">{t("position_rules_loading_rules")}</Card>}

              {!isRulesLoading && filteredRules.length === 0 && (
                <Card className="p-4 text-sm text-muted-foreground">
                  {t("position_rules_empty_rules", { filter: dayLabel(selectedListDay).toLowerCase() })}
                </Card>
              )}

              {!isRulesLoading &&
                filteredRules.map((rule) => (
                  <Card
                    key={rule.id}
                    data-rule-id={rule.id}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault()
                      if (!draggingRuleId || draggingRuleId === rule.id) return
                      void applyRuleReorder(draggingRuleId, rule.id)
                      setDraggingRuleId(null)
                    }}
                    className={`p-4 space-y-2 ${
                      draggingRuleId === rule.id || touchDraggingRuleId === rule.id ? "opacity-60" : "opacity-100"
                    } ${touchDropTargetRuleId === rule.id ? "ring-2 ring-primary/50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <button
                          type="button"
                          aria-label={t("position_rules_reorder_aria")}
                          className="pt-0.5 text-muted-foreground touch-none cursor-grab active:cursor-grabbing"
                          draggable={!isReordering && !isCoarsePointer}
                          onDragStart={() => setDraggingRuleId(rule.id)}
                          onDragEnd={() => setDraggingRuleId(null)}
                          onTouchStart={() => {
                            if (isReordering) return
                            setTouchDraggingRule(rule.id)
                            setTouchDropTargetRule(null)
                          }}
                          onTouchMove={(event) => {
                            if (isReordering || touchDraggingRuleIdRef.current !== rule.id) return
                            const touch = event.touches[0]
                            if (!touch) return
                            event.preventDefault()
                            const targetRuleId = resolveRuleIdFromPoint(touch.clientX, touch.clientY)
                            if (!targetRuleId || targetRuleId === rule.id) {
                              setTouchDropTargetRule(null)
                              return
                            }
                            setTouchDropTargetRule(targetRuleId)
                          }}
                          onTouchEnd={() => {
                            if (isReordering || touchDraggingRuleIdRef.current !== rule.id) {
                              resetTouchDragState()
                              return
                            }
                            const dropRuleId = touchDropTargetRuleIdRef.current
                            resetTouchDragState()
                            if (dropRuleId && dropRuleId !== rule.id) {
                              void applyRuleReorder(rule.id, dropRuleId)
                            }
                          }}
                          onTouchCancel={resetTouchDragState}
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                        <div className="pt-0.5 text-muted-foreground">{typeIconByRule[rule.type]}</div>
                        <div>
                          <div className="font-medium text-sm">
                            {displayRuleTitle(rule)}{" "}
                            {rule.required && <span className="text-destructive">*</span>}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>
                              {ruleTypeLabel(rule.type)} • {t("position_rules_order", { order: rule.order })}
                            </span>
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                              {shortDayLabel(rule.dayOfWeek ?? "default")}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEdit(rule)}>
                          {t("position_rules_edit")}
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(rule.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {rule.type === "CHECKLIST" && (
                      <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                        {rule.checklistItems.map((item) => (
                          <li key={item.id}>{item.title}</li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ))}
            </div>
          </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
