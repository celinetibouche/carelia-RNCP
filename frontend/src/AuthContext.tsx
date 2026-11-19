import { useEffect, useState, type ReactNode } from 'react'
import { Bird } from 'lucide-react'
import { api, json, type User } from './api.ts'
import { Button } from './components/ui/Button.tsx'
import { FormField, TextInput } from './components/ui/FormField.tsx'
import { AuthContext } from './useAuth.ts'

// Logo de la maquette E1 : pastille brune avec un oiseau, nom à empattement et devise.
function Brand() {
  return <div className="carelia-brand">
    <div className="carelia-brand-logo">
      <span className="carelia-brand-symbol" aria-hidden="true"><Bird size={26} strokeWidth={1.8} /></span>
      <h1>Carelia</h1>
    </div>
    <p>Le lien doux entre la crèche et la maison.</p>
  </div>
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
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
    const expired = () => setUser(null)
    window.addEventListener('carelia:unauthorized', expired)
    return () => { active = false; window.removeEventListener('carelia:unauthorized', expired) }
  }, [])

  // Un seul formulaire pour tous : c'est le rôle renvoyé par le serveur qui décide de l'espace affiché
  // (parent ou équipe). Les droits restent vérifiés côté serveur à chaque requête.
  async function onLogin(event: React.FormEvent) {
    event.preventDefault()
    setError(''); setSubmitting(true)
    try {
      const result = await api<{ user: User }>('/auth/login', json('POST', { email, password }))
      setUser(result.user); setPassword('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Connexion impossible.') }
    finally { setSubmitting(false) }
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }) }
    finally { setUser(null) }
  }

  if (loading) return <main className="carelia-entry carelia-splash" aria-label="Ouverture de Carelia">
    <Brand />
    <span className="carelia-loader" role="status" aria-label="Chargement" />
  </main>

  if (!user) return <main className="carelia-entry">
    <Brand />
    <section className="carelia-entry-content" aria-labelledby="login-heading">
      <h2 id="login-heading">Ravie de vous revoir</h2>
      <p>Connectez-vous à votre espace sécurisé.</p>
      <form onSubmit={onLogin} className="grid gap-4">
        <FormField label="Adresse e-mail" htmlFor="login-email" required>
          <TextInput type="email" required autoComplete="username" placeholder="camille@exemple.fr" value={email} onChange={(event) => setEmail(event.target.value)} className="bg-card" />
        </FormField>
        <FormField label="Mot de passe" htmlFor="login-password" required>
          <TextInput type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="bg-card" />
        </FormField>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" loading={submitting} className="mt-2 min-h-12 w-full">Se connecter</Button>
      </form>
    </section>
  </main>

  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>
}
