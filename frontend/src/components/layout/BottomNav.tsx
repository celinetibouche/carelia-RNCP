import { NavLink } from 'react-router'
import { useAuth } from '../../useAuth.ts'
import { navTabsFor } from './navTabs.ts'

// Navigation : barre basse, identique sur téléphone et ordinateur.
// Style de la maquette : fond crème translucide, onglet actif en brun avec un petit trait au-dessus de l'icône.
export function BottomNav() {
  const { user } = useAuth()
  return (
    <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md border-t border-[#d5c5b5] bg-[#f6efe6]/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      {navTabsFor(user.role).map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative flex min-h-[70px] min-w-0 flex-1 flex-col items-center justify-center gap-1.5 text-[10px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${isActive ? 'font-semibold text-primary' : 'font-medium text-muted-foreground'}`
          }
        >
          {({ isActive }) => <>
            {/* Trait de l'onglet actif, collé au bord haut de la barre. */}
            {isActive && <span className="absolute top-0 h-[3px] w-7 rounded-b-full bg-primary" aria-hidden="true" />}
            <Icon size={21} strokeWidth={isActive ? 2 : 1.6} aria-hidden="true" />
            <span className="text-center">{label}</span>
          </>}
        </NavLink>
      ))}
    </nav>
  )
}
