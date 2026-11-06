import assert from 'node:assert/strict'
import test from 'node:test'
import { formatDateTime, formatDay, formatMessageTime, formatShortTime } from '../src/dates.ts'

test("l'heure seule le jour même, date et heure sinon (bulles)", () => {
  const now = new Date(2026, 10, 5, 15, 0)
  assert.equal(formatMessageTime(new Date(2026, 10, 5, 9, 15).toISOString(), now), '09:15')
  assert.equal(formatMessageTime(new Date(2026, 10, 4, 21, 29).toISOString(), now), '04/11 21:29')
  assert.equal(formatMessageTime('invalide', now), '')
})

test("l'heure seule le jour même, la date courte sinon", () => {
  const now = new Date(2026, 10, 5, 15, 0)
  assert.equal(formatShortTime(new Date(2026, 10, 5, 9, 15).toISOString(), now), '09:15')
  assert.equal(formatShortTime(new Date(2026, 10, 4, 21, 29).toISOString(), now), '04/11')
  assert.equal(formatShortTime('invalide', now), '')
  assert.equal(formatShortTime(null, now), '')
})

test('une date sans heure est affichée en français, sans décalage de jour', () => {
  assert.equal(formatDay('2026-11-04'), '4 novembre 2026')
  assert.equal(formatDay('2026-01-01'), '1 janvier 2026')
  assert.equal(formatDay('2026-12-31'), '31 décembre 2026')
})

test('les valeurs vides ou invalides ne cassent pas l’affichage', () => {
  assert.equal(formatDay(null), '—')
  assert.equal(formatDay(undefined), '—')
  assert.equal(formatDay('pas une date'), 'pas une date')
  assert.equal(formatDateTime(''), '—')
  assert.equal(formatDateTime('invalide'), 'invalide')
})

test('un horodatage affiche la date puis l’heure', () => {
  assert.match(formatDateTime('2026-11-04T20:29:56.953Z'), /^\d{2}\/\d{2}\/2026,? \d{2}:\d{2}$/)
})
