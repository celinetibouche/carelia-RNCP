import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bell } from 'lucide-react'
import { useNavigate } from 'react-router'
import { api, type MessageNotificationPage, type ReportNotification } from '../../api.ts'
import { IconButton } from '../ui/Button.tsx'
import { useAuth } from '../../useAuth.ts'
import { useMessagingEvents } from '../../useMessagingEvents.ts'
import { canReadNotifications, isParent } from '../../permissions.ts'

type PageHeaderProps = {
  title: string
  subtitle?: string
  showBack?: boolean
  onBack?: () => void
  showNotifications?: boolean
  onNotificationsClick?: () => void
}

export function PageHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  showNotifications = true,
  onNotificationsClick,
}: PageHeaderProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const branded = isParent(user.role)
  const [unread, setUnread] = useState(false)

  const sequence = useRef(0)
  const watching = showNotifications && canReadNotifications(user.role)
  // Seule la réponse à la demande la plus récente est appliquée ; en cas d'échec, l'indicateur actuel est conservé.
  const refresh = useCallback(() => {
    const current = ++sequence.current
    Promise.all([
      api<MessageNotificationPage>('/message-notifications?limit=1'),
      isParent(user.role) ? api<ReportNotification[]>('/notifications') : Promise.resolve([]),
    ])
      .then(([messages, reports]) => { if (current === sequence.current) setUnread(messages.unread > 0 || reports.some((item) => !item.readAt)) })
      .catch(() => undefined)
  }, [user.role])
  useEffect(() => {
    if (!watching) return
    queueMicrotask(refresh)
    window.addEventListener('carelia:notification-read', refresh)
    return () => window.removeEventListener('carelia:notification-read', refresh)
  }, [watching, refresh])
  useMessagingEvents({ onChange: refresh, onResync: refresh }, watching)

  const notificationButton = showNotifications && canReadNotifications(user.role) && (
    <span className="relative shrink-0">
      <IconButton label="Notifications" variant={branded ? 'outline' : 'ghost'} onClick={onNotificationsClick ?? (() => navigate('/notifications'))}>
        <Bell size={21} aria-hidden="true" />
      </IconButton>
      {unread && <span className="pointer-events-none absolute right-1 top-1 size-2 rounded-full bg-destructive" aria-hidden="true" />}
    </span>
  )

  return (
    <header className="sticky top-0 z-20 -mx-5 mb-5 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-background px-5 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {branded && notificationButton}
        {showBack && (!branded || !showNotifications) && (
          <IconButton label="Retour" variant={branded ? 'outline' : 'ghost'} onClick={onBack ?? (() => navigate(-1))}>
            <ArrowLeft size={20} aria-hidden="true" />
          </IconButton>
        )}
        <div className="min-w-0">
          <h1 className="break-words text-[23px] leading-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 break-words text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {branded ? <div className="shrink-0 text-right text-primary"><span className="block font-serif text-lg">Carelia</span><small className="block text-[9px] font-semibold uppercase">Parents</small></div> : notificationButton}
    </header>
  )
}
