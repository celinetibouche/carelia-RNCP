import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Baby, BookOpen, ChevronRight, ClipboardList, MessageCircle, Moon, Smile, Utensils } from 'lucide-react'
import { api, type Child, type ConversationPage, type Report } from '../api.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { MetricTile } from '../components/shared/MetricTile.tsx'
import { PersonListItem } from '../components/shared/PersonListItem.tsx'
import { InlineError } from '../components/ui/InlineStatus.tsx'
import { StatusBadge } from '../components/ui/StatusBadge.tsx'
import { canUseMessaging, isParent } from '../permissions.ts'
import { formatDay } from '../dates.ts'
import { useAuth } from '../useAuth.ts'
import { useMessagingEvents } from '../useMessagingEvents.ts'

function useCurrentDate() {
  const [current, setCurrent] = useState(() => new Date())
  useEffect(() => {
    const interval = window.setInterval(() => setCurrent(new Date()), 60_000)
    return () => window.clearInterval(interval)
  }, [])
  return current
}
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const intakeNames: Record<string, string> = { ALL: 'Tout mangé', MOST: 'Bien mangé', LITTLE: 'Peu mangé', NONE: 'Refusé' }
const moodNames: Record<string, string> = { SAD: 'Triste', CALM: 'Calme', HAPPY: 'Joyeux', TIRED: 'Fatigué' }
const minutes = (value: string) => { const [hours, mins] = value.split(':').map(Number); return hours * 60 + mins }
const duration = (mins: number) => `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')}`

export function HomePage() {
  const { user } = useAuth()
  return isParent(user.role) ? <ParentHome /> : <StaffHome />
}

function useHomeData() {
  const { user } = useAuth()
  const [reports, setReports] = useState<Report[]>([])
  const [children, setChildren] = useState<Child[]>([])
  const [daycare, setDaycare] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setError(''); setLoading(true); setAttempt((value) => value + 1) }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api<Report[]>('/reports?limit=100'),
      api<Child[]>('/children'),
      api<{ name: string }>(`/daycares/${user.daycareId}`),
    ]).then(([items, enrolled, site]) => {
      if (!cancelled) { setReports(items); setChildren(enrolled); setDaycare(site.name) }
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user.daycareId, attempt])

  return { reports, children, daycare, error, loading, retry }
}

function useUnreadMessages(enabled: boolean) {
  const [unread, setUnread] = useState<number | null>(null)
  const sequence = useRef(0)
  // Seule la réponse à la demande la plus récente est appliquée ; en cas d'échec, le dernier total connu reste affiché.
  const refresh = useCallback(() => {
    const current = ++sequence.current
    api<ConversationPage>('/conversations?limit=1')
      .then((page) => { if (current === sequence.current) setUnread(page.unreadMessages) })
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!enabled) return
    queueMicrotask(refresh)
    window.addEventListener('carelia:notification-read', refresh)
    return () => window.removeEventListener('carelia:notification-read', refresh)
  }, [enabled, refresh])
  useMessagingEvents({ onChange: refresh, onResync: refresh }, enabled)
  return unread
}

const unreadDetail = (count: number | null) => count === null ? 'Chargement…' : count ? `${count} message${count > 1 ? 's' : ''} non lu${count > 1 ? 's' : ''}` : 'Aucun nouveau message'

function ActionLink({ to, icon, title, detail }: { to: string; icon: ReactNode; title: string; detail: string }) {
  return <Link to={to} className="flex min-h-32 min-w-0 flex-col rounded-card border border-border bg-card p-4 shadow-sm hover:bg-accent">
    <span className="mb-4 flex size-10 items-center justify-center rounded-full bg-accent text-primary" aria-hidden="true">{icon}</span>
    <strong className="text-sm">{title}</strong><small className="mt-0.5 text-muted-foreground">{detail}</small>
  </Link>
}

