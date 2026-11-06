export type User = { userId: number; daycareId: number; role: 'DAYCARE_ADMIN' | 'EJE' | 'AUXILIARY' | 'PARENT'; email: string; firstName: string; lastName: string }
export type Child = { childId: number; daycareId: number; firstName: string; lastName: string; birthDate: string; isActive: boolean; groupName: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null }
export type DirectoryUser = { userId: number; daycareId: number; roleId: number; email: string; firstName: string; lastName: string; phone: string | null; address: string | null; isActive: boolean }
export type ParentLink = { userId: number; firstName: string; lastName: string; email: string; relationship: string }
export type Meal = { kind: 'MAIN' | 'DESSERT' | 'SNACK'; intake: 'ALL' | 'MOST' | 'LITTLE' | 'NONE'; label: string | null }
export type Nap = { napQualityId: number; startTime: string; endTime: string; comment: string | null; qualityLabel?: string }
export type Mood = { moodId: number; observedTime: string; comment: string | null; moodLabel?: string }
export type Change = { diaperChangeTypeId: number; changeTime: string; comment: string | null; typeLabel?: string }
export type Report = {
  reportId: number; childId: number; reportDate: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null; summary: string | null; summaryOverride: string | null;
  parentNote: string | null; revision: number; firstName: string; lastName: string;
  publishedBy?: Array<{ userId: number; firstName: string; lastName: string }>;
  meals: Meal[]; activities: string[]; naps: Nap[]; moods: Mood[]; diaperChanges: Change[]
}
export type ReportNotification = {
  notificationId: number; reportId: number; childId: number;
  reportDate: string; childName: string; createdAt: string; readAt: string | null
}
export type Conversation = {
  conversationId: number; daycareId: number; childId: number; parentId: number;
  childFirstName: string; childLastName: string; parentFirstName: string; parentLastName: string;
  createdAt: string; lastActivityAt: string; unreadCount: number
}
export type ConversationPage = { items: Conversation[]; total: number; unreadConversations: number; unreadMessages: number; limit: number; offset: number }
export type ConversationMessage = {
  messageId: number; conversationId: number; senderId: number;
  senderFirstName?: string; senderLastName?: string; body: string; createdAt: string;
  firstReadAt: string | null; myReadAt?: string | null
}
export type ConversationMessagePage = { items: ConversationMessage[]; hasMore: boolean }
export type MessageNotification = { messageId: number; conversationId: number; childId: number; childName: string; createdAt: string; readAt: string | null }
export type MessageNotificationPage = { items: MessageNotification[]; total: number; unread: number; limit: number; offset: number }
export type RefItem = { label: string; napQualityId?: number; moodId?: number; diaperChangeTypeId?: number }
export type References = { roles: Array<{ roleId: number; label: User['role'] }>; napQualities: RefItem[]; moods: RefItem[]; diaperChangeTypes: RefItem[] }

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...options.headers },
  })
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('carelia:unauthorized'))
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new ApiError(body.error ?? `Erreur HTTP ${response.status}`, response.status)
  }
  return response.status === 204 ? undefined as T : await response.json() as T
}

export function json(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) }
}
