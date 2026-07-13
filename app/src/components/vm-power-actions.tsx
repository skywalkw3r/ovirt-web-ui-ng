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
import { canReset, canRestart, canShutdown, canStart, canSuspend } from '../lib/vm-status'

export interface PowerAction {
  action: VmAction
  allowed: (status: string | undefined) => boolean
  icon: ReactNode
  // one-line hover tooltip explaining what the action does
  description: string
  isDanger?: boolean
  // body copy for the confirmation modal; absent means fire immediately
  confirmBody?: string
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
    description: 'Boot the VM on a host in its cluster.',
  },
  {
    action: 'shutdown',
    allowed: canShutdown,
    icon: <PowerOffIcon />,
    description: 'Ask the guest OS to shut down cleanly, then power off.',
    isDanger: true,
    confirmBody:
      'The guest OS will be asked to shut down; anyone using this VM will be interrupted.',
  },
  {
    action: 'stop',
    allowed: canShutdown,
    icon: <OffIcon />,
    description: 'Cut power immediately without telling the guest OS — like pulling the plug.',
    isDanger: true,
    confirmBody:
      'Powering off cuts power without asking the guest OS to shut down — unsaved data may be lost.',
  },
  {
    action: 'reboot',
    allowed: canRestart,
    icon: <RedoIcon />,
    description: 'Ask the guest OS to restart cleanly.',
    confirmBody: 'The guest OS will be asked to restart; anyone using this VM will be interrupted.',
  },
  {
    action: 'reset',
    allowed: canReset,
    icon: <SyncAltIcon />,
    description: 'Restart instantly without telling the guest OS — like pressing the reset button.',
    confirmBody:
      'Hard-resets the VM without asking the guest OS — like pressing the reset button; unsaved data is lost.',
  },
  {
    action: 'suspend',
    allowed: canSuspend,
    icon: <PauseIcon />,
    description: 'Save the VM state to disk and pause it; resume later with Start.',
  },
]
