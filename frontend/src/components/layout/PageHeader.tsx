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

  // Boutons ronds cerclés, comme dans les maquettes (cloche à droite, retour à gauche).
  // « ! » : force l'arrondi complet face au rounded-lg par défaut d'IconButton.
  const roundButton = '!rounded-full border border-border bg-card'
  const notificationButton = showNotifications && canReadNotifications(user.role) && (
    <span className="relative shrink-0">
      <IconButton label="Notifications" variant="outline" className={roundButton} onClick={onNotificationsClick ?? (() => navigate('/notifications'))}>
        <Bell size={20} aria-hidden="true" />
      </IconButton>
      {unread && <span className="pointer-events-none absolute right-1 top-1 size-2 rounded-full bg-ring" aria-hidden="true" />}
    </span>
  )

  // En-tête de la nouvelle maquette, identique pour les parents et l'équipe : titre à empattement en grand,
  // sous-titre en petites majuscules espacées, sans bordure basse.
  return (
    <header className="sticky top-0 z-20 -mx-5 mb-5 flex min-h-20 items-center justify-between gap-3 bg-background/95 px-5 pb-3 pt-5 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-3">
        {showBack && (
          <IconButton label="Retour" variant="outline" className={roundButton} onClick={onBack ?? (() => navigate(-1))}>
            <ArrowLeft size={20} aria-hidden="true" />
          </IconButton>
        )}
        <div className="min-w-0">
          <h1 className="break-words text-[27px] font-semibold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 break-words text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {notificationButton}
    </header>
  )
}
