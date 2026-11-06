import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Save } from 'lucide-react'
import { api, json, type Child } from '../api.ts'
import { useAuth } from '../useAuth.ts'
import { canEditChildren } from '../permissions.ts'
import { AccessDenied } from '../components/shared/AccessDenied.tsx'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button } from '../components/ui/Button.tsx'
import { FormField, TextInput } from '../components/ui/FormField.tsx'
import { SectionCard } from '../components/ui/SectionCard.tsx'
import { Baby } from 'lucide-react'

export function ChildFormPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [groupName, setGroupName] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const child = await api<Child>('/children', json('POST', {
        firstName, lastName, birthDate, groupName: groupName || null,
        emergencyContactName: emergencyContactName || null,
        emergencyContactPhone: emergencyContactPhone || null,
      }))
      navigate(`/enfants/${child.childId}`, { replace: true })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Création impossible.') }
    finally { setBusy(false) }
  }

  if (!canEditChildren(user.role)) return <AccessDenied showBack />
  return <>
    <PageHeader title="Nouvel enfant" showBack />
    <form onSubmit={(event) => void submit(event)}>
      <SectionCard title="Informations" icon={Baby} className="grid gap-4">
      <FormField label="Prénom" htmlFor="child-first" required><TextInput maxLength={100} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></FormField>
      <FormField label="Nom" htmlFor="child-last" required><TextInput maxLength={100} value={lastName} onChange={(event) => setLastName(event.target.value)} /></FormField>
      <FormField label="Date de naissance" htmlFor="child-birth" required><TextInput type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></FormField>
      <FormField label="Groupe" htmlFor="child-group"><TextInput maxLength={100} value={groupName} onChange={(event) => setGroupName(event.target.value)} /></FormField>
      <FormField label="Contact d'urgence" htmlFor="child-contact"><TextInput maxLength={150} value={emergencyContactName} onChange={(event) => setEmergencyContactName(event.target.value)} /></FormField>
      <FormField label="Téléphone d'urgence" htmlFor="child-phone"><TextInput type="tel" maxLength={30} value={emergencyContactPhone} onChange={(event) => setEmergencyContactPhone(event.target.value)} /></FormField>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </SectionCard>
      <Button type="submit" loading={busy} icon={<Save size={18} />} className="mt-4 w-full rounded-full">Créer la fiche</Button>
    </form>
  </>
}
