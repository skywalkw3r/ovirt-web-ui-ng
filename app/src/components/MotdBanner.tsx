import { useState } from 'react'
import { Alert, AlertActionCloseButton } from '@patternfly/react-core'
import { dismissMotd, readDismissedMotd } from '../api/resources/platformSettings'
import { motdSignature, motdWindowState } from '../api/schemas/platform-settings'
import { usePlatformSettings } from '../hooks/usePlatformSettings'
import { useNow } from '../hooks/useNow'
import { useT } from '../i18n/useT'

// How often the banner re-evaluates its schedule window: a scheduled
// announcement arms/expires within this much of its boundary without any
// navigation or refetch (the ticker only forces re-renders, no requests).
const WINDOW_TICK_MS = 30_000

// The admin-authored announcement (MOTD) banner, pinned above page content in
// AppShell beside OfflineBanner. Dismissal is per-session: the announcement's
// content signature lands in sessionStorage and AuthProvider.login() clears
// it, so the banner returns at every sign-in while it stays enabled — and an
// EDITED or RESCHEDULED announcement (new signature) resurfaces immediately
// even for users who dismissed the previous version. Renders nothing while
// disabled, empty, outside its schedule window, or dismissed.
export function MotdBanner() {
  const { settings } = usePlatformSettings()
  const t = useT()
  const now = useNow(WINDOW_TICK_MS)
  const [dismissed, setDismissed] = useState<string | null>(() => readDismissedMotd())

  const { motd } = settings
  if (!motd.enabled || motd.message.trim() === '') return null
  if (motdWindowState(motd, now) !== 'live') return null

  const signature = motdSignature(motd)
  if (dismissed === signature) return null

  const hasTitle = motd.title.trim() !== ''
  return (
    <Alert
      variant={motd.severity}
      isInline
      title={hasTitle ? motd.title : motd.message}
      actionClose={
        <AlertActionCloseButton
          // aria-label is the button's accessible name (PF's default bakes in
          // English); title doubles it as the pointer tooltip
          aria-label={t('platform.motd.dismiss')}
          title={t('platform.motd.dismiss')}
          onClose={() => {
            dismissMotd(signature)
            setDismissed(signature)
          }}
        />
      }
    >
      {hasTitle ? motd.message : undefined}
    </Alert>
  )
}
