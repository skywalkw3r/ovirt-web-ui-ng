import { useEffect, useState, type MouseEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  Divider,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Radio,
  Skeleton,
  Split,
  SplitItem,
  Stack,
  StackItem,
  TextInput,
  Tooltip,
} from '@patternfly/react-core'
import { MinusCircleIcon, NetworkIcon } from '@patternfly/react-icons'
import { StatusBadge } from '../StatusBadge'
import { FieldHelp } from '../forms/FieldHelp'
import { useT } from '../../i18n/useT'
import type { HostNic } from '../../api/schemas/host-nic'
import { listHostNicDetails, type HostNicDetail } from '../../api/resources/hosts'
import { useClusterNetworks } from '../../hooks/useClusterDetail'
import { useHostNetworkAttachments, useHostNics } from '../../hooks/useHostDetail'
import { useSetupHostNetworks } from '../../hooks/useHostMutations'
import { statusText } from '../../lib/format'
import { SriovVfModal } from './SriovVfModal'
import {
  BOND_MODES,
  DEFAULT_BOND_MODE,
  addBondMember,
  addNicLabel,
  attachTargetNames,
  breakBond,
  createBond,
  draftBlocksSave,
  draftHasChanges,
  draftToSpec,
  freeNics,
  hasUnsyncedRows,
  isRowLocked,
  managementGuardError,
  nameServersError,
  nextBondName,
  nicLabelsFor,
  removeBondMember,
  removeNicLabel,
  rowFieldErrors,
  seedSetupNetworksDraft,
  setBondMode,
  setNameServers,
  syncAll,
  updateRow,
  type BondDraft,
  type BootProtocol,
  type Ipv6BootProtocol,
  type NetworkRow,
  type NetworkRowPatch,
  type SetupNetworksDraft,
} from './setupNetworksDraft'

function labelText(row: NetworkRow, t: ReturnType<typeof useT>): string {
  return row.vlan !== undefined
    ? t('setupNetworks.label.withVlan', { name: row.networkName, vlan: row.vlan })
    : row.networkName
}

// One attached network on a NIC/bond: a removable Label (management: remove
// disabled with a tooltip — webadmin's mgmtNotAttachedToolTip guard) that opens
// the inline attachment editor on click. Out-of-sync attachments read orange
// until their sync checkbox is ticked.
function AttachmentLabel({
  row,
  isEditing,
  onEdit,
  onDetach,
}: {
  row: NetworkRow
  isEditing: boolean
  onEdit: () => void
  onDetach: () => void
}) {
  const t = useT()
  const outOfSync = isRowLocked(row) || (row.seed !== undefined && !row.seed.inSync)
  const label = (
    <Label
      color={outOfSync ? 'orange' : 'blue'}
      variant={isEditing ? 'filled' : 'outline'}
      onClick={onEdit}
      aria-label={t('setupNetworks.attachment.editAria', { name: row.networkName })}
      {...(row.isManagement
        ? {}
        : {
            onClose: (event: MouseEvent) => {
              event.stopPropagation()
              onDetach()
            },
            closeBtnAriaLabel: t('setupNetworks.attachment.detachAria', { name: row.networkName }),
          })}
    >
      {labelText(row, t)}
      {outOfSync ? t('setupNetworks.attachment.outOfSyncSuffix') : ''}
    </Label>
  )
  if (!row.isManagement) return label
  return <Tooltip content={t('setupNetworks.management.tooltip')}>{label}</Tooltip>
}

