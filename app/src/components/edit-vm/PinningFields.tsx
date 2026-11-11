import {
  Button,
  FormGroup,
  FormHelperText,
  FormSection,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Skeleton,
  TextInput,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { UseQueryResult } from '@tanstack/react-query'
import type { VmNumaNode } from '../../api/resources/vmNuma'
import type { PlacementHostNumaNodes } from '../../hooks/useVmNumaNodes'
import { useT } from '../../i18n/useT'
import { FieldHelp } from '../forms/FieldHelp'
import {
  CPU_PINNING_POLICY_OPTIONS,
  cpuPinningDraftError,
  draftHasSpecificHost,
  type DraftError,
} from './cpuPinning'
import type { EditVmDraft } from './editVmDraft'
import {
  formatCpuIds,
  freshNumaNodes,
  NUMA_TUNE_MODE_OPTIONS,
  resolveNumaNodes,
  type NumaNodeDraft,
} from './numaDraft'

type SetDraft = <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void

// Webadmin flips the migration mode to "Allow manual migration only" as soon as
// a VM gets a pinning configuration (UnitVmModel.cpuPinningChanged /
// VmModelBehaviorBase.useNumaPinningChanged set IMPLICITLY_NON_MIGRATABLE,
// which is user_migratable on the wire). It is a default, not an engine rule:
// the user can still pick another mode afterwards. Unlike webadmin the mode is
// not flipped back to migratable when the pinning is cleared again.
function nudgeMigrationMode(draft: EditVmDraft, set: SetDraft): void {
  if (draft.migrationMode === 'migratable') set('migrationMode', 'user_migratable')
}

// CPU pinning block of the Host section: the 4.5 policy and, for Manual, the
// pinning string. Webadmin keeps these two under Resource Allocation; they sit
// here because every rule they obey (a specific host, pinned vNUMA nodes) is
// edited on this tab.
export function CpuPinningFields({
  draft,
  set,
  baselinePolicy,
  dedicatedSupported,
}: {
  draft: EditVmDraft
  set: SetDraft
  // the policy the VM was loaded with (leaving Resize and Pin drops the nodes'
  // engine-made pins, as webadmin's NumaUnitToVmBaseBuilder does)
  baselinePolicy: string
  // cluster compatibility >= 4.7 (engine config IsDedicatedSupported)
  dedicatedSupported: boolean
}) {
  const t = useT()
  const specificHost = draftHasSpecificHost(draft)
  const numaPinned = draft.numaNodes.some((node) => node.pins.length > 0)
  const error = cpuPinningDraftError(draft)

  // Webadmin's CpuPinningListModel enablement (UnitVmModel.updateCpuPinningPolicy):
  // Manual needs a specific host; Dedicated / Isolate Threads need a 4.7
  // cluster and no pinned vNUMA node. The loaded policy always stays
  // selectable so the select can show it.
  const policyDisabled = (policy: string): boolean => {
    if (policy === draft.cpuPinningPolicy) return false
    if (policy === 'manual') return !specificHost
    if (policy === 'dedicated' || policy === 'isolate_threads') {
      return !dedicatedSupported || numaPinned
    }
    return false
  }

  const changePolicy = (policy: string) => {
    set('cpuPinningPolicy', policy)
    if (baselinePolicy === 'resize_and_pin_numa' && policy !== 'resize_and_pin_numa') {
      set('numaNodes', freshNumaNodes(draft.numaNodes.length))
    }
  }

  return (
    <FormSection title={t('vm.edit.pinning.title')} titleElement="h3">
      <FormGroup
        label={t('vm.edit.pinning.policy')}
        fieldId="edit-vm-pinning-policy"
        labelHelp={
          <FieldHelp
            field={t('vm.edit.pinning.policy')}
            content={t('fieldHelp.vm.cpuPinningPolicy')}
          />
        }
      >
        <FormSelect
          id="edit-vm-pinning-policy"
          aria-label={t('vm.edit.pinning.policy')}
          value={draft.cpuPinningPolicy}
          onChange={(_event, value) => changePolicy(value)}
        >
          {CPU_PINNING_POLICY_OPTIONS.map((option) => (
            <FormSelectOption
              key={option.value}
              value={option.value}
              label={t(option.labelId)}
              isDisabled={policyDisabled(option.value)}
            />
          ))}
        </FormSelect>
        <FormHelperText>
          <HelperText>
            {!specificHost && draft.cpuPinningPolicy !== 'manual' && (
              <HelperTextItem>{t('vm.edit.pinning.hint.manualNeedsHost')}</HelperTextItem>
            )}
            {!dedicatedSupported && (
              <HelperTextItem>{t('vm.edit.pinning.hint.dedicatedNeedsVersion')}</HelperTextItem>
            )}
            {dedicatedSupported && numaPinned && (
              <HelperTextItem>{t('vm.edit.pinning.hint.dedicatedNumaPinned')}</HelperTextItem>
            )}
            {draft.cpuPinningPolicy === 'resize_and_pin_numa' && (
              <HelperTextItem>{t('vm.edit.pinning.hint.resizeAndPin')}</HelperTextItem>
            )}
          </HelperText>
        </FormHelperText>
      </FormGroup>

      {draft.cpuPinningPolicy === 'manual' && (
        <FormGroup
          label={t('vm.edit.pinning.topology')}
          isRequired
          fieldId="edit-vm-pinning-topology"
          labelHelp={
            <FieldHelp
              field={t('vm.edit.pinning.topology')}
              content={t('fieldHelp.vm.cpuPinningTopology')}
            />
          }
        >
          <TextInput
            id="edit-vm-pinning-topology"
            aria-label={t('vm.edit.pinning.topology')}
            placeholder="0#0_1#1-3"
            value={draft.cpuPinning}
            validated={error === undefined ? 'default' : 'error'}
            onChange={(_event, value) => {
              set('cpuPinning', value)
              if (value.trim() !== '') nudgeMigrationMode(draft, set)
            }}
          />
          {error !== undefined && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="error">{t(error.id, error.values)}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      )}
    </FormSection>
  )
}

// The value of a node's host-node select: '' unpinned, the host node index, or
// the loaded multi-node pin list (the api-model allows several pins per node;
// webadmin's dialog and this select set one).
function pinValue(node: NumaNodeDraft): string {
  return node.pins.join(',')
}

// NUMA block of the Host section: the virtual node count and, per node, its
// tune mode and the host NUMA node it is pinned to. The vCPUs and memory of
// each node are not edited: they follow webadmin's default distribution
// (numaDraft.distributeNuma), shown read-only.
export function NumaFields({
  draft,
  baseline,
  set,
  numaNodes,
  hostNuma,
  vmIsDown,
  error,
}: {
  draft: EditVmDraft
  baseline: EditVmDraft
  set: SetDraft
  // the VM's numanodes read (loading / error states; the nodes themselves are
  // already folded into the draft by the modal)
  numaNodes: UseQueryResult<VmNumaNode[]>
  // physical NUMA topology of the pinned hosts; the first host's nodes are the
  // pin targets (webadmin's dialog opens on the first selected host)
  hostNuma: PlacementHostNumaNodes
  vmIsDown: boolean
  error: DraftError | undefined
}) {
  const t = useT()
  const engineOwned = draft.cpuPinningPolicy === 'resize_and_pin_numa'
  const editable = vmIsDown && !engineOwned
  const specificHost = draftHasSpecificHost(draft)
  const hostNodes = [...(hostNuma.hosts[0]?.nodes ?? [])].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  )
  // Webadmin only enables NUMA pinning with a specific host whose hosts all
  // support NUMA (VmModelBehaviorBase.updateNumaPinningEnabled); "supports
  // NUMA" is "reports more than one node" on the engine.
  const canPin = editable && specificHost && hostNodes.length > 1
  const nodes = resolveNumaNodes(draft, baseline)

  // rows are the draft nodes in index order, so a row's position addresses its
  // draft node even when the indices get renumbered by a redistribution
  const updateNode = (position: number, change: Partial<NumaNodeDraft>) => {
    const sorted = [...draft.numaNodes].sort((a, b) => a.index - b.index)
    set(
      'numaNodes',
      sorted.map((node, at) => (at === position ? { ...node, ...change } : node)),
    )
  }

  return (
    <FormSection title={t('vm.edit.numa.title')} titleElement="h3">
      {numaNodes.isPending && (
        <Skeleton height="4rem" screenreaderText={t('vm.edit.numa.loading')} />
      )}
      {numaNodes.isError && (
        <>
          <HelperText>
            <HelperTextItem variant="error">
              {t('vm.edit.numa.error')}
              {numaNodes.error instanceof Error ? `: ${numaNodes.error.message}` : ''}
            </HelperTextItem>
          </HelperText>
          <Button variant="link" isInline onClick={() => void numaNodes.refetch()}>
            {t('vm.edit.host.hosts.retry')}
          </Button>
        </>
      )}
      {draft.numaLoaded && (
        <>
          <FormGroup
            label={t('vm.edit.numa.count')}
            fieldId="edit-vm-numa-count"
            labelHelp={
              <FieldHelp field={t('vm.edit.numa.count')} content={t('fieldHelp.vm.numaCount')} />
            }
          >
            <TextInput
              id="edit-vm-numa-count"
              type="number"
              min={0}
              aria-label={t('vm.edit.numa.count')}
              value={draft.numaNodes.length}
              isDisabled={!editable}
              onChange={(_event, value) => {
                const count = Math.max(0, Math.floor(Number(value) || 0))
                if (count !== draft.numaNodes.length) set('numaNodes', freshNumaNodes(count))
              }}
            />
            <FormHelperText>
              <HelperText>
                {!vmIsDown && <HelperTextItem>{t('vm.edit.numa.hint.running')}</HelperTextItem>}
                {vmIsDown && engineOwned && (
                  <HelperTextItem>{t('vm.edit.pinning.hint.resizeAndPin')}</HelperTextItem>
                )}
                {editable && nodes.length > 0 && !specificHost && (
                  <HelperTextItem>{t('vm.edit.numa.hint.needsHost')}</HelperTextItem>
                )}
                {editable && nodes.length > 0 && specificHost && hostNuma.isPending && (
                  <HelperTextItem>{t('vm.edit.numa.hint.hostLoading')}</HelperTextItem>
                )}
                {error !== undefined && (
                  <HelperTextItem variant="error">{t(error.id, error.values)}</HelperTextItem>
                )}
              </HelperText>
            </FormHelperText>
            {editable && nodes.length > 0 && specificHost && hostNuma.isError && (
              <>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('vm.edit.numa.hint.hostError')}
                    {hostNuma.error instanceof Error ? `: ${hostNuma.error.message}` : ''}
                  </HelperTextItem>
                </HelperText>
                <Button variant="link" isInline onClick={hostNuma.refetch}>
                  {t('vm.edit.host.hosts.retry')}
                </Button>
              </>
            )}
          </FormGroup>

          {nodes.length > 0 && (
            <Table aria-label={t('vm.edit.numa.table')} variant="compact">
              <Thead>
                <Tr>
                  <Th>{t('vm.edit.numa.column.node')}</Th>
                  <Th>{t('vm.edit.numa.column.resources')}</Th>
                  <Th>{t('vm.edit.numa.column.tune')}</Th>
                  <Th>{t('vm.edit.numa.column.hostNode')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {nodes.map((node, position) => (
                  <Tr key={node.index}>
                    <Td dataLabel={t('vm.edit.numa.column.node')}>{node.index}</Td>
                    <Td dataLabel={t('vm.edit.numa.column.resources')}>
                      {t('vm.edit.numa.resources', {
                        cpus: formatCpuIds(node.cpuIds),
                        memory: node.memoryMb,
                      })}
                    </Td>
                    <Td dataLabel={t('vm.edit.numa.column.tune')}>
                      <FormSelect
                        id={`edit-vm-numa-tune-${node.index}`}
                        aria-label={t('vm.edit.numa.tuneLabel', { index: node.index })}
                        value={node.tuneMode}
                        isDisabled={!editable}
                        onChange={(_event, value) => updateNode(position, { tuneMode: value })}
                      >
                        {NUMA_TUNE_MODE_OPTIONS.map((option) => (
                          <FormSelectOption
                            key={option.value}
                            value={option.value}
                            label={t(option.labelId)}
                          />
                        ))}
                      </FormSelect>
                    </Td>
                    <Td dataLabel={t('vm.edit.numa.column.hostNode')}>
                      <FormSelect
                        id={`edit-vm-numa-pin-${node.index}`}
                        aria-label={t('vm.edit.numa.pinLabel', { index: node.index })}
                        value={pinValue(node)}
                        // an existing pin can always be cleared while the
                        // topology is editable, even with no host to pin to
                        isDisabled={!(canPin || (editable && node.pins.length > 0))}
                        onChange={(_event, value) => {
                          updateNode(position, {
                            pins: value === '' ? [] : value.split(',').map(Number),
                          })
                          if (value !== '') nudgeMigrationMode(draft, set)
                        }}
                      >
                        <FormSelectOption value="" label={t('vm.edit.numa.pin.none')} />
                        {canPin &&
                          hostNodes.map((hostNode) => (
                            <FormSelectOption
                              key={hostNode.index}
                              value={String(hostNode.index)}
                              label={t('vm.edit.numa.pin.hostNode', { index: hostNode.index ?? 0 })}
                            />
                          ))}
                        {/* a loaded pin the options above do not offer (several
                            host nodes, or a node of a host that is not loaded) */}
                        {node.pins.length > 0 &&
                          !(
                            canPin &&
                            node.pins.length === 1 &&
                            hostNodes.some((hostNode) => hostNode.index === node.pins[0])
                          ) && (
                            <FormSelectOption
                              value={pinValue(node)}
                              label={t('vm.edit.numa.pin.hostNode', {
                                index: node.pins.join(', '),
                              })}
                            />
                          )}
                      </FormSelect>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </>
      )}
    </FormSection>
  )
}
