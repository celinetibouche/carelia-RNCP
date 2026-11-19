import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Plus } from 'lucide-react'
import { api, type Child, type Report } from '../api.ts'
import { useAuth } from '../useAuth.ts'
import { canEditReports } from '../permissions.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Tag } from '../components/ui/Tag.tsx'
import { FormField, SelectField, TextInput } from '../components/ui/FormField.tsx'
import { Button } from '../components/ui/Button.tsx'
import { InlineError, LoadingText } from '../components/ui/InlineStatus.tsx'

const pageSize = 20
const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const monthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short' })

// Libellé de la carte : « Aujourd'hui, 12 novembre » ou « Jeudi 6 novembre » (maquette S5).
function dayTitle(value: string) {
  const date = new Date(`${value}T12:00:00`)
  const label = weekday.format(date)
  if (date.toDateString() === new Date().toDateString()) return `Aujourd'hui, ${label.split(' ').slice(1).join(' ')}`
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function ReportsPage() {
  const { user } = useAuth()
  const [children, setChildren] = useState<Child[]>([])
  const [childId, setChildId] = useState('')
  const [date, setDate] = useState('')
  const [page, setPage] = useState(0)
  const [childrenError, setChildrenError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; reports: Report[]; error: string } | null>(null)
  const query = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) })
  if (childId) query.set('childId', childId)
  if (date) query.set('date', date)
  const queryKey = query.toString()
  const loading = result?.key !== `${queryKey}#${attempt}`
  const reports = loading ? [] : result.reports
  const error = childrenError || (loading ? '' : result.error)

  useEffect(() => {
    api<Child[]>('/children').then((items) => { setChildren(items); setChildrenError('') })
      .catch((reason) => setChildrenError(reason instanceof Error ? reason.message : 'Enfants indisponibles.'))
  }, [attempt])
  useEffect(() => {
    let cancelled = false
    const key = `${queryKey}#${attempt}`
    api<Report[]>(`/reports?${queryKey}`)
      .then((items) => { if (!cancelled) setResult({ key, reports: items, error: '' }) })
      .catch((reason) => { if (!cancelled) setResult({ key, reports: [], error: reason instanceof Error ? reason.message : 'Bulletins indisponibles.' }) })
    return () => { cancelled = true }
  }, [queryKey, attempt])

  return <>
    <PageHeader title="Bulletins" subtitle="Suivi quotidien" />
    <div className="grid grid-cols-1 gap-3 min-[375px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <FormField label="Enfant" htmlFor="reports-child">
        <SelectField value={childId} onChange={(event) => { setChildId(event.target.value); setPage(0) }}>
          <option value="">Tous</option>
          {children.map((child) => <option key={child.childId} value={child.childId}>{child.firstName} {child.lastName}</option>)}
        </SelectField>
      </FormField>
      <FormField label="Date" htmlFor="reports-date">
        <TextInput type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(0) }} />
      </FormField>
    </div>
    {error && <InlineError className="mt-4" message={error} onRetry={() => setAttempt((value) => value + 1)} />}
    <div className="mt-5 grid gap-3">
      {/* Carte de la maquette : pastille ronde avec la date, jour en toutes lettres, enfant, résumé, statut. */}
      {reports.map((report) => {
        const date = new Date(`${report.reportDate}T12:00:00`)
        return <Link key={report.reportId} to={`/bulletin?childId=${report.childId}&date=${report.reportDate}`}
          className="flex min-h-24 items-center gap-4 rounded-card border border-border bg-card px-4 py-4 hover:bg-muted">
          <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-full bg-[#e5d5c5] leading-none text-primary" aria-hidden="true">
            <strong className="text-lg">{String(date.getDate()).padStart(2, '0')}</strong>
            <small className="mt-0.5 text-[9px] uppercase">{monthShort.format(date)}</small>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <strong className="text-sm">{dayTitle(report.reportDate)}</strong>
              <Tag tone={report.status === 'PUBLISHED' ? 'neutral' : 'sand'} className="shrink-0">{report.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'}</Tag>
            </span>
            <small className="mt-1 block text-xs font-semibold text-primary">{report.firstName} {report.lastName}</small>
            {report.summary && <small className="mt-1 block truncate text-sm text-muted-foreground">{report.summary}</small>}
          </span>
          <ChevronRight size={18} className="shrink-0 text-foreground" aria-hidden="true" />
        </Link>
      })}
      {!loading && !reports.length && !error && <p className="py-6 text-sm text-muted-foreground">Aucun bulletin trouvé.</p>}
      {loading && <LoadingText />}
    </div>
    {(page > 0 || reports.length === pageSize) && <div className="mt-5 flex justify-between gap-3">
      <Button variant="outline" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>Précédent</Button>
      <Button variant="outline" disabled={reports.length < pageSize || loading} onClick={() => setPage(page + 1)}>Suivant</Button>
    </div>}
    {canEditReports(user.role) && <Link to="/bulletin" className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={18} />Saisir un bulletin</Link>}
  </>
}
