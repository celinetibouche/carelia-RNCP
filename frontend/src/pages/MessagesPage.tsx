import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { api, json, type Child, type Conversation, type ConversationPage, type ParentLink } from '../api.ts'
import { formatShortTime } from '../dates.ts'
import { appendConversations, reloadConversations } from '../messagingSync.ts'
import { useAuth } from '../useAuth.ts'
import { useMessagingEvents } from '../useMessagingEvents.ts'
import { canUseMessaging, isParent } from '../permissions.ts'
import { AccessDenied } from '../components/shared/AccessDenied.tsx'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Avatar } from '../components/shared/Avatar.tsx'
import { SearchField } from '../components/shared/SearchField.tsx'
import { Button } from '../components/ui/Button.tsx'
import { FormField, SelectField } from '../components/ui/FormField.tsx'
import { InlineError, LoadingText } from '../components/ui/InlineStatus.tsx'

const pageSize = 30

export function MessagesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const allowed = canUseMessaging(user.role)
  const parent = isParent(user.role)
  const [items, setItems] = useState<Conversation[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [children, setChildren] = useState<Child[]>([])
  const [parents, setParents] = useState<ParentLink[]>([])
  const [parentsFor, setParentsFor] = useState('')
  const [childId, setChildId] = useState('')
  const [parentId, setParentId] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(allowed)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [moreError, setMoreError] = useState('')
  const [childrenError, setChildrenError] = useState('')
  const itemsRef = useRef<Conversation[]>([])
  const searchRef = useRef('')
  const requestSeq = useRef(0)

  const commit = useCallback((next: Conversation[]) => { itemsRef.current = next; setItems(next) }, [])
  const fetchPage = useCallback((offset: number, limit: number) =>
    api<ConversationPage>(`/conversations?limit=${limit}&offset=${offset}&search=${encodeURIComponent(searchRef.current.trim())}`), [])

  // reset : nouvelle recherche, on repart de la première page. Sinon (événement, reconnexion), on recharge
  // toute la hauteur déjà affichée pour resynchroniser liste et compteurs sans perdre la pagination.
  // Seule la réponse à la demande la plus récente est appliquée.
  const reload = useCallback(async (reset: boolean) => {
    if (!allowed) return
    const seq = ++requestSeq.current
    if (reset) setLoading(true)
    try {
      const result = await reloadConversations(fetchPage, reset ? 0 : itemsRef.current.length, pageSize)
      if (seq !== requestSeq.current) return
      commit(result.items)
      setTotal(result.total)
      setListError('')
      setMoreError('')
    } catch (reason) {
      if (seq === requestSeq.current) setListError(reason instanceof Error ? reason.message : 'Chargement impossible.')
    } finally { if (seq === requestSeq.current) setLoading(false) }
  }, [allowed, fetchPage, commit])

  useEffect(() => {
    searchRef.current = search
    // Pas d'attente au premier affichage ni quand on efface la recherche ; sinon on laisse finir la frappe.
    const timer = setTimeout(() => { void reload(true) }, search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [search, reload])
  useMessagingEvents({ onChange: () => void reload(false), onResync: () => void reload(false) }, allowed)

  async function loadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    setMoreError('')
    try {
      const page = await fetchPage(itemsRef.current.length, pageSize)
      // Les conversations changent d'ordre au fil de l'activité : la fusion écarte les doublons.
      commit(appendConversations(itemsRef.current, page.items))
      setTotal(page.total)
    } catch (reason) { setMoreError(reason instanceof Error ? reason.message : 'Chargement impossible.') }
    finally { setLoadingMore(false) }
  }

  const loadChildren = useCallback(() => {
    if (!allowed) return
    api<Child[]>('/children').then((list) => { setChildren(list); setChildrenError('') })
      .catch((reason) => setChildrenError(reason instanceof Error ? reason.message : 'Enfants indisponibles.'))
  }, [allowed])
  useEffect(() => { loadChildren() }, [loadChildren])

  const activeChildren = children.filter((child) => child.isActive)
  // Valeurs dérivées plutôt que copiées dans l'état : un seul enfant (cas courant d'un parent) ou un seul
  // parent lié est choisi d'office, sans effet de bord ni rendu en cascade.
  const effectiveChildId = childId || (activeChildren.length === 1 ? String(activeChildren[0].childId) : '')
  const selectedChild = activeChildren.find((child) => String(child.childId) === effectiveChildId)
  const parentsLoading = Boolean(effectiveChildId) && !parent && parentsFor !== effectiveChildId
  const childParents = parentsFor === effectiveChildId ? parents : []
  const effectiveParentId = parentId || (childParents.length === 1 ? String(childParents[0].userId) : '')

  // Parents liés à l'enfant choisi (équipe) ; une réponse périmée (enfant changé entre-temps) est ignorée.
  useEffect(() => {
    if (!effectiveChildId || parent) return
    let cancelled = false
    api<ParentLink[]>(`/children/${effectiveChildId}/parents`)
      .then((list) => { if (!cancelled) { setParents(list); setParentsFor(effectiveChildId) } })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Parents indisponibles.') })
    return () => { cancelled = true }
  }, [effectiveChildId, parent])

  function chooseChild(value: string) {
    setChildId(value)
    setParentId('')
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await api<Conversation>('/conversations', json('POST', {
        childId: Number(effectiveChildId), ...(!parent ? { parentId: Number(effectiveParentId) } : {}),
      }))
      navigate(`/messages/${result.conversationId}`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Création impossible.') }
    finally { setSaving(false) }
  }

  if (!allowed) return <AccessDenied />
  return <>
    <PageHeader title="Messages" />
    <SearchField value={search} onChange={setSearch} label="Rechercher une discussion" placeholder="Rechercher une discussion" className="mb-4" />
    <Button className="mb-4 w-full rounded-xl" icon={<Plus size={17} />} onClick={() => setCreating(!creating)} aria-expanded={creating}>Créer une discussion</Button>
    {creating && <form onSubmit={(event) => void create(event)} className="mb-5 grid gap-3 rounded-card border border-border bg-card p-4">
      <h2 className="text-lg">Écrire à {parent ? 'la crèche' : 'un parent'}</h2>
      <FormField label="Enfant" htmlFor="message-child" required hint={selectedChild ? `La discussion portera sur ${selectedChild.firstName} ${selectedChild.lastName}.` : undefined}>
        <SelectField value={effectiveChildId} onChange={(event) => chooseChild(event.target.value)}>
          <option value="">Choisir un enfant</option>
          {activeChildren.map((child) => <option key={child.childId} value={child.childId}>{child.firstName} {child.lastName}</option>)}
        </SelectField>
      </FormField>
      {!parent && <FormField label="Parent" htmlFor="message-parent" required
        hint={effectiveChildId && parentsLoading ? 'Chargement des parents…' : effectiveChildId && !childParents.length ? 'Aucun parent n’est lié à cet enfant : liez-en un depuis sa fiche.' : undefined}>
        <SelectField value={effectiveParentId} onChange={(event) => setParentId(event.target.value)} disabled={!effectiveChildId || !childParents.length}>
          <option value="">Choisir un parent lié à l’enfant</option>
          {childParents.map((person) => <option key={person.userId} value={person.userId}>{person.firstName} {person.lastName}</option>)}
        </SelectField>
      </FormField>}
      <Button type="submit" loading={saving} disabled={!effectiveChildId || (!parent && !effectiveParentId)}>Ouvrir la discussion</Button>
    </form>}
    {creating && childrenError && <InlineError className="mb-3" message={childrenError} onRetry={loadChildren} />}
    {error && <InlineError className="mb-3" message={error} />}
    {listError && <InlineError className="mb-3" message={listError} onRetry={() => void reload(false)} />}
    <div className="grid gap-2">
      {items.map((item) => {
        const name = parent ? `${item.childFirstName} ${item.childLastName}` : `${item.parentFirstName} ${item.parentLastName}`
        const description = parent ? 'Équipe de la crèche' : `À propos de ${item.childFirstName} ${item.childLastName}`
        return <Link key={item.conversationId} to={`/messages/${item.conversationId}`}
          className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-card p-3 text-left hover:bg-accent">
          <Avatar name={name} className="rounded-xl bg-muted! text-foreground!" />
          <span className="min-w-0">
            <b className="block truncate text-sm">{name}</b>
            <span className="block truncate text-xs text-muted-foreground">{description}</span>
          </span>
          <span className="flex flex-col items-end gap-1 text-[10px] text-muted-foreground">
            <time dateTime={item.lastActivityAt}>{formatShortTime(item.lastActivityAt)}</time>
            {item.unreadCount > 0 && <b className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">
              {item.unreadCount}<span className="sr-only"> message{item.unreadCount > 1 ? 's' : ''} non lu{item.unreadCount > 1 ? 's' : ''}</span>
            </b>}
          </span>
        </Link>
      })}
      {!loading && !items.length && !listError && <p className="py-8 text-center text-sm text-muted-foreground">Aucune discussion pour le moment.</p>}
      {loading && <LoadingText />}
      {moreError && <InlineError message={`Discussions suivantes indisponibles : ${moreError}`} onRetry={() => void loadMore()} />}
      {!loading && !moreError && items.length < total && <Button variant="outline" loading={loadingMore} onClick={() => void loadMore()}>Voir plus de discussions</Button>}
    </div>
  </>
}
