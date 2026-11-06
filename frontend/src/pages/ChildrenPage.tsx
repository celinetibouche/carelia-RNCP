import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { Baby, ChevronRight, Plus } from 'lucide-react'
import { api, type Child } from '../api.ts'
import { useAuth } from '../useAuth.ts'
import { canEditChildren, isParent } from '../permissions.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { PersonListItem } from '../components/shared/PersonListItem.tsx'
import { SearchField } from '../components/shared/SearchField.tsx'
import { FormField, SelectField } from '../components/ui/FormField.tsx'
import { InlineError } from '../components/ui/InlineStatus.tsx'

export function ChildrenPage() {
  const { user } = useAuth()
  const [children, setChildren] = useState<Child[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [groupName, setGroupName] = useState('')
  const [knownGroups, setKnownGroups] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const query = new URLSearchParams()
  if (search) query.set('search', search)
  if (groupName) query.set('groupName', groupName)
  if (filter !== 'ALL') query.set('active', String(filter === 'ACTIVE'))
  const queryKey = query.toString()
  const loading = loadedQuery !== `${queryKey}#${attempt}`
  useEffect(() => {
    let cancelled = false
    const key = `${queryKey}#${attempt}`
    api<Child[]>(`/children${queryKey ? `?${queryKey}` : ''}`)
      .then((items) => { if (!cancelled) {
        setChildren(items); setError(''); setLoadedQuery(key)
        setKnownGroups((current) => Array.from(new Set([...current, ...items.flatMap((child) => child.groupName ? [child.groupName] : [])])).sort())
      } })
      .catch((reason) => { if (!cancelled) { setError(reason instanceof Error ? reason.message : 'Chargement impossible.'); setLoadedQuery(key) } })
    return () => { cancelled = true }
  }, [queryKey, attempt])

  if (isParent(user.role) && !loading && children.length === 1 && !error) {
    return <Navigate to={`/enfants/${children[0].childId}`} replace />
  }

  return <>
    <PageHeader title={isParent(user.role) ? 'Mes enfants' : 'Les enfants'} />
    <SearchField value={search} onChange={setSearch} placeholder="Rechercher un enfant" />
    <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Filtrer les fiches">
      {([['ALL', 'Tous'], ['ACTIVE', 'Actifs'], ['INACTIVE', 'Inactifs']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
        className={`min-h-9 shrink-0 rounded-full border px-4 text-xs font-semibold ${filter === value ? 'border-primary bg-accent text-primary' : 'border-border bg-card text-muted-foreground'}`}>{label}</button>)}
    </div>
    {knownGroups.length > 0 && <FormField label="Groupe" htmlFor="children-group" className="mt-3">
      <SelectField value={groupName} className="rounded-full" onChange={(event) => setGroupName(event.target.value)}>
        <option value="">Tous les groupes</option>
        {knownGroups.map((group) => <option key={group} value={group}>{group}</option>)}
      </SelectField>
    </FormField>}
    {!loading && error && <InlineError className="mt-4" message={error} onRetry={() => setAttempt((value) => value + 1)} />}
    <div className="mt-4 grid gap-2">
      {!loading && children.map((child) => <PersonListItem
        key={child.childId} to={`/enfants/${child.childId}`}
        name={`${child.firstName} ${child.lastName}`}
        description={child.groupName ?? 'Enfant'}
        leading={<span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-primary"><Baby size={22} /></span>}
        status={child.isActive ? 'Actif' : 'Inactif'} statusTone={child.isActive ? 'success' : 'neutral'}
        trailing={<ChevronRight size={15} className="text-muted-foreground" aria-hidden="true" />}
      />)}
      {loading && <p className="py-6 text-sm text-muted-foreground">Chargement...</p>}
      {!loading && !children.length && !error && <p className="py-6 text-sm text-muted-foreground">Aucun enfant trouvé.</p>}
    </div>
    {canEditChildren(user.role) && <Link to="/enfants/nouveau" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold"><Plus size={18} />Ajouter un profil</Link>}
  </>
}
