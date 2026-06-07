"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DEFAULT_PHONE_COUNTRY_ISO,
  PHONE_COUNTRIES,
  getPhoneCountryByIso,
} from "@/lib/phone/country-codes"
import { buildPhoneValue, splitPhoneNumber } from "@/lib/validation/phone"
import { useTranslation } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"

type PhoneInputProps = {
  id?: string
  name?: string
  value?: string | null
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  placeholder?: string
  required?: boolean
  className?: string
  inputClassName?: string
  ariaInvalid?: boolean
  ariaDescribedBy?: string
}

export function PhoneInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  disabled,
  placeholder,
  required,
  className,
  inputClassName,
  ariaInvalid,
  ariaDescribedBy,
}: PhoneInputProps) {
  const { t, language } = useTranslation()
  const [open, setOpen] = useState(false)
  const [selectedCountryIso, setSelectedCountryIso] = useState(DEFAULT_PHONE_COUNTRY_ISO)
  const [nationalNumber, setNationalNumber] = useState("")
  const selectedCountryIsoRef = useRef(selectedCountryIso)

  useEffect(() => {
    selectedCountryIsoRef.current = selectedCountryIso
  }, [selectedCountryIso])

  useEffect(() => {
    const parsed = splitPhoneNumber(value, selectedCountryIsoRef.current)
    setSelectedCountryIso(parsed.country.iso2)
    setNationalNumber(parsed.nationalNumber)
  }, [value])

  const selectedCountry = useMemo(
    () => getPhoneCountryByIso(selectedCountryIso),
    [selectedCountryIso],
  )

  const handleCountrySelect = (countryIso: string) => {
    const nextCountry = getPhoneCountryByIso(countryIso)
    setSelectedCountryIso(nextCountry.iso2)
    setOpen(false)
    onChange(buildPhoneValue(nextCountry.dialCode, nationalNumber))
  }

  const handleInputChange = (nextValue: string) => {
    const digitsOnly = nextValue.replace(/\D/g, "")
    setNationalNumber(digitsOnly)
    onChange(buildPhoneValue(selectedCountry.dialCode, digitsOnly))
  }

  return (
    <div
      className={cn(
        "border-input dark:bg-input/30 flex h-9 w-full min-w-0 rounded-md border bg-transparent shadow-xs transition-[color,box-shadow]",
        "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
        ariaInvalid && "border-destructive ring-destructive/20",
        disabled && "opacity-50",
        className,
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("phone_country_code_label")}
            disabled={disabled}
            className={cn(
              "border-input hover:bg-muted/50 flex h-full shrink-0 items-center gap-1.5 border-r px-3 text-sm transition-colors",
              "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
              "disabled:cursor-not-allowed",
            )}
          >
            <span className="font-medium">{selectedCountry.dialCode}</span>
            <span className="text-muted-foreground text-xs">{selectedCountry.iso2}</span>
            <ChevronsUpDown className="text-muted-foreground h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
          <Command>
            <CommandInput placeholder={t("phone_search_placeholder")} />
            <CommandEmpty>{t("phone_not_found")}</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {PHONE_COUNTRIES.map((country) => {
                  const displayName = language === "en" ? country.nameEn : country.name
                  return (
                    <CommandItem
                      key={country.iso2}
                      value={`${country.iso2} ${country.name} ${country.nameEn} ${country.dialCode}`}
                      onSelect={() => handleCountrySelect(country.iso2)}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4",
                          selectedCountry.iso2 === country.iso2 ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex flex-1 items-center justify-between gap-3">
                        <span className="truncate">{displayName}</span>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {country.dialCode}
                        </span>
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Input
        id={id}
        name={name}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        disabled={disabled}
        required={required}
        value={nationalNumber}
        onChange={(event) => handleInputChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder ?? selectedCountry.placeholder}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        className={cn(
          "h-full rounded-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0",
          inputClassName,
        )}
      />
    </div>
  )
}
