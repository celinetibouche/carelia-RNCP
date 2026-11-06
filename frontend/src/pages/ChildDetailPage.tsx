import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { Baby, BookOpen, Info, Pencil, Save, UserPlus, Users, X } from 'lucide-react'
import { api, json, type Child, type DirectoryUser, type ParentLink, type References } from '../api.ts'
import { formatDay } from '../dates.ts'
import { useAuth } from '../useAuth.ts'
import { canEditChildren, canLinkParents, isStaff } from '../permissions.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button, IconButton } from '../components/ui/Button.tsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.tsx'
import { FormField, SelectField, TextInput } from '../components/ui/FormField.tsx'
import { InlineError, LoadingText } from '../components/ui/InlineStatus.tsx'
import { SectionCard } from '../components/ui/SectionCard.tsx'
import { StatusBadge } from '../components/ui/StatusBadge.tsx'

export function ChildDetailPage() {
  const { user } = useAuth()
  const { childId } = useParams()
  const id = Number(childId)
  const validId = Number.isSafeInteger(id) && id > 0
  const canEdit = canEditChildren(user.role)
  const staff = isStaff(user.role)
  const canLink = canLinkParents(user.role)
  const [child, setChild] = useState<Child | null>(null)
  const [form, setForm] = useState<Child | null>(null)
  const [parents, setParents] = useState<ParentLink[]>([])
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [parentRoleId, setParentRoleId] = useState(0)
  const [parentId, setParentId] = useState('')
  const [relationship, setRelationship] = useState('Parent')
  const [removeParentId, setRemoveParentId] = useState<number | null>(null)
  const [tab, setTab] = useState<'info' | 'family' | 'reports'>('info')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  const retryLoad = () => { setError(''); setLoading(true); setAttempt((value) => value + 1) }

  async function loadParents() {
    setParents(await api<ParentLink[]>(`/children/${id}/parents`))
  }

  useEffect(() => {
    if (!validId) return
    let cancelled = false
    Promise.all([
      api<Child>(`/children/${id}`),
      staff ? api<ParentLink[]>(`/children/${id}/parents`) : Promise.resolve([]),
      canLink ? api<DirectoryUser[]>('/users') : Promise.resolve([]),
      canLink ? api<References>('/references') : Promise.resolve(null),
    ]).then(([loaded, links, directory, references]) => {
      if (cancelled) return
      setChild(loaded); setForm(loaded); setParents(links); setUsers(directory)
      setParentRoleId(references?.roles.find((role) => role.label === 'PARENT')?.roleId ?? 0)
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, staff, canLink, validId, attempt])

  function update(values: Partial<Child>) { setForm((current) => current ? { ...current, ...values } : current) }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = await api<Child>(`/children/${id}`, json('PATCH', {
        firstName: form.firstName, lastName: form.lastName, birthDate: form.birthDate,
        groupName: form.groupName, emergencyContactName: form.emergencyContactName,
        emergencyContactPhone: form.emergencyContactPhone, isActive: form.isActive,
      }))
      setChild(saved); setForm(saved); setEditing(false); setNotice('Fiche enregistrée.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') }
    finally { setBusy(false) }
  }

  async function linkParent(event: FormEvent) {
    event.preventDefault()
    if (!parentId) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api(`/children/${id}/parents/${parentId}`, json('PUT', { relationship }))
      await loadParents()
      setParentId(''); setNotice('Parent lié à cet enfant.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Liaison impossible.') }
    finally { setBusy(false) }
  }

  async function unlinkParent() {
    if (removeParentId === null) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api(`/children/${id}/parents/${removeParentId}`, { method: 'DELETE' })
      await loadParents()
      setNotice('Lien supprimé.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Suppression impossible.') }
    finally { setBusy(false); setRemoveParentId(null) }
  }

  const availableParents = users.filter((person) => person.roleId === parentRoleId && person.isActive && !parents.some((link) => link.userId === person.userId))
  return <>
    <PageHeader title={isStaff(user.role) ? 'Fiche enfant' : 'Mon enfant'} showBack />
    {validId && loading && <LoadingText />}
    {(!validId || error) && <InlineError className="mb-4" message={validId ? error : 'Enfant introuvable.'} onRetry={validId && !child ? retryLoad : undefined} />}
    {notice && <p role="status" className="mb-4 text-sm text-secondary-foreground">{notice}</p>}
    {form && <>
      <div className="mb-5 flex min-h-[120px] items-center gap-4 rounded-[24px] bg-secondary px-4 py-5">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-[20px] bg-card text-primary"><Baby size={31} /></span>
        <span className="min-w-0"><strong className="block font-serif text-[23px] leading-tight">{form.firstName} {form.lastName}</strong>
          <small className="block text-muted-foreground">{form.groupName ?? 'Enfant'}</small>
          <StatusBadge tone={form.isActive ? 'success' : 'neutral'} className="mt-2">{form.isActive ? 'Fiche active' : 'Fiche inactive'}</StatusBadge>
        </span>
      </div>
      <div className="-mx-5 mb-5 flex gap-2 overflow-x-auto px-5 pb-1" role="tablist" aria-label="Fiche enfant">
        {([['info', 'Informations'], ...(staff ? [['family', 'Famille']] : []), ['reports', 'Bulletins']] as const).map(([value, label]) =>
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value as typeof tab)}
            className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold ${tab === value ? 'border-primary bg-accent text-primary' : 'border-border bg-card text-muted-foreground'}`}>{label}</button>)}
      </div>
      {tab === 'info' && <SectionCard title="Informations" icon={Info}>
      {canEdit && editing ? <form onSubmit={(event) => void save(event)} className="grid gap-4">
        <FormField label="Prénom" htmlFor="detail-first" required><TextInput maxLength={100} value={form.firstName} onChange={(event) => update({ firstName: event.target.value })} /></FormField>
        <FormField label="Nom" htmlFor="detail-last" required><TextInput maxLength={100} value={form.lastName} onChange={(event) => update({ lastName: event.target.value })} /></FormField>
        <FormField label="Date de naissance" htmlFor="detail-birth" required><TextInput type="date" value={form.birthDate} onChange={(event) => update({ birthDate: event.target.value })} /></FormField>
        <FormField label="Groupe" htmlFor="detail-group"><TextInput maxLength={100} value={form.groupName ?? ''} onChange={(event) => update({ groupName: event.target.value || null })} /></FormField>
        <FormField label="Contact d'urgence" htmlFor="detail-contact"><TextInput maxLength={150} value={form.emergencyContactName ?? ''} onChange={(event) => update({ emergencyContactName: event.target.value || null })} /></FormField>
        <FormField label="Téléphone d'urgence" htmlFor="detail-phone"><TextInput type="tel" maxLength={30} value={form.emergencyContactPhone ?? ''} onChange={(event) => update({ emergencyContactPhone: event.target.value || null })} /></FormField>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => update({ isActive: event.target.checked })} />Fiche active</label>
        <div className="flex gap-2"><Button type="submit" loading={busy} icon={<Save size={18} />}>Enregistrer</Button>
          <Button variant="outline" onClick={() => { setForm(child); setEditing(false) }}>Annuler</Button></div>
      </form> : <>
        <dl className="divide-y divide-border text-sm">
          {([['Date de naissance', formatDay(form.birthDate)], ['Section', form.groupName], ["Contact d'urgence", form.emergencyContactName], ["Téléphone d'urgence", form.emergencyContactPhone]] as const)
            .filter(([, value]) => Boolean(value)).map(([label, value]) => <div key={label} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <dt className="text-muted-foreground">{label}</dt><dd className="max-w-[55%] text-right font-semibold">{value}</dd></div>)}
        </dl>
        {canEdit && <Button variant="outline" className="mt-4 w-full rounded-full" icon={<Pencil size={17} />} onClick={() => setEditing(true)}>Modifier la fiche</Button>}
      </>}
      </SectionCard>}
      {tab === 'reports' && <SectionCard title="Bulletins" icon={BookOpen}>
        <Link to={`/bulletin?childId=${id}`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold text-primary"><BookOpen size={18} />Bulletin du jour</Link>
        <Link to="/bulletins" className="mt-3 inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-primary">Voir l'historique</Link>
      </SectionCard>}
      {staff && tab === 'family' && <SectionCard title="Famille" icon={Users}>
        <div className="divide-y divide-border">
          {parents.map((parent) => <div key={parent.userId} className="flex min-h-16 items-center gap-3 py-2">
            <span className="min-w-0 flex-1"><strong className="block">{parent.firstName} {parent.lastName}</strong><small className="text-muted-foreground">{parent.relationship} · {parent.email}</small></span>
            {canLink && <IconButton label={`Délier ${parent.firstName} ${parent.lastName}`} onClick={() => setRemoveParentId(parent.userId)}><X size={18} /></IconButton>}
          </div>)}
          {!parents.length && <p className="py-4 text-sm text-muted-foreground">Aucun parent lié.</p>}
        </div>
        {canLink && <form onSubmit={(event) => void linkParent(event)} className="mt-5 grid gap-3">
          <FormField label="Parent" htmlFor="link-parent" required>
            <SelectField value={parentId} onChange={(event) => setParentId(event.target.value)}>
              <option value="">Choisir un parent</option>
              {availableParents.map((person) => <option key={person.userId} value={person.userId}>{person.firstName} {person.lastName}</option>)}
            </SelectField>
          </FormField>
          <FormField label="Lien" htmlFor="link-relationship" required><TextInput maxLength={50} value={relationship} onChange={(event) => setRelationship(event.target.value)} /></FormField>
          <Button type="submit" variant="outline" loading={busy} disabled={!availableParents.length} icon={<UserPlus size={18} />}>Lier un parent</Button>
          <Link to="/utilisateurs" className="text-sm font-semibold text-primary">Gérer les comptes parents</Link>
        </form>}
      </SectionCard>}
    </>}
    <ConfirmDialog open={removeParentId !== null} title="Délier ce parent ?" description="Il n'aura plus accès aux bulletins de cet enfant." onConfirm={() => void unlinkParent()} onCancel={() => setRemoveParentId(null)} />
  </>
}
