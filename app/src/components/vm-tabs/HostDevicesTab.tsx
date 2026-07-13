import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  TextInput,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { HostDevice } from '../../api/schemas/host-device'
import { getHost, listHostDevices } from '../../api/resources/hosts'
import { attachVmHostDevice, detachVmHostDevice } from '../../api/resources/hostDevices'
import {
  addVmMediatedDevice,
  listHostMdevTypes,
  listVmMediatedDevices,
  mdevType,
  removeVmMediatedDevice,
  type MediatedDevice,
} from '../../api/resources/mediatedDevices'
import { useVmHostDevices, VM_DETAIL_POLL_INTERVAL_MS } from '../../hooks/useVmDetail'
import { useVm } from '../../hooks/useVm'
import { useCapabilities } from '../../auth/capabilities'
import { useSettings } from '../../settings/SettingsProvider'
import { useNotify } from '../../notifications/context'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import { ConfirmModal } from '../ConfirmModal'

// Only PCI and whole-USB devices are assignable for passthrough — mirror
// webadmin's attach picker, which filters the host's device inventory to these
// capabilities. Everything else the host reports (scsi/storage/net/system/…) is
// not attachable to a VM.
const ATTACHABLE_CAPABILITIES = new Set(['pci', 'usb_device'])

// vendor/product arrive as { name } on current engines but as a bare string on
// older ones (the shared host-device schema accepts both) — resolve either
// form to a plain label. Same helper as host-tabs/HostDevicesTab.
function named(value: HostDevice['vendor']): string {
  if (value === undefined) return '—'
  if (typeof value === 'string') return value || '—'
  return value.name ?? '—'
}

function deviceLabel(device: HostDevice): string {
  return device.name ?? device.id
}

