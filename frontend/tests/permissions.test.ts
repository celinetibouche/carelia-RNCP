import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canEditChildren, canEditReports, canLinkParents, canManageDirectory,
  canPublishReports, canReadNotifications, canUseMessaging, canViewDirectory, isParent, isStaff,
  type Role,
} from '../src/permissions.ts'

test('les permissions du front correspondent aux rôles autorisés par l’API', () => {
  const cases: Array<[Role, boolean, boolean, boolean, boolean, boolean]> = [
    ['DAYCARE_ADMIN', true, true, true, true, true],
    ['EJE', true, true, false, false, true],
    ['AUXILIARY', false, false, false, false, false],
    ['PARENT', false, false, false, false, true],
  ]

  for (const [role, editChild, viewDirectory, manageDirectory, linkParent, notifications] of cases) {
    assert.equal(canEditChildren(role), editChild, role)
    assert.equal(canPublishReports(role), editChild, role)
    assert.equal(canViewDirectory(role), viewDirectory, role)
    assert.equal(canManageDirectory(role), manageDirectory, role)
    assert.equal(canLinkParents(role), linkParent, role)
    assert.equal(canReadNotifications(role), notifications, role)
    assert.equal(canUseMessaging(role), notifications, role)
    assert.equal(canEditReports(role), role !== 'PARENT', role)
    assert.equal(isStaff(role), role !== 'PARENT', role)
    assert.equal(isParent(role), role === 'PARENT', role)
  }
})
