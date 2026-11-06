import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, Baby, HeartHandshake, Users } from 'lucide-react'
import { api, json, type User } from './api.ts'
import { Button } from './components/ui/Button.tsx'
import { FormField, TextInput } from './components/ui/FormField.tsx'
import { AuthContext } from './useAuth.ts'

type Profile = 'parent' | 'team' | 'direction'
const profileLabel: Record<Profile, string> = { parent: 'Parent', team: 'Équipe', direction: 'Direction' }

function matchesProfile(role: User['role'], profile: Profile) {
  if (profile === 'parent') return role === 'PARENT'
  if (profile === 'direction') return role === 'DAYCARE_ADMIN'
  return role === 'EJE' || role === 'AUXILIARY'
}

function Brand({ subtitle }: { subtitle: string }) {
  return <div className="carelia-brand">
    <div className="carelia-brand-symbol" aria-hidden="true"><Baby size={43} strokeWidth={1.7} /></div>
    <h1>Carelia</h1><p>{subtitle}</p>
  </div>
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    const splash = new Promise<void>((resolve) => window.setTimeout(resolve, 900))
    Promise.all([api<User>('/auth/me').catch(() => null), splash]).then(([session]) => {
      if (active) { setUser(session); setLoading(false) }
    })
    const expired = () => { setUser(null); setProfile(null) }
    window.addEventListener('carelia:unauthorized', expired)
    return () => { active = false; window.removeEventListener('carelia:unauthorized', expired) }
  }, [])

  async function onLogin(event: React.FormEvent) {
    event.preventDefault()
    if (!profile) return
    setError(''); setSubmitting(true)
    try {
      const result = await api<{ user: User }>('/auth/login', json('POST', { email, password }))
      if (!matchesProfile(result.user.role, profile)) {
        await api('/auth/logout', { method: 'POST' })
        setError(`Ce compte ne correspond pas au profil « ${profileLabel[profile]} ».`)
        return
      }
      setUser(result.user); setPassword('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Connexion impossible.') }
    finally { setSubmitting(false) }
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }) }
    finally { setUser(null); setProfile(null) }
  }

  if (loading) return <main className="carelia-entry carelia-splash" aria-label="Ouverture de Carelia">
    <Brand subtitle="Le lien quotidien entre la crèche et les familles" />
    <span className="carelia-loader" role="status" aria-label="Chargement" />
  </main>

  if (!user && !profile) return <main className="carelia-entry">
    <Brand subtitle="Bienvenue dans votre espace crèche" />
    <section className="carelia-entry-content" aria-labelledby="profile-heading">
      <h2 id="profile-heading">Vous êtes…</h2>
      <p>Choisissez votre espace pour vous connecter.</p>
      <button className="carelia-profile-card" onClick={() => setProfile('parent')}>
        <span className="carelia-profile-icon"><HeartHandshake size={25} /></span>
        <span><strong>Un parent</strong><small>Suivre mon enfant et écrire à la crèche</small></span>
      </button>
      <button className="carelia-profile-card" onClick={() => setProfile('team')}>
        <span className="carelia-profile-icon"><Users size={25} /></span>
        <span><strong>Un professionnel</strong><small>Équipe éducative ou direction</small></span>
      </button>
    </section>
  </main>

  if (!user) return <main className="carelia-entry">
    <Brand subtitle={profile === 'parent' ? 'Espace parents' : 'Espace professionnels'} />
    <section className="carelia-entry-content" aria-labelledby="login-heading">
      <button className="carelia-back" type="button" onClick={() => { setProfile(null); setError('') }}><ArrowLeft size={18} /> Changer de profil</button>
      {profile !== 'parent' && <div className="carelia-role-switch" role="group" aria-label="Espace professionnel">
        <button type="button" aria-pressed={profile === 'team'} onClick={() => { setProfile('team'); setError('') }}>Équipe</button>
        <button type="button" aria-pressed={profile === 'direction'} onClick={() => { setProfile('direction'); setError('') }}>Direction</button>
      </div>}
      <h2 id="login-heading">Connexion {profileLabel[profile!]}</h2>
      <form onSubmit={onLogin} className="grid gap-4">
        <FormField label="Adresse e-mail" htmlFor="login-email" required>
          <TextInput type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="bg-background" />
        </FormField>
        <FormField label="Mot de passe" htmlFor="login-password" required>
          <TextInput type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="bg-background" />
        </FormField>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" loading={submitting} className="w-full">Se connecter</Button>
      </form>
    </section>
  </main>

  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>
}
