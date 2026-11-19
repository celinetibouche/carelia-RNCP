import { Baby, Bell, BookOpen, ChevronRight, LogOut, MessageCircle, UserCog } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button } from '../components/ui/Button.tsx'
import { canUseMessaging, canViewDirectory, isParent } from '../permissions.ts'
import { useAuth } from '../useAuth.ts'

export function MorePage() {
  const { user, logout } = useAuth()
  const parent = isParent(user.role)
  const role = { DAYCARE_ADMIN: 'Direction', EJE: 'Éducateur de jeunes enfants', AUXILIARY: 'Auxiliaire', PARENT: 'Parent' }[user.role]
  const links = [
    { to: '/enfants', title: parent ? 'Mon enfant' : 'Enfants', subtitle: parent ? 'Fiche de mon enfant' : undefined, icon: Baby },
    { to: '/bulletins', title: 'Bulletins', subtitle: parent ? 'Les journées de mon enfant' : undefined, icon: BookOpen },
    ...(canUseMessaging(user.role) ? [{ to: '/messages', title: 'Messages', subtitle: parent ? 'Échanges avec la crèche' : undefined, icon: MessageCircle }] : []),
    ...(canUseMessaging(user.role) ? [{ to: '/notifications', title: 'Notifications', subtitle: undefined, icon: Bell }] : []),
    // Gestion des comptes : la page existait sans accès par le menu ; la direction gère, les EJE consultent.
    ...(canViewDirectory(user.role) ? [{ to: '/utilisateurs', title: 'Utilisateurs', subtitle: "Comptes de l'équipe et des parents", icon: UserCog }] : []),
  ]
  return <>
    <PageHeader title={parent ? 'Mon espace' : 'Plus'} />
    {/* Carte profil de la maquette : avatar rond à initiales, nom à empattement, rôle et e-mail. */}
    <div className="mb-5 flex items-center gap-5 rounded-card border border-border bg-[#e5d5c5] px-5 py-6">
      <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[#d4bcab] text-xl font-semibold text-primary" aria-hidden="true">{user.firstName[0]}{user.lastName[0]}</span>
      <span className="min-w-0"><strong className="block font-serif text-2xl font-semibold">{user.firstName} {user.lastName}</strong>
        <small className="mt-1 block text-sm">{role}</small><small className="mt-2 block truncate text-xs text-muted-foreground">{user.email}</small></span>
    </div>
    {/* Une seule carte de liens séparés par des traits. */}
    <nav aria-label="Rubriques" className="divide-y divide-border rounded-card border border-border bg-card px-4">
      {links.map(({ to, title, subtitle, icon: Icon }) => <Link key={to} to={to} className="flex min-h-16 items-center gap-4 py-3 hover:text-primary">
        <Icon size={21} className="shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1"><strong className="block text-sm">{title}</strong>{subtitle && <small className="block text-xs text-muted-foreground">{subtitle}</small>}</span>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>)}
    </nav>
    <Button variant="outline" className="mt-6 min-h-12 w-full" icon={<LogOut size={18} />} onClick={() => void logout()}>Se déconnecter</Button>
  </>
}
