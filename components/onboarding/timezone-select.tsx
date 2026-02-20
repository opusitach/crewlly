"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type TimezoneSelectProps = {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
}

export function TimezoneSelect({ value, onChange, options, placeholder }: TimezoneSelectProps) {
  const [open, setOpen] = useState(false)
  const items = useMemo(() => options, [options])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-12 w-full justify-between"
        >
          <span className="truncate">{value || placeholder || "Выберите часовой пояс"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Поиск таймзоны..." />
          <CommandEmpty>Ничего не найдено</CommandEmpty>
          <CommandList>
            <CommandGroup>
              {items.map((timezone) => (
                <CommandItem
                  key={timezone}
                  value={timezone}
                  onSelect={(currentValue) => {
                    onChange(currentValue)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === timezone ? "opacity-100" : "opacity-0")} />
                  {timezone}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
