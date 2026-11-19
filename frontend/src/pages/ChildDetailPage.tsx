import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { BookOpen, CalendarDays, Pencil, Save, UserPlus, X } from 'lucide-react'
import { api, json, type Child, type DirectoryUser, type ParentLink, type References } from '../api.ts'
import { ageLabel, formatDay } from '../dates.ts'
import { useAuth } from '../useAuth.ts'
import { canEditChildren, canLinkParents, isStaff } from '../permissions.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button, IconButton } from '../components/ui/Button.tsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.tsx'
import { FormField, SelectField, TextInput } from '../components/ui/FormField.tsx'
import { InlineError, LoadingText } from '../components/ui/InlineStatus.tsx'
import { Tag } from '../components/ui/Tag.tsx'

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
    <PageHeader title={form ? `Profil de ${form.firstName}` : isStaff(user.role) ? 'Fiche enfant' : 'Mon enfant'} showBack />
    {validId && loading && <LoadingText />}
    {(!validId || error) && <InlineError className="mb-4" message={validId ? error : 'Enfant introuvable.'} onRetry={validId && !child ? retryLoad : undefined} />}
    {notice && <p role="status" className="mb-4 text-sm text-secondary-foreground">{notice}</p>}
    {form && <>
      {/* Maquette S3 : une seule page qui défile (plus d'onglets), portrait centré puis cartes. */}
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="flex size-24 items-center justify-center rounded-full border border-[#d9cbbd] bg-secondary p-1.5" aria-hidden="true">
          <span className="flex size-full items-center justify-center rounded-full bg-[#e5d5c5] font-serif text-3xl text-primary">{form.firstName[0]}{form.lastName[0]}</span>
        </span>
        <strong className="mt-4 block font-serif text-2xl font-semibold">{form.firstName} {form.lastName}</strong>
        <small className="mt-1 block text-sm text-muted-foreground">{[ageLabel(form.birthDate), form.groupName].filter(Boolean).join(' · ')}</small>
        {!form.isActive && <Tag tone="muted" className="mt-2">Fiche inactive</Tag>}
      </div>

      <Card title="Informations">
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
      </form> : <dl className="divide-y divide-border text-sm">
          {([['Date de naissance', formatDay(form.birthDate)], ['Groupe', form.groupName], ["Contact d'urgence", form.emergencyContactName], ["Téléphone d'urgence", form.emergencyContactPhone]] as const)
            .filter(([, value]) => Boolean(value)).map(([label, value]) => <div key={label} className="flex min-h-12 items-center justify-between gap-3 py-2">
              <dt className="text-muted-foreground">{label}</dt><dd className="max-w-[55%] text-right font-semibold">{value}</dd></div>)}
        </dl>}
      </Card>

      {staff && <Card title="Contacts des parents">
        <div className="divide-y divide-border">
          {parents.map((parent) => <div key={parent.userId} className="flex min-h-16 items-center gap-3 py-2">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary" aria-hidden="true">{parent.firstName[0]}{parent.lastName[0]}</span>
            <span className="min-w-0 flex-1"><strong className="block text-sm">{parent.firstName} {parent.lastName}</strong><small className="text-xs text-muted-foreground">{parent.relationship} · {parent.email}</small></span>
            {canLink && <IconButton label={`Délier ${parent.firstName} ${parent.lastName}`} className="text-destructive" onClick={() => setRemoveParentId(parent.userId)}><X size={18} /></IconButton>}
          </div>)}
          {!parents.length && <p className="py-4 text-sm text-muted-foreground">Aucun parent lié.</p>}
        </div>
        {canLink && <form onSubmit={(event) => void linkParent(event)} className="mt-5 grid gap-3">
          <FormField label="Lier un parent" htmlFor="link-parent" required>
            <SelectField value={parentId} onChange={(event) => setParentId(event.target.value)}>
              <option value="">Choisir un parent</option>
              {availableParents.map((person) => <option key={person.userId} value={person.userId}>{person.firstName} {person.lastName}</option>)}
            </SelectField>
          </FormField>
          <FormField label="Lien" htmlFor="link-relationship" required><TextInput maxLength={50} value={relationship} onChange={(event) => setRelationship(event.target.value)} /></FormField>
          <Button type="submit" variant="outline" loading={busy} disabled={!availableParents.length} icon={<UserPlus size={18} />}>Lier ce parent</Button>
          <Link to="/utilisateurs" className="text-sm font-semibold text-primary">Gérer les comptes parents</Link>
        </form>}
      </Card>}

      <div className="grid gap-3">
        {canEdit && !editing && <Button variant="outline" className="min-h-12 w-full" icon={<Pencil size={17} />} onClick={() => setEditing(true)}>Modifier la fiche</Button>}
        <Link to={`/bulletin?childId=${id}`} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold text-primary"><BookOpen size={18} />Bulletin du jour</Link>
        {/* Les absences de l'enfant arrivent avec F3 : bouton prévu par la maquette, désactivé pour l'instant. */}
        <Button variant="outline" disabled className="min-h-12 w-full" icon={<CalendarDays size={17} />}>Absences (bientôt)</Button>
      </div>
    </>}
    <ConfirmDialog open={removeParentId !== null} title="Délier ce parent ?" description="Il n'aura plus accès aux bulletins de cet enfant." onConfirm={() => void unlinkParent()} onCancel={() => setRemoveParentId(null)} />
  </>
}

// Carte blanche à titre simple de la maquette (« Informations », « Contacts des parents »).
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mb-4 rounded-card border border-border bg-card p-5">
    <h2 className="mb-2 font-sans text-lg font-medium">{title}</h2>
    {children}
  </section>
}
