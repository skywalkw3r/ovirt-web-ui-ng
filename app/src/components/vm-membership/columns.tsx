import type { ReactNode } from 'react'
import type { ThProps } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import type { Vm } from '../../api/schemas/vm'
import { VmStatusLabel } from '../VmStatusLabel'

export interface VmMembershipColumn {
  key: string
  label: string
  width?: ThProps['width']
  render: (vm: Vm) => ReactNode
  // opt-in header sort (see hooks/useColumnSort). Status stays unsortable — it
  // is a state chip, not a scannable value (same rule as the list pages).
  sortValue?: (vm: Vm) => string | number | undefined
  // long free-text columns: single line with the full value on hover
  modifier?: 'truncate'
  title?: (vm: Vm) => string | undefined
}

// The Name→detail link and Status label every membership table opens with;
// tabs spread these to add widths ({ ...VM_NAME_COLUMN, width: 30 }) and
// append their own columns after. Kept out of VmMembershipTable.tsx so that
// file exports only the component (fast-refresh rule).
export const VM_NAME_COLUMN: VmMembershipColumn = {
  key: 'name',
  label: 'Name',
  sortValue: (vm) => vm.name,
  render: (vm) => (
    <Link to="/vms/$vmId" params={{ vmId: vm.id }}>
      {vm.name}
    </Link>
  ),
}

export const VM_STATUS_COLUMN: VmMembershipColumn = {
  key: 'status',
  label: 'Status',
  render: (vm) => <VmStatusLabel status={vm.status} />,
}
