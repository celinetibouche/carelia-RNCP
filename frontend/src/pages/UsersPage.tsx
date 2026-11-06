import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { api, json, type DirectoryUser, type References } from '../api.ts'
import { useAuth } from '../useAuth.ts'
import { canManageDirectory, canViewDirectory } from '../permissions.ts'
import { AccessDenied } from '../components/shared/AccessDenied.tsx'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button } from '../components/ui/Button.tsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.tsx'
import { PersonListItem } from '../components/shared/PersonListItem.tsx'
import { FormField, SelectField, TextInput } from '../components/ui/FormField.tsx'

type UserForm = {
  firstName: string; lastName: string; email: string; phone: string;
  roleId: number; password: string; isActive: boolean
}
const emptyForm = (roleId: number): UserForm => ({
  firstName: '', lastName: '', email: '', phone: '', roleId, password: '', isActive: true,
})

export function UsersPage() {
  const { user } = useAuth()
  const canManage = canManageDirectory(user.role)
  const canRead = canViewDirectory(user.role)
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [references, setReferences] = useState<References | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<UserForm>(emptyForm(0))
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function reload() { setUsers(await api<DirectoryUser[]>('/users')) }
  useEffect(() => {
    if (!canRead) return
    let cancelled = false
    Promise.all([api<DirectoryUser[]>('/users'), api<References>('/references')])
      .then(([directory, refs]) => {
        if (cancelled) return
        setUsers(directory); setReferences(refs)
        setForm(emptyForm(refs.roles.find((role) => role.label === 'PARENT')?.roleId ?? 0))
      }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Utilisateurs indisponibles.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [canRead])

  function edit(person: DirectoryUser) {
    setEditingId(person.userId)
    setForm({ firstName: person.firstName, lastName: person.lastName, email: person.email,
      phone: person.phone ?? '', roleId: person.roleId, password: '', isActive: person.isActive })
    setError(''); setNotice('')
  }
  function create() {
    setEditingId(0)
    setForm(emptyForm(references?.roles.find((role) => role.label === 'PARENT')?.roleId ?? 0))
    setError(''); setNotice('')
  }
  function update(values: Partial<UserForm>) { setForm((current) => ({ ...current, ...values })) }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (editingId === null) return
    setBusy(true); setError(''); setNotice('')
    try {
      const payload = { firstName: form.firstName, lastName: form.lastName, email: form.email,
        phone: form.phone || null, roleId: form.roleId, isActive: form.isActive,
        ...(form.password ? { password: form.password } : {}) }
      if (editingId === 0) {
        await api('/users', json('POST', { ...payload, daycareId: user.daycareId, password: form.password }))
        setNotice('Compte créé.')
      } else {
        await api(`/users/${editingId}`, json('PATCH', payload))
        setNotice('Compte enregistré.')
      }
      await reload()
      setEditingId(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') }
    finally { setBusy(false) }
  }

  async function remove() {
    if (deleteId === null) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api(`/users/${deleteId}`, { method: 'DELETE' })
      await reload()
      setNotice('Compte supprimé.')
      setEditingId(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Suppression impossible.') }
    finally { setBusy(false); setDeleteId(null) }
  }

  if (!canRead) return <AccessDenied showBack />
  const roleLabel = (roleId: number) => references?.roles.find((role) => role.roleId === roleId)?.label ?? 'Rôle'
  return <>
    <PageHeader title="Utilisateurs" showBack />
    {canManage && editingId === null && <Button variant="outline" icon={<Plus size={18} />} onClick={create} className="mb-5 w-full rounded-full">Créer un compte</Button>}
    {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="mb-4 text-sm text-secondary-foreground">{notice}</p>}
    {editingId !== null && canManage && <form onSubmit={(event) => void save(event)} className="mb-5 grid gap-4 rounded-[22px] border border-border bg-card p-4">
      <h2 className="text-xl">{editingId === 0 ? 'Nouveau compte' : 'Modifier le compte'}</h2>
      <FormField label="Prénom" htmlFor="user-first" required><TextInput maxLength={100} value={form.firstName} onChange={(event) => update({ firstName: event.target.value })} /></FormField>
      <FormField label="Nom" htmlFor="user-last" required><TextInput maxLength={100} value={form.lastName} onChange={(event) => update({ lastName: event.target.value })} /></FormField>
      <FormField label="Adresse e-mail" htmlFor="user-email" required><TextInput type="email" maxLength={320} value={form.email} onChange={(event) => update({ email: event.target.value })} /></FormField>
      <FormField label="Rôle" htmlFor="user-role" required><SelectField value={form.roleId || ''} onChange={(event) => update({ roleId: Number(event.target.value) })}>
        <option value="">Choisir un rôle</option>
        {references?.roles.map((role) => <option key={role.roleId} value={role.roleId}>{role.label}</option>)}
      </SelectField></FormField>
      <FormField label="Téléphone" htmlFor="user-phone"><TextInput type="tel" maxLength={30} value={form.phone} onChange={(event) => update({ phone: event.target.value })} /></FormField>
      <FormField label={editingId === 0 ? 'Mot de passe' : 'Nouveau mot de passe'} htmlFor="user-password" required={editingId === 0}>
        <TextInput type="password" minLength={8} maxLength={72} autoComplete="new-password" value={form.password} onChange={(event) => update({ password: event.target.value })} />
      </FormField>
      {editingId !== 0 && <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => update({ isActive: event.target.checked })} />Compte actif</label>}
      <div className="flex gap-2"><Button type="submit" loading={busy} icon={<Save size={18} />}>Enregistrer</Button><Button variant="outline" onClick={() => setEditingId(null)}>Annuler</Button></div>
      {editingId > 0 && editingId !== user.userId && <Button variant="danger" icon={<Trash2 size={18} />} onClick={() => setDeleteId(editingId)}>Supprimer le compte</Button>}
    </form>}
    <div className="grid gap-2">
      {users.map((person) => <PersonListItem key={person.userId}
        name={`${person.firstName} ${person.lastName}`} description={`${roleLabel(person.roleId)} · ${person.email}`}
        status={person.isActive ? undefined : 'Inactif'} statusTone="neutral"
        trailing={canManage ? <Button variant="outline" size="sm" onClick={() => edit(person)}>Modifier</Button> : undefined} />)}
      {!users.length && !loading && !error && <p className="py-6 text-sm text-muted-foreground">Aucun utilisateur.</p>}
      {loading && <p className="py-6 text-sm text-muted-foreground">Chargement...</p>}
    </div>
    <ConfirmDialog open={deleteId !== null} title="Supprimer ce compte ?" description="Cette action est définitive. Un compte lié à un enfant peut être protégé par la base de données." onConfirm={() => void remove()} onCancel={() => setDeleteId(null)} />
  </>
}
