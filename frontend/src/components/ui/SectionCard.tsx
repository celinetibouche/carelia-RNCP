import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Panel } from './Panel.tsx'

export function SectionCard({ title, icon: Icon, children, className = '' }: {
  title: string; icon: LucideIcon; children: ReactNode; className?: string
}) {
  return <Panel className={className}>
    <h2 className="mb-4 flex items-center gap-2 font-serif text-xl leading-tight">
      <Icon size={20} className="shrink-0 text-primary" aria-hidden="true" />{title}
    </h2>
    {children}
  </Panel>
}
