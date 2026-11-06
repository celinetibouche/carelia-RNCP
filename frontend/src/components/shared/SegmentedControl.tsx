import type { ReactNode } from 'react'

export type SegmentOption<T extends string> = {
  value: T
  label: string
  icon?: ReactNode
}

type SegmentedControlProps<T extends string> = {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}

function SegmentedControl<T extends string>({ options, value, onChange, label, className = '' }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className={`inline-flex max-w-full gap-1 rounded-lg bg-secondary/60 p-1 ${className}`}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function FilterTabs<T extends string>(props: SegmentedControlProps<T>) {
  return <SegmentedControl {...props} />
}

export function ViewTabs<T extends string>(props: SegmentedControlProps<T>) {
  return <SegmentedControl {...props} />
}