// One static-IP stack editor (v4 or v6): address, mask/prefix, gateway.
function StaticIpFields({
  row,
  version,
  idBase,
  locked,
  patch,
}: {
  row: NetworkRow
  version: 'v4' | 'v6'
  idBase: string
  locked: boolean
  patch: (update: NetworkRowPatch) => void
}) {
  const t = useT()
  const errors = rowFieldErrors(row)
  const isV6 = version === 'v6'
  const address = isV6 ? row.ipv6Address : row.address
  const mask = isV6 ? row.ipv6Prefix : row.netmask
  const gateway = isV6 ? row.ipv6Gateway : row.gateway
  const addressError = isV6 ? errors.ipv6Address : errors.address
  const maskError = isV6 ? errors.ipv6Prefix : errors.netmask
  const gatewayError = isV6 ? errors.ipv6Gateway : errors.gateway
  const maskLabel = isV6 ? t('setupNetworks.field.prefixLength') : t('setupNetworks.field.netmask')
  return (
    <>
      <FormGroup
        label={t('setupNetworks.field.ipAddress')}
        isRequired
        fieldId={`${idBase}-address`}
      >
        <TextInput
          id={`${idBase}-address`}
          isRequired
          aria-label={t('setupNetworks.aria.ipAddress', { name: row.networkName, version })}
          validated={addressError !== undefined ? 'error' : 'default'}
          value={address}
          isDisabled={locked}
          onChange={(_event, value) => patch(isV6 ? { ipv6Address: value } : { address: value })}
        />
        {addressError !== undefined && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{addressError}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <FormGroup label={maskLabel} isRequired fieldId={`${idBase}-mask`}>
        <TextInput
          id={`${idBase}-mask`}
          isRequired
          aria-label={t('setupNetworks.aria.mask', {
            name: row.networkName,
            version,
            mask: maskLabel,
          })}
          validated={maskError !== undefined ? 'error' : 'default'}
          value={mask}
          isDisabled={locked}
          onChange={(_event, value) => patch(isV6 ? { ipv6Prefix: value } : { netmask: value })}
        />
        {maskError !== undefined && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{maskError}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <FormGroup label={t('setupNetworks.field.gateway')} fieldId={`${idBase}-gateway`}>
        <TextInput
          id={`${idBase}-gateway`}
          aria-label={t('setupNetworks.aria.gateway', { name: row.networkName, version })}
          validated={gatewayError !== undefined ? 'error' : 'default'}
          value={gateway}
          isDisabled={locked}
          onChange={(_event, value) => patch(isV6 ? { ipv6Gateway: value } : { gateway: value })}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={gatewayError !== undefined ? 'error' : 'default'}>
              {gatewayError ?? t('setupNetworks.gateway.optional')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </>
  )
}

// One outbound host-network QoS value input (a non-negative integer).
function QosField({
  id,
  label,
  help,
  name,
  value,
  error,
  locked,
  onChange,
}: {
  id: string
  label: string
  help: string
  name: string
  value: string
  error?: string
  locked: boolean
  onChange: (value: string) => void
}) {
  return (
    <FormGroup label={label} fieldId={id} labelHelp={<FieldHelp field={label} content={help} />}>
      <TextInput
        id={id}
        type="number"
        min={0}
        aria-label={`${label} for ${name}`}
        validated={error !== undefined ? 'error' : 'default'}
        value={value}
        isDisabled={locked}
        onChange={(_event, next) => onChange(next)}
      />
      {error !== undefined && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">{error}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  )
}

// The per-attachment host-network QoS override: an inherit/override toggle and,
// while overriding, the three outbound knobs (weighted share, rate limit,
// committed rate). Inherit — the default — leaves the attachment on the
// network's data-center QoS. Disabled while the row is locked (out of sync).
function QosOverrideEditor({
  row,
  locked,
  patch,
}: {
  row: NetworkRow
  locked: boolean
  patch: (update: NetworkRowPatch) => void
}) {
  const errors = rowFieldErrors(row)
  const idBase = `setup-networks-${row.networkId}-qos`
  return (
    <>
      <FormGroup
        fieldId={`${idBase}-toggle`}
        label="Host-network QoS"
        labelHelp={
          <FieldHelp
            field="Host-network QoS"
            content="Override the network's data-center QoS for this host's attachment. Leave off to inherit the network's QoS."
          />
        }
      >
        <Checkbox
          id={`${idBase}-toggle`}
          label="Override the network QoS for this host"
          aria-label={`Override host-network QoS for ${row.networkName}`}
          isChecked={row.qosOverride}
          isDisabled={locked}
          onChange={(_event, checked) => patch({ qosOverride: checked })}
        />
      </FormGroup>
      {row.qosOverride && (
        <>
          <QosField
            id={`${idBase}-linkshare`}
            label="Weighted share"
            help="The share of the link's capacity this network gets relative to the others on it."
            name={row.networkName}
            value={row.qosLinkshare}
            error={errors.qosLinkshare}
            locked={locked}
            onChange={(value) => patch({ qosLinkshare: value })}
          />
          <QosField
            id={`${idBase}-upperlimit`}
            label="Rate limit (Mbps)"
            help="The maximum outbound bandwidth this network may use, in Mbps."
            name={row.networkName}
            value={row.qosUpperlimit}
            error={errors.qosUpperlimit}
            locked={locked}
            onChange={(value) => patch({ qosUpperlimit: value })}
          />
          <QosField
            id={`${idBase}-realtime`}
            label="Committed rate (Mbps)"
            help="The minimum outbound bandwidth requested for this network, in Mbps."
            name={row.networkName}
            value={row.qosRealtime}
            error={errors.qosRealtime}
            locked={locked}
            onChange={(value) => patch({ qosRealtime: value })}
          />
        </>
      )}
    </>
  )
}

// The inline per-attachment editor: NIC/bond (move target), IPv4 + IPv6 boot
// protocol with static fields, the Sync checkbox for drifted attachments, and
// the host-network QoS override. Everything but Sync/detach stays disabled while
// the row is locked (webadmin: "an out-of-sync network cannot be modified" until
// synced).
function AttachmentEditor({
  row,
  targetNames,
  patch,
  onDone,
}: {
  row: NetworkRow
  targetNames: string[]
  patch: (update: NetworkRowPatch) => void
  onDone: () => void
}) {
  const t = useT()
  const locked = isRowLocked(row)
  const idBase = `setup-networks-${row.networkId}`

  return (
    <Form isHorizontal onSubmit={(event) => event.preventDefault()}>
      {row.seed !== undefined && !row.seed.inSync && (
        <FormGroup fieldId={`${idBase}-sync`}>
          <Checkbox
            id={`${idBase}-sync`}
            label={t('setupNetworks.sync.label')}
            aria-label={t('setupNetworks.sync.aria', { name: row.networkName })}
            isChecked={row.syncRequested}
            onChange={(_event, checked) => patch({ syncRequested: checked })}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>{t('setupNetworks.sync.help')}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      )}

      <FormGroup label={t('setupNetworks.field.networkInterface')} fieldId={`${idBase}-nic`}>
        <FormSelect
          id={`${idBase}-nic`}
          aria-label={t('setupNetworks.aria.networkInterface', { name: row.networkName })}
          value={row.nicName ?? ''}
          isDisabled={locked}
          onChange={(_event, value) => patch({ nicName: value })}
        >
          {targetNames.map((name) => (
            <FormSelectOption key={name} value={name} label={name} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label={t('setupNetworks.field.ipv4BootProtocol')}
        role="radiogroup"
        isStack
        fieldId={`${idBase}-proto`}
      >
        {(['none', 'dhcp', 'static'] as BootProtocol[]).map((proto) => (
          <Radio
            key={proto}
            id={`${idBase}-proto-${proto}`}
            name={`${idBase}-proto`}
            label={t(
              proto === 'none'
                ? 'setupNetworks.proto.none'
                : proto === 'dhcp'
                  ? 'setupNetworks.proto.dhcp'
                  : 'setupNetworks.proto.static',
            )}
            aria-label={t('setupNetworks.aria.ipv4Proto', { name: row.networkName, proto })}
            isChecked={row.bootProtocol === proto}
            isDisabled={locked}
            onChange={() => patch({ bootProtocol: proto })}
          />
        ))}
      </FormGroup>

      {row.bootProtocol === 'static' && (
        <StaticIpFields
          row={row}
          version="v4"
          idBase={`${idBase}-v4`}
          locked={locked}
          patch={patch}
        />
      )}

      <FormGroup
        label={t('setupNetworks.field.ipv6BootProtocol')}
        role="radiogroup"
        isStack
        fieldId={`${idBase}-proto6`}
      >
        {(['none', 'dhcp', 'autoconf', 'static'] as Ipv6BootProtocol[]).map((proto) => (
          <Radio
            key={proto}
            id={`${idBase}-proto6-${proto}`}
            name={`${idBase}-proto6`}
            label={t(
              proto === 'none'
                ? 'setupNetworks.proto6.none'
                : proto === 'dhcp'
                  ? 'setupNetworks.proto6.dhcp'
                  : proto === 'autoconf'
                    ? 'setupNetworks.proto6.autoconf'
                    : 'setupNetworks.proto6.static',
            )}
            aria-label={t('setupNetworks.aria.ipv6Proto', { name: row.networkName, proto })}
            isChecked={row.ipv6BootProtocol === proto}
            isDisabled={locked}
            onChange={() => patch({ ipv6BootProtocol: proto })}
          />
        ))}
      </FormGroup>

      {row.ipv6BootProtocol === 'static' && (
        <StaticIpFields
          row={row}
          version="v6"
          idBase={`${idBase}-v6`}
          locked={locked}
          patch={patch}
        />
      )}

      <QosOverrideEditor row={row} locked={locked} patch={patch} />

      <FormGroup fieldId={`${idBase}-done`}>
        <Button
          variant="link"
          isInline
          onClick={onDone}
          aria-label={t('setupNetworks.aria.done', { name: row.networkName })}
        >
          {t('setupNetworks.action.done')}
        </Button>
      </FormGroup>
    </Form>
  )
}

// The attached-networks + attach-picker block shared by NIC and bond cards.
function AttachmentArea({
  targetName,
  idSuffix,
  draft,
  targetNames,
  editing,
  setEditing,
  onPatch,
}: {
  targetName: string
  idSuffix: string
  draft: SetupNetworksDraft
  targetNames: string[]
  editing: string | null
  setEditing: (networkId: string | null) => void
  onPatch: (networkId: string, update: NetworkRowPatch) => void
}) {
  const t = useT()
  const attached = draft.rows.filter((row) => row.nicName === targetName)
  const unattached = draft.rows.filter((row) => row.nicName === null)
  const editingRow = attached.find((row) => row.networkId === editing)

  return (
    <>
      <StackItem>
        {attached.length === 0 ? (
          <span>{t('setupNetworks.noNetworksAttached')}</span>
        ) : (
          <Flex
            spaceItems={{ default: 'spaceItemsSm' }}
            aria-label={t('setupNetworks.aria.networksOn', { name: targetName })}
          >
            {attached.map((row) => (
              <FlexItem key={row.networkId}>
                <AttachmentLabel
                  row={row}
                  isEditing={editing === row.networkId}
                  onEdit={() => setEditing(editing === row.networkId ? null : row.networkId)}
                  onDetach={() => {
                    if (editing === row.networkId) setEditing(null)
                    onPatch(row.networkId, { nicName: null })
                  }}
                />
              </FlexItem>
            ))}
          </Flex>
        )}
      </StackItem>

      {editingRow !== undefined && (
        <StackItem>
          <AttachmentEditor
            row={editingRow}
            targetNames={targetNames}
            patch={(update) => onPatch(editingRow.networkId, update)}
            onDone={() => setEditing(null)}
          />
        </StackItem>
      )}

      {unattached.length > 0 && (
        <StackItem>
          <FormSelect
            id={`setup-networks-attach-${idSuffix}`}
            aria-label={t('setupNetworks.aria.attachTo', { name: targetName })}
            value=""
            onChange={(_event, networkId) => {
              if (networkId === '') return
              onPatch(networkId, { nicName: targetName })
              setEditing(networkId)
            }}
          >
            <FormSelectOption value="" label={t('setupNetworks.attachPlaceholder')} />
            {unattached.map((row) => (
              <FormSelectOption
                key={row.networkId}
                value={row.networkId}
                label={labelText(row, t)}
              />
            ))}
          </FormSelect>
        </StackItem>
      )}
    </>
  )
}

// One NIC's network-label chips (PF Label) plus an add-a-label control. The
// label diff rides in the transactional setupnetworks action's modified_labels /
// removed_labels lists (see the draft's nicLabels).
function NicLabelsEditor({
  nicName,
  labels,
  onAdd,
  onRemove,
}: {
  nicName: string
  labels: string[]
  onAdd: (label: string) => void
  onRemove: (label: string) => void
}) {
  const [value, setValue] = useState('')
  const commit = () => {
    const trimmed = value.trim()
    if (trimmed === '') return
    onAdd(trimmed)
    setValue('')
  }
  return (
    <FormGroup
      label="Labels"
      role="group"
      labelHelp={
        <FieldHelp
          field="Labels"
          content="Network labels attached to this NIC. The engine auto-wires every network that carries a matching label onto the NIC."
        />
      }
    >
      <Stack hasGutter>
        <StackItem>
          {labels.length === 0 ? (
            <span>No labels</span>
          ) : (
            <LabelGroup aria-label={`Labels on ${nicName}`} numLabels={10}>
              {labels.map((label) => (
                <Label
                  key={label}
                  isCompact
                  color="blue"
                  onClose={() => onRemove(label)}
                  closeBtnAriaLabel={`Remove label ${label} from ${nicName}`}
                >
                  {label}
                </Label>
              ))}
            </LabelGroup>
          )}
        </StackItem>
        <StackItem>
          <Split hasGutter>
            <SplitItem isFilled>
              <TextInput
                id={`setup-networks-nic-label-${nicName}`}
                aria-label={`New label for ${nicName}`}
                placeholder="Label"
                value={value}
                onChange={(_event, next) => setValue(next)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commit()
                  }
                }}
              />
            </SplitItem>
            <SplitItem>
              <Button variant="secondary" isDisabled={value.trim() === ''} onClick={commit}>
                Add label
              </Button>
            </SplitItem>
          </Split>
        </StackItem>
      </Stack>
    </FormGroup>
  )
}

// One card per physical NIC (bond members are folded into their bond and not
// shown): identity line, an SR-IOV editor entry for SR-IOV NICs, the networks
// attached to it, an attach picker, and its network labels.
function NicCard({
  nic,
  draft,
  targetNames,
  labels,
  sriov,
  editing,
  setEditing,
  onPatch,
  onAddLabel,
  onRemoveLabel,
  onOpenSriov,
}: {
  nic: HostNic
  draft: SetupNetworksDraft
  targetNames: string[]
  labels: string[]
  sriov: boolean
  editing: string | null
  setEditing: (networkId: string | null) => void
  onPatch: (networkId: string, update: NetworkRowPatch) => void
  onAddLabel: (label: string) => void
  onRemoveLabel: (label: string) => void
  onOpenSriov: () => void
}) {
  const nicName = nic.name ?? ''
  return (
    <Card isCompact>
      <CardHeader>
        <CardTitle>{nicName}</CardTitle>
      </CardHeader>
      <CardBody>
        <Stack hasGutter>
          <StackItem>
            <Flex
              spaceItems={{ default: 'spaceItemsSm' }}
              alignItems={{ default: 'alignItemsCenter' }}
            >
              <FlexItem>{nic.mac?.address ?? '—'}</FlexItem>
              <FlexItem>
                <StatusBadge color={nic.status?.toLowerCase() === 'up' ? 'green' : 'grey'}>
                  {statusText(nic.status ?? 'unknown')}
                </StatusBadge>
              </FlexItem>
              {sriov && (
                <FlexItem align={{ default: 'alignRight' }}>
                  <Button
                    variant="link"
                    isInline
                    icon={<NetworkIcon />}
                    onClick={onOpenSriov}
                    aria-label={`Configure SR-IOV for ${nicName}`}
                  >
                    SR-IOV
                  </Button>
                </FlexItem>
              )}
            </Flex>
          </StackItem>
          <AttachmentArea
            targetName={nicName}
            idSuffix={nic.id}
            draft={draft}
            targetNames={targetNames}
            editing={editing}
            setEditing={setEditing}
            onPatch={onPatch}
          />
          <StackItem>
            <Divider />
          </StackItem>
          <StackItem>
            <NicLabelsEditor
              nicName={nicName}
              labels={labels}
              onAdd={onAddLabel}
              onRemove={onRemoveLabel}
            />
          </StackItem>
        </Stack>
      </CardBody>
    </Card>
  )
}

// One card per bond: mode select, member management (add a free NIC, remove
// down to a two-member floor), a Break action, then the same attachment UI as
// a NIC card. Members carry no attachments of their own (folded onto the bond).
function BondCard({
  bond,
  nics,
  freeForBond,
  draft,
  targetNames,
  editing,
  setEditing,
  onPatch,
  onSetMode,
  onAddMember,
  onRemoveMember,
  onBreak,
}: {
  bond: BondDraft
  nics: HostNic[]
  freeForBond: HostNic[]
  draft: SetupNetworksDraft
  targetNames: string[]
  editing: string | null
  setEditing: (networkId: string | null) => void
  onPatch: (networkId: string, update: NetworkRowPatch) => void
  onSetMode: (mode: number) => void
  onAddMember: (nicId: string) => void
  onRemoveMember: (nicId: string) => void
  onBreak: () => void
}) {
  const t = useT()
  const memberNics = bond.slaveNicIds.map((id) => ({
    id,
    name: nics.find((nic) => nic.id === id)?.name ?? id,
  }))
  return (
    <Card isCompact>
      <CardHeader>
        <CardTitle>
          <Split hasGutter>
            <SplitItem>{bond.name}</SplitItem>
            <SplitItem>
              <Label isCompact variant="outline">
                {t('setupNetworks.bond.label')}
              </Label>
            </SplitItem>
          </Split>
        </CardTitle>
      </CardHeader>
      <CardBody>
        <Stack hasGutter>
          <StackItem>
            <FormGroup
              label={t('setupNetworks.bond.mode')}
              fieldId={`setup-networks-bond-mode-${bond.name}`}
            >
              <FormSelect
                id={`setup-networks-bond-mode-${bond.name}`}
                aria-label={t('setupNetworks.aria.bondMode', { name: bond.name })}
                value={String(bond.mode)}
                onChange={(_event, value) => onSetMode(Number(value))}
              >
                {BOND_MODES.map((entry) => (
                  <FormSelectOption
                    key={entry.mode}
                    value={String(entry.mode)}
                    label={entry.label}
                  />
                ))}
              </FormSelect>
            </FormGroup>
          </StackItem>

          <StackItem>
            <Flex
              spaceItems={{ default: 'spaceItemsSm' }}
              alignItems={{ default: 'alignItemsCenter' }}
              aria-label={t('setupNetworks.aria.bondMembers', { name: bond.name })}
            >
              {memberNics.map((member) => (
                <FlexItem key={member.id}>
                  <Label
                    isCompact
                    variant="outline"
                    onClose={
                      bond.slaveNicIds.length > 2 ? () => onRemoveMember(member.id) : undefined
                    }
                    closeBtnAriaLabel={t('setupNetworks.aria.removeMember', {
                      member: member.name,
                      bond: bond.name,
                    })}
                  >
                    {member.name}
                  </Label>
                </FlexItem>
              ))}
            </Flex>
          </StackItem>

          {freeForBond.length > 0 && (
            <StackItem>
              <FormSelect
                id={`setup-networks-bond-add-${bond.name}`}
                aria-label={t('setupNetworks.aria.addMember', { name: bond.name })}
                value=""
                onChange={(_event, nicId) => {
                  if (nicId !== '') onAddMember(nicId)
                }}
              >
                <FormSelectOption value="" label={t('setupNetworks.addMemberPlaceholder')} />
                {freeForBond.map((nic) => (
                  <FormSelectOption key={nic.id} value={nic.id} label={nic.name ?? nic.id} />
                ))}
              </FormSelect>
            </StackItem>
          )}

          <StackItem>
            <Button
              variant="link"
              isInline
              isDanger
              icon={<MinusCircleIcon />}
              onClick={onBreak}
              aria-label={t('setupNetworks.aria.breakBond', { name: bond.name })}
            >
              {t('setupNetworks.action.breakBond')}
            </Button>
          </StackItem>

          <StackItem>
            <Divider />
          </StackItem>

          <AttachmentArea
            targetName={bond.name}
            idSuffix={bond.name}
            draft={draft}
            targetNames={targetNames}
            editing={editing}
            setEditing={setEditing}
            onPatch={onPatch}
          />
        </Stack>
      </CardBody>
    </Card>
  )
}

// The inline "Create bond" form: pick 2+ free NICs, a mode, and create. The
// name is auto-assigned (lowest free bondN), mirroring webadmin.
function CreateBondForm({
  bondName,
  candidates,
  onCreate,
  onCancel,
}: {
  bondName: string
  candidates: HostNic[]
  onCreate: (mode: number, memberNicIds: string[]) => void
  onCancel: () => void
}) {
  const t = useT()
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState(DEFAULT_BOND_MODE)
  const toggle = (nicId: string, checked: boolean) =>
    setSelected((current) => (checked ? [...current, nicId] : current.filter((id) => id !== nicId)))

  return (
    <Card isCompact>
      <CardHeader>
        <CardTitle>{t('setupNetworks.createBond.title', { name: bondName })}</CardTitle>
      </CardHeader>
      <CardBody>
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('setupNetworks.createBond.members')} isRequired role="group">
            {candidates.map((nic) => (
              <Checkbox
                key={nic.id}
                id={`setup-networks-create-bond-${nic.id}`}
                label={nic.name ?? nic.id}
                aria-label={t('setupNetworks.aria.includeMember', {
                  nic: nic.name ?? nic.id,
                  bond: bondName,
                })}
                isChecked={selected.includes(nic.id)}
                onChange={(_event, checked) => toggle(nic.id, checked)}
              />
            ))}
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={selected.length < 2 ? 'warning' : 'default'}>
                  {t('setupNetworks.createBond.minMembers')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
          <FormGroup label={t('setupNetworks.bond.mode')} fieldId="setup-networks-create-bond-mode">
            <FormSelect
              id="setup-networks-create-bond-mode"
              aria-label={t('setupNetworks.createBond.modeAria')}
              value={String(mode)}
              onChange={(_event, value) => setMode(Number(value))}
            >
              {BOND_MODES.map((entry) => (
                <FormSelectOption key={entry.mode} value={String(entry.mode)} label={entry.label} />
              ))}
            </FormSelect>
          </FormGroup>
          <FlexItem>
            <Button
              variant="secondary"
              isDisabled={selected.length < 2}
              onClick={() => onCreate(mode, selected)}
            >
              {t('setupNetworks.action.createBond')}
            </Button>{' '}
            <Button variant="link" onClick={onCancel}>
              {t('common.action.cancel')}
            </Button>
          </FlexItem>
        </Form>
      </CardBody>
    </Card>
  )
}

// The host-level DNS resolver name servers (dns_resolver_configuration): a
// small add/remove list, applied to the management (default-route) attachment.
function NameServersEditor({
  nameServers,
  onChange,
}: {
  nameServers: string[]
  onChange: (nameServers: string[]) => void
}) {
  const t = useT()
  // present an empty row so there is always something to type into
  const rows = nameServers.length === 0 ? [''] : nameServers
  const error = nameServersError(nameServers)
  const setAt = (index: number, value: string) =>
    onChange(rows.map((server, i) => (i === index ? value : server)))
  const removeAt = (index: number) => onChange(rows.filter((_server, i) => i !== index))

  return (
    <FormGroup label={t('setupNetworks.dns.label')} role="group" fieldId="setup-networks-dns">
      <Stack hasGutter>
        {rows.map((server, index) => (
          <StackItem key={index}>
            <Split hasGutter>
              <SplitItem isFilled>
                <TextInput
                  id={`setup-networks-dns-${index}`}
                  aria-label={t('setupNetworks.aria.nameServer', { index: index + 1 })}
                  placeholder={t('setupNetworks.dns.placeholder')}
                  value={server}
                  onChange={(_event, value) => setAt(index, value)}
                />
              </SplitItem>
              <SplitItem>
                <Button
                  variant="plain"
                  aria-label={t('setupNetworks.aria.removeNameServer', { index: index + 1 })}
                  isDisabled={rows.length === 1 && server === ''}
                  onClick={() => removeAt(index)}
                  icon={<MinusCircleIcon />}
                />
              </SplitItem>
            </Split>
          </StackItem>
        ))}
        <StackItem>
          <Button variant="link" isInline onClick={() => onChange([...rows, ''])}>
            {t('setupNetworks.dns.add')}
          </Button>
        </StackItem>
        {error !== undefined && (
          <StackItem>
            <HelperText>
              <HelperTextItem variant="error">{error}</HelperTextItem>
            </HelperText>
          </StackItem>
        )}
      </Stack>
    </FormGroup>
  )
}

// The Setup Host Networks dialog — the pragmatic PF6 take on webadmin's
// drag-and-drop HostSetupNetworksModel: per-NIC/bond sections instead of
// columns, the same one-shot transactional POST /hosts/{id}/setupnetworks
// underneath. Mount conditionally ({open && <SetupNetworksModal …>}) so each
// opening reseeds the draft from the engine's current attachments.
export function SetupNetworksModal({
  hostId,
  clusterId,
  isOpen,
  onClose,
}: {
  hostId: string
  clusterId: string
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const nics = useHostNics(hostId)
  const attachments = useHostNetworkAttachments(hostId)
  const networks = useClusterNetworks(clusterId)
  const setup = useSetupHostNetworks()
  // NIC labels + SR-IOV VF config the base NIC read (useHostNics) doesn't carry:
  // network_labels is a @Link sub-collection (followed here), the VF config is
  // inlined. Inlined useQuery rather than a hooks/ hook because this wave owns
  // only host-network/**; it degrades to empty via listHostNicDetails on error.
  const nicDetails = useQuery({
    queryKey: ['host', hostId, 'nicDetails'],
    queryFn: () => listHostNicDetails(hostId),
    enabled: isOpen,
  })

  // Seed once when all sources land; polling refetches after that must not
  // clobber in-progress edits, hence the null-gated effect instead of a derived
  // value. nicDetails is allowed to be pending-then-settled independently, so a
  // details failure never blocks the dialog — it just seeds empty labels.
  const [draft, setDraft] = useState<SetupNetworksDraft | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [creatingBond, setCreatingBond] = useState(false)
  const [sriovNicId, setSriovNicId] = useState<string | null>(null)
  const ready =
    nics.isSuccess && attachments.isSuccess && networks.isSuccess && !nicDetails.isPending
  useEffect(() => {
    if (ready && draft === null) {
      setDraft(
        seedSetupNetworksDraft(networks.data, attachments.data, nics.data, nicDetails.data ?? []),
      )
    }
  }, [ready, draft, networks.data, attachments.data, nics.data, nicDetails.data])

  const isPending = nics.isPending || attachments.isPending || networks.isPending
  const isError = nics.isError || attachments.isError || networks.isError
  const retryFailed = () => {
    if (nics.isError) void nics.refetch()
    if (attachments.isError) void attachments.refetch()
    if (networks.isError) void networks.refetch()
  }

  // SR-IOV NICs — keyed by id so the NIC cards can show the editor entry and the
  // modal can look up the VF seed values.
  const detailById = new Map<string, HostNicDetail>(
    (nicDetails.data ?? []).map((detail) => [detail.id, detail]),
  )
  const sriovDetail = sriovNicId !== null ? detailById.get(sriovNicId) : undefined

  const allNics = nics.data ?? []
  const free = draft !== null ? freeNics(allNics, draft) : []
  const targetNames = draft !== null ? attachTargetNames(allNics, draft) : []
  const guardError = draft !== null ? managementGuardError(draft) : undefined
  const saveDisabled =
    setup.isPending || draft === null || !draftHasChanges(draft) || draftBlocksSave(draft)

  const patchRow = (networkId: string, update: NetworkRowPatch) =>
    setDraft((current) => (current === null ? current : updateRow(current, networkId, update)))
  const mutateDraft = (next: (draft: SetupNetworksDraft) => SetupNetworksDraft) =>
    setDraft((current) => (current === null ? current : next(current)))

  const save = () => {
    if (draft === null) return
    // engine faults (409 topology refusals etc.) toast via the mutation's
    // onError and keep the modal open for another attempt
    setup.mutate({ id: hostId, spec: draftToSpec(draft) }, { onSuccess: onClose })
  }

  const hasCards = free.length > 0 || (draft !== null && draft.bonds.length > 0)

  return (
    <>
      <Modal
        variant="large"
        isOpen={isOpen}
        onClose={onClose}
        aria-labelledby="setup-networks-title"
        aria-describedby="setup-networks-body"
      >
        <ModalHeader title={t('setupNetworks.title')} labelId="setup-networks-title" />
        <ModalBody id="setup-networks-body">
          {isPending && (
            <>
              <Skeleton height="6rem" style={{ marginBottom: '0.5rem' }} />
              <Skeleton height="6rem" style={{ marginBottom: '0.5rem' }} />
              <Skeleton height="6rem" screenreaderText={t('setupNetworks.loading')} />
            </>
          )}

          {!isPending && isError && (
            <EmptyState titleText={t('setupNetworks.error.title')} status="danger">
              <EmptyStateBody>
                {[nics.error, attachments.error, networks.error]
                  .filter((error): error is Error => error instanceof Error)
                  .map((error) => error.message)
                  .join('; ') || t('common.error.unknown')}
              </EmptyStateBody>
              <Button variant="primary" onClick={retryFailed}>
                {t('common.action.retry')}
              </Button>
            </EmptyState>
          )}

          {ready && draft !== null && !hasCards && (
            <EmptyState titleText={t('setupNetworks.noNics.title')}>
              <EmptyStateBody>{t('setupNetworks.noNics.body')}</EmptyStateBody>
            </EmptyState>
          )}

          {ready && draft !== null && hasCards && draft.rows.length === 0 && (
            <EmptyState titleText={t('setupNetworks.noNetworks.title')}>
              <EmptyStateBody>{t('setupNetworks.noNetworks.body')}</EmptyStateBody>
            </EmptyState>
          )}

          {ready && draft !== null && hasCards && draft.rows.length > 0 && (
            <Stack hasGutter>
              <StackItem>
                <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                  <FlexItem>
                    <Button
                      variant="secondary"
                      onClick={() => setCreatingBond(true)}
                      isDisabled={creatingBond || free.length < 2}
                    >
                      {t('setupNetworks.action.createBond')}
                    </Button>
                  </FlexItem>
                  <FlexItem>
                    <Button
                      variant="secondary"
                      onClick={() => mutateDraft(syncAll)}
                      isDisabled={!hasUnsyncedRows(draft)}
                    >
                      {t('setupNetworks.action.syncAll')}
                    </Button>
                  </FlexItem>
                </Flex>
              </StackItem>

              {creatingBond && (
                <StackItem>
                  <CreateBondForm
                    bondName={nextBondName(draft, allNics)}
                    candidates={free}
                    onCreate={(mode, memberNicIds) => {
                      const name = nextBondName(draft, allNics)
                      mutateDraft((current) =>
                        createBond(current, allNics, name, mode, memberNicIds),
                      )
                      setCreatingBond(false)
                    }}
                    onCancel={() => setCreatingBond(false)}
                  />
                </StackItem>
              )}

              {draft.bonds.map((bond) => (
                <StackItem key={bond.name}>
                  <BondCard
                    bond={bond}
                    nics={allNics}
                    freeForBond={free}
                    draft={draft}
                    targetNames={targetNames}
                    editing={editing}
                    setEditing={setEditing}
                    onPatch={patchRow}
                    onSetMode={(mode) =>
                      mutateDraft((current) => setBondMode(current, bond.name, mode))
                    }
                    onAddMember={(nicId) =>
                      mutateDraft((current) => addBondMember(current, allNics, bond.name, nicId))
                    }
                    onRemoveMember={(nicId) =>
                      mutateDraft((current) => removeBondMember(current, bond.name, nicId))
                    }
                    onBreak={() => mutateDraft((current) => breakBond(current, bond.name))}
                  />
                </StackItem>
              ))}

              {free.map((nic) => (
                <StackItem key={nic.id}>
                  <NicCard
                    nic={nic}
                    draft={draft}
                    targetNames={targetNames}
                    labels={nicLabelsFor(draft, nic.id)}
                    sriov={detailById.get(nic.id)?.vf !== undefined}
                    editing={editing}
                    setEditing={setEditing}
                    onPatch={patchRow}
                    onAddLabel={(label) =>
                      mutateDraft((current) => addNicLabel(current, nic.id, nic.name ?? '', label))
                    }
                    onRemoveLabel={(label) =>
                      mutateDraft((current) => removeNicLabel(current, nic.id, label))
                    }
                    onOpenSriov={() => setSriovNicId(nic.id)}
                  />
                </StackItem>
              ))}

              {guardError !== undefined && (
                <StackItem>
                  <HelperText>
                    <HelperTextItem variant="error">{guardError}</HelperTextItem>
                  </HelperText>
                </StackItem>
              )}
            </Stack>
          )}
        </ModalBody>
        <ModalFooter>
          <Flex
            direction={{ default: 'column' }}
            spaceItems={{ default: 'spaceItemsSm' }}
            style={{ width: '100%' }}
          >
            {draft !== null && (
              <FlexItem>
                <NameServersEditor
                  nameServers={draft.nameServers}
                  onChange={(nameServers) =>
                    mutateDraft((current) => setNameServers(current, nameServers))
                  }
                />
              </FlexItem>
            )}
            <FlexItem>
              <Checkbox
                id="setup-networks-verify"
                label={t('setupNetworks.verifyConnectivity')}
                aria-label={t('setupNetworks.verifyConnectivity')}
                isChecked={draft?.checkConnectivity ?? true}
                isDisabled={draft === null}
                onChange={(_event, checked) =>
                  setDraft((current) =>
                    current === null ? current : { ...current, checkConnectivity: checked },
                  )
                }
              />
            </FlexItem>
            <FlexItem>
              <Checkbox
                id="setup-networks-commit"
                label={t('setupNetworks.commitOnSuccess')}
                aria-label={t('setupNetworks.commitOnSuccess')}
                isChecked={draft?.commitOnSuccess ?? true}
                isDisabled={draft === null}
                onChange={(_event, checked) =>
                  setDraft((current) =>
                    current === null ? current : { ...current, commitOnSuccess: checked },
                  )
                }
              />
            </FlexItem>
            <FlexItem>
              <Button
                variant="primary"
                onClick={save}
                isLoading={setup.isPending}
                isDisabled={saveDisabled}
              >
                {t('common.action.save')}
              </Button>{' '}
              <Button variant="secondary" onClick={onClose} isDisabled={setup.isPending}>
                {t('common.action.cancel')}
              </Button>
            </FlexItem>
          </Flex>
        </ModalFooter>
      </Modal>
      {sriovNicId !== null && sriovDetail !== undefined && (
        <SriovVfModal
          hostId={hostId}
          nicId={sriovNicId}
          nicName={sriovDetail.name ?? allNics.find((nic) => nic.id === sriovNicId)?.name ?? ''}
          initialVf={sriovDetail.vf ?? {}}
          networks={networks.data ?? []}
          isOpen
          onClose={() => setSriovNicId(null)}
        />
      )}
    </>
  )
}
