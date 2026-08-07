import { Button } from '@patternfly/react-core'
import { SyncAltIcon } from '@patternfly/react-icons'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n/useT'

// Toolbar "refresh now": invalidates every query so the page refetches on
// demand. The polling CADENCE is deliberately not surfaced here — the global
// refresh interval lives in User menu → Preferences (refreshIntervalMs),
// which every poll hook already reads; a per-page dropdown duplicated that
// single global setting and was removed (user decision, 2026-07-05).
export function RefreshControl() {
  const queryClient = useQueryClient()
  const t = useT()

  return (
    <Button
      variant="control"
      aria-label={t('common.refresh.ariaLabel')}
      icon={<SyncAltIcon />}
      onClick={() => void queryClient.invalidateQueries()}
    />
  )
}
