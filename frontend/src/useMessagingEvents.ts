import { useEffect, useRef } from 'react'
import { messagingEvents } from './messagingEvents.ts'
import type { MessagingListener } from './messagingHub.ts'

// Abonne un écran aux événements de messagerie. Les gestionnaires peuvent changer à chaque rendu
// sans réabonner : seule la valeur de `enabled` ouvre ou ferme l'abonnement.
export function useMessagingEvents(handlers: MessagingListener, enabled = true) {
  const latest = useRef(handlers)
  useEffect(() => { latest.current = handlers })
  useEffect(() => {
    if (!enabled) return
    return messagingEvents.subscribe({
      onChange: (change) => latest.current.onChange?.(change),
      onResync: () => latest.current.onResync?.(),
    })
  }, [enabled])
}
