import { Baby, Bell, BookOpen, ChevronRight, LogOut, MessageCircle } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Avatar } from '../components/shared/Avatar.tsx'
import { PersonListItem } from '../components/shared/PersonListItem.tsx'
import { Button } from '../components/ui/Button.tsx'
import { canUseMessaging, isParent } from '../permissions.ts'
import { useAuth } from '../useAuth.ts'

export function MorePage() {
  const { user, logout } = useAuth()
  const parent = isParent(user.role)
  const role = { DAYCARE_ADMIN: 'Direction', EJE: 'Éducateur de jeunes enfants', AUXILIARY: 'Auxiliaire', PARENT: 'Parent' }[user.role]
  const links = [
    // L'annuaire (/utilisateurs) est hors périmètre de cette livraison : aucune entrée de menu.
    { to: '/enfants', title: parent ? 'Mon enfant' : 'Enfants', subtitle: parent ? 'Fiche de mon enfant' : 'Fiches et contacts des familles', icon: Baby },
    { to: '/bulletins', title: 'Bulletins', subtitle: parent ? 'Les journées de mon enfant' : 'Historique des journées', icon: BookOpen },
    ...(canUseMessaging(user.role) ? [{ to: '/messages', title: 'Messages', subtitle: 'Échanges avec la crèche', icon: MessageCircle }] : []),
    ...(canUseMessaging(user.role) ? [{ to: '/notifications', title: 'Notifications', subtitle: parent ? 'Bulletins et messages' : 'Nouveaux messages', icon: Bell }] : []),
  ]
  return <>
    <PageHeader title={parent ? 'Mon espace' : 'Plus'} />
    <div className="mb-5 flex min-h-24 items-center gap-4 rounded-card bg-secondary px-4 py-4">
      <Avatar name={`${user.firstName} ${user.lastName}`} size="lg" className="bg-card" />
      <span className="min-w-0"><strong className="block text-sm">{user.firstName} {user.lastName}</strong><small className="block truncate text-muted-foreground">{role} · {user.email}</small></span>
    </div>
    <div className="grid gap-2">
      {links.map(({ to, title, subtitle, icon: Icon }) => <PersonListItem key={to} to={to} name={title} description={subtitle}
        leading={<span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><Icon size={21} /></span>}
        trailing={<ChevronRight size={18} className="text-muted-foreground" aria-hidden="true" />} />)}
    </div>
    <Button variant="outline" className="mt-5 w-full" icon={<LogOut size={18} />} onClick={() => void logout()}>Se déconnecter</Button>
  </>
}
