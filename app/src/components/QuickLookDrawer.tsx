import {
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  DrawerActions,
  DrawerCloseButton,
  DrawerHead,
  DrawerPanelBody,
  DrawerPanelContent,
  Flex,
  FlexItem,
  Title,
} from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import type { Vm } from '../api/schemas/vm'
import { formatBytes } from '../lib/format'
import { VmLabels } from './tags/VmLabels'
import { VmActionsMenu } from './VmActionsMenu'
import { VmStatusLabel } from './VmStatusLabel'

// Quick-look side panel for the VMs page (docs/COMPONENTS.md: Drawer +
// DescriptionList). The page owns the Drawer/DrawerContent shell and decides
// which VM is open; this panel only renders that VM's summary and reports
// close. It fetches nothing of its own — VmLabels reuses the cached
// ['vm', id, 'tags'] entry the table's label cells already populated.
export function QuickLookPanel({ vm, onClose }: { vm: Vm; onClose: () => void }) {
  return (
    // a third of the page is enough for a summary — details live on the VM page
    <DrawerPanelContent widths={{ default: 'width_33' }}>
      <DrawerHead>
        <Title headingLevel="h2" size="lg">
          {vm.name}
        </Title>
        <DrawerActions>
          <DrawerCloseButton aria-label={`Close quick look for ${vm.name}`} onClick={onClose} />
        </DrawerActions>
      </DrawerHead>
      <DrawerPanelBody>
        <Flex
          alignItems={{ default: 'alignItemsCenter' }}
          spaceItems={{ default: 'spaceItemsSm' }}
          style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
        >
          <FlexItem>
            <VmStatusLabel status={vm.status} />
          </FlexItem>
          <FlexItem>
            <VmLabels vmId={vm.id} />
          </FlexItem>
        </Flex>

        {/* fixed rows with em dashes (not conditional groups like OverviewTab)
            so the panel keeps its shape as the user flips between VMs */}
        <DescriptionList isCompact>
          <DescriptionListGroup>
            <DescriptionListTerm>FQDN</DescriptionListTerm>
            <DescriptionListDescription>{vm.fqdn ?? '—'}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Memory</DescriptionListTerm>
            {/* formatBytes renders the em dash itself when memory is absent */}
            <DescriptionListDescription>{formatBytes(vm.memory)}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Operating system</DescriptionListTerm>
            <DescriptionListDescription>{vm.os?.type ?? '—'}</DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>

        <Flex
          alignItems={{ default: 'alignItemsCenter' }}
          spaceItems={{ default: 'spaceItemsSm' }}
          style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}
        >
          <FlexItem>
            <VmActionsMenu vm={vm} />
          </FlexItem>
          <FlexItem>
            <Link to="/vms/$vmId" params={{ vmId: vm.id }}>
              Open details
            </Link>
          </FlexItem>
        </Flex>
      </DrawerPanelBody>
    </DrawerPanelContent>
  )
}
