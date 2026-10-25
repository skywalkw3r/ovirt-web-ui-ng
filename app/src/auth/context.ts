import { createContext, useContext } from 'react'

export interface AuthContextValue {
  username: string | null
  isAuthenticated: boolean
  // A session-less tab is still asking its signed-in siblings for a session
  // (auth/sessionHandoff.ts): neither show nor redirect to the login page yet.
  isResolving: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
