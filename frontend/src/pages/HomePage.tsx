import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Baby, BookOpen, CalendarDays, Check, ChevronRight, ClipboardList, FileText, Heart, MessageCircle, Moon, Plus, Utensils } from 'lucide-react'
import { api, type Child, type ConversationPage, type Report } from '../api.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { InlineError } from '../components/ui/InlineStatus.tsx'
import { Tag } from '../components/ui/Tag.tsx'
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
const timeLabel = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
// Âge affiché sur l'accueil parent (« 2 ANS », « 8 MOIS »), calculé à partir de la date de naissance.
function ageLabel(birthDate: string, today: Date) {
  const birth = new Date(`${birthDate}T00:00:00`)
  const months = (today.getFullYear() - birth.getFullYear()) * 12 + today.getMonth() - birth.getMonth() - (today.getDate() < birth.getDate() ? 1 : 0)
  if (months < 0) return ''
  return months < 24 ? `${months} mois` : `${Math.floor(months / 12)} ans`
}
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

// Tuile compacte de « À faire maintenant » (maquette S1) : icône ronde, libellé, chevron.
function ActionLink({ to, icon, title }: { to: string; icon: ReactNode; title: string }) {
  return <Link to={to} className="flex min-h-16 min-w-0 items-center gap-3 rounded-card border border-border bg-card px-3 hover:bg-muted">
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary" aria-hidden="true">{icon}</span>
    <strong className="min-w-0 flex-1 text-[13px] leading-tight">{title}</strong>
    <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
  </Link>
}

