import type { ReactNode } from 'react'
import { Skeleton } from '@patternfly/react-core'
import { useT } from '../../i18n/useT'

// A control seeded from the all_content device read (serial console, sound
// card, VirtIO-SCSI, RNG): a skeleton until the read lands, then the control.
// When the read failed the control renders, disabled by its caller
// (!draft.devicesLoaded), and the modal's alert says why and offers Retry.
export function AllContentField({
  loaded,
  failed,
  children,
}: {
  loaded: boolean
  failed: boolean
  children: ReactNode
}) {
  const t = useT()
  if (!loaded && !failed) {
    return <Skeleton height="1.5rem" width="3rem" screenreaderText={t('vm.edit.devices.loading')} />
  }
  return <>{children}</>
}
