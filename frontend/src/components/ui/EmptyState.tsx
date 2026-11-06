import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type EmptyStateProps = {
  title: string
  description?: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon: Icon, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex min-h-40 flex-col items-center justify-center gap-3 px-4 py-8 text-center ${className}`}>
      {Icon && <Icon size={28} className="text-muted-foreground" aria-hidden="true" />}
      <div className="max-w-sm">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
