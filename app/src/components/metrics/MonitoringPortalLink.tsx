import { Button } from '@patternfly/react-core'
import { ExternalLinkAltIcon } from '@patternfly/react-icons'
import { useCapabilities } from '../../auth/capabilities'
import { useT } from '../../i18n/useT'
import { monitoringPortalUrl, showMonitoringPortal } from '../../lib/monitoringPortal'

// The "Open Monitoring Portal" escape hatch in a Monitoring tab's card header.
// Same gate and engine-aware URL as the sidebar link (lib/monitoringPortal.ts),
// so on a proxied deploy it opens the engine's own Grafana, never a console
// path. Renders nothing when the gate is closed; callers can mount it
// unconditionally.
export function MonitoringPortalLink() {
  const t = useT()
  const { isAdmin } = useCapabilities()
  if (!showMonitoringPortal(isAdmin)) return null
  return (
    <Button
      variant="link"
      component="a"
      href={monitoringPortalUrl()}
      target="_blank"
      rel="noopener noreferrer"
      icon={<ExternalLinkAltIcon />}
      iconPosition="end"
      isInline
    >
      {t('monitoring.openPortal')}
    </Button>
  )
}