// Carte de chiffre clé en haut du tableau de bord : grand nombre, libellé, icône dans une pastille.
function StatCard({ value, total, label, icon, tone }: { value: string; total?: string; label: string; icon: ReactNode; tone: 'sand' | 'coral' }) {
  return <div className={`flex min-h-24 justify-between gap-2 rounded-card border border-border p-4 ${tone === 'sand' ? 'bg-[#e5d5c5]' : 'bg-[#eadfd2]'}`}>
    <span><strong className="block text-3xl font-semibold leading-none">{value}{total && <small className="text-sm font-normal text-muted-foreground">/{total}</small>}</strong>
      <small className="mt-3 block text-sm text-muted-foreground">{label}</small></span>
    <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tone === 'sand' ? 'bg-card/70 text-primary' : 'bg-[#fbe4dc] text-ring'}`} aria-hidden="true">{icon}</span>
  </div>
}

function StaffHome() {
  const { user } = useAuth()
  const unread = useUnreadMessages(canUseMessaging(user.role))
  const currentDate = useCurrentDate()
  const { reports, children, daycare, error, loading, retry } = useHomeData()
  const todayReports = reports.filter((report) => report.reportDate === dateKey(currentDate))
  const draftCount = todayReports.filter((report) => report.status === 'DRAFT').length
  const activeChildren = children.filter((child) => child.isActive).length

  return <>
    <PageHeader title={`Bonjour, ${user.firstName}`} subtitle={`${dateLabel.format(currentDate)}${daycare ? ` · ${daycare}` : ''}`} />
    {error && <InlineError className="mb-4" message={error} onRetry={retry} />}
    <div className="grid grid-cols-2 gap-3">
      <StatCard tone="sand" value={loading ? '…' : String(todayReports.length)} total={loading ? undefined : String(activeChildren)} label="Bulletins du jour" icon={<FileText size={19} />} />
      {/* Le nombre d'absents viendra de l'API des absences (F3), pas encore codée. */}
      <StatCard tone="coral" value="—" label="Absents aujourd'hui" icon={<CalendarDays size={19} />} />
    </div>

    <section className="mt-7">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-2xl font-semibold">Absents du jour</h2>
        <span className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground" title="Bientôt disponible">Déclarer <Plus size={16} /></span></div>
      <p className="rounded-card border border-dashed border-border bg-card/60 px-4 py-5 text-sm text-muted-foreground">La liste des enfants absents arrive avec la fonctionnalité Absences.</p>
    </section>

    <section className="mt-7">
      <h2 className="mb-3 text-2xl font-semibold">À faire maintenant</h2>
      <div className="grid grid-cols-2 gap-3">
        <ActionLink to="/enfants" icon={<Baby size={19} />} title="Enfants" />
        <ActionLink to="/bulletins" icon={<ClipboardList size={19} />} title={`${draftCount} à compléter`} />
        <ActionLink to="/bulletin" icon={<Plus size={19} />} title="Saisir un bulletin" />
        {canUseMessaging(user.role) && <ActionLink to="/messages" icon={<MessageCircle size={19} />} title={unread ? `Messages (${unread})` : 'Messages'} />}
      </div>
    </section>

    <section className="mt-7">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-2xl font-semibold">Bulletins récents</h2>
        <Link to="/bulletins" className="inline-flex min-h-10 items-center gap-1 text-sm text-primary">Tout voir <ArrowRight size={15} /></Link></div>
      <div className="grid gap-2">
        {reports.slice(0, 5).map((report) => <Link key={report.reportId} to={`/bulletin?childId=${report.childId}&date=${report.reportDate}`}
          className="flex min-h-20 items-center gap-4 rounded-card border border-border bg-card px-4 hover:bg-muted">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#eef0ea] font-semibold text-primary" aria-hidden="true">{report.firstName[0]}</span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{report.firstName} {report.lastName}</strong>
            <small className="text-sm text-muted-foreground">{publishedLabel(report, currentDate)}</small></span>
          <Tag tone={report.status === 'PUBLISHED' ? 'neutral' : 'muted'}>{report.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'}</Tag>
        </Link>)}
        {!loading && !reports.length && !error && <p className="py-4 text-sm text-muted-foreground">Aucun bulletin pour le moment.</p>}
      </div>
    </section>
  </>
}

// « Publié à 15:38 » pour un bulletin publié aujourd'hui, sinon la date du bulletin.
function publishedLabel(report: Report, today: Date) {
  if (report.status === 'PUBLISHED' && report.publishedAt && report.reportDate === dateKey(today)) {
    return `Publié à ${timeLabel.format(new Date(report.publishedAt))}`
  }
  return formatDay(report.reportDate)
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
  const changes = detail?.diaperChanges.length ?? 0
  const bulletinUrl = latest ? `/bulletin?childId=${latest.childId}&date=${latest.reportDate}` : '/bulletins'
  // Auteur et heure du mot de l'équipe : première personne ayant publié le bulletin.
  const author = detail?.publishedBy?.[0]
  const noteTime = detail?.publishedAt ? timeLabel.format(new Date(detail.publishedAt)) : ''

  return <>
    <PageHeader title={`Bonjour ${user.firstName}`} subtitle={`${daycare ? `${daycare} · ` : ''}${dateLabel.format(currentDate)}`} />
    {error && <InlineError className="mb-4" message={error} onRetry={retry} />}

    {/* En-tête éditorial de la maquette P1 : prénom en grand et portrait ovale (initiales, pas de photo stockée). */}
    {child ? <Link to={`/enfants/${child.childId}`} className="mb-8 grid grid-cols-[1fr_96px] items-center gap-5">
      <span className="min-w-0">
        <small className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9b6d54]">
          {[child.groupName, ageLabel(child.birthDate, currentDate)].filter(Boolean).join(' · ')}
        </small>
        <strong className="mt-2 block font-serif text-[38px] font-medium leading-none tracking-tight">{child.firstName}</strong>
      </span>
      <span className="relative flex aspect-[4/5] items-center justify-center rounded-[50%] border border-[#d9cbbd] bg-secondary p-1.5">
        <span className="flex size-full items-center justify-center rounded-[50%] bg-[#e5d5c5] font-serif text-3xl text-primary">{child.firstName[0]}{child.lastName[0]}</span>
        <i className="absolute bottom-2 right-1 size-2.5 rounded-full bg-ring" aria-hidden="true" />
      </span>
    </Link> : !loading && !error && <p className="py-5 text-sm text-muted-foreground">Aucun enfant lié à votre compte.</p>}
    {children.length > 1 && <Link to="/enfants" className="-mt-4 mb-6 inline-flex min-h-10 items-center text-sm font-semibold text-primary">Voir mes enfants <ArrowRight size={16} className="ml-1" /></Link>}

    <section>
      <SectionTitle number="01" label="Sa journée" />
      <ul className="divide-y divide-dotted divide-[#d9cbbd] border-b border-[#d9cbbd]">
        <DayRow icon={<Moon size={20} />} title="Sieste" value={detail ? duration(sleep) : '—'} />
        <DayRow icon={<Heart size={20} />} title="Humeur" value={mood ? moodNames[mood.moodLabel ?? ''] ?? 'Observée' : '—'} />
        <DayRow icon={<Utensils size={20} />} title="Repas" value={meal ? intakeNames[meal.intake] : '—'} />
        <DayRow icon={<Check size={20} />} title="Changes" value={detail ? String(changes) : '—'} />
      </ul>
      {latest && <p className="mt-2 text-xs text-muted-foreground">{latest.reportDate === dateKey(currentDate) ? "Bulletin d'aujourd'hui" : `Dernier bulletin : ${formatDay(latest.reportDate)}`}</p>}
      {detailError && <p role="alert" className="mt-2 text-xs text-destructive">{detailError}</p>}
    </section>

    <section className="mt-8">
      <SectionTitle number="02" label="Le mot de l'équipe" />
      {/* Carte façon post-it, légèrement inclinée, avec un morceau de ruban adhésif en haut. */}
      <figure className="relative mx-1 -rotate-[0.6deg] bg-[#ead9c4] px-5 pb-4 pt-6 shadow-[0_6px_16px_#4832261a]">
        <span className="absolute -top-2 left-1/2 h-4 w-16 -translate-x-1/2 rotate-[1deg] bg-[#d9bfa3]/70" aria-hidden="true" />
        {author && <figcaption className="mb-3 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-[#c9ac95] text-xs font-semibold text-primary">{author.firstName[0]}{author.lastName[0]}</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9b6d54]">{author.firstName}</span>
        </figcaption>}
        <blockquote className="font-serif text-xl leading-snug">{detail?.parentNote || detail?.summary || (loading ? 'Chargement...' : 'Aucun mot pour le moment.')}</blockquote>
        {noteTime && <p className="mt-3 text-right font-serif text-sm text-muted-foreground">{noteTime}</p>}
      </figure>
      {latest && <Link to={bulletinUrl} className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary">Voir le bulletin {latest.reportDate === dateKey(currentDate) ? 'du jour' : 'complet'} <ArrowRight size={16} /></Link>}
    </section>

    <section className="mt-8">
      <SectionTitle number="03" label="À suivre" />
      <ul className="divide-y divide-[#d9cbbd]">
        <FollowRow to="/messages" icon={<MessageCircle size={20} />} title="Messages" detail={unreadDetail(unread)} badge={unread || undefined} />
        <FollowRow to="/notifications" icon={<BookOpen size={20} />} title="Notifications" detail="Nouveaux bulletins publiés" />
      </ul>
    </section>

    {/* La déclaration d'absence (F3) arrive avec le back-end : bouton visible mais désactivé pour l'instant. */}
    <button type="button" disabled className="mt-8 flex min-h-14 w-full items-center gap-3 rounded-lg bg-primary px-5 text-left text-primary-foreground disabled:opacity-60">
      <CalendarDays size={20} aria-hidden="true" />
      <span className="flex-1 font-serif text-xl">Déclarer une absence</span>
      <small className="text-[10px] uppercase tracking-wider">Bientôt</small>
    </button>
  </>
}

// Titre de section numéroté de la maquette : « 01  SA JOURNÉE ———— ».
function SectionTitle({ number, label }: { number: string; label: string }) {
  return <h2 className="mb-3 flex items-center gap-4 font-sans text-xs font-semibold uppercase tracking-[0.16em]">
    <span className="font-medium text-[#9b6d54]">{number}</span>{label}
    <span className="h-px flex-1 bg-[#d9cbbd]" aria-hidden="true" />
  </h2>
}

// Ligne de « Sa journée » : icône au trait, titre à empattement, valeur en dessous.
function DayRow({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return <li className="flex items-center gap-5 py-3">
    <span className="text-primary" aria-hidden="true">{icon}</span>
    <span><strong className="block font-serif text-lg font-semibold">{title}</strong><span className="text-sm text-muted-foreground">{value}</span></span>
  </li>
}

// Ligne de « À suivre » : lien vers une rubrique, avec un compteur facultatif.
function FollowRow({ to, icon, title, detail, badge }: { to: string; icon: ReactNode; title: string; detail: string; badge?: number }) {
  return <li><Link to={to} className="flex min-h-16 items-center gap-4 py-3">
    <span className="text-primary" aria-hidden="true">{icon}</span>
    <span className="min-w-0 flex-1"><strong className="block font-serif text-lg font-semibold">{title}</strong><span className="text-sm text-muted-foreground">{detail}</span></span>
    {badge ? <span className="rounded-full bg-ring px-2 py-0.5 text-xs font-semibold text-primary-foreground">{badge}</span> : null}
    <ChevronRight size={18} className="text-muted-foreground" aria-hidden="true" />
  </Link></li>
}
