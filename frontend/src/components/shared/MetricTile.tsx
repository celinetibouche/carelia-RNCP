import type { ReactNode } from 'react'

type MetricTileProps = {
  label: string
  value: ReactNode
  detail?: string
  icon?: ReactNode
  compact?: boolean
  className?: string
}

export function MetricTile({ label, value, detail, icon, compact = false, className = '' }: MetricTileProps) {
  return (
    <section className={`min-w-0 rounded-card border border-border bg-card ${compact ? 'px-2 py-3 text-center' : 'p-4'} ${className}`} aria-label={label}>
      <div className={compact ? 'flex min-h-14 flex-col-reverse items-center justify-center gap-1' : 'flex items-start justify-between gap-3'}>
        <div className={compact ? 'flex min-w-0 flex-col-reverse' : 'min-w-0'}>
          <p className={compact ? 'text-[11px] text-muted-foreground' : 'text-sm text-muted-foreground'}>{label}</p>
          <p className={compact ? 'break-words text-sm font-semibold' : 'mt-1 break-words text-2xl font-semibold'}>{value}</p>
        </div>
        {icon && <span className="shrink-0 text-primary" aria-hidden="true">{icon}</span>}
      </div>
      {detail && <p className="mt-2 text-sm text-muted-foreground">{detail}</p>}
    </section>
  )
}
