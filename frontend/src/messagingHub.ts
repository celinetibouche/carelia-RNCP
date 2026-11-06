// Hub d'événements de messagerie : une seule connexion temps réel partagée par tous les écrans,
// et une resynchronisation déclenchée à la reconnexion, au retour du réseau ou de l'onglet.
// Sans dépendance au navigateur : la connexion et l'environnement sont injectés (voir messagingEvents.ts).

export type MessagingChange = { conversationId: number; type?: 'CREATED' | 'MESSAGE' | 'READ' }
export type MessagingListener = { onChange?: (change: MessagingChange) => void; onResync?: () => void }

export type HubSocket = {
  on: (event: string, handler: (payload: unknown) => void) => unknown
  onReconnect: (handler: () => void) => unknown
  disconnect: () => unknown
}
// Branche des déclencheurs de resynchronisation (réseau, onglet visible…) et renvoie leur nettoyage.
export type WatchEnvironment = (resync: () => void) => () => void

function isChange(payload: unknown): payload is MessagingChange {
  return typeof payload === 'object' && payload !== null && Number.isSafeInteger((payload as { conversationId?: unknown }).conversationId)
}

export function createMessagingHub(connect: () => HubSocket, watchEnvironment: WatchEnvironment) {
  const listeners = new Set<MessagingListener>()
  let socket: HubSocket | null = null
  let stopWatching: (() => void) | null = null

  const resync = () => { for (const listener of [...listeners]) listener.onResync?.() }

  function open() {
    socket = connect()
    socket.on('conversation:changed', (payload) => {
      if (!isChange(payload)) return
      for (const listener of [...listeners]) listener.onChange?.(payload)
    })
    // Les événements émis pendant une coupure ne sont pas rejoués : chaque écran recharge ses données.
    socket.onReconnect(resync)
    stopWatching = watchEnvironment(resync)
  }

  function close() {
    stopWatching?.()
    socket?.disconnect()
    socket = null
    stopWatching = null
  }

  return {
    subscribe(listener: MessagingListener): () => void {
      listeners.add(listener)
      if (!socket) open()
      return () => {
        listeners.delete(listener)
        if (!listeners.size) close()
      }
    },
    get connected() { return socket !== null },
  }
}
