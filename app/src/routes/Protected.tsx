import { useEffect } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { AppShell } from '../components/AppShell'
import { useAuth } from '../auth/context'
import { loginRedirectSearch } from '../auth/capabilities'

// Auth lives in React context (in-memory token), so the guard is a component
// rather than beforeLoad: unauthenticated users are redirected to /login,
// carrying the intended destination so LoginPage can restore it after sign-in.
export function Protected() {
  const { isAuthenticated } = useAuth()
  const { pathname, searchStr } = useLocation()
  const navigate = useNavigate()

  // The redirect carries the full intended URL (path + search) so deep links
  // like /vms?folder=<id> survive the login round-trip — LoginPage restores
  // it via navigate({ href }). Normalize searchStr's leading '?' defensively.
  const query = searchStr === '' || searchStr === '?' ? '' : searchStr.replace(/^\??/, '?')
  const intended = pathname + query

  // Imperative redirect instead of <Navigate>: Navigate re-fires on every
  // re-render (fresh props object each render), and this component re-renders
  // mid-transition with pathname already '/login' — which looped and replaced
  // the redirect param with '/login'. The pathname guard stops the effect
  // once the transition to /login is underway.
  const mustRedirect = !isAuthenticated && pathname !== '/login'
  useEffect(() => {
    if (mustRedirect) {
      void navigate({ to: '/login', search: loginRedirectSearch(intended), replace: true })
    }
  }, [mustRedirect, navigate, intended])

  if (!isAuthenticated) return null
  return <AppShell />
}
