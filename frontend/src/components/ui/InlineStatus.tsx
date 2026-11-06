import { RotateCw } from 'lucide-react'
import { Button } from './Button.tsx'

// Erreur annoncée aux technologies d'assistance, avec une reprise quand elle a un sens.
export function InlineError({ message, onRetry, className = '' }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive ${className}`}>
      <span className="min-w-0 flex-1 wrap-anywhere">{message}</span>
      {onRetry && <Button variant="outline" size="sm" icon={<RotateCw size={16} aria-hidden="true" />} onClick={onRetry}>Réessayer</Button>}
    </div>
  )
}

// Chargement : annoncé poliment, sans bloquer le reste de la page.
export function LoadingText({ label = 'Chargement...', className = '' }: { label?: string; className?: string }) {
  return <p role="status" className={`py-6 text-sm text-muted-foreground ${className}`}>{label}</p>
}
