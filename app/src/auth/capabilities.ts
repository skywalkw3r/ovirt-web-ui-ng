import { createContext, useContext } from 'react'
import type { CapabilityProfile } from '../api/resources/users'

export type CapabilitiesValue = CapabilityProfile & { loaded: boolean }

// Least-privilege placeholder shown before the profile fetch resolves and
// after logout: capability-gated UI stays hidden until loaded flips to true.
export const DEFAULT_CAPABILITIES: CapabilitiesValue = {
  tier: 'user',
  isAdmin: false,
  loaded: false,
}

export const CapabilitiesContext = createContext<CapabilitiesValue | null>(null)

export function useCapabilities(): CapabilitiesValue {
  const value = useContext(CapabilitiesContext)
  if (!value) throw new Error('useCapabilities must be used inside <AuthProvider>')
  return value
}

// Search params for the auth guard's redirect to /login: router.tsx passes
// search={loginRedirectSearch(pathname)} on its Navigate so LoginPage can
// restore the intended destination after sign-in (LoginPage validates the
// value is an app-internal path before following it).
export function loginRedirectSearch(pathname: string): { redirect: string } {
  return { redirect: pathname }
}
