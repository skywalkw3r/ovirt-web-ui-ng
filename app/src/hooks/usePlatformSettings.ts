import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  savePlatformSettings,
  readPlatformMirror,
  writePlatformMirror,
} from '../api/resources/platformSettings'
import {
  DEFAULT_PLATFORM_SETTINGS,
  parsePlatformTags,
  type PlatformSettings,
} from '../api/schemas/platform-settings'
import { useT } from '../i18n/useT'
import { useNotify } from '../notifications/context'
import { useTags } from './useTags'

// Platform settings ride the shared ['tags'] query (they live in the reserved
// 'ui.platform' tag cluster — api/schemas/platform-settings.ts), so every
// consumer — masthead logo, MOTD banner, the settings page, the user-menu
// support link — derives from one fetch, and the folder tree pre-warms it.
// While the listing is in flight (or failed: a user tier whose engine refuses
// GET /tags), the last mirrored resolution from this browser stands in, and
// failing that the defaults — branding may flash from stale to fresh, but it
// never blocks and never throws.
export function usePlatformSettings(): {
  settings: PlatformSettings
  // true once `settings` reflects the live engine rather than mirror/defaults
  isLive: boolean
  isPending: boolean
  isError: boolean
  error: unknown
  refetch: () => void
} {
  const tags = useTags()
  const live = useMemo(
    () => (tags.data !== undefined ? parsePlatformTags(tags.data) : null),
    [tags.data],
  )
  // Read once per mount: the mirror only matters until the live parse lands.
  const [mirror] = useState(() => readPlatformMirror())

  // Every live resolution refreshes the mirror so the NEXT pre-auth sign-in
  // screen shows current branding/notice.
  useEffect(() => {
    if (live !== null) writePlatformMirror(live)
  }, [live])

  return {
    settings: live ?? mirror ?? DEFAULT_PLATFORM_SETTINGS,
    isLive: live !== null,
    isPending: tags.isPending,
    isError: tags.isError,
    error: tags.error,
    refetch: () => void tags.refetch(),
  }
}

export function useSavePlatformSettings() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: (next: PlatformSettings) => savePlatformSettings(next),
    onSuccess: (_data, next) => {
      // the mirror follows the write immediately — no waiting on the refetch
      writePlatformMirror(next)
      notify({ title: t('platform.toast.saved'), variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    // Settings live in the tags collection, so the tags query is the one to
    // refresh; label/folder consumers are unaffected by the reserved cluster.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['tags'] }),
  })
}
