import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, MessageCircle, type LucideIcon } from 'lucide-react'
import { api, type MessageNotification, type MessageNotificationPage, type ReportNotification } from '../api.ts'
import { formatDateTime, formatDay } from '../dates.ts'
import { useAuth } from '../useAuth.ts'
import { useMessagingEvents } from '../useMessagingEvents.ts'
import { canReadNotifications, isParent } from '../permissions.ts'
import { AccessDenied } from '../components/shared/AccessDenied.tsx'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Link } from 'react-router'
import { Button } from '../components/ui/Button.tsx'
import { InlineError, LoadingText } from '../components/ui/InlineStatus.tsx'

const pageSize = 30

// Ajoute des notifications sans doublon (de nouveaux messages décalent les pages).
const appendUnique = (current: MessageNotification[], incoming: MessageNotification[]) => {
  const known = new Set(current.map((item) => item.messageId))
  return [...current, ...incoming.filter((item) => !known.has(item.messageId))]
}

export function NotificationsPage() {
  const { user } = useAuth()
  const allowed = canReadNotifications(user.role)
  const [reports, setReports] = useState<ReportNotification[]>([])
  const [messages, setMessages] = useState<MessageNotification[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [moreError, setMoreError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const messagesRef = useRef<MessageNotification[]>([])
  const sequence = useRef(0)

  const fetchPage = useCallback((offset: number) => api<MessageNotificationPage>(`/message-notifications?limit=${pageSize}&offset=${offset}`), [])

  // Recharge toute la hauteur déjà affichée (liste et compteurs restent cohérents sans revenir à la première page).
  // Seule la réponse à la demande la plus récente est appliquée ; en cas d'échec, l'affichage actuel est conservé.
  const refresh = useCallback(async () => {
    if (!allowed) return
    const current = ++sequence.current
    try {
      const pages = Math.max(1, Math.ceil(messagesRef.current.length / pageSize))
      let items: MessageNotification[] = []
      let count = 0
      for (let index = 0; index < pages; index += 1) {
        const page = await fetchPage(index * pageSize)
        items = appendUnique(items, page.items)
        count = page.total
        if (page.items.length < pageSize) break
      }
      const reportItems = isParent(user.role) ? await api<ReportNotification[]>('/notifications') : []
      if (current !== sequence.current) return
      messagesRef.current = items
      setMessages(items); setTotal(count); setReports(reportItems)
      setError(''); setMoreError('')
    } catch (reason) {
      if (current === sequence.current) setError(reason instanceof Error ? reason.message : 'Chargement impossible.')
    } finally { if (current === sequence.current) setLoading(false) }
  }, [allowed, user.role, fetchPage])

  async function loadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    setMoreError('')
    try {
      const page = await fetchPage(messagesRef.current.length)
      const next = appendUnique(messagesRef.current, page.items)
      messagesRef.current = next
      setMessages(next); setTotal(page.total)
    } catch (reason) { setMoreError(reason instanceof Error ? reason.message : 'Chargement impossible.') }
    finally { setLoadingMore(false) }
  }

  useEffect(() => {
    if (!allowed) return
    queueMicrotask(() => { void refresh() })
    const read = () => { void refresh() }
    window.addEventListener('carelia:notification-read', read)
    return () => window.removeEventListener('carelia:notification-read', read)
  }, [allowed, refresh])
  useMessagingEvents({ onChange: () => void refresh(), onResync: () => void refresh() }, allowed)

  if (!allowed) return <AccessDenied showBack />
  return <>
    <PageHeader title="Notifications" showBack showNotifications={false} />
    {error && <InlineError className="mb-3" message={error} onRetry={() => void refresh()} />}
    {/* Deux groupes comme la maquette : « Nouveau » (non lues) puis « Plus tôt » (déjà lues). */}
    {[true, false].map((unread) => {
      const groupMessages = messages.filter((item) => !item.readAt === unread)
      const groupReports = reports.filter((item) => !item.readAt === unread)
      if (!groupMessages.length && !groupReports.length) return null
      return <section key={String(unread)} className="mb-5">
        <h2 className="mb-3 font-sans text-xs font-semibold uppercase tracking-[0.16em] text-[#9b6d54]">{unread ? 'Nouveau' : 'Plus tôt'}</h2>
        <div className="grid gap-3">
          {groupMessages.map((item) => <NotificationCard key={`message-${item.messageId}`} to={`/messages/${item.conversationId}`} unread={unread}
            icon={MessageCircle} tone="coral" title="Nouveau message" text={`Discussion à propos de ${item.childName}.`} time={formatDateTime(item.createdAt)} />)}
          {groupReports.map((item) => <NotificationCard key={`report-${item.notificationId}`} to={`/bulletin?childId=${item.childId}&date=${item.reportDate}`} unread={unread}
            icon={FileText} tone="sand" title="Nouveau bulletin disponible" text={`La journée de ${item.childName} du ${formatDay(item.reportDate)} vient d'être publiée.`} time={formatDateTime(item.createdAt)} />)}
        </div>
      </section>
    })}
    <div className="grid gap-2">
      {loading && <LoadingText />}
      {!loading && !reports.length && !messages.length && !error && <p className="py-6 text-sm text-muted-foreground">Aucune notification.</p>}
      {moreError && <InlineError message={`Notifications suivantes indisponibles : ${moreError}`} onRetry={() => void loadMore()} />}
      {!loading && !moreError && messages.length < total && <Button variant="outline" loading={loadingMore} onClick={() => void loadMore()}>Voir plus de notifications</Button>}
    </div>
  </>
}

// Carte de notification de la maquette : pastille d'icône ronde, titre, texte, heure ;
// fond beige et point corail tant qu'elle n'est pas lue.
function NotificationCard({ to, unread, icon: Icon, tone, title, text, time }: {
  to: string; unread: boolean; icon: LucideIcon; tone: 'sand' | 'coral'; title: string; text: string; time: string
}) {
  return <Link to={to} className={`relative flex gap-4 rounded-card border p-4 hover:bg-muted ${unread ? 'border-[#d9c2ad] bg-[#ece0d2]' : 'border-border bg-card'}`}>
    <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${tone === 'coral' ? 'bg-[#fbe4dc] text-ring' : 'bg-secondary text-primary'}`} aria-hidden="true"><Icon size={19} /></span>
    <span className="min-w-0 flex-1 pr-3">
      <strong className="block text-sm">{title}</strong>
      <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
      <small className="mt-2 block text-xs text-muted-foreground">{time}</small>
    </span>
    {unread && <span className="absolute right-4 top-4 size-2 rounded-full bg-ring"><span className="sr-only">Non lue</span></span>}
  </Link>
}
