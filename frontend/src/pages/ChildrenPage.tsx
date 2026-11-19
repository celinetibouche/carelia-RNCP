import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { ChevronRight, Plus } from 'lucide-react'
import { api, type Child } from '../api.ts'
import { useAuth } from '../useAuth.ts'
import { canEditChildren, isParent } from '../permissions.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { SearchField } from '../components/shared/SearchField.tsx'
import { FormField, SelectField } from '../components/ui/FormField.tsx'
import { InlineError } from '../components/ui/InlineStatus.tsx'
import { Tag } from '../components/ui/Tag.tsx'
import { ageLabel } from '../dates.ts'

// Pastilles pastel alternées pour les avatars à initiale (maquette S2), choisies selon l'identifiant
// de l'enfant pour qu'un même enfant garde toujours la même couleur.
const avatarTones = ['bg-[#eef0ea] text-primary', 'bg-[#f6e3db] text-[#a0624a]', 'bg-[#efeaf0] text-[#7a6a80]', 'bg-[#f3ead9] text-[#8c6b32]']

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

  const count = `${children.length} enfant${children.length > 1 ? 's' : ''}`
  return <>
    <PageHeader title={isParent(user.role) ? 'Mes enfants' : 'Les enfants'} subtitle={loading ? undefined : isParent(user.role) ? count : `${count} inscrit${children.length > 1 ? 's' : ''}`} />
    <SearchField value={search} onChange={setSearch} placeholder="Rechercher un enfant" />
    <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Filtrer les fiches">
      {([['ALL', 'Tous'], ['ACTIVE', 'Actifs'], ['INACTIVE', 'Inactifs']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
        className={`min-h-9 shrink-0 rounded-full border px-4 text-xs font-semibold ${filter === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'}`}>{label}</button>)}
    </div>
    {knownGroups.length > 0 && <FormField label="Groupe" htmlFor="children-group" className="mt-3">
      <SelectField value={groupName} onChange={(event) => setGroupName(event.target.value)}>
        <option value="">Tous les groupes</option>
        {knownGroups.map((group) => <option key={group} value={group}>{group}</option>)}
      </SelectField>
    </FormField>}
    {!loading && error && <InlineError className="mt-4" message={error} onRetry={() => setAttempt((value) => value + 1)} />}
    <div className="mt-4 grid gap-3">
      {/* Carte enfant de la maquette : avatar rond à l'initiale, nom, « âge · groupe », chevron. */}
      {!loading && children.map((child) => <Link key={child.childId} to={`/enfants/${child.childId}`}
        className={`flex min-h-20 items-center gap-4 rounded-card border border-border bg-card px-4 py-3 hover:bg-muted ${child.isActive ? '' : 'opacity-60'}`}>
        <span className={`flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${avatarTones[child.childId % avatarTones.length]}`} aria-hidden="true">{child.firstName[0]}</span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-lg font-medium">{child.firstName} {child.lastName}</strong>
          <small className="block truncate text-sm text-muted-foreground">{[ageLabel(child.birthDate), child.groupName ? `Groupe des ${child.groupName}` : null].filter(Boolean).join(' · ')}</small>
        </span>
        {!child.isActive && <Tag tone="muted">Inactif</Tag>}
        <ChevronRight size={20} className="shrink-0 text-foreground" aria-hidden="true" />
      </Link>)}
      {loading && <p className="py-6 text-sm text-muted-foreground">Chargement...</p>}
      {!loading && !children.length && !error && <p className="py-6 text-sm text-muted-foreground">Aucun enfant trouvé.</p>}
    </div>
    {canEditChildren(user.role) && <Link to="/enfants/nouveau" className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={18} />Nouvel enfant</Link>}
  </>
}
