"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { Camera, ChevronLeft, GripVertical, ListChecks, Pencil, ReceiptText, Trash2, Type } from "lucide-react"

type RuleTemplate = {
  id: string
  when: "OPEN" | "CLOSE"
  type: "CHECKLIST" | "INPUT" | "PHOTO" | "CASH"
  title: string
  required: boolean
  order: number
  dayOfWeek: string | null
  checklistItems: { id: string; title: string; order: number }[]
}

type Position = {
  id: string
  name: string
  defaultOpenRulesCount?: number
  defaultCloseRulesCount?: number
  needsRulesSetup?: boolean
}

const DAY_OPTIONS = [
  { value: "default", label: "По умолчанию" },
  { value: "MON", label: "Понедельник" },
  { value: "TUE", label: "Вторник" },
  { value: "WED", label: "Среда" },
  { value: "THU", label: "Четверг" },
  { value: "FRI", label: "Пятница" },
  { value: "SAT", label: "Суббота" },
  { value: "SUN", label: "Воскресенье" },
]

const WHEN_LABELS: Record<RuleTemplate["when"], string> = {
  OPEN: "Открытие",
  CLOSE: "Закрытие",
}

const RULE_TYPE_LABELS: Record<RuleTemplate["type"], string> = {
  CHECKLIST: "Чек-лист",
  INPUT: "Поле ввода",
  PHOTO: "Фото",
  CASH: "Касса",
}

const CASH_RULE_TITLE = "Касса"

const emptyForm = {
  id: null as string | null,
  title: "",
  type: "CHECKLIST" as RuleTemplate["type"],
  required: true,
  order: 0,
  checklistItems: [{ title: "Пункт", order: 0 }],
}

