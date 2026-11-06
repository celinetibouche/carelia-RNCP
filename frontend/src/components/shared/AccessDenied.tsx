import { Lock } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '../layout/PageHeader.tsx'
import { EmptyState } from '../ui/EmptyState.tsx'

// Écran commun quand le profil connecté n'a pas accès à une page : une explication et une sortie.
export function AccessDenied({ showBack = false }: { showBack?: boolean }) {
  return <>
    <PageHeader title="Accès refusé" showBack={showBack} showNotifications={false} />
    <EmptyState icon={Lock} title="Cette page n'est pas disponible pour votre profil"
      description="Si vous pensez qu'il s'agit d'une erreur, contactez la direction de la crèche."
      action={<Link to="/" className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-primary">Retour à l'accueil</Link>} />
  </>
}
