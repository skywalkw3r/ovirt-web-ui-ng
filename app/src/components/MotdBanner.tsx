import { useState } from 'react'
import { Alert, AlertActionCloseButton } from '@patternfly/react-core'
import { useRuntimeConfig } from '../config/runtime'
import { useT } from '../i18n/useT'
import { dismissMotd, motdSignature, readDismissedMotd } from '../lib/motd'

// The deploy-time announcement (MOTD) banner, pinned above page content in
// AppShell beside OfflineBanner. The text comes from config.js (config/
// runtime.ts MotdConfig) — static per page load, so an operator edits it on
// the server and users pick it up on their next reload. Dismissal is
// per-session and keyed on the announcement's content (lib/motd.ts), so a
// re-worded banner resurfaces even for someone who dismissed the old one.
// Renders nothing while unset (both fields blank) or dismissed this session.
export function MotdBanner() {
  const t = useT()
  const { motd } = useRuntimeConfig()
  const [dismissed, setDismissed] = useState<string | null>(() => readDismissedMotd())

  // runtime.ts trims both fields, so non-empty here means real content.
  const hasTitle = motd.title !== ''
  const hasMessage = motd.message !== ''
  if (!hasTitle && !hasMessage) return null

  const signature = motdSignature(motd)
  if (dismissed === signature) return null

  return (
    <Alert
      // MotdSeverity is exactly the AlertVariant subset the banner offers
      variant={motd.severity}
      isInline
      // Either field may stand alone: a message-only announcement rides in the
      // title slot (PF then renders a bodyless Alert) so it keeps the same
      // prominence rather than shrinking into body text.
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
      {hasTitle && hasMessage ? motd.message : undefined}
    </Alert>
  )
}
