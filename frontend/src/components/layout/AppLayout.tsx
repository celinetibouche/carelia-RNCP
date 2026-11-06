import { Outlet } from 'react-router'
import { BottomNav } from './BottomNav.tsx'

// L'application reste une colonne « téléphone » (max-w-md) sur tous les écrans, ordinateur compris.
export function AppLayout() {
  return (
    <div className="mx-auto min-h-screen max-w-md">
      <main className="px-5 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
