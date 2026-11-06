import assert from 'node:assert/strict'
import test from 'node:test'
import { navTabsFor } from '../src/components/layout/navTabs.ts'
import { canUseMessaging } from '../src/permissions.ts'

const roles = ['DAYCARE_ADMIN', 'EJE', 'AUXILIARY', 'PARENT'] as const

test("la messagerie n'apparaît que pour les profils autorisés par l'API", () => {
  for (const role of roles) {
    const tabs = navTabsFor(role)
    assert.equal(tabs.some((tab) => tab.to === '/messages'), canUseMessaging(role), role)
    assert.equal(tabs.length, canUseMessaging(role) ? 5 : 4, role)
  }
})

test("les modules non livrés (annuaire, agenda, santé, événements) ne sont dans aucune navigation", () => {
  for (const role of roles) {
    for (const tab of navTabsFor(role)) {
      assert.doesNotMatch(tab.to, /utilisateurs|agenda|sante|evenements/, `${role} ${tab.to}`)
    }
  }
})

test("le parent a ses libellés dédiés", () => {
  const labels = navTabsFor('PARENT').map((tab) => tab.label)
  assert.ok(labels.includes('Mon enfant'))
  assert.ok(labels.includes('Mon espace'))
})
