export type PhoneCountry = {
  iso2: string
  name: string
  dialCode: string
  placeholder: string
}

export const DEFAULT_PHONE_COUNTRY_ISO = "CZ"

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso2: "CZ", name: "Чехия", dialCode: "+420", placeholder: "123 456 789" },
  { iso2: "RU", name: "Россия", dialCode: "+7", placeholder: "912 345 67 89" },
  { iso2: "UA", name: "Украина", dialCode: "+380", placeholder: "50 123 45 67" },
  { iso2: "BY", name: "Беларусь", dialCode: "+375", placeholder: "29 123 45 67" },
  { iso2: "KZ", name: "Казахстан", dialCode: "+7", placeholder: "701 123 45 67" },
  { iso2: "US", name: "США", dialCode: "+1", placeholder: "201 555 0123" },
  { iso2: "CA", name: "Канада", dialCode: "+1", placeholder: "416 555 0123" },
  { iso2: "GB", name: "Великобритания", dialCode: "+44", placeholder: "7400 123456" },
  { iso2: "IE", name: "Ирландия", dialCode: "+353", placeholder: "85 123 4567" },
  { iso2: "DE", name: "Германия", dialCode: "+49", placeholder: "1512 3456789" },
  { iso2: "FR", name: "Франция", dialCode: "+33", placeholder: "6 12 34 56 78" },
  { iso2: "ES", name: "Испания", dialCode: "+34", placeholder: "612 34 56 78" },
  { iso2: "IT", name: "Италия", dialCode: "+39", placeholder: "312 345 6789" },
  { iso2: "PT", name: "Португалия", dialCode: "+351", placeholder: "912 345 678" },
  { iso2: "NL", name: "Нидерланды", dialCode: "+31", placeholder: "6 12345678" },
  { iso2: "BE", name: "Бельгия", dialCode: "+32", placeholder: "470 12 34 56" },
  { iso2: "CH", name: "Швейцария", dialCode: "+41", placeholder: "78 123 45 67" },
  { iso2: "AT", name: "Австрия", dialCode: "+43", placeholder: "664 1234567" },
  { iso2: "PL", name: "Польша", dialCode: "+48", placeholder: "512 345 678" },
  { iso2: "SK", name: "Словакия", dialCode: "+421", placeholder: "910 123 456" },
  { iso2: "HU", name: "Венгрия", dialCode: "+36", placeholder: "20 123 4567" },
  { iso2: "RO", name: "Румыния", dialCode: "+40", placeholder: "712 345 678" },
  { iso2: "BG", name: "Болгария", dialCode: "+359", placeholder: "88 123 4567" },
  { iso2: "GR", name: "Греция", dialCode: "+30", placeholder: "691 234 5678" },
  { iso2: "TR", name: "Турция", dialCode: "+90", placeholder: "532 123 45 67" },
  { iso2: "IL", name: "Израиль", dialCode: "+972", placeholder: "50 123 4567" },
  { iso2: "AE", name: "ОАЭ", dialCode: "+971", placeholder: "50 123 4567" },
  { iso2: "SA", name: "Саудовская Аравия", dialCode: "+966", placeholder: "50 123 4567" },
  { iso2: "IN", name: "Индия", dialCode: "+91", placeholder: "91234 56789" },
  { iso2: "CN", name: "Китай", dialCode: "+86", placeholder: "131 2345 6789" },
  { iso2: "JP", name: "Япония", dialCode: "+81", placeholder: "90 1234 5678" },
  { iso2: "KR", name: "Южная Корея", dialCode: "+82", placeholder: "10 1234 5678" },
  { iso2: "SG", name: "Сингапур", dialCode: "+65", placeholder: "8123 4567" },
  { iso2: "MY", name: "Малайзия", dialCode: "+60", placeholder: "12 345 6789" },
  { iso2: "TH", name: "Таиланд", dialCode: "+66", placeholder: "81 234 5678" },
  { iso2: "VN", name: "Вьетнам", dialCode: "+84", placeholder: "91 234 56 78" },
  { iso2: "AU", name: "Австралия", dialCode: "+61", placeholder: "412 345 678" },
  { iso2: "NZ", name: "Новая Зеландия", dialCode: "+64", placeholder: "21 123 4567" },
  { iso2: "BR", name: "Бразилия", dialCode: "+55", placeholder: "11 91234 5678" },
  { iso2: "AR", name: "Аргентина", dialCode: "+54", placeholder: "11 2345 6789" },
  { iso2: "MX", name: "Мексика", dialCode: "+52", placeholder: "55 1234 5678" },
  { iso2: "CL", name: "Чили", dialCode: "+56", placeholder: "9 1234 5678" },
  { iso2: "CO", name: "Колумбия", dialCode: "+57", placeholder: "300 123 4567" },
  { iso2: "ZA", name: "ЮАР", dialCode: "+27", placeholder: "82 123 4567" },
  { iso2: "EG", name: "Египет", dialCode: "+20", placeholder: "10 1234 5678" },
  { iso2: "NO", name: "Норвегия", dialCode: "+47", placeholder: "406 12 345" },
  { iso2: "SE", name: "Швеция", dialCode: "+46", placeholder: "70 123 45 67" },
  { iso2: "FI", name: "Финляндия", dialCode: "+358", placeholder: "40 123 4567" },
  { iso2: "DK", name: "Дания", dialCode: "+45", placeholder: "20 12 34 56" },
  { iso2: "IS", name: "Исландия", dialCode: "+354", placeholder: "611 2345" },
  { iso2: "LV", name: "Латвия", dialCode: "+371", placeholder: "20 123 456" },
  { iso2: "LT", name: "Литва", dialCode: "+370", placeholder: "612 34 567" },
  { iso2: "EE", name: "Эстония", dialCode: "+372", placeholder: "5123 4567" },
  { iso2: "HR", name: "Хорватия", dialCode: "+385", placeholder: "91 123 4567" },
  { iso2: "SI", name: "Словения", dialCode: "+386", placeholder: "31 123 456" },
  { iso2: "RS", name: "Сербия", dialCode: "+381", placeholder: "60 123 4567" },
]

const countriesByIso = new Map(PHONE_COUNTRIES.map((country) => [country.iso2, country]))

const countriesByDialCode = [...PHONE_COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length)

export function getPhoneCountryByIso(iso2: string | null | undefined): PhoneCountry {
  if (!iso2) {
    return countriesByIso.get(DEFAULT_PHONE_COUNTRY_ISO) ?? PHONE_COUNTRIES[0]
  }
  return countriesByIso.get(iso2.toUpperCase()) ?? countriesByIso.get(DEFAULT_PHONE_COUNTRY_ISO) ?? PHONE_COUNTRIES[0]
}

export function detectPhoneCountryByDialCode(phone: string | null | undefined): PhoneCountry | null {
  const rawValue = (phone ?? "").trim()
  if (!rawValue.startsWith("+")) {
    return null
  }

  const normalized = `+${rawValue.slice(1).replace(/\D/g, "")}`
  for (const country of countriesByDialCode) {
    if (normalized.startsWith(country.dialCode)) {
      return country
    }
  }
  return null
}
