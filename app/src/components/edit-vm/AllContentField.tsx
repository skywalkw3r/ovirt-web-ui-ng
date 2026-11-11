import type { ReactNode } from 'react'
import { Skeleton } from '@patternfly/react-core'
import { useT } from '../../i18n/useT'
import type { AllContentState } from './vmBaseDraft'

// A control seeded from an all_content device read (serial console, sound
// card, VirtIO-SCSI, RNG): a skeleton until the read lands, then the control.
// When the read failed the control renders, disabled by its caller (until
// state.loaded), and the form's alert says why and offers Retry. Without a
// state (a form that does not seed from an all_content read) the control
// renders as it is.
export function AllContentField({
  state,
  children,
}: {
  state: AllContentState | undefined
  children: ReactNode
}) {
  const t = useT()
  if (state !== undefined && !state.loaded && !state.failed) {
    return <Skeleton height="1.5rem" width="3rem" screenreaderText={t('vm.edit.devices.loading')} />
  }
  return <>{children}</>
}