export default function PositionRulesView({ onBack }: { onBack?: () => void } = {}) {
  const router = useRouter()
  const { toast } = useToast()
  const lastTapRef = useRef<{ positionId: string; at: number } | null>(null)

  const [positions, setPositions] = useState<Position[]>([])
  const [selectedPositionId, setSelectedPositionId] = useState<string>("")
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  const [rules, setRules] = useState<RuleTemplate[]>([])
  const [isRulesLoading, setIsRulesLoading] = useState(false)
  const [selectedWhen, setSelectedWhen] = useState<RuleTemplate["when"]>("OPEN")
  const [selectedDay, setSelectedDay] = useState<string>("default")
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

  const resetForm = useCallback(() => setFormState({ ...emptyForm }), [])
  const resetTouchDragState = useCallback(() => {
    setTouchDraggingRule(null)
    setTouchDropTargetRule(null)
  }, [setTouchDraggingRule, setTouchDropTargetRule])

  const loadPositions = useCallback(async () => {
    const res = await fetch("/api/positions", { credentials: "include" })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      toast({ title: "Ошибка", description: json?.error || "Не удалось загрузить позиции", variant: "destructive" })
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
  }, [toast])

  const loadRules = useCallback(
    async (positionId: string) => {
      if (!positionId) return
      setIsRulesLoading(true)
      const res = await fetch(`/api/positions/${positionId}/rules`, { credentials: "include" })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        toast({ title: "Ошибка", description: json?.error || "Не удалось загрузить правила", variant: "destructive" })
        setRules([])
        setIsRulesLoading(false)
        return
      }
      setRules((json?.data ?? []) as RuleTemplate[])
      setIsRulesLoading(false)
    },
    [toast],
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
      .filter((rule) => (selectedDay === "default" ? rule.dayOfWeek == null : rule.dayOfWeek === selectedDay))
      .sort((a, b) => a.order - b.order)
  }, [rules, selectedWhen, selectedDay])

  const nextOrder = useMemo(() => {
    if (filteredRules.length === 0) return 1
    return Math.max(...filteredRules.map((rule) => rule.order)) + 1
  }, [filteredRules])

  const openEditorForPosition = useCallback(
    (positionId: string) => {
      setSelectedPositionId(positionId)
      setSelectedWhen("OPEN")
      setSelectedDay("default")
      resetForm()
      setIsEditorOpen(true)
    },
    [resetForm],
  )

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
    const normalizedTitle = rule.type === "CASH" ? CASH_RULE_TITLE : rule.title
    setFormState({
      id: rule.id,
      title: normalizedTitle,
      type: rule.type,
      required: rule.required,
      order: rule.order,
      checklistItems: rule.checklistItems.map((item) => ({ title: item.title, order: item.order })),
    })
  }

  const handleSave = async () => {
    if (!selectedPositionId) return
    const normalizedTitle = formState.type === "CASH" ? CASH_RULE_TITLE : formState.title.trim()

    if (!normalizedTitle) {
      toast({ title: "Название обязательно", variant: "destructive" })
      return
    }
    if (formState.type === "CHECKLIST" && formState.checklistItems.length === 0) {
      toast({ title: "Нужны пункты чек-листа", variant: "destructive" })
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        when: selectedWhen,
        type: formState.type,
        title: normalizedTitle,
        required: selectedWhen === "CLOSE" ? true : formState.required,
        order: formState.id ? formState.order : nextOrder,
        dayOfWeek: selectedDay === "default" ? null : selectedDay,
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
        throw new Error(json?.error || "Не удалось сохранить правило")
      }

      toast({ title: "Сохранено" })
      resetForm()
      await Promise.all([loadPositions(), loadRules(selectedPositionId)])
    } catch (err: any) {
      toast({ title: "Ошибка", description: err?.message || "Не удалось сохранить", variant: "destructive" })
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
      toast({ title: "Ошибка", description: "Не удалось удалить", variant: "destructive" })
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
            throw new Error(json?.error || "Не удалось сохранить новый порядок")
          }
        }
        await loadPositions()
      } catch (err: any) {
        toast({
          title: "Ошибка",
          description: err?.message || "Не удалось изменить порядок правил",
          variant: "destructive",
        })
        await loadRules(selectedPositionId)
      } finally {
        setIsReordering(false)
      }
    },
    [filteredRules, loadPositions, loadRules, selectedPositionId, toast],
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
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="p-4 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => (onBack ? onBack() : router.back())} className="rounded-full">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Роли и правила</h1>
          <div className="w-8" />
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Card className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>Роли заведения</Label>
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
                          {WHEN_LABELS.OPEN} {position.defaultOpenRulesCount ?? 0} • {WHEN_LABELS.CLOSE}{" "}
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
                      <div className="mt-1 text-xs text-destructive font-medium">Настройте правила для роли</div>
                    )}
                  </div>
                )
              })}
            </div>
            {positions.length === 0 && (
              <div className="text-xs text-muted-foreground">Добавьте должности, чтобы настроить роли и правила.</div>
            )}
            {selectedPosition && !selectedPosition.needsRulesSetup && (
              <div className="text-xs text-emerald-700">Наборы по умолчанию для открытия и закрытия настроены.</div>
            )}
          </div>
        </Card>
      </div>

      <Dialog
        open={isEditorOpen}
        onOpenChange={(open) => {
          setIsEditorOpen(open)
          if (!open) {
            resetForm()
            resetTouchDragState()
          }
        }}
      >
        <DialogContent className="max-w-2xl h-[90vh] z-[60] pointer-events-auto">
          <DialogHeader>
            <DialogTitle>{selectedPosition ? `Правила для роли: ${selectedPosition.name}` : "Правила роли"}</DialogTitle>
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
                    resetForm()
                  }}
                >
                  {WHEN_LABELS[item]}
                </Button>
              ))}
            </div>

            <Card className="p-4 space-y-3">
              <div className="text-sm font-semibold">{formState.id ? "Редактировать правило" : "Новое правило"}</div>

              <div className="space-y-2">
                <Label>День недели</Label>
                <Select value={selectedDay} onValueChange={setSelectedDay}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[80]">
                    {DAY_OPTIONS.map((day) => (
                      <SelectItem key={day.value} value={day.value}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Название</Label>
                <Input
                  value={formState.title}
                  onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                  disabled={formState.type === "CASH"}
                />
              </div>

              <div className="space-y-2">
                <Label>Тип</Label>
                <Select
                  value={formState.type}
                  onValueChange={(value) =>
                    setFormState((prev) => {
                      const nextType = value as RuleTemplate["type"]
                      if (nextType === "CASH") {
                        return { ...prev, type: nextType, title: CASH_RULE_TITLE }
                      }
                      if (prev.type === "CASH" && prev.title === CASH_RULE_TITLE) {
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
                    <SelectItem value="CHECKLIST">{RULE_TYPE_LABELS.CHECKLIST}</SelectItem>
                    <SelectItem value="INPUT">{RULE_TYPE_LABELS.INPUT}</SelectItem>
                    <SelectItem value="PHOTO">{RULE_TYPE_LABELS.PHOTO}</SelectItem>
                    <SelectItem value="CASH">{RULE_TYPE_LABELS.CASH}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={selectedWhen === "CLOSE" ? true : formState.required}
                  onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, required: checked }))}
                  disabled={selectedWhen === "CLOSE"}
                />
                <Label>{selectedWhen === "CLOSE" ? "Обязательное (для закрытия всегда включено)" : "Обязательное"}</Label>
              </div>

              {formState.type === "CHECKLIST" && (
                <div className="space-y-2">
                  <Label>Пункты чек-листа</Label>
                  <div className="space-y-2">
                    {formState.checklistItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={item.title}
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
                          checklistItems: [...prev.checklistItems, { title: "Новый пункт", order: prev.checklistItems.length + 1 }],
                        }))
                      }
                    >
                      Добавить пункт
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleSave} disabled={isSaving || isReordering}>
                  {isSaving ? "Сохранение..." : formState.id ? "Сохранить изменения" : "Добавить правило"}
                </Button>
                {formState.id && (
                  <Button variant="outline" onClick={resetForm} className="flex-1" disabled={isSaving || isReordering}>
                    Отмена
                  </Button>
                )}
              </div>
            </Card>

            <div className="space-y-3">
              <div className="text-sm font-semibold">Созданные правила</div>

              {isRulesLoading && <Card className="p-4 text-sm text-muted-foreground">Загрузка правил...</Card>}

              {!isRulesLoading && filteredRules.length === 0 && (
                <Card className="p-4 text-sm text-muted-foreground">Для выбранного этапа и дня недели правила пока не созданы.</Card>
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
                          aria-label="Изменить порядок"
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
                            {rule.type === "CASH" ? CASH_RULE_TITLE : rule.title}{" "}
                            {rule.required && <span className="text-destructive">*</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {RULE_TYPE_LABELS[rule.type]} • Порядок {rule.order}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEdit(rule)}>
                          Изменить
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
