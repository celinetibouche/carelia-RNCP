import { createContext, useContext } from 'react'
import type { User } from './api.ts'

export type AuthContextValue = { user: User; logout: () => Promise<void> }
export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('Session indisponible')
  return value
}
