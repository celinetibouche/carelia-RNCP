import type { Conversation, ConversationMessage, ConversationMessagePage, ConversationPage } from './api.ts'

// Logique de synchronisation de la messagerie, volontairement sans React ni réseau :
// elle reçoit les fonctions de lecture en paramètre pour pouvoir être testée.

// Fusionne deux listes de messages sans doublon, triées par identifiant.
// La donnée la plus récente l'emporte, mais un accusé de lecture n'est jamais perdu :
// une réponse tardive (ex. page d'historique demandée avant un « Lu » temps réel) ne l'efface pas.
export function mergeMessages(current: ConversationMessage[], incoming: ConversationMessage[]): ConversationMessage[] {
  const byId = new Map<number, ConversationMessage>()
  for (const message of current) byId.set(message.messageId, message)
  for (const message of incoming) {
    const known = byId.get(message.messageId)
    byId.set(message.messageId, known ? {
      ...known, ...message,
      firstReadAt: message.firstReadAt ?? known.firstReadAt,
      myReadAt: message.myReadAt ?? known.myReadAt,
    } : message)
  }
  return [...byId.values()].sort((a, b) => a.messageId - b.messageId)
}

// Jusqu'où recharger pour tout rattraper : le dernier message connu (détecte les messages manqués)
// et le plus ancien message envoyé par moi encore « non lu » (pour afficher son « Lu »).
// null = premier chargement, une seule page suffit.
export function catchUpTarget(held: ConversationMessage[], userId: number): number | null {
  const last = held.at(-1)
  if (!last) return null
  const unreadMine = held.find((message) => message.senderId === userId && !message.firstReadAt)
  return Math.min(last.messageId, unreadMine?.messageId ?? last.messageId)
}

export type MessagePageFetcher = (beforeId?: number) => Promise<ConversationMessagePage>

const maxCatchUpPages = 200

// Charge les messages les plus récents puis remonte page par page jusqu'à couvrir `targetId`,
// même si plus de 50 messages ont été manqués. Lève une erreur au moindre échec : l'appelant
// conserve alors ses messages et propose de réessayer.
export async function loadMessagesUntil(fetchPage: MessagePageFetcher, targetId: number | null): Promise<ConversationMessagePage> {
  let items: ConversationMessage[] = []
  let hasMore = false
  let before: number | undefined
  for (let pages = 0; pages < maxCatchUpPages; pages += 1) {
    const page = await fetchPage(before)
    items = mergeMessages(page.items, items)
    hasMore = page.hasMore
    const oldest = page.items[0]?.messageId
    if (targetId === null || !hasMore || oldest === undefined || oldest <= targetId) return { items, hasMore }
    before = oldest
  }
  throw new Error('Trop de messages à récupérer, réessayez.')
}

// Reste-t-il des messages plus anciens que ceux affichés ? Un rattrapage ne doit pas masquer
// l'historique déjà chargé : on ne reprend l'information du serveur que si la page récupérée
// descend au moins aussi loin que ce qu'on détient.
export function olderAvailable(heldOldest: number | undefined, heldHasMore: boolean, fetchedOldest: number | undefined, fetchedHasMore: boolean): boolean {
  if (heldOldest === undefined || fetchedOldest === undefined) return fetchedHasMore
  return fetchedOldest <= heldOldest ? fetchedHasMore : heldHasMore
}

// Ajoute des conversations sans doublon (l'ordre par activité peut changer entre deux pages).
export function appendConversations(current: Conversation[], incoming: Conversation[]): Conversation[] {
  const known = new Set(current.map((item) => item.conversationId))
  return [...current, ...incoming.filter((item) => !known.has(item.conversationId))]
}

export type ConversationPageFetcher = (offset: number, limit: number) => Promise<ConversationPage>

// Recharge la liste jusqu'à la hauteur déjà affichée (par pages de `pageSize`), sans doublon,
// pour resynchroniser liste et compteurs sans revenir à la première page.
export async function reloadConversations(fetchPage: ConversationPageFetcher, loadedCount: number, pageSize: number): Promise<ConversationPage> {
  const pages = Math.max(1, Math.ceil(loadedCount / pageSize))
  let items: Conversation[] = []
  let last: ConversationPage | null = null
  for (let index = 0; index < pages; index += 1) {
    last = await fetchPage(index * pageSize, pageSize)
    items = appendConversations(items, last.items)
    if (last.items.length < pageSize) break
  }
  return { ...(last as ConversationPage), items }
}
