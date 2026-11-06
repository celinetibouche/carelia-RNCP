import { CircleCheck, CircleAlert, Info, TriangleAlert, X } from 'lucide-react'
import { IconButton } from '../ui/Button.tsx'

type ToastProps = {
  title: string
  description?: string
  tone?: 'success' | 'error' | 'info' | 'warning'
  onClose?: () => void
  className?: string
}

const toastIcons = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
  warning: TriangleAlert,
}

export function Toast({ title, description, tone = 'info', onClose, className = '' }: ToastProps) {
  const Icon = toastIcons[tone]
  const role = tone === 'error' || tone === 'warning' ? 'alert' : 'status'

  return (
    <div role={role} className={`flex max-w-sm items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-lg ${className}`}>
      <Icon size={20} className={tone === 'error' ? 'text-destructive' : 'text-primary'} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {onClose && (
        <IconButton label="Fermer la notification" size="sm" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      )}
    </div>
  )
}