// Host devices passed through to this VM (GET /vms/{id}/hostdevices). The tab is
// read+write: it lists the VM's attached devices and drives attach (from the
// pinned host's inventory) and per-row detach.
export function HostDevicesTab({ vmId }: { vmId: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const { isAdmin } = useCapabilities()
  const devices = useVmHostDevices(vmId)
  const [attachOpen, setAttachOpen] = useState(false)
  const [detaching, setDetaching] = useState<HostDevice | null>(null)

  // Names already attached to this VM — the attach picker filters them out so
  // the same physical device can't be double-selected (the attached device's id
  // under the VM differs from the host device id, so we key on the stable name).
  const attachedNames = useMemo(
    () => new Set((devices.data ?? []).map((device) => device.name ?? '')),
    [devices.data],
  )

  const detachMutation = useMutation({
    mutationFn: (device: HostDevice) => detachVmHostDevice(vmId, device.id),
    onSuccess: (_data, device) => {
      notify({ title: `Host device ${deviceLabel(device)} detached`, variant: 'success' })
    },
    onError: (error: Error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'hostDevices'] })
    },
  })

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <Button variant="primary" onClick={() => setAttachOpen(true)}>
              {t('vmHostDevices.attach')}
            </Button>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {devices.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vmHostDevices.loading')} />
        </>
      )}

      {devices.isError && (
        <EmptyState titleText={t('vmHostDevices.error.title')} status="danger">
          <EmptyStateBody>
            {devices.error instanceof Error ? devices.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void devices.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {devices.isSuccess && devices.data.length === 0 && (
        <EmptyState titleText={t('vmHostDevices.empty.title')}>
          <EmptyStateBody>{t('vmHostDevices.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {devices.isSuccess && devices.data.length > 0 && (
        <Table aria-label={t('vmHostDevices.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('common.field.name')}</Th>
              <Th>{t('vmHostDevices.column.capability')}</Th>
              <Th>{t('vmHostDevices.column.vendor')}</Th>
              <Th>{t('vmHostDevices.column.product')}</Th>
              <Th aria-label={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {devices.data.map((device: HostDevice) => (
              <Tr key={device.id}>
                <Td dataLabel={t('common.field.name')}>{device.name ?? '—'}</Td>
                <Td dataLabel={t('vmHostDevices.column.capability')}>{device.capability ?? '—'}</Td>
                <Td dataLabel={t('vmHostDevices.column.vendor')}>{named(device.vendor)}</Td>
                <Td dataLabel={t('vmHostDevices.column.product')}>{named(device.product)}</Td>
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  <Button
                    variant="secondary"
                    isDisabled={detachMutation.isPending}
                    onClick={() => setDetaching(device)}
                  >
                    {t('vmHostDevices.detach')}
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {/* vGPU (mediated devices) — admin-only. The engine's Filter header keeps
          non-admins from the mdev subcollection server-side; the section stays
          hidden for them client-side too. */}
      {isAdmin && <VGpuSection vmId={vmId} />}

      {attachOpen && (
        <AttachDevicesModal
          vmId={vmId}
          attachedNames={attachedNames}
          onClose={() => setAttachOpen(false)}
        />
      )}

      <ConfirmModal
        isOpen={detaching !== null}
        title={
          detaching ? t('vmHostDevices.detach.confirm.title', { name: deviceLabel(detaching) }) : ''
        }
        body={t('vmHostDevices.detach.confirm.body')}
        confirmLabel={t('vmHostDevices.detach')}
        onConfirm={() => {
          if (detaching) detachMutation.mutate(detaching)
          setDetaching(null)
        }}
        onCancel={() => setDetaching(null)}
      />
    </>
  )
}

// The attach dialog. Passthrough requires the VM be pinned to exactly one host
// (placement_policy.hosts) — webadmin's precondition — so we branch: not pinned
// shows the needsPin guidance; pinned lists that host's attachable devices for a
// multi-select attach.
function AttachDevicesModal({
  vmId,
  attachedNames,
  onClose,
}: {
  vmId: string
  attachedNames: ReadonlySet<string>
  onClose: () => void
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const vm = useVm(vmId)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  // A single dedicated host is the passthrough precondition; zero or several
  // means "not pinned" for our purposes (webadmin requires exactly one).
  const pinnedHostId = useMemo(() => {
    const hosts = vm.data?.placement_policy?.hosts?.host ?? []
    return hosts.length === 1 ? hosts[0]?.id : undefined
  }, [vm.data])

  // Reuse the read-only host reads (shared cache keys with useHost /
  // useHostDevices); gated until a pinned host is known.
  const host = useQuery({
    queryKey: ['host', pinnedHostId],
    queryFn: () => getHost(pinnedHostId ?? ''),
    enabled: pinnedHostId !== undefined,
  })
  const hostDevices = useQuery({
    queryKey: ['host', pinnedHostId, 'devices'],
    queryFn: () => listHostDevices(pinnedHostId ?? ''),
    enabled: pinnedHostId !== undefined,
  })

  const attachable = useMemo(
    () =>
      (hostDevices.data ?? []).filter(
        (device) =>
          device.capability !== undefined &&
          ATTACHABLE_CAPABILITIES.has(device.capability) &&
          !attachedNames.has(device.name ?? ''),
      ),
    [hostDevices.data, attachedNames],
  )

  const attachMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Sequential: each attach may pull IOMMU-group siblings in as
      // placeholders, so we let the engine settle one before the next.
      for (const id of ids) await attachVmHostDevice(vmId, { id })
    },
    onSuccess: (_data, ids) => {
      notify({
        title: ids.length === 1 ? 'Host device attached' : `${ids.length} host devices attached`,
        variant: 'success',
      })
      onClose()
    },
    onError: (error: Error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'hostDevices'] })
    },
  })

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const allSelected = attachable.length > 0 && attachable.every((device) => selected.has(device.id))

  return (
    <Modal variant="medium" isOpen onClose={onClose} aria-labelledby="attach-hostdev-title">
      <ModalHeader title={t('vmHostDevices.attach.title')} labelId="attach-hostdev-title" />
      <ModalBody>
        {vm.isPending && <Skeleton height="8rem" screenreaderText={t('common.state.loading')} />}

        {vm.isError && (
          <HelperText>
            <HelperTextItem variant="error">
              {vm.error instanceof Error ? vm.error.message : t('common.error.unknown')}
            </HelperTextItem>
          </HelperText>
        )}

        {vm.isSuccess && pinnedHostId === undefined && (
          <Alert variant="info" isInline title={t('vmHostDevices.attach.needsPin')} />
        )}

        {pinnedHostId !== undefined && (
          <>
            <p style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
              <strong>{t('vmHostDevices.attach.pinnedHost')}:</strong>{' '}
              {host.data?.name ?? pinnedHostId}
            </p>

            {/* IOMMU side-effect note (VmHostDevicesService.Add javadoc). */}
            <Alert
              variant="info"
              isInline
              title={t('vmHostDevices.attach.iommuNote')}
              style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
            />

            {hostDevices.isPending && (
              <Skeleton height="6rem" screenreaderText={t('vmHostDevices.loading')} />
            )}

            {hostDevices.isError && (
              <HelperText>
                <HelperTextItem variant="error">
                  {hostDevices.error instanceof Error
                    ? hostDevices.error.message
                    : t('common.error.unknown')}
                </HelperTextItem>
              </HelperText>
            )}

            {hostDevices.isSuccess && attachable.length === 0 && (
              <HelperText>
                <HelperTextItem>{t('vmHostDevices.attach.empty')}</HelperTextItem>
              </HelperText>
            )}

            {hostDevices.isSuccess && attachable.length > 0 && (
              <Table aria-label={t('vmHostDevices.attach.title')} variant="compact">
                <Thead>
                  <Tr>
                    <Th
                      aria-label={t('vms.selectAll')}
                      select={{
                        isSelected: allSelected,
                        onSelect: (_event, isSelecting) =>
                          setSelected(
                            isSelecting
                              ? new Set(attachable.map((device) => device.id))
                              : new Set(),
                          ),
                      }}
                    />
                    <Th>{t('common.field.name')}</Th>
                    <Th>{t('vmHostDevices.column.capability')}</Th>
                    <Th>{t('vmHostDevices.column.vendor')}</Th>
                    <Th>{t('vmHostDevices.column.product')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {attachable.map((device, rowIndex) => (
                    <Tr key={device.id}>
                      <Td
                        select={{
                          rowIndex,
                          isSelected: selected.has(device.id),
                          onSelect: (_event, isSelecting) => toggle(device.id, isSelecting),
                        }}
                      />
                      <Td dataLabel={t('common.field.name')}>{device.name ?? '—'}</Td>
                      <Td dataLabel={t('vmHostDevices.column.capability')}>
                        {device.capability ?? '—'}
                      </Td>
                      <Td dataLabel={t('vmHostDevices.column.vendor')}>{named(device.vendor)}</Td>
                      <Td dataLabel={t('vmHostDevices.column.product')}>{named(device.product)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          isDisabled={selected.size === 0 || attachMutation.isPending}
          isLoading={attachMutation.isPending}
          onClick={() => attachMutation.mutate([...selected])}
        >
          {t('common.action.attach')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// The mdev type a mediated-device row displays, or its id when the engine
// reports no mdevType property (shouldn't happen for a well-formed vGPU spec).
function mdevLabel(device: MediatedDevice): string {
  return mdevType(device) ?? device.id ?? '—'
}

// vGPU (mediated devices) attached to the VM (GET /vms/{id}/mediateddevices).
// Admin-only surface (the parent gates on isAdmin). Read + add + remove: lists
// the configured mdev specs and drives an Add modal and per-row Remove. Strings
// are hardcoded English — a later i18n pass externalizes them.
function VGpuSection({ vmId }: { vmId: string }) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const { refreshIntervalMs } = useSettings()
  const [addOpen, setAddOpen] = useState(false)
  const [removing, setRemoving] = useState<MediatedDevice | null>(null)

  const mdevs = useQuery({
    queryKey: ['vm', vmId, 'mediatedDevices'],
    queryFn: () => listVmMediatedDevices(vmId),
    refetchInterval: Math.max(refreshIntervalMs, VM_DETAIL_POLL_INTERVAL_MS),
  })

  const removeMutation = useMutation({
    mutationFn: (device: MediatedDevice) => removeVmMediatedDevice(vmId, device.id ?? ''),
    onSuccess: (_data, device) => {
      notify({ title: `vGPU ${mdevLabel(device)} removed`, variant: 'success' })
    },
    onError: (error: Error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'mediatedDevices'] })
    },
  })

  return (
    <>
      <Divider style={{ margin: 'var(--pf-t--global--spacer--lg) 0' }} />
      <Title
        headingLevel="h3"
        size="md"
        style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
      >
        vGPU (mediated devices)
      </Title>

      {mdevs.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading vGPU devices" />
        </>
      )}

      {mdevs.isError && (
        <EmptyState titleText="Could not load vGPU devices" status="danger">
          <EmptyStateBody>
            {mdevs.error instanceof Error ? mdevs.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void mdevs.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {mdevs.isSuccess && mdevs.data.length === 0 && (
        <EmptyState titleText="No vGPU devices">
          <EmptyStateBody>
            No mediated (vGPU) devices are configured on this VM. Add one to assign a slice of a
            host GPU.
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setAddOpen(true)}>
                Add vGPU
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {mdevs.isSuccess && mdevs.data.length > 0 && (
        <>
          <Toolbar>
            <ToolbarContent>
              <ToolbarItem>
                <Button variant="secondary" onClick={() => setAddOpen(true)}>
                  Add vGPU
                </Button>
              </ToolbarItem>
            </ToolbarContent>
          </Toolbar>
          <Table aria-label="vGPU mediated devices" variant="compact">
            <Thead>
              <Tr>
                <Th>mdev type</Th>
                <Th>Framebuffer console</Th>
                <Th aria-label="Actions" />
              </Tr>
            </Thead>
            <Tbody>
              {mdevs.data.map((device, i) => (
                <Tr key={device.id ?? i}>
                  <Td dataLabel="mdev type">{mdevLabel(device)}</Td>
                  {/* spec_params 'nodisplay'=true means the mdev does NOT drive the
                      framebuffer console; absent → the engine default (enabled). */}
                  <Td dataLabel="Framebuffer console">{specParamDisplay(device)}</Td>
                  <Td dataLabel="Actions" isActionCell>
                    <Button
                      variant="secondary"
                      isDisabled={removeMutation.isPending}
                      onClick={() => setRemoving(device)}
                    >
                      Remove
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </>
      )}

      {addOpen && (
        <AddVGpuModal vmId={vmId} existing={mdevs.data ?? []} onClose={() => setAddOpen(false)} />
      )}

      <ConfirmModal
        isOpen={removing !== null}
        title={removing ? `Remove vGPU ${mdevLabel(removing)}?` : ''}
        body="The mediated device is released from this VM. The change applies the next time the VM starts."
        confirmLabel="Remove"
        onConfirm={() => {
          if (removing) removeMutation.mutate(removing)
          setRemoving(null)
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  )
}

// The framebuffer-console cell: spec_params 'nodisplay'=true disables it,
// anything else (or absent) leaves the engine default (enabled).
function specParamDisplay(device: MediatedDevice): string {
  const value = (device.spec_params?.property ?? []).find((p) => p.name === 'nodisplay')?.value
  return value === 'true' ? 'Disabled' : 'Enabled'
}

// Add a vGPU mediated device. The mdev type is discovered from the VM's run-on
// host (or its single pinned host) device inventory where a vGPU-capable GPU is
// present; a free-text field always backs it up.
//
// GPU-LESS-LAB CAVEAT: the reference lab has no vGPU-capable GPU, so
// listHostMdevTypes returns [] there — the modal shows the manual entry field
// alone and a note explaining why the type list is empty.
function AddVGpuModal({
  vmId,
  existing,
  onClose,
}: {
  vmId: string
  existing: MediatedDevice[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const vm = useVm(vmId)

  // Discovery host: the host the VM currently runs on (vm.host, followed by
  // getVm), else its single pinned host. mdev types live on that host's device
  // inventory — there is no cluster/global mdev-type catalog.
  const pinnedHostId = useMemo(() => {
    const hosts = vm.data?.placement_policy?.hosts?.host ?? []
    return hosts.length === 1 ? hosts[0]?.id : undefined
  }, [vm.data])
  const discoveryHostId = vm.data?.host?.id ?? pinnedHostId

  const mdevTypes = useQuery({
    queryKey: ['host', discoveryHostId, 'mdevTypes'],
    queryFn: () => listHostMdevTypes(discoveryHostId ?? ''),
    enabled: discoveryHostId !== undefined,
  })

  const [mdevTypeValue, setMdevTypeValue] = useState('')
  const [nodisplay, setNodisplay] = useState(false)

  const existingTypes = useMemo(
    () => new Set(existing.map((device) => mdevType(device)).filter(Boolean)),
    [existing],
  )
  const trimmed = mdevTypeValue.trim()
  const duplicate = trimmed !== '' && existingTypes.has(trimmed)

  const addMutation = useMutation({
    mutationFn: () => addVmMediatedDevice(vmId, { mdevType: trimmed, nodisplay }),
    onSuccess: () => {
      notify({ title: `vGPU ${trimmed} added`, variant: 'success' })
      onClose()
    },
    onError: (error: Error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'mediatedDevices'] })
    },
  })

  const discovered = mdevTypes.data ?? []

  return (
    <Modal variant="small" isOpen onClose={onClose} aria-labelledby="add-vgpu-title">
      <ModalHeader title="Add vGPU (mediated device)" labelId="add-vgpu-title" />
      <ModalBody>
        <Form
          id="add-vgpu-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmed !== '' && !duplicate && !addMutation.isPending) addMutation.mutate()
          }}
        >
          {discoveryHostId === undefined && (
            <Alert
              variant="info"
              isInline
              title="Start or pin this VM to a host to list its available mdev types. You can still enter a type manually."
            />
          )}

          {discoveryHostId !== undefined && mdevTypes.isSuccess && discovered.length === 0 && (
            <Alert
              variant="info"
              isInline
              title="This host reports no mdev types (no vGPU-capable GPU). Enter the mdev type name manually."
            />
          )}

          {discovered.length > 0 && (
            <FormGroup label="Available mdev types" fieldId="add-vgpu-select">
              <FormSelect
                id="add-vgpu-select"
                aria-label="Available mdev types"
                value={discovered.some((type) => type.name === trimmed) ? trimmed : ''}
                onChange={(_event, value) => setMdevTypeValue(value)}
              >
                <FormSelectOption value="" label="Select a type…" isDisabled />
                {discovered.map((type) => (
                  <FormSelectOption
                    key={type.name}
                    value={type.name}
                    label={mdevOptionLabel(type)}
                  />
                ))}
              </FormSelect>
            </FormGroup>
          )}

          <FormGroup
            label="mdev type"
            isRequired
            fieldId="add-vgpu-type"
            labelHelp={
              <FieldHelp
                field="mdev type"
                content="The mediated-device type name that rides as the spec_params 'mdevType' property, for example nvidia-11 or i915-GVTg_V5_4. In a lab without a vGPU-capable GPU the host reports no types, so enter the name directly."
              />
            }
          >
            <TextInput
              id="add-vgpu-type"
              aria-label="mdev type"
              value={mdevTypeValue}
              onChange={(_event, value) => setMdevTypeValue(value)}
              validated={duplicate ? 'error' : 'default'}
            />
            {duplicate && (
              <HelperText>
                <HelperTextItem variant="error">
                  This mdev type is already attached to the VM.
                </HelperTextItem>
              </HelperText>
            )}
          </FormGroup>

          <FormGroup fieldId="add-vgpu-nodisplay">
            <Checkbox
              id="add-vgpu-nodisplay"
              label="Disable framebuffer console (nodisplay)"
              aria-label="Disable framebuffer console"
              isChecked={nodisplay}
              onChange={(_event, checked) => setNodisplay(checked)}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          form="add-vgpu-form"
          type="submit"
          isDisabled={trimmed === '' || duplicate || addMutation.isPending}
          isLoading={addMutation.isPending}
        >
          Add
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// Option label for a discovered mdev type: the human-readable name (falling back
// to the wire name) plus the count of instances still available on the host.
function mdevOptionLabel(type: {
  name?: string
  human_readable_name?: string
  available_instances?: number
}): string {
  const base = type.human_readable_name ?? type.name ?? ''
  return type.available_instances === undefined
    ? base
    : `${base} (${type.available_instances} available)`
}
