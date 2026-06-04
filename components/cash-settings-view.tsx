"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { useTranslation } from "@/lib/i18n/context"
import { ChevronLeft, Plus, Trash2, Save } from "lucide-react"

type CashFieldDraft = {
  localId: string
  id?: string
  key: string
  label: string
  inputStage: "open" | "close"
  isRequired: boolean
  isPhotoRequired: boolean
  isRevenueBasis: boolean
  isActive: boolean
  displayOrder: number
  defaultSign: 1 | -1
}

type CashFormulaDraft = {
  localId: string
  id?: string
  resultKey: string
  resultLabel: string
  expression: string
  isTipsSource: boolean
  isRevenueSource: boolean
  displayOrder: number
}

export type CashSettingsTab = "open" | "close" | "formula"

const FORMULA_OPERATOR_BUTTONS = ["+", "-", "(", ")"] as const
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
}

const createLocalId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`

const normalizeKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")

const keyPattern = /^[a-z][a-z0-9_]{1,63}$/

const transliterateToLatin = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .split("")
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join("")

const createBaseFieldKeyFromLabel = (label: string, inputStage: "open" | "close") => {
  const latin = transliterateToLatin(label)
  let key = normalizeKey(latin)
  if (!key) {
    key = inputStage === "open" ? "open_field" : "close_field"
  }
  if (!/^[a-z]/.test(key)) {
    key = `field_${key}`
  }
  if (key.length < 2) {
    key = `${key}_field`
  }
  return key.slice(0, 64)
}

const createBaseFormulaKeyFromLabel = (label: string) => {
  const latin = transliterateToLatin(label)
  let key = normalizeKey(latin)
  if (!key) {
    key = "calc"
  }
  if (!/^[a-z]/.test(key)) {
    key = `calc_${key}`
  }
  if (key.length < 2) {
    key = `${key}_calc`
  }
  return key.slice(0, 64)
}

const createUniqueKey = (base: string, usedKeys: Set<string>) => {
  let next = base
  let suffix = 2
  while (usedKeys.has(next)) {
    const suffixLabel = `_${suffix}`
    const trimmedBase = base.slice(0, Math.max(1, 64 - suffixLabel.length))
    next = `${trimmedBase}${suffixLabel}`
    suffix += 1
  }
  return next
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const replaceFormulaKey = (expression: string, currentKey: string, nextKey: string) => {
  if (!currentKey || !nextKey || currentKey === nextKey) return expression
  const pattern = new RegExp(`\\b${escapeRegex(currentKey)}\\b`, "g")
  return expression.replace(pattern, nextKey)
}

const removeFormulaKey = (expression: string, key: string) => {
  if (!key) return expression
  const pattern = new RegExp(`\\b${escapeRegex(key)}\\b`, "g")
  return expression.replace(pattern, "").replace(/\s+/g, " ").trim()
}

const toFormulaDisplayTokens = (
  expression: string,
  fields: Array<{ key: string; label: string }>,
  formulas: Array<{ key: string; label: string }>,
) => {
  const byKey = new Map<string, string>()
  for (const field of fields) {
    byKey.set(field.key, field.label.trim() || field.key)
  }
  for (const formula of formulas) {
    byKey.set(formula.key, formula.label.trim() || formula.key)
  }

  const rawTokens = expression.match(/[A-Za-z_][A-Za-z0-9_]*|\d+%?|[()+-]/g) ?? []
  return rawTokens.map((token) => {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
      return byKey.get(token) ?? token
    }
    return token
  })
}

const sortFormulas = (formulas: CashFormulaDraft[]) => {
  return [...formulas].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
    return a.resultLabel.localeCompare(b.resultLabel)
  })
}

export default function CashSettingsView({
  onBack,
  initialTab = "open",
  locationId: initialLocationId = null,
}: {
  onBack: () => void
  initialTab?: CashSettingsTab
  locationId?: string | null
}) {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [locationId, setLocationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<CashSettingsTab>(initialTab)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const [fields, setFields] = useState<CashFieldDraft[]>([])
  const [formulas, setFormulas] = useState<CashFormulaDraft[]>([])
  const [activeFormulaLocalId, setActiveFormulaLocalId] = useState<string | null>(null)
  const [percentInput, setPercentInput] = useState("10")
  const getDefaultFieldLabel = (inputStage: "open" | "close") =>
    inputStage === "open" ? t("cash_settings_new_open_field") : t("cash_settings_new_close_field")

  useEffect(() => {
    void loadSettings(initialLocationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLocationId])

  const openFields = useMemo(() => fields.filter((field) => field.isActive && field.inputStage === "open"), [fields])
  const closeFields = useMemo(() => fields.filter((field) => field.isActive && field.inputStage === "close"), [fields])
  const activeFields = useMemo(() => fields.filter((field) => field.isActive), [fields])

  const expressionFields = useMemo(
    () =>
      activeFields
        .filter((field) => Boolean(field.key))
        .map((field) => ({
          key: field.key,
          label: field.label.trim() || field.key,
        })),
    [activeFields],
  )

  const visibleFormulas = useMemo(() => sortFormulas(formulas), [formulas])

  const activeFormula = useMemo(
    () => visibleFormulas.find((formula) => formula.localId === activeFormulaLocalId) ?? visibleFormulas[0] ?? null,
    [activeFormulaLocalId, visibleFormulas],
  )

  const formulaEntriesForDisplay = useMemo(
    () =>
      visibleFormulas
        .filter((formula) => Boolean(formula.resultKey))
        .map((formula) => ({
          key: formula.resultKey,
          label: formula.resultLabel.trim() || formula.resultKey,
        })),
    [visibleFormulas],
  )

  const availableFormulaReferences = useMemo(() => {
    if (!activeFormula) return []
    const activeIndex = visibleFormulas.findIndex((formula) => formula.localId === activeFormula.localId)
    if (activeIndex <= 0) return []

    return visibleFormulas.slice(0, activeIndex).map((formula) => ({
      key: formula.resultKey,
      label: formula.resultLabel.trim() || formula.resultKey,
    }))
  }, [activeFormula, visibleFormulas])

  const formulaDisplayTokens = useMemo(
    () => toFormulaDisplayTokens(activeFormula?.expression ?? "", expressionFields, formulaEntriesForDisplay),
    [activeFormula?.expression, expressionFields, formulaEntriesForDisplay],
  )

  useEffect(() => {
    if (visibleFormulas.length === 0) {
      if (activeFormulaLocalId !== null) {
        setActiveFormulaLocalId(null)
      }
      return
    }

    if (!activeFormulaLocalId || !visibleFormulas.some((formula) => formula.localId === activeFormulaLocalId)) {
      setActiveFormulaLocalId(visibleFormulas[0].localId)
    }
  }, [activeFormulaLocalId, visibleFormulas])

  const loadSettings = async (targetLocationId: string | null = initialLocationId) => {
    setLoading(true)
    try {
      const query = targetLocationId ? `?locationId=${encodeURIComponent(targetLocationId)}` : ""
      const res = await fetch(`/api/cash/settings${query}`, { credentials: "include" })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || t("cash_settings_load_error"))
      }

      const data = json?.data
      setLocationId(data?.locationId ?? null)

      const loadedFields: CashFieldDraft[] = (data?.fields ?? []).map((field: any, index: number) => ({
        localId: field.id ?? createLocalId(),
        id: field.id,
        key: field.key,
        label: field.label,
        inputStage: field.inputStage === "close" ? "close" : "open",
        isRequired: Boolean(field.isRequired),
        isPhotoRequired: Boolean(field.isPhotoRequired),
        isRevenueBasis: Boolean(field.isRevenueBasis),
        isActive: Boolean(field.isActive),
        displayOrder: Number.isInteger(field.displayOrder) ? field.displayOrder : index,
        defaultSign: field.defaultSign === -1 ? -1 : 1,
      }))

      setFields(loadedFields)

      const rawFormulas = Array.isArray(data?.formulas)
        ? data.formulas
        : data?.formula
          ? [data.formula]
          : []

      const loadedFormulas = sortFormulas(
        rawFormulas.map((formula: any, index: number) => ({
          localId: formula.id ?? createLocalId(),
          id: formula.id,
          resultKey: (formula.resultKey || "").toLowerCase(),
          resultLabel: formula.resultLabel || "",
          expression: formula.expression || "",
          isTipsSource: Boolean(formula.isTipsSource),
          isRevenueSource: Boolean(formula.isRevenueSource),
          displayOrder: Number.isInteger(formula.displayOrder) ? formula.displayOrder : index,
        })),
      )

      setFormulas(loadedFormulas)
      setActiveFormulaLocalId(loadedFormulas[0]?.localId ?? null)
    } catch (error: any) {
      toast({
        title: t("common_error"),
        description: error?.message || t("cash_settings_load_error"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const addField = (inputStage: "open" | "close") => {
    const defaultLabel = getDefaultFieldLabel(inputStage)
    const usedFieldKeys = new Set(fields.filter((field) => field.isActive).map((field) => field.key))
    const nextFieldKey = createUniqueKey(createBaseFieldKeyFromLabel(defaultLabel, inputStage), usedFieldKeys)

    setFields((prev) => [
      {
        localId: createLocalId(),
        key: nextFieldKey,
        label: "",
        inputStage,
        isRequired: true,
        isPhotoRequired: false,
        isRevenueBasis: false,
        isActive: true,
        displayOrder: 0,
        defaultSign: 1,
      },
      ...prev.map((field) =>
        field.isActive && field.inputStage === inputStage
          ? { ...field, displayOrder: field.displayOrder + 1 }
          : field,
      ),
    ])
  }

  const removeField = (localId: string) => {
    const removedField = fields.find((field) => field.localId === localId)

    setFields((prev) =>
      prev
        .map((field) => (field.localId === localId ? { ...field, isActive: false, isRevenueBasis: false } : field))
        .filter((field) => field.id || field.isActive),
    )

    if (removedField?.key) {
      setFormulas((prev) =>
        prev.map((formula) => ({
          ...formula,
          expression: removeFormulaKey(formula.expression, removedField.key),
        })),
      )
    }
  }

  const updateField = (localId: string, patch: Partial<CashFieldDraft>) => {
    setFields((prev) =>
      prev.map((field) => {
        if (field.localId !== localId) return field
        return { ...field, ...patch }
      }),
    )
  }

  const setRevenueBasis = (localId: string, checked: boolean) => {
    setFields((prev) =>
      prev.map((field) => {
        if (!field.isActive || field.inputStage !== "close") return field
        if (field.localId === localId) return { ...field, isRevenueBasis: checked }
        return { ...field, isRevenueBasis: false }
      }),
    )
  }

  const updateFormula = (localId: string, patch: Partial<CashFormulaDraft>) => {
    setFormulas((prev) =>
      prev.map((formula) => {
        if (formula.localId !== localId) return formula
        return { ...formula, ...patch }
      }),
    )
  }

  const setTipsSource = (localId: string, checked: boolean) => {
    setFormulas((prev) =>
      prev.map((formula) => {
        if (formula.localId === localId) {
          return { ...formula, isTipsSource: checked, isRevenueSource: checked ? false : formula.isRevenueSource }
        }
        return { ...formula, isTipsSource: false }
      }),
    )
  }

  const setRevenueSource = (localId: string, checked: boolean) => {
    setFormulas((prev) =>
      prev.map((formula) => {
        if (formula.localId === localId) {
          return { ...formula, isRevenueSource: checked, isTipsSource: checked ? false : formula.isTipsSource }
        }
        return { ...formula, isRevenueSource: false }
      }),
    )
  }

  const addFormula = () => {
    const defaultLabel = t("cash_settings_new_calculation")
    const localId = createLocalId()

    setFormulas((prev) => {
      const usedKeys = new Set(prev.map((formula) => formula.resultKey))
      const resultKey = createUniqueKey(createBaseFormulaKeyFromLabel(defaultLabel), usedKeys)

      const nextFormula: CashFormulaDraft = {
        localId,
        resultKey,
        resultLabel: "",
        expression: "",
        isTipsSource: false,
        isRevenueSource: false,
        displayOrder: 0,
      }

      const next = [...prev, nextFormula]

      return next.map((formula, index) => ({ ...formula, displayOrder: index }))
    })

    setActiveFormulaLocalId(localId)
  }

  const removeFormula = (localId: string) => {
    setFormulas((prev) => {
      const target = prev.find((formula) => formula.localId === localId)
      if (!target) return prev

      return prev
        .filter((formula) => formula.localId !== localId)
        .map((formula) => ({
          ...formula,
          expression: removeFormulaKey(formula.expression, target.resultKey),
        }))
        .map((formula, index) => ({ ...formula, displayOrder: index }))
    })
  }

  const updateFormulaLabel = (localId: string, nextLabel: string) => {
    let currentKey: string | null = null
    let nextKey: string | null = null

    setFormulas((prev) => {
      const usedKeys = new Set(prev.filter((formula) => formula.localId !== localId).map((formula) => formula.resultKey))

      return prev.map((formula) => {
        if (formula.localId !== localId) return formula

        currentKey = formula.resultKey

        const generatedKey = createUniqueKey(createBaseFormulaKeyFromLabel(nextLabel), usedKeys)
        nextKey = generatedKey
        usedKeys.add(generatedKey)

        return {
          ...formula,
          resultLabel: nextLabel,
          resultKey: generatedKey,
        }
      })
    })

    if (currentKey && nextKey && currentKey !== nextKey) {
      setFormulas((prev) =>
        prev.map((formula) => ({
          ...formula,
          expression: replaceFormulaKey(formula.expression, currentKey as string, nextKey as string),
        })),
      )
    }
  }

  const appendFormulaToken = (token: string) => {
    if (!activeFormula) return

    const current = activeFormula.expression.trim()
    const next = current.length === 0 ? token : `${current} ${token}`
    updateFormula(activeFormula.localId, { expression: next })
  }

  const deleteLastFormulaToken = () => {
    if (!activeFormula) return

    const tokens = activeFormula.expression.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return

    const next = tokens.slice(0, -1).join(" ")
    updateFormula(activeFormula.localId, { expression: next })
  }

  const clearFormulaExpression = () => {
    if (!activeFormula) return
    updateFormula(activeFormula.localId, { expression: "" })
  }

  const appendPercentSubtraction = () => {
    if (!activeFormula) return

    const value = Number(percentInput.trim())
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      toast({
        title: t("common_error"),
        description: t("cash_settings_percent_invalid"),
        variant: "destructive",
      })
      return
    }

    if (!activeFormula.expression.trim()) {
      toast({
        title: t("common_error"),
        description: t("cash_settings_percent_needs_expression"),
        variant: "destructive",
      })
      return
    }

    appendFormulaToken("-")
    appendFormulaToken(`${value}%`)
  }

  const updateFieldLabel = (localId: string, nextLabel: string) => {
    let currentKey: string | null = null
    let nextKey: string | null = null

    setFields((prev) => {
      const usedKeys = new Set(prev.filter((field) => field.isActive && field.localId !== localId).map((field) => field.key))

      return prev.map((field) => {
        if (field.localId !== localId) return field

        currentKey = field.key
        if (field.id) {
          return { ...field, label: nextLabel }
        }

        nextKey = createUniqueKey(createBaseFieldKeyFromLabel(nextLabel, field.inputStage), usedKeys)
        usedKeys.add(nextKey)

        return {
          ...field,
          label: nextLabel,
          key: nextKey,
        }
      })
    })

    if (currentKey && nextKey && currentKey !== nextKey) {
      setFormulas((prev) =>
        prev.map((formula) => ({
          ...formula,
          expression: replaceFormulaKey(formula.expression, currentKey as string, nextKey as string),
        })),
      )
    }
  }

  const validateBeforeSave = () => {
    const active = fields.filter((field) => field.isActive)
    if (active.length === 0) {
      return t("cash_settings_validation_add_field")
    }

    const seenKeys = new Set<string>()
    for (const field of active) {
      if (!field.label.trim()) return t("cash_settings_validation_field_name")
      if (!field.key.trim()) return t("cash_settings_validation_field_generated")
      const normalized = field.key
      if (!keyPattern.test(normalized)) {
        return t("cash_settings_validation_field_save")
      }
      if (seenKeys.has(normalized)) {
        return t("cash_settings_validation_field_unique")
      }
      seenKeys.add(normalized)
    }

    const revenueFields = active.filter((field) => field.isRevenueBasis)
    if (revenueFields.length > 1) {
      return t("cash_settings_validation_one_revenue")
    }

    if (revenueFields.length === 1 && revenueFields[0].inputStage !== "close") {
      return t("cash_settings_validation_revenue_close")
    }

    if (formulas.length === 0) {
      return t("cash_settings_validation_add_formula")
    }

    const formulaKeys = new Set<string>()
    const activeFieldKeys = new Set(active.map((field) => field.key))
    let tipsSourceCount = 0
    let revenueSourceCount = 0
    for (const formula of formulas) {
      if (!formula.resultLabel.trim()) {
        return t("cash_settings_validation_formula_name")
      }

      if (!formula.expression.trim()) {
        return t("cash_settings_validation_formula_expression", { name: formula.resultLabel || t("cash_settings_untitled") })
      }

      if (!formula.resultKey.trim() || !keyPattern.test(formula.resultKey)) {
        return t("cash_settings_validation_formula_save")
      }

      if (formulaKeys.has(formula.resultKey)) {
        return t("cash_settings_validation_formula_unique")
      }
      formulaKeys.add(formula.resultKey)

      if (activeFieldKeys.has(formula.resultKey)) {
        return t("cash_settings_validation_formula_field_conflict", { name: formula.resultLabel || t("cash_settings_untitled") })
      }

      if (formula.isTipsSource) {
        tipsSourceCount += 1
      }

      if (formula.isRevenueSource) {
        revenueSourceCount += 1
      }

      if (formula.isTipsSource && formula.isRevenueSource) {
        return t("cash_settings_validation_one_special_toggle", { name: formula.resultLabel || t("cash_settings_untitled") })
      }
    }

    if (tipsSourceCount > 1) {
      return t("cash_settings_validation_one_tips")
    }

    if (revenueSourceCount > 1) {
      return t("cash_settings_validation_one_revenue_formula")
    }

    return null
  }

  const saveSettings = async () => {
    const validationError = validateBeforeSave()
    if (validationError) {
      toast({ title: t("common_error"), description: validationError, variant: "destructive" })
      return
    }

    const payloadFields = fields
      .filter((field) => field.isActive)
      .map((field, index) => ({
        id: field.id,
        key: field.key,
        label: field.label.trim(),
        inputStage: field.inputStage,
        isRequired: field.isRequired,
        isPhotoRequired: field.isPhotoRequired,
        isRevenueBasis: field.inputStage === "close" ? field.isRevenueBasis : false,
        isActive: true,
        displayOrder: index,
        defaultSign: field.defaultSign,
      }))

    const payloadFormulas = sortFormulas(formulas).map((formula, index) => ({
      id: formula.id,
      resultKey: formula.resultKey,
      resultLabel: formula.resultLabel.trim(),
      expression: formula.expression.trim(),
      isTipsSource: formula.isTipsSource,
      isRevenueSource: formula.isRevenueSource,
      displayOrder: index,
    }))

    setSaving(true)
    try {
      const res = await fetch("/api/cash/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          fields: payloadFields,
          formulas: payloadFormulas,
        }),
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || t("cash_settings_save_generic_error"))
      }

      toast({
        title: t("cash_settings_saved"),
        description: t("cash_settings_saved_desc"),
      })
      await loadSettings()
    } catch (error: any) {
      toast({
        title: t("common_error"),
        description: error?.message || t("cash_settings_save_error"),
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-8 max-w-3xl mx-auto">
      <div className="sticky top-0 z-10 bg-background">
        <div className="p-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="min-w-0 flex-1 text-left text-lg font-semibold">{t("cash_settings_title")}</h1>
          <Button onClick={saveSettings} disabled={saving || loading}>
            <Save className="h-4 w-4 mr-2" />
            {t("cash_settings_save")}
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CashSettingsTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="open">{t("cash_settings_tab_open")}</TabsTrigger>
            <TabsTrigger value="close">{t("cash_settings_tab_close")}</TabsTrigger>
            <TabsTrigger value="formula">{t("cash_settings_tab_formulas")}</TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="space-y-3 mt-4">
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{t("cash_settings_open_fields")}</h2>
                <Button size="sm" variant="outline" onClick={() => addField("open")}>
                  <Plus className="h-4 w-4 mr-1" />
                  {t("cash_settings_add_field")}
                </Button>
              </div>

              {openFields.length === 0 && <p className="text-sm text-muted-foreground">{t("cash_settings_open_fields_empty")}</p>}

              {openFields.map((field) => (
                <Card key={field.localId} className="p-3 space-y-3">
                  <div className="space-y-1">
                    <Label>{t("cash_settings_field_name")}</Label>
                    <Input
                      value={field.label}
                      onChange={(e) => updateFieldLabel(field.localId, e.target.value)}
                      placeholder={getDefaultFieldLabel(field.inputStage)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch checked={field.isRequired} onCheckedChange={(v) => updateField(field.localId, { isRequired: Boolean(v) })} />
                      <span className="text-sm">{t("cash_settings_required_field")}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeField(field.localId)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={field.isPhotoRequired}
                      onCheckedChange={(v) => updateField(field.localId, { isPhotoRequired: Boolean(v) })}
                    />
                    <span className="text-sm">{t("cash_settings_request_photo")}</span>
                  </div>
                </Card>
              ))}
            </Card>
          </TabsContent>

          <TabsContent value="close" className="space-y-3 mt-4">
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{t("cash_settings_close_fields")}</h2>
                <Button size="sm" variant="outline" onClick={() => addField("close")}>
                  <Plus className="h-4 w-4 mr-1" />
                  {t("cash_settings_add_field")}
                </Button>
              </div>

              {closeFields.length === 0 && <p className="text-sm text-muted-foreground">{t("cash_settings_close_fields_empty")}</p>}

              {closeFields.map((field) => (
                <Card key={field.localId} className="p-3 space-y-3">
                  <div className="space-y-1">
                    <Label>{t("cash_settings_field_name")}</Label>
                    <Input
                      value={field.label}
                      onChange={(e) => updateFieldLabel(field.localId, e.target.value)}
                      placeholder={getDefaultFieldLabel(field.inputStage)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch checked={field.isRequired} onCheckedChange={(v) => updateField(field.localId, { isRequired: Boolean(v) })} />
                        <span className="text-sm">{t("cash_settings_required_field")}</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeField(field.localId)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch checked={field.isRevenueBasis} onCheckedChange={(v) => setRevenueBasis(field.localId, Boolean(v))} />
                      <span className="text-sm">{t("cash_settings_revenue_basis")}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={field.isPhotoRequired}
                        onCheckedChange={(v) => updateField(field.localId, { isPhotoRequired: Boolean(v) })}
                      />
                      <span className="text-sm">{t("cash_settings_request_photo")}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </Card>
          </TabsContent>

          <TabsContent value="formula" className="space-y-3 mt-4">
            <Card className="p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{t("cash_settings_calculations")}</h2>
                  <p className="text-sm text-muted-foreground">{t("cash_settings_calculations_desc")}</p>
                </div>
                <Button size="sm" variant="outline" onClick={addFormula}>
                  <Plus className="h-4 w-4 mr-1" />
                  {t("cash_settings_add_calculation")}
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {visibleFormulas.map((formula) => {
                  const isActive = activeFormula?.localId === formula.localId

                  return (
                    <Button
                      key={formula.localId}
                      variant={isActive ? "default" : "outline"}
                      className="justify-between"
                      onClick={() => setActiveFormulaLocalId(formula.localId)}
                    >
                      <span className="truncate">{formula.resultLabel.trim() || t("cash_settings_untitled")}</span>
                      <span className="flex items-center gap-1">
                        {formula.isTipsSource && (
                          <span className="rounded bg-background/30 px-2 py-0.5 text-[10px] uppercase tracking-wide">{t("cash_settings_tips_badge")}</span>
                        )}
                        {formula.isRevenueSource && (
                          <span className="rounded bg-background/30 px-2 py-0.5 text-[10px] uppercase tracking-wide">{t("cash_settings_revenue_badge")}</span>
                        )}
                      </span>
                    </Button>
                  )
                })}
              </div>

              {activeFormula ? (
                <Card className="p-3 space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-1">
                        <Label>{t("cash_settings_calculation_name")}</Label>
                        <Input
                          value={activeFormula.resultLabel}
                          onChange={(e) => updateFormulaLabel(activeFormula.localId, e.target.value)}
                          placeholder={t("cash_settings_new_calculation")}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("cash_settings_keys_hidden")}
                        </p>

                        <div className="flex items-center gap-2 pt-1">
                          <Switch
                            checked={activeFormula.isTipsSource}
                            onCheckedChange={(checked) => setTipsSource(activeFormula.localId, Boolean(checked))}
                          />
                          <span className="text-sm">{t("cash_settings_tips_calculation")}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Switch
                            checked={activeFormula.isRevenueSource}
                            onCheckedChange={(checked) => setRevenueSource(activeFormula.localId, Boolean(checked))}
                          />
                          <span className="text-sm">{t("cash_settings_revenue_data")}</span>
                        </div>
                      </div>

                      <Button variant="ghost" size="icon" onClick={() => removeFormula(activeFormula.localId)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("cash_settings_formula_builder")}</Label>
                    <div className="flex flex-wrap gap-2">
                      {expressionFields.map((field) => (
                        <Button key={field.key} size="sm" variant="outline" onClick={() => appendFormulaToken(field.key)}>
                          {field.label}
                        </Button>
                      ))}
                    </div>
                    {availableFormulaReferences.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">{t("cash_settings_previous_calculations")}</p>
                        <div className="flex flex-wrap gap-2">
                          {availableFormulaReferences.map((formulaRef) => (
                            <Button
                              key={formulaRef.key}
                              size="sm"
                              variant="outline"
                              onClick={() => appendFormulaToken(formulaRef.key)}
                            >
                              {formulaRef.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {FORMULA_OPERATOR_BUTTONS.map((operator) => (
                        <Button key={operator} size="sm" variant="secondary" onClick={() => appendFormulaToken(operator)}>
                          {operator}
                        </Button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={percentInput}
                        onChange={(e) => setPercentInput(e.target.value)}
                        className="h-8 w-24"
                      />
                      <Button size="sm" variant="secondary" onClick={appendPercentSubtraction}>
                        {t("cash_settings_subtract_percent")}
                      </Button>
                      <span className="text-xs text-muted-foreground">{t("cash_settings_percent_hint")}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={deleteLastFormulaToken}>
                        {t("cash_settings_delete_last")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={clearFormulaExpression}>
                        {t("cash_settings_clear")}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>{t("cash_settings_formula")}</Label>
                    <div className="min-h-20 rounded-md border bg-muted/30 p-3">
                      {formulaDisplayTokens.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {formulaDisplayTokens.map((token, index) => (
                            <span key={`${token}_${index}`} className="rounded bg-background px-2 py-1 text-sm">
                              {token}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t("cash_settings_formula_empty")}</p>
                      )}
                    </div>
                  </div>
                </Card>
              ) : (
                <p className="text-sm text-muted-foreground">{t("cash_settings_add_first_calculation")}</p>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        {loading && <p className="text-sm text-muted-foreground">{t("cash_settings_loading")}</p>}
      </div>
    </div>
  )
}
