import assert from 'node:assert/strict'
import test from 'node:test'
import { createMessagingHub, type HubSocket, type MessagingChange } from '../src/messagingHub.ts'

function fakeEnvironment() {
  const sockets: Array<HubSocket & { emit: (event: string, payload: unknown) => void; reconnect: () => void; closed: boolean }> = []
  let watchers = 0
  let triggerEnvironment: () => void = () => {}
  const connect = () => {
    const handlers = new Map<string, (payload: unknown) => void>()
    let reconnectHandler: () => void = () => {}
    const socket = {
      closed: false,
      on: (event: string, handler: (payload: unknown) => void) => { handlers.set(event, handler) },
      onReconnect: (handler: () => void) => { reconnectHandler = handler },
      disconnect: () => { socket.closed = true },
      emit: (event: string, payload: unknown) => handlers.get(event)?.(payload),
      reconnect: () => reconnectHandler(),
    }
    sockets.push(socket)
    return socket
  }
  const watch = (resync: () => void) => { watchers += 1; triggerEnvironment = resync; return () => { watchers -= 1 } }
  return { connect, watch, sockets, watchers: () => watchers, trigger: () => triggerEnvironment() }
}

test('une seule connexion est partagée entre tous les écrans', () => {
  const env = fakeEnvironment()
  const hub = createMessagingHub(env.connect, env.watch)
  const stops = [hub.subscribe({}), hub.subscribe({}), hub.subscribe({})]
  assert.equal(env.sockets.length, 1)
  stops.forEach((stop) => stop())
})

test('les changements sont distribués à chaque écran abonné', () => {
  const env = fakeEnvironment()
  const hub = createMessagingHub(env.connect, env.watch)
  const received: MessagingChange[][] = [[], []]
  hub.subscribe({ onChange: (change) => received[0].push(change) })
  hub.subscribe({ onChange: (change) => received[1].push(change) })
  env.sockets[0].emit('conversation:changed', { conversationId: 7, type: 'READ' })
  assert.deepEqual(received, [[{ conversationId: 7, type: 'READ' }], [{ conversationId: 7, type: 'READ' }]])
})

test('un événement mal formé est ignoré', () => {
  const env = fakeEnvironment()
  const hub = createMessagingHub(env.connect, env.watch)
  let count = 0
  hub.subscribe({ onChange: () => { count += 1 } })
  for (const payload of [null, 'x', {}, { conversationId: 'abc' }, { conversationId: 1.5 }]) env.sockets[0].emit('conversation:changed', payload)
  assert.equal(count, 0)
})

test('après une reconnexion, chaque écran est invité à resynchroniser ses données', () => {
  const env = fakeEnvironment()
  const hub = createMessagingHub(env.connect, env.watch)
  let resyncs = 0
  hub.subscribe({ onResync: () => { resyncs += 1 } })
  hub.subscribe({ onResync: () => { resyncs += 1 } })
  env.sockets[0].reconnect()
  assert.equal(resyncs, 2)
})

test('le retour du réseau ou de l’onglet déclenche aussi la resynchronisation', () => {
  const env = fakeEnvironment()
  const hub = createMessagingHub(env.connect, env.watch)
  let resyncs = 0
  hub.subscribe({ onResync: () => { resyncs += 1 } })
  env.trigger()
  assert.equal(resyncs, 1)
})

test('le dernier désabonnement ferme la connexion ; un nouvel abonné en rouvre une', () => {
  const env = fakeEnvironment()
  const hub = createMessagingHub(env.connect, env.watch)
  const stopA = hub.subscribe({})
  const stopB = hub.subscribe({})
  stopA()
  assert.equal(env.sockets[0].closed, false)
  assert.equal(env.watchers(), 1)
  stopB()
  assert.equal(env.sockets[0].closed, true)
  assert.equal(env.watchers(), 0)
  assert.equal(hub.connected, false)
  hub.subscribe({})
  assert.equal(env.sockets.length, 2)
})

test('un écran désabonné ne reçoit plus rien', () => {
  const env = fakeEnvironment()
  const hub = createMessagingHub(env.connect, env.watch)
  let count = 0
  const stop = hub.subscribe({ onChange: () => { count += 1 } })
  hub.subscribe({})
  stop()
  env.sockets[0].emit('conversation:changed', { conversationId: 1 })
  assert.equal(count, 0)
})
