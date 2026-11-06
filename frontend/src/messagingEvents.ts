import { io } from 'socket.io-client'
import { createMessagingHub, type HubSocket, type WatchEnvironment } from './messagingHub.ts'

function connectSocket(): HubSocket {
  const socket = io({ withCredentials: true })
  return {
    on: (event, handler) => socket.on(event, handler),
    onReconnect: (handler) => socket.io.on('reconnect', handler),
    disconnect: () => socket.disconnect(),
  }
}

// Retour du réseau ou de l'onglet au premier plan : des événements ont pu être perdus.
const watchBrowser: WatchEnvironment = (resync) => {
  const onVisible = () => { if (document.visibilityState === 'visible') resync() }
  window.addEventListener('online', resync)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    window.removeEventListener('online', resync)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

// Connexion unique pour toute l'application, ouverte au premier abonné et fermée au dernier.
export const messagingEvents = createMessagingHub(connectSocket, watchBrowser)
