import type { ReactNode } from 'react'
import {
  OffIcon,
  PauseIcon,
  PlayIcon,
  PowerOffIcon,
  RedoIcon,
  SyncAltIcon,
} from '@patternfly/react-icons'
import type { VmAction } from '../api/resources/vms'
import type { MessageId } from '../i18n/messages/en'
import { canReset, canRestart, canShutdown, canStart, canSuspend } from '../lib/vm-status'

export interface PowerAction {
  action: VmAction
  allowed: (status: string | undefined) => boolean
  icon: ReactNode
  // one-line hover tooltip explaining what the action does — a message id the
  // consuming component resolves via t() (module-level const, no hook here)
  descriptionId: MessageId
  isDanger?: boolean
  // body copy id for the confirmation modal; absent means fire immediately
  confirmBodyId?: MessageId
}

// Single source for the power lifecycle menu — the detail header's Power
// button (VmPowerMenu) and the list/kebab menu (VmActionsMenu) render the
// same set, so the two entry points can't drift. Lives outside the component
// files so each of those only exports components (fast refresh).
// isDanger marks the two actions that end the VM's session outright
// (Shutdown, Power off); Reset/Reboot restart it, so they stay neutral even
// though Reset is also ungraceful — the confirm modal carries that nuance.
export const POWER_ACTIONS: PowerAction[] = [
  {
    action: 'start',
    allowed: canStart,
    icon: <PlayIcon />,
    descriptionId: 'power.start.description',
  },
  {
    action: 'shutdown',
    allowed: canShutdown,
    icon: <PowerOffIcon />,
    descriptionId: 'power.shutdown.description',
    isDanger: true,
    confirmBodyId: 'power.shutdown.confirm',
  },
  {
    action: 'stop',
    allowed: canShutdown,
    icon: <OffIcon />,
    descriptionId: 'power.stop.description',
    isDanger: true,
    confirmBodyId: 'power.stop.confirm',
  },
  {
    action: 'reboot',
    allowed: canRestart,
    icon: <RedoIcon />,
    descriptionId: 'power.reboot.description',
    confirmBodyId: 'power.reboot.confirm',
  },
  {
    action: 'reset',
    allowed: canReset,
    icon: <SyncAltIcon />,
    descriptionId: 'power.reset.description',
    confirmBodyId: 'power.reset.confirm',
  },
  {
    action: 'suspend',
    allowed: canSuspend,
    icon: <PauseIcon />,
    descriptionId: 'power.suspend.description',
  },
]
