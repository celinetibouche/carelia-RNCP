import type { ReactNode } from 'react'

// Étiquette de la nouvelle maquette : petites majuscules espacées, coins presque droits, bordure fine.
// Tons : neutral (beige, ex. « Publié »), coral (ex. « Maladie »), sand (ex. « Rendez-vous »),
// red (ex. « Injustifiée »), muted (ex. « Brouillon »).
export type TagTone = 'neutral' | 'coral' | 'sand' | 'red' | 'muted'

const toneClasses: Record<TagTone, string> = {
  neutral: 'border-[#d2beaa] bg-[#eee3d6] text-[#644b3e]',
  coral: 'border-[#dfb9a6] bg-[#f1ded3] text-[#8c4f39]',
  sand: 'border-[#d8c49d] bg-[#eee5cf] text-[#79603c]',
  red: 'border-[#dcb1a6] bg-[#f0dcd5] text-[#8d453b]',
  muted: 'border-border bg-muted text-muted-foreground',
}

export function Tag({ tone = 'neutral', children, className = '' }: { tone?: TagTone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex w-fit items-center whitespace-nowrap rounded-[3px] border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.05em] ${toneClasses[tone]} ${className}`}>
    {children}
  </span>
}
