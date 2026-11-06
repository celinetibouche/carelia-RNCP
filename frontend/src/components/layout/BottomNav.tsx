import { NavLink } from 'react-router'
import { useAuth } from '../../useAuth.ts'
import { navTabsFor } from './navTabs.ts'

// Navigation : barre basse, identique sur téléphone et ordinateur.
export function BottomNav() {
  const { user } = useAuth()
  return (
    <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
      {navTabsFor(user.role).map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex min-h-[64px] min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${isActive ? 'text-primary' : 'text-muted-foreground'}`
          }
        >
          <Icon size={21} aria-hidden="true" />
          <span className="text-center">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
