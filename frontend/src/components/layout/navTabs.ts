import { Baby, BookOpen, House, Menu, MessageCircle, Users, type LucideIcon } from 'lucide-react'
import { canUseMessaging, isParent } from '../../permissions.ts'
import type { Role } from '../../permissions.ts'

// end : l'onglet n'est actif que sur l'adresse exacte (utile pour l'accueil "/").
export type NavTab = { to: string; label: string; icon: LucideIcon; end?: boolean }

// Mêmes entrées pour la barre basse (mobile) et la barre latérale (desktop).
// La messagerie suit canUseMessaging (direction, EJE, parent : l'API refuse l'auxiliaire) ;
// l'annuaire et l'agenda ne sont pas livrés.
export function navTabsFor(role: Role): NavTab[] {
  const messages: NavTab[] = canUseMessaging(role) ? [{ to: '/messages', label: 'Messages', icon: MessageCircle }] : []
  return isParent(role) ? [
    { to: '/', label: 'Accueil', icon: House, end: true },
    { to: '/enfants', label: 'Mon enfant', icon: Baby },
    { to: '/bulletins', label: 'Bulletins', icon: BookOpen },
    ...messages,
    { to: '/plus', label: 'Mon espace', icon: Users },
  ] : [
    { to: '/', label: 'Accueil', icon: House, end: true },
    { to: '/enfants', label: 'Enfants', icon: Users },
    { to: '/bulletins', label: 'Bulletins', icon: BookOpen },
    ...messages,
    { to: '/plus', label: 'Plus', icon: Menu },
  ]
}
