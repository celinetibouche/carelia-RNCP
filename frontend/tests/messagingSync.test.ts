import assert from 'node:assert/strict'
import test from 'node:test'
import type { Conversation, ConversationMessage, ConversationMessagePage, ConversationPage } from '../src/api.ts'
import {
  appendConversations, catchUpTarget, loadMessagesUntil, mergeMessages, olderAvailable, reloadConversations,
} from '../src/messagingSync.ts'

const ME = 4
const message = (messageId: number, extra: Partial<ConversationMessage> = {}): ConversationMessage => ({
  messageId, conversationId: 1, senderId: ME, body: `m${messageId}`, createdAt: '2026-11-05T10:00:00.000Z', firstReadAt: null, myReadAt: null, ...extra,
})
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => message(from + index))
const ids = (items: ConversationMessage[]) => items.map((item) => item.messageId)

// Faux serveur : même contrat que GET /conversations/:id/messages (limit 50, beforeId, ordre croissant).
function fakeServer(all: ConversationMessage[], limit = 50) {
  const calls: Array<number | undefined> = []
  const fetchPage = async (beforeId?: number): Promise<ConversationMessagePage> => {
    calls.push(beforeId)
    const eligible = all.filter((item) => beforeId === undefined || item.messageId < beforeId)
    const page = eligible.slice(-limit)
    return { items: page, hasMore: eligible.length > page.length }
  }
  return { fetchPage, calls }
}

test('mergeMessages supprime les doublons et trie par identifiant', () => {
  const merged = mergeMessages([message(3), message(1)], [message(2), message(3), message(1)])
  assert.deepEqual(ids(merged), [1, 2, 3])
})

test('mergeMessages : un accusé de lecture temps réel n’est jamais effacé par une réponse plus ancienne', () => {
  const held = [message(1, { firstReadAt: '2026-11-05T10:05:00.000Z' })]
  const stale = [message(1, { firstReadAt: null })]
  assert.equal(mergeMessages(held, stale)[0].firstReadAt, '2026-11-05T10:05:00.000Z')
})

test('mergeMessages : une lecture récente complète un message encore « non lu »', () => {
  const merged = mergeMessages([message(1)], [message(1, { firstReadAt: '2026-11-05T10:05:00.000Z' })])
  assert.equal(merged[0].firstReadAt, '2026-11-05T10:05:00.000Z')
})

test('premier chargement : une seule page', async () => {
  const server = fakeServer(range(1, 120))
  const page = await loadMessagesUntil(server.fetchPage, null)
  assert.deepEqual(ids(page.items), ids(range(71, 120)))
  assert.equal(page.hasMore, true)
  assert.equal(server.calls.length, 1)
})

test('récupère tous les messages manqués, même au-delà des 50 derniers, sans doublon', async () => {
  // J'ai vu jusqu'au message 100 ; 130 messages sont arrivés pendant la coupure.
  const server = fakeServer(range(1, 230))
  const held = range(51, 100)
  const page = await loadMessagesUntil(server.fetchPage, catchUpTarget(held, 999))
  const merged = mergeMessages(held, page.items)
  assert.deepEqual(ids(merged), ids(range(51, 230)), 'aucun manquant, aucun doublon')
  assert.equal(server.calls.length, 3)
})

test('s’arrête dès que le dernier message connu est couvert', async () => {
  const server = fakeServer(range(1, 60))
  const page = await loadMessagesUntil(server.fetchPage, 58)
  assert.equal(server.calls.length, 1)
  assert.ok(ids(page.items).includes(58))
})

test('un échec pendant le rattrapage est remonté sans perdre les messages déjà affichés', async () => {
  const server = fakeServer(range(1, 230))
  let calls = 0
  const flaky = async (beforeId?: number) => { calls += 1; if (calls === 2) throw new Error('réseau'); return server.fetchPage(beforeId) }
  const held = range(51, 100)
  await assert.rejects(loadMessagesUntil(flaky, 100), /réseau/)
  // L'appelant n'a rien remplacé : les messages détenus restent intacts.
  assert.deepEqual(ids(held), ids(range(51, 100)))
  const retry = await loadMessagesUntil(server.fetchPage, 100)
  assert.deepEqual(ids(mergeMessages(held, retry.items)), ids(range(51, 230)))
})

