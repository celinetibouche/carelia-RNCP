import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { BookOpen, ChevronRight, Plus } from 'lucide-react'
import { api, type Child, type Report } from '../api.ts'
import { formatDay } from '../dates.ts'
import { useAuth } from '../useAuth.ts'
import { canEditReports } from '../permissions.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { PersonListItem } from '../components/shared/PersonListItem.tsx'
import { FormField, SelectField, TextInput } from '../components/ui/FormField.tsx'
import { Button } from '../components/ui/Button.tsx'
import { InlineError, LoadingText } from '../components/ui/InlineStatus.tsx'

const pageSize = 20

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
    <PageHeader title="Bulletins" />
    {canEditReports(user.role) && <Link to="/bulletin" className="mb-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-primary"><Plus size={18} />Saisir un bulletin</Link>}
    <div className="grid grid-cols-1 gap-3 rounded-card border border-border bg-card p-4 min-[375px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
    <div className="mt-5 grid gap-2">
      {reports.map((report) => <PersonListItem key={report.reportId}
        to={`/bulletin?childId=${report.childId}&date=${report.reportDate}`}
        name={`${report.firstName} ${report.lastName}`} description={formatDay(report.reportDate)}
        leading={<span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><BookOpen size={20} aria-hidden="true" /></span>}
        status={report.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'} statusTone={report.status === 'PUBLISHED' ? 'success' : 'neutral'}
        trailing={<ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
      />)}
      {!loading && !reports.length && !error && <p className="py-6 text-sm text-muted-foreground">Aucun bulletin trouvé.</p>}
      {loading && <LoadingText />}
    </div>
    <div className="mt-5 flex justify-between gap-3">
      <Button variant="outline" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>Précédent</Button>
      <Button variant="outline" disabled={reports.length < pageSize || loading} onClick={() => setPage(page + 1)}>Suivant</Button>
    </div>
  </>
}
