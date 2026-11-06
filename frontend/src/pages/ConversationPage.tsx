import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import { useParams } from 'react-router'
import { api, json, type Conversation, type ConversationMessage, type ConversationMessagePage } from '../api.ts'
import { formatMessageTime } from '../dates.ts'
import { catchUpTarget, loadMessagesUntil, mergeMessages, olderAvailable } from '../messagingSync.ts'
import { useAuth } from '../useAuth.ts'
import { useMessagingEvents } from '../useMessagingEvents.ts'
import { canUseMessaging, isParent } from '../permissions.ts'
import { AccessDenied } from '../components/shared/AccessDenied.tsx'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button } from '../components/ui/Button.tsx'
import { Avatar } from '../components/shared/Avatar.tsx'
import { InlineError, LoadingText } from '../components/ui/InlineStatus.tsx'

export function ConversationPage() {
  const { user } = useAuth()
  const { conversationId } = useParams()
  const id = Number(conversationId)
  if (!canUseMessaging(user.role) || !Number.isSafeInteger(id) || id <= 0) return <AccessDenied showBack />
  // Une clé par discussion : changer de discussion repart d'un état vide (messages, erreurs, requêtes en cours).
  return <ConversationView key={id} id={id} />
}

function ConversationView({ id }: { id: number }) {
  const { user } = useAuth()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [olderError, setOlderError] = useState('')
  const [sendError, setSendError] = useState('')
  // Miroirs synchrones de l'état : les réponses réseau arrivent dans le désordre, on fusionne toujours
  // avec ce qui est réellement affiché à l'instant de la réponse, jamais avec une copie périmée.
  const messagesRef = useRef<ConversationMessage[]>([])
  const hasMoreRef = useRef(false)
  const inFlight = useRef(false)
  const queued = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastMessageId = messages.at(-1)?.messageId

  const commit = useCallback((next: ConversationMessage[], more?: boolean) => {
    messagesRef.current = next
    setMessages(next)
    if (more !== undefined) { hasMoreRef.current = more; setHasMore(more) }
  }, [])

  const fetchMessages = useCallback((beforeId?: number) =>
    api<ConversationMessagePage>(`/conversations/${id}/messages${beforeId ? `?beforeId=${beforeId}` : ''}`), [id])

  // Une passe de synchronisation : détails, messages récents (jusqu'à couvrir tout ce qui a été manqué,
  // même au-delà de 50) et accusé de lecture. En cas d'échec, ce qui est affiché reste en place.
  const syncOnce = useCallback(async () => {
    try {
      const target = catchUpTarget(messagesRef.current, user.userId)
      const [details, page] = await Promise.all([api<Conversation>(`/conversations/${id}`), loadMessagesUntil(fetchMessages, target)])
      const held = messagesRef.current
      const merged = mergeMessages(held, page.items)
      commit(merged, olderAvailable(held[0]?.messageId, hasMoreRef.current, page.items[0]?.messageId, page.hasMore))
      setConversation(details)
      setLoadError('')
      const last = merged.at(-1)
      // On ne marque comme lu que si la discussion est réellement sous les yeux.
      if (last && details.unreadCount && document.visibilityState === 'visible') {
        await api(`/conversations/${id}/read`, json('POST', { upToMessageId: last.messageId }))
        window.dispatchEvent(new Event('carelia:notification-read'))
      }
    } catch (reason) { setLoadError(reason instanceof Error ? reason.message : 'Discussion indisponible.') }
    finally { setLoading(false) }
  }, [id, user.userId, fetchMessages, commit])

  // Une seule synchronisation à la fois ; un événement reçu pendant l'une d'elles en programme une seconde.
  const refresh = useCallback(async () => {
    if (inFlight.current) { queued.current = true; return }
    inFlight.current = true
    try {
      do { queued.current = false; await syncOnce() } while (queued.current)
    } finally { inFlight.current = false }
  }, [syncOnce])

  useEffect(() => { queueMicrotask(() => { void refresh() }) }, [refresh])
  useMessagingEvents({
    onChange: (change) => { if (change.conversationId === id) void refresh() },
    onResync: () => void refresh(),
  })
  // Le dernier message reste visible au-dessus de la barre de saisie (ouverture, envoi, réception).
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [lastMessageId])

  async function loadOlder() {
    const first = messagesRef.current[0]
    if (!first || loadingOlder) return
    setLoadingOlder(true)
    setOlderError('')
    try {
      const page = await fetchMessages(first.messageId)
      // Fusion avec les messages actuels (y compris ceux reçus pendant le chargement), sans doublon.
      commit(mergeMessages(messagesRef.current, page.items), page.hasMore)
    } catch (reason) { setOlderError(reason instanceof Error ? reason.message : 'Chargement impossible.') }
    finally { setLoadingOlder(false) }
  }

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    setSendError('')
    try {
      const sent = await api<ConversationMessage>(`/conversations/${id}/messages`, json('POST', { body: text }))
      commit(mergeMessages(messagesRef.current, [sent]))
      setBody('')
      void refresh()
    } catch (reason) { setSendError(reason instanceof Error ? reason.message : 'Envoi impossible.') }
    finally { setSending(false) }
  }

  const parent = isParent(user.role)
  const contactName = conversation ? (parent ? 'Équipe de la crèche' : `${conversation.parentFirstName} ${conversation.parentLastName}`) : ''
  return <>
    <PageHeader title="Discussion" showBack showNotifications={false} />
    {loadError && <InlineError className="mb-3" message={loadError} onRetry={() => { setLoading(true); void refresh() }} />}
    {loading && <LoadingText />}
    {/* La colonne remplit la hauteur de l'écran : la barre de saisie reste en bas, même si la discussion est courte. */}
    {conversation && <div className="flex min-h-[calc(100dvh-11rem-env(safe-area-inset-bottom))] flex-col">
      <div className="mb-5 flex items-center gap-3">
        <Avatar name={contactName} className="rounded-xl bg-muted! text-foreground!" />
        <div className="min-w-0">
          <b className="block truncate">{contactName}</b>
          <p className="truncate text-xs text-muted-foreground">À propos de {conversation.childFirstName} {conversation.childLastName}</p>
        </div>
      </div>
      {hasMore && <Button variant="outline" className="mb-4 w-full" loading={loadingOlder} onClick={() => void loadOlder()}>Voir les messages précédents</Button>}
      {olderError && <InlineError className="mb-3" message={`Messages précédents indisponibles : ${olderError}`} onRetry={() => void loadOlder()} />}
      <div className="grid flex-1 content-start gap-3 pb-4" role="log" aria-label="Messages de la discussion">
        {messages.map((message) => {
          const mine = message.senderId === user.userId
          // L'expéditeur n'est nommé que si ce n'est ni moi ni le parent de la discussion (ex. un autre membre de l'équipe).
          const showSender = !mine && message.senderId !== conversation.parentId
          return <article key={message.messageId} className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm ${mine ? 'ml-auto rounded-tr-sm bg-primary text-primary-foreground' : 'mr-auto rounded-tl-sm bg-card'}`}>
            {showSender && <p className="mb-1 text-xs font-semibold opacity-80">{`${message.senderFirstName ?? ''} ${message.senderLastName ?? ''}`.trim()}</p>}
            <p className="whitespace-pre-wrap break-words leading-6">{message.body}</p>
            <small className="mt-1 block text-[11px] opacity-80">{formatMessageTime(message.createdAt)}{mine && message.firstReadAt ? ` · Lu ${formatMessageTime(message.firstReadAt)}` : ''}</small>
          </article>
        })}
        {!messages.length && !loadError && <p className="py-8 text-center text-sm text-muted-foreground">Écrivez le premier message.</p>}
        <div ref={bottomRef} aria-hidden="true" className="scroll-mb-40" />
      </div>
      {/* Barre de saisie collée en bas, au-dessus de la barre de navigation mobile. */}
      <form onSubmit={(event) => void send(event)} className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-5 grid grid-cols-[minmax(0,1fr)] gap-2 bg-background px-5 pb-2 pt-2">
        {sendError && <InlineError message={sendError} onRetry={() => void send()} />}
        <div className="flex min-w-0 items-end gap-2 rounded-xl bg-card p-2 shadow-sm">
          <label htmlFor="message-body" className="sr-only">Votre message</label>
          <textarea id="message-body" rows={1} value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000}
            placeholder="Écrire un message…"
            className="max-h-32 min-h-9 min-w-0 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary" />
          <button type="submit" aria-label="Envoyer" aria-busy={sending} disabled={!body.trim() || sending}
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50">
            <Send size={17} aria-hidden="true" />
          </button>
        </div>
        {body.length >= 1800 && <small className="text-right text-xs text-muted-foreground" aria-live="polite">{body.length}/2000</small>}
      </form>
    </div>}
  </>
}
