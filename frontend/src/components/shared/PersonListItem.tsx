import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Avatar } from './Avatar.tsx'
import { StatusBadge } from '../ui/StatusBadge.tsx'

type PersonListItemProps = {
  name: string
  description?: string
  avatarUrl?: string | null
  leading?: ReactNode
  status?: string
  statusTone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'unread'
  trailing?: ReactNode
  onClick?: () => void
  to?: string
  className?: string
}

export function PersonListItem({
  name,
  description,
  avatarUrl,
  leading,
  status,
  statusTone = 'neutral',
  trailing,
  onClick,
  to,
  className = '',
}: PersonListItemProps) {
  const content = (
    <>
      {leading ?? <Avatar name={name} src={avatarUrl} />}
      <span className="min-w-0 flex-1 text-left">
        <span className="block break-words font-semibold">{name}</span>
        {description && <span className="block break-words text-sm text-muted-foreground">{description}</span>}
      </span>
      {status && <StatusBadge tone={statusTone}>{status}</StatusBadge>}
      {trailing && <span className="shrink-0">{trailing}</span>}
    </>
  )

  const classes = `flex min-h-16 w-full items-center gap-3 rounded-card border border-border bg-card px-3 py-2 text-left ${onClick || to ? 'hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary' : ''} ${className}`

  return to ? (
    <Link to={to} className={classes}>{content}</Link>
  ) : onClick ? (
    <button type="button" onClick={onClick} className={classes}>{content}</button>
  ) : (
    <div className={classes}>{content}</div>
  )
}