function StaffHome() {
  const { user } = useAuth()
  const unread = useUnreadMessages(canUseMessaging(user.role))
  const currentDate = useCurrentDate()
  const { reports, children, daycare, error, loading, retry } = useHomeData()
  const todayReports = reports.filter((report) => report.reportDate === dateKey(currentDate))
  const draftCount = todayReports.filter((report) => report.status === 'DRAFT').length

  return <>
    <PageHeader title={`Bonjour, ${user.firstName}`} subtitle={`${dateLabel.format(currentDate)}${daycare ? ` · ${daycare}` : ''}`} />
    {error && <InlineError className="mb-4" message={error} onRetry={retry} />}
    <section className="rounded-[22px] bg-secondary p-5 text-secondary-foreground">
      <p className="text-xs font-semibold uppercase">Aujourd'hui</p>
      <h2 className="mt-1 text-[26px] leading-tight">{loading ? 'Chargement...' : `${todayReports.length} bulletin${todayReports.length > 1 ? 's' : ''} du jour`}</h2>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <MetricTile compact label="Publiés" value={loading ? '…' : todayReports.filter((report) => report.status === 'PUBLISHED').length} className="border-0" />
        <MetricTile compact label="Brouillons" value={loading ? '…' : draftCount} className="border-0" />
        <MetricTile compact label="Enfants actifs" value={loading ? '…' : children.filter((child) => child.isActive).length} className="border-0" />
      </div>
    </section>
    <section className="mt-6">
      <h2 className="mb-3 text-xl">À faire maintenant</h2>
      <div className="grid grid-cols-2 gap-3">
        <ActionLink to="/enfants" icon={<Baby size={21} />} title="Enfants" detail={`${children.length} fiche${children.length > 1 ? 's' : ''}`} />
        <ActionLink to="/bulletins" icon={<ClipboardList size={21} />} title="Bulletins" detail={`${draftCount} à compléter`} />
        <ActionLink to="/bulletin" icon={<BookOpen size={21} />} title="Saisir un bulletin" detail="Aujourd'hui" />
        {canUseMessaging(user.role) && <ActionLink to="/messages" icon={<MessageCircle size={21} />} title="Messages" detail={unreadDetail(unread)} />}
      </div>
    </section>
    <section className="mt-7">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-xl">Bulletins récents</h2>
        <Link to="/bulletins" className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-primary">Voir tout <ArrowRight size={15} /></Link></div>
      <div className="grid gap-2">
        {reports.slice(0, 5).map((report) => <PersonListItem key={report.reportId}
          to={`/bulletin?childId=${report.childId}&date=${report.reportDate}`} name={`${report.firstName} ${report.lastName}`} description={formatDay(report.reportDate)}
          leading={<span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-primary"><BookOpen size={18} /></span>}
          status={report.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'} statusTone={report.status === 'PUBLISHED' ? 'success' : 'neutral'} />)}
        {!loading && !reports.length && !error && <p className="py-4 text-sm text-muted-foreground">Aucun bulletin pour le moment.</p>}
      </div>
    </section>
  </>
}

function ParentHome() {
  const { user } = useAuth()
  const unread = useUnreadMessages(true)
  const currentDate = useCurrentDate()
  const { reports, children, daycare, error, loading, retry } = useHomeData()
  const [detail, setDetail] = useState<Report | null>(null)
  const [detailError, setDetailError] = useState('')
  const child = children[0]
  const latest = child && reports.find((report) => report.childId === child.childId)
  const latestId = latest?.reportId

  useEffect(() => {
    if (!latestId) return
    let cancelled = false
    api<Report>(`/reports/${latestId}`)
      .then((report) => { if (!cancelled) setDetail(report) })
      .catch((reason) => { if (!cancelled) setDetailError(reason instanceof Error ? reason.message : 'Bulletin indisponible.') })
    return () => { cancelled = true }
  }, [latestId])

  const mood = detail?.moods[0]
  const meal = detail?.meals.find((item) => item.kind === 'MAIN')
  const sleep = detail?.naps.reduce((sum, nap) => sum + Math.max(0, minutes(nap.endTime) - minutes(nap.startTime)), 0) ?? 0
  const bulletinUrl = latest ? `/bulletin?childId=${latest.childId}&date=${latest.reportDate}` : '/bulletins'

  return <>
    <PageHeader title={`Bonjour, ${user.firstName}`} />
    <p className="mb-5 text-xs text-muted-foreground">{daycare ? `${daycare} · ` : ''}{dateLabel.format(currentDate)}</p>
    {error && <InlineError className="mb-4" message={error} onRetry={retry} />}
    {child ? <Link to={`/enfants/${child.childId}`} className="flex min-h-32 items-center gap-4 rounded-card bg-secondary p-5 text-secondary-foreground">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-card text-primary"><Baby size={29} /></span>
      <span className="min-w-0 flex-1"><strong className="block font-serif text-2xl text-foreground">{child.firstName} {child.lastName}</strong>
        <small className="block text-muted-foreground">{child.groupName ? `Section des ${child.groupName}` : 'Fiche enfant'}</small>
        <StatusBadge tone={child.isActive ? 'success' : 'neutral'} className="mt-3">{child.isActive ? 'Fiche active' : 'Fiche inactive'}</StatusBadge></span>
      <ChevronRight size={20} className="shrink-0 text-foreground" aria-hidden="true" />
    </Link> : !loading && !error && <p className="py-5 text-sm text-muted-foreground">Aucun enfant lié à votre compte.</p>}
    {children.length > 1 && <Link to="/enfants" className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-primary">Voir mes enfants <ArrowRight size={16} className="ml-1" /></Link>}
    <section className="mt-6">
      <h2 className="mb-3 text-xl">Sa journée en un regard</h2>
      <div className="grid grid-cols-3 gap-2">
        <MetricTile compact className="min-h-[108px]" label="Humeur" value={mood ? moodNames[mood.moodLabel ?? ''] ?? 'Observée' : '—'} icon={<Smile size={20} className="text-amber-600" />} />
        <MetricTile compact className="min-h-[108px]" label="Repas" value={meal ? intakeNames[meal.intake] : '—'} icon={<Utensils size={20} className="text-emerald-700" />} />
        <MetricTile compact className="min-h-[108px]" label="Sommeil" value={detail ? duration(sleep) : '—'} icon={<Moon size={20} className="text-violet-600" />} />
      </div>
      {latest && <p className="mt-2 text-xs text-muted-foreground">{latest.reportDate === dateKey(currentDate) ? "Bulletin d'aujourd'hui" : `Dernier bulletin : ${formatDay(latest.reportDate)}`}</p>}
      {detailError && <p role="alert" className="mt-2 text-xs text-destructive">{detailError}</p>}
    </section>
    <section className="mt-6">
      <h2 className="mb-3 text-xl">Le mot de l'équipe</h2>
      <p className="border-l-[3px] border-primary py-1 pl-4 text-sm leading-7 text-muted-foreground">{detail?.parentNote || detail?.summary || (loading ? 'Chargement...' : 'Aucun mot pour le moment.')}</p>
      {latest && <Link to={bulletinUrl} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Voir le bulletin {latest.reportDate === dateKey(currentDate) ? 'du jour' : 'récent'}</Link>}
    </section>
    <section className="mt-6">
      <h2 className="mb-3 text-xl">À suivre</h2>
      <PersonListItem to="/messages" name="Messages" description={unreadDetail(unread)} className="mb-2"
        leading={<span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><MessageCircle size={20} /></span>}
        status={unread ? String(unread) : undefined} statusTone="unread"
        trailing={<ChevronRight size={18} className="text-muted-foreground" aria-hidden="true" />} />
      <PersonListItem to="/notifications" name="Notifications" description="Nouveaux bulletins publiés"
        leading={<span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><BookOpen size={20} /></span>}
        trailing={<ChevronRight size={18} className="text-muted-foreground" aria-hidden="true" />} />
    </section>
  </>
}
