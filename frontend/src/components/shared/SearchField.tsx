import { Search, X } from 'lucide-react'
import { IconButton } from '../ui/Button.tsx'

type SearchFieldProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  className?: string
}

export function SearchField({ value, onChange, placeholder = 'Rechercher', label = 'Rechercher', className = '' }: SearchFieldProps) {
  return (
    <div className={`flex min-h-12 items-center gap-2 rounded-full border border-border bg-card px-3 focus-within:outline-2 focus-within:outline-primary ${className}`}>
      <Search size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground"
      />
      {value && (
        <IconButton label="Effacer la recherche" size="sm" onClick={() => onChange('')}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      )}
    </div>
  )
}
