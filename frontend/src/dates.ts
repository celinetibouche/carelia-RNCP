// Formats de date communs à tous les écrans (fr-FR). Une seule source pour rester cohérent.
const day = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

// Date sans heure renvoyée par l'API ("2026-11-04") -> "4 novembre 2026".
// Midi local évite tout décalage de jour lié au fuseau horaire.
export function formatDay(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : day.format(date)
}

const hour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const shortDay = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' })

// Horodatage ISO -> "21:29" le jour même, "04/11" sinon (listes et bulles de discussion).
export function formatShortTime(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toDateString() === now.toDateString() ? hour.format(date) : shortDay.format(date)
}

// Horodatage ISO -> "21:29" le jour même, "04/11 21:29" sinon (bulles de discussion).
export function formatMessageTime(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toDateString() === now.toDateString() ? hour.format(date) : `${shortDay.format(date)} ${hour.format(date)}`
}

// Horodatage ISO -> "04/11/2026 21:29".
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTime.format(date)
}
