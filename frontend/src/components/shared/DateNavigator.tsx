import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '../ui/Button.tsx'

type DateNavigatorProps = {
  value: string
  onChange: (value: string) => void
  locale?: string
  className?: string
}

function shiftDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function DateNavigator({ value, onChange, locale = 'fr-FR', className = '' }: DateNavigatorProps) {
  const date = new Date(`${value}T12:00:00`)
  const label = Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(date)

  return (
    <div className={`flex min-w-0 items-center justify-between gap-2 ${className}`}>
      <IconButton label="Jour précédent" size="sm" onClick={() => onChange(shiftDate(value, -1))}>
        <ChevronLeft size={20} aria-hidden="true" />
      </IconButton>
      <label className="relative min-w-0 flex-1 cursor-pointer text-center">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <input
          type="date"
          aria-label="Choisir une date"
          value={value}
          onChange={(event) => event.target.value && onChange(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <IconButton label="Jour suivant" size="sm" onClick={() => onChange(shiftDate(value, 1))}>
        <ChevronRight size={20} aria-hidden="true" />
      </IconButton>
    </div>
  )
}
