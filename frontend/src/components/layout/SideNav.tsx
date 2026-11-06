import { NavLink } from 'react-router'
import { useAuth } from '../../useAuth.ts'
import { isParent } from '../../permissions.ts'
import { navTabsFor } from './navTabs.ts'

// Navigation desktop : barre latérale fixe à gauche, visible à partir du breakpoint lg.
export function SideNav() {
  const { user } = useAuth()
  return (
    <nav aria-label="Navigation principale" className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-1 border-r border-border bg-card px-3 py-6 lg:flex">
      <div className="mb-6 px-3 text-primary">
        <span className="block font-serif text-2xl">Carelia</span>
        {isParent(user.role) && <small className="block text-[10px] font-semibold uppercase">Parents</small>}
      </div>
      {navTabsFor(user.role).map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary ${isActive ? 'bg-accent text-primary' : 'text-muted-foreground hover:bg-muted'}`
          }
        >
          <Icon size={20} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
