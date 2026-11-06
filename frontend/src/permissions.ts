import type { User } from './api.ts'

export type Role = User['role']

export const isParent = (role: Role) => role === 'PARENT'
export const isStaff = (role: Role) => role !== 'PARENT'
export const canEditChildren = (role: Role) => role === 'DAYCARE_ADMIN' || role === 'EJE'
export const canLinkParents = (role: Role) => role === 'DAYCARE_ADMIN'
export const canViewDirectory = (role: Role) => role === 'DAYCARE_ADMIN' || role === 'EJE'
export const canManageDirectory = (role: Role) => role === 'DAYCARE_ADMIN'
export const canEditReports = isStaff
export const canPublishReports = canEditChildren
export const canUseMessaging = (role: Role) => role === 'DAYCARE_ADMIN' || role === 'EJE' || role === 'PARENT'
export const canReadNotifications = canUseMessaging
