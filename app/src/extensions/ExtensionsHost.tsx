import { useEffect } from 'react'
import { useIntl } from 'react-intl'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '../auth/context'
import { useCapabilities } from '../auth/capabilities'
import { useNotify } from '../notifications/context'
import { updateBridge } from './bridge'
import { startExtensions } from './loader'

// Mounted once inside the authenticated shell (AppShell). It keeps the
// extensions bridge pointed at the live toast, navigation, session and
// locale, and starts the plugin loader, so nothing loads for an anonymous
// visitor (ADR-0001 §2). Renders nothing.
export function ExtensionsHost() {
  const { notify } = useNotify()
  const navigate = useNavigate()
  const { username, isAuthenticated } = useAuth()
  const { isAdmin } = useCapabilities()
  const { locale } = useIntl()

  useEffect(() => {
    updateBridge({
      notify: (title, variant) => notify({ title, variant }),
      // plugin paths are validated (isSafeAppPath) before they get here; the
      // router's typed `to` cannot describe a runtime string
      navigate: (path) => void navigate({ to: path as never }),
      userName: username,
      isAdmin,
      locale,
    })
  }, [isAdmin, locale, navigate, notify, username])

  useEffect(() => {
    if (!isAuthenticated) return
    void startExtensions()
  }, [isAuthenticated, username])

  return null
}
