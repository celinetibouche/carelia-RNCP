import type { HTMLAttributes, ReactNode } from 'react'

type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'unread'

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone
  children: ReactNode
}

const toneClasses: Record<StatusTone, string> = {
  success: 'bg-secondary text-secondary-foreground',
  warning: 'bg-accent text-accent-foreground',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-primary/10 text-primary',
  neutral: 'bg-border/50 text-foreground',
  unread: 'bg-primary text-primary-foreground',
}

export function StatusBadge({ tone = 'neutral', className = '', children, ...props }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-tight ${toneClasses[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