test('catchUpTarget : remonte jusqu’au plus ancien de mes messages encore non lus', () => {
  const held = [message(10, { firstReadAt: 'x' }), message(20), message(30, { senderId: 99 }), message(40, { firstReadAt: 'x' })]
  assert.equal(catchUpTarget(held, ME), 20)
  assert.equal(catchUpTarget([message(10, { firstReadAt: 'x' }), message(11, { firstReadAt: 'x' })], ME), 11)
  assert.equal(catchUpTarget([], ME), null)
})

test('un « Lu » est rattrapé même sans nouveau message', async () => {
  // Mes messages 41..60 sont affichés non lus ; le destinataire les lit (aucun message neuf).
  const server = fakeServer(range(1, 60).map((item) => item.messageId >= 41 ? { ...item, firstReadAt: '2026-11-05T10:10:00.000Z' } : item))
  const held = range(41, 60)
  const page = await loadMessagesUntil(server.fetchPage, catchUpTarget(held, ME))
  const merged = mergeMessages(held, page.items)
  assert.ok(merged.filter((item) => item.messageId >= 41).every((item) => item.firstReadAt))
})

test('concurrence : un message reçu pendant le chargement de l’historique est conservé', async () => {
  const server = fakeServer(range(1, 100))
  let held = range(51, 100)
  // Début du chargement des messages précédents (demandé avant l’arrivée du 101)...
  const olderRequest = server.fetchPage(held[0].messageId)
  // ... le message 101 arrive en temps réel pendant ce temps ...
  held = mergeMessages(held, [message(101)])
  // ... puis la page d’historique répond.
  const older = await olderRequest
  held = mergeMessages(held, older.items)
  assert.deepEqual(ids(held), ids(range(1, 101)))
})

test('concurrence : une réponse de rafraîchissement périmée ne retire aucun message', () => {
  const held = range(1, 80)
  const staleRefresh = range(31, 70)
  assert.deepEqual(ids(mergeMessages(held, staleRefresh)), ids(range(1, 80)))
})

test('olderAvailable : le rattrapage ne masque pas l’historique déjà chargé', () => {
  // J’ai chargé jusqu’au 1 (plus rien d’ancien) ; le rattrapage ne ramène que 101..150 avec hasMore=true.
  assert.equal(olderAvailable(1, false, 101, true), false)
  // Je n’ai que 51..100 ; le rattrapage couvre 51 et indique qu’il reste de l’ancien.
  assert.equal(olderAvailable(51, true, 51, true), true)
  assert.equal(olderAvailable(51, true, 31, false), false)
  assert.equal(olderAvailable(undefined, false, 5, true), true)
})

const conversation = (conversationId: number, unreadCount = 0): Conversation => ({
  conversationId, daycareId: 1, childId: 1, parentId: conversationId, childFirstName: 'Lina', childLastName: 'Durand',
  parentFirstName: 'P', parentLastName: String(conversationId), createdAt: '2026-11-05T10:00:00.000Z', lastActivityAt: '2026-11-05T10:00:00.000Z', unreadCount,
})

test('appendConversations ignore les doublons créés par un changement d’ordre entre deux pages', () => {
  const merged = appendConversations([conversation(3), conversation(2)], [conversation(2), conversation(1)])
  assert.deepEqual(merged.map((item) => item.conversationId), [3, 2, 1])
})

test('reloadConversations recharge toute la hauteur affichée, sans doublon, et garde les compteurs', async () => {
  const all = Array.from({ length: 70 }, (_, index) => conversation(70 - index, index === 0 ? 2 : 0))
  const fetchPage = async (offset: number, limit: number): Promise<ConversationPage> => ({
    items: all.slice(offset, offset + limit), total: all.length, unreadConversations: 1, unreadMessages: 2, limit, offset,
  })
  const result = await reloadConversations(fetchPage, 65, 30)
  assert.equal(result.items.length, 70, 'trois pages de 30 couvrent les 65 lignes affichées (la dernière est courte)')
  assert.equal(new Set(result.items.map((item) => item.conversationId)).size, result.items.length)
  assert.equal(result.unreadMessages, 2)
  assert.equal(result.total, 70)
})

test('reloadConversations : une page courte arrête le rechargement', async () => {
  let calls = 0
  const fetchPage = async (offset: number, limit: number): Promise<ConversationPage> => {
    calls += 1
    return { items: [conversation(1)], total: 1, unreadConversations: 0, unreadMessages: 0, limit, offset }
  }
  const result = await reloadConversations(fetchPage, 90, 30)
  assert.equal(calls, 1)
  assert.equal(result.items.length, 1)
})
