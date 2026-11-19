import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Panel } from './Panel.tsx'

export function SectionCard({ title, icon: Icon, children, className = '' }: {
  title: string; icon: LucideIcon; children: ReactNode; className?: string
}) {
  return <Panel className={className}>
    {/* Titre de carte de la maquette : icône dans une pastille ronde beige, titre sobre. */}
    <h2 className="mb-4 flex items-center gap-3 font-sans text-lg font-medium leading-tight">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary" aria-hidden="true"><Icon size={19} /></span>{title}
    </h2>
    {children}
  </Panel>
}
