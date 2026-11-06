import type { HTMLAttributes, ReactNode } from 'react'

type PanelProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode
  padded?: boolean
}

export function Panel({ children, padded = true, className = '', ...props }: PanelProps) {
  return (
    <section
      className={`rounded-card border border-border bg-card ${padded ? 'p-4' : ''} ${className}`}
      {...props}
    >
      {children}
    </section>
  )
}

type SectionHeaderProps = {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function SectionHeader({ title, description, action, className = '' }: SectionHeaderProps) {
  return (
    <div className={`mb-3 flex min-w-0 items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
