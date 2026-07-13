import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
  EmptyState,
  EmptyStateBody,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Skeleton,
  Stack,
  StackItem,
  TextInput,
  Tooltip,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { ExclamationTriangleIcon } from '@patternfly/react-icons'
import { StatusBadge } from '../StatusBadge'
import {
  iscsiDiscover,
  iscsiLogin,
  listHostStorage,
  type IscsiTarget,
} from '../../api/resources/hosts'
import type { DiscoveredLun } from '../../api/schemas/host-storage'
import { formatBytes } from '../../lib/format'

// The block-storage sub-form the New Storage Domain modal renders below the
// shared fields when the storage type is iSCSI or FCP. It owns the whole SAN
// discover→login→enumerate flow (iSCSI) or the immediate LUN read (FC) and
// reports the chosen host and selected LUN ids up to the modal, which folds
// them into the block createStorageDomain body. The modal stays the single
// owner of name/DC/function/host + the create-then-attach orchestration; this
// component never mounts a mutation.
//
// SECURITY: the CHAP password lives only in this component's controlled state
// and rides only into the in-flight discover/login request bodies — it is never
// persisted, never logged, and (per the data-layer contract) never part of the
// later create body (the login session carries the auth). autoComplete is set
// to new-password so browsers never offer to store it.

// A LUN can't back a new domain when it is already part of a storage domain,
// bound to a direct-LUN disk, or the engine marked it unusable — mirrors
// SanStorageModelBase.updateGrayedOut. Returns the human reason (for the row
// tooltip) or undefined when the LUN is selectable. `currentStorageDomainId`
// (the extend flow) refines the wording when the blocking domain is the very
// domain being managed.
function lunUnavailableReason(
  lun: DiscoveredLun,
  currentStorageDomainId?: string,
): string | undefined {
  if (lun.storageDomainId) {
    return lun.storageDomainId === currentStorageDomainId
      ? 'Already part of this storage domain'
      : 'Already part of another storage domain'
  }
  if (lun.diskId) return 'Already bound to a direct LUN disk'
  if (lun.status?.toLowerCase() === 'unusable') return 'Reported unusable by the host'
  return undefined
}

// A LunStatus.Used LUN already carved into a volume group is NOT grayed out in
// webadmin — it stays selectable but reusing it DESTROYS that volume group, so
// SanStorageModelBase.getUsedLunsMessages/lunUsedByVG surfaces a data-loss
// confirmation the user must acknowledge before create. Returns the warning
// text when a *selectable* LUN would wipe a VG, else undefined. Callers gate
// this behind lunUnavailableReason so an already-in-a-domain LUN (which also
// carries a volume_group_id) never double-warns — it is already un-selectable.
function lunVgDataLossReason(
  lun: DiscoveredLun,
  currentStorageDomainId?: string,
): string | undefined {
  if (lunUnavailableReason(lun, currentStorageDomainId) !== undefined) return undefined
  if (lun.status?.toLowerCase() === 'used' && lun.volumeGroupId) {
    return `LUN ${lun.id} is used by volume group ${lun.volumeGroupId} and its data will be lost`
  }
  return undefined
}

// A short LUN label for the table: the vendor/product pair when present, else
// the raw id (LUNs from a bare FC read may carry neither address nor target).
function lunProduct(lun: DiscoveredLun): string {
  const vendorProduct = [lun.vendorId, lun.productId].filter(Boolean).join(' ')
  return vendorProduct || '—'
}

// A selected LUN whose reuse would wipe an existing volume group — reported up
// so the modal can gate Save behind a data-loss confirmation (lunUsedByVG).
export interface LunVgDataLoss {
  id: string
  volumeGroupId: string
  reason: string
}

export function SanStorageSection({
  storageType,
  hostId,
  selectedLunIds,
  onSelectedLunIdsChange,
  onVgDataLossChange,
  onSelectedLunsChange,
  onLunsChange,
  selectionVariant = 'checkbox',
  selectable = true,
  currentStorageDomainId,
}: {
  storageType: 'iscsi' | 'fcp'
  // The chosen host's id, or '' before a host is picked — every SAN round-trip
  // is host-scoped, so nothing loads until this is set.
  hostId: string
  selectedLunIds: string[]
  onSelectedLunIdsChange: (ids: string[]) => void
  // Reports the selected LUNs whose reuse destroys a volume group. The modal
  // owns Save, so it — not this sub-form — mounts the data-loss confirmation;
  // this component only surfaces the inline warning and feeds the set up.
  onVgDataLossChange?: (warnings: LunVgDataLoss[]) => void
  // Reports the FULL DiscoveredLun objects behind the current selection. The
  // direct-LUN disk dialog needs the iSCSI connection coordinates
  // (address/port/target) and the LUN size — not just the ids the SD wizard
  // folds into its create body.
  onSelectedLunsChange?: (luns: DiscoveredLun[]) => void
  // Reports the FULL loaded LUN list whenever it changes (undefined while
  // unloaded/invalidated). The block-import flow reads it to detect the
  // pre-existing domain ids the host sees — it never selects LUNs, so this is
  // its only feed.
  onLunsChange?: (luns: DiscoveredLun[] | undefined) => void
  // 'checkbox' (default): multi-select — the SD wizard's semantics. 'radio':
  // single-select — webadmin's direct-LUN dialog binds exactly ONE LUN per
  // disk, so picking a row replaces the selection.
  selectionVariant?: 'checkbox' | 'radio'
  // false hides the selection column entirely — the block-import flow shows
  // the LUN table as read-only evidence of what the host sees (the import is
  // keyed by domain id, not by LUN picks).
  selectable?: boolean
  // The domain being managed (the extend flow): its own LUNs stay grayed but
  // the tooltip says "this storage domain" instead of "another".
  currentStorageDomainId?: string
}) {
  // iSCSI discover sub-form state (unused on the FC path).
  const [address, setAddress] = useState('')
  const [port, setPort] = useState('')
  const [useChap, setUseChap] = useState(false)
  const [chapUser, setChapUser] = useState('')
  const [chapPassword, setChapPassword] = useState('')

  // Discover / login / LUN-list async state, each with its own four states.
  const [targets, setTargets] = useState<IscsiTarget[] | undefined>(undefined)
  const [discovering, setDiscovering] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | undefined>(undefined)

  // The IQN the user logged into — LUNs only enumerate for a logged-in target.
  const [loggedInTarget, setLoggedInTarget] = useState<string | undefined>(undefined)
  const [loggingInTarget, setLoggingInTarget] = useState<string | undefined>(undefined)
  const [loginError, setLoginError] = useState<string | undefined>(undefined)

  const [luns, setLuns] = useState<DiscoveredLun[] | undefined>(undefined)
  const [lunsLoading, setLunsLoading] = useState(false)
  const [lunsError, setLunsError] = useState<string | undefined>(undefined)

  const selected = new Set(selectedLunIds)

  // The selected LUNs whose reuse would destroy an existing volume group. These
  // stay selectable (webadmin does not grey them) but demand an explicit
  // data-loss acknowledgement before create — mirrors lunUsedByVG. Derived from
  // the loaded LUNs so a stale warning can't outlive its LUN list.
  const vgDataLoss = useMemo<LunVgDataLoss[]>(() => {
    const warnings: LunVgDataLoss[] = []
    for (const lun of luns ?? []) {
      if (!selected.has(lun.id)) continue
      const reason = lunVgDataLossReason(lun, currentStorageDomainId)
      // lunVgDataLossReason only returns a reason when volumeGroupId is set,
      // so the non-null assertion below is sound.
      if (reason !== undefined) {
        warnings.push({ id: lun.id, volumeGroupId: lun.volumeGroupId!, reason })
      }
    }
    return warnings
    // `selected` is rebuilt every render from selectedLunIds — key on the ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [luns, selectedLunIds])

  // Feed the VG-data-loss set up to the modal, which owns Save and mounts the
  // confirmation. Report the ids (not the array identity) so a re-derived but
  // unchanged set doesn't churn the parent.
  const vgDataLossKey = vgDataLoss.map((w) => w.id).join(',')
  useEffect(() => {
    onVgDataLossChange?.(vgDataLoss)
    // vgDataLoss is re-derived each render; key the effect on its stable id list
    // and treat the callback as stable (same discipline as onSelectedLunIdsChange).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vgDataLossKey])

  // Feed the full DiscoveredLun objects behind the selection up to consumers
  // that need more than ids (the direct-LUN dialog). Keyed on the selection ids
  // + the loaded list so a re-render with an unchanged selection doesn't churn
  // the parent — same discipline as the VG-data-loss effect above.
  const selectedLunsKey = selectedLunIds.join(',')
  useEffect(() => {
    if (!onSelectedLunsChange) return
    const byId = new Map((luns ?? []).map((lun) => [lun.id, lun]))
    onSelectedLunsChange(
      selectedLunIds
        .map((id) => byId.get(id))
        .filter((lun): lun is DiscoveredLun => lun !== undefined),
    )
    // onSelectedLunsChange is treated as stable (same as onSelectedLunIdsChange).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLunsKey, luns])

  // Feed the full loaded LUN list up whenever it changes — the block-import
  // flow derives the visible pre-existing domain ids from it. Keyed on the
  // list state itself; the callback is treated as stable like its siblings.
  useEffect(() => {
    onLunsChange?.(luns)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [luns])

  // Changing the host or storage type invalidates every SAN result and the
  // selection — nothing discovered on host A is valid for host B. The FC path
  // reads LUNs as soon as a host exists (no discover/login gate); the iSCSI
  // path waits for the user to discover + log in.
  useEffect(() => {
    setTargets(undefined)
    setDiscoverError(undefined)
    setLoggedInTarget(undefined)
    setLoginError(undefined)
    setLuns(undefined)
    setLunsError(undefined)
    onSelectedLunIdsChange([])
    // clear the CHAP credentials too, so a typed password never outlives the
    // discover flow or bleeds across a host/type change (the modal stays
    // mounted across close→reopen)
    setUseChap(false)
    setChapUser('')
    setChapPassword('')
    if (storageType === 'fcp' && hostId) {
      void loadLuns(hostId, 'fcp')
    }
    // onSelectedLunIdsChange and loadLuns are stable enough for this reset —
    // re-running only when the host or type actually changes is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, storageType])

  async function loadLuns(id: string, type: 'iscsi' | 'fcp') {
    setLunsLoading(true)
    setLunsError(undefined)
    try {
      const result = await listHostStorage(id, type)
      setLuns(result)
    } catch (error) {
      setLunsError(error instanceof Error ? error.message : 'Unknown error')
      setLuns(undefined)
    } finally {
      setLunsLoading(false)
    }
  }

  async function discover() {
    if (!hostId || address.trim() === '') return
    setDiscovering(true)
    setDiscoverError(undefined)
    // A fresh discover invalidates any earlier login + LUN list.
    setTargets(undefined)
    setLoggedInTarget(undefined)
    setLoginError(undefined)
    setLuns(undefined)
    setLunsError(undefined)
    onSelectedLunIdsChange([])
    try {
      const result = await iscsiDiscover(hostId, {
        address: address.trim(),
        port: port.trim() === '' ? undefined : Number(port),
        username: useChap && chapUser.trim() !== '' ? chapUser.trim() : undefined,
        password: useChap && chapPassword !== '' ? chapPassword : undefined,
      })
      setTargets(result)
    } catch (error) {
      setDiscoverError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setDiscovering(false)
    }
  }

  async function login(target: IscsiTarget) {
    if (!hostId || !target.target) return
    setLoggingInTarget(target.target)
    setLoginError(undefined)
    setLuns(undefined)
    setLunsError(undefined)
    onSelectedLunIdsChange([])
    try {
      await iscsiLogin(hostId, {
        address: target.address ?? address.trim(),
        target: target.target,
        port: target.port,
        portal: target.portal,
        username: useChap && chapUser.trim() !== '' ? chapUser.trim() : undefined,
        password: useChap && chapPassword !== '' ? chapPassword : undefined,
      })
      setLoggedInTarget(target.target)
      await loadLuns(hostId, 'iscsi')
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setLoggingInTarget(undefined)
    }
  }

  function toggleLun(lunId: string, selecting: boolean) {
    // Radio mode: one LUN per disk — selecting a row replaces the selection
    // (a radio can't be unpicked, only superseded).
    if (selectionVariant === 'radio') {
      if (selecting) onSelectedLunIdsChange([lunId])
      return
    }
    const next = new Set(selected)
    if (selecting) next.add(lunId)
    else next.delete(lunId)
    onSelectedLunIdsChange([...next])
  }

  // Both paths need a host before anything can load.
  if (!hostId) {
    return (
      <HelperText>
        <HelperTextItem>Select a host to use before choosing LUNs.</HelperTextItem>
      </HelperText>
    )
  }

  return (
    <Stack hasGutter>
      {storageType === 'iscsi' && (
        <StackItem>
          {/* Nested form: the iSCSI target-discovery sub-form. Enter triggers
              Discover rather than submitting the outer modal. */}
          <Form
            onSubmit={(event) => {
              event.preventDefault()
              void discover()
            }}
          >
            <FormGroup label="Target address" isRequired fieldId="san-iscsi-address">
              <TextInput
                id="san-iscsi-address"
                isRequired
                aria-label="iSCSI target address"
                placeholder="10.35.1.10"
                value={address}
                onChange={(_event, value) => setAddress(value)}
              />
            </FormGroup>
            <FormGroup label="Port" fieldId="san-iscsi-port">
              <TextInput
                id="san-iscsi-port"
                type="number"
                aria-label="iSCSI target port"
                placeholder="3260"
                value={port}
                onChange={(_event, value) => setPort(value)}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>Leave blank to use the default iSCSI port 3260.</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <FormGroup fieldId="san-iscsi-use-chap">
              <Checkbox
                id="san-iscsi-use-chap"
                label="Use CHAP authentication"
                aria-label="Use CHAP authentication"
                isChecked={useChap}
                onChange={(_event, checked) => setUseChap(checked)}
              />
            </FormGroup>
            {useChap && (
              <>
                <FormGroup label="CHAP user name" fieldId="san-iscsi-chap-user">
                  <TextInput
                    id="san-iscsi-chap-user"
                    aria-label="CHAP user name"
                    autoComplete="username"
                    value={chapUser}
                    onChange={(_event, value) => setChapUser(value)}
                  />
                </FormGroup>
                <FormGroup label="CHAP password" fieldId="san-iscsi-chap-password">
                  <TextInput
                    id="san-iscsi-chap-password"
                    type="password"
                    aria-label="CHAP password"
                    autoComplete="new-password"
                    value={chapPassword}
                    onChange={(_event, value) => setChapPassword(value)}
                  />
                </FormGroup>
              </>
            )}
            <Button
              variant="secondary"
              onClick={() => void discover()}
              isLoading={discovering}
              isDisabled={discovering || address.trim() === ''}
            >
              Discover
            </Button>
          </Form>
        </StackItem>
      )}

      {/* iSCSI: discovered-target list, its own four states. */}
      {storageType === 'iscsi' && discoverError !== undefined && (
        <StackItem>
          <EmptyState titleText="Could not discover targets" status="danger">
            <EmptyStateBody>{discoverError}</EmptyStateBody>
            <Button variant="primary" onClick={() => void discover()}>
              Retry
            </Button>
          </EmptyState>
        </StackItem>
      )}
      {storageType === 'iscsi' && targets !== undefined && targets.length === 0 && (
        <StackItem>
          <EmptyState titleText="No targets discovered">
            <EmptyStateBody>
              The host found no iSCSI targets at that address. Check the address and CHAP
              credentials, then discover again.
            </EmptyStateBody>
          </EmptyState>
        </StackItem>
      )}
      {storageType === 'iscsi' && targets !== undefined && targets.length > 0 && (
        <StackItem>
          <Table aria-label="Discovered iSCSI targets" variant="compact">
            <Thead>
              <Tr>
                <Th>Target (IQN)</Th>
                <Th>Portal</Th>
                <Th screenReaderText="Log in" />
              </Tr>
            </Thead>
            <Tbody>
              {targets.map((target, index) => {
                const isLoggedIn = loggedInTarget !== undefined && loggedInTarget === target.target
                return (
                  <Tr key={target.target ?? index}>
                    <Td dataLabel="Target (IQN)">{target.target ?? '—'}</Td>
                    <Td dataLabel="Portal">
                      {target.portal ??
                        (target.address ? `${target.address}:${target.port ?? 3260}` : '—')}
                    </Td>
                    <Td dataLabel="Log in" modifier="fitContent">
                      <Button
                        variant={isLoggedIn ? 'secondary' : 'primary'}
                        isInline
                        isLoading={loggingInTarget === target.target}
                        isDisabled={loggingInTarget !== undefined || isLoggedIn || !target.target}
                        onClick={() => void login(target)}
                      >
                        {isLoggedIn ? 'Logged in' : 'Log in'}
                      </Button>
                    </Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        </StackItem>
      )}
      {storageType === 'iscsi' && loginError !== undefined && (
        <StackItem>
          <EmptyState titleText="Could not log in to target" status="danger">
            <EmptyStateBody>{loginError}</EmptyStateBody>
          </EmptyState>
        </StackItem>
      )}

      {/* LUN table — shared by both paths once its host storage is loadable.
          iSCSI: only after a successful login. FC: immediately. */}
      {(storageType === 'fcp' || loggedInTarget !== undefined) && (
        <StackItem>
          {lunsLoading && (
            <>
              <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
              <Skeleton height="2.5rem" screenreaderText="Loading LUNs" />
            </>
          )}

          {!lunsLoading && lunsError !== undefined && (
            <EmptyState titleText="Could not load LUNs" status="danger">
              <EmptyStateBody>{lunsError}</EmptyStateBody>
              <Button variant="primary" onClick={() => void loadLuns(hostId, storageType)}>
                Retry
              </Button>
            </EmptyState>
          )}

          {!lunsLoading && lunsError === undefined && luns !== undefined && luns.length === 0 && (
            <EmptyState titleText="No LUNs found">
              <EmptyStateBody>
                {storageType === 'iscsi'
                  ? 'The logged-in target exposes no LUNs to this host.'
                  : 'The host sees no Fibre Channel LUNs on the fabric.'}
              </EmptyStateBody>
            </EmptyState>
          )}

          {!lunsLoading && lunsError === undefined && luns !== undefined && luns.length > 0 && (
            <Table aria-label="Available LUNs" variant="compact">
              <Thead>
                <Tr>
                  {selectable && <Th screenReaderText="Select LUN" />}
                  <Th>LUN ID</Th>
                  <Th>Product</Th>
                  <Th>Size</Th>
                  <Th>Serial</Th>
                </Tr>
              </Thead>
              <Tbody>
                {luns.map((lun, rowIndex) => {
                  const reason = lunUnavailableReason(lun, currentStorageDomainId)
                  const disabled = reason !== undefined
                  // A selectable Used-in-VG LUN: not greyed, but reusing it wipes
                  // its volume group — flag the row so the danger is visible at
                  // the point of selection, not only in the pre-save confirm.
                  const vgLossReason = lunVgDataLossReason(lun, currentStorageDomainId)
                  const checkbox = selectable ? (
                    <Td
                      select={{
                        rowIndex,
                        variant: selectionVariant,
                        isSelected: selected.has(lun.id),
                        isDisabled: disabled,
                        onSelect: (_event, selecting) => toggleLun(lun.id, selecting),
                      }}
                    />
                  ) : null
                  return (
                    <Tr key={lun.id}>
                      {checkbox !== null &&
                        (disabled ? <Tooltip content={reason}>{checkbox}</Tooltip> : checkbox)}
                      <Td dataLabel="LUN ID">
                        {lun.id}
                        {vgLossReason !== undefined && (
                          <Tooltip content={vgLossReason}>
                            <span style={{ marginInlineStart: '0.5rem' }}>
                              <StatusBadge color="orange" icon={<ExclamationTriangleIcon />}>
                                Data loss
                              </StatusBadge>
                            </span>
                          </Tooltip>
                        )}
                      </Td>
                      <Td dataLabel="Product">{lunProduct(lun)}</Td>
                      <Td dataLabel="Size">{formatBytes(lun.size)}</Td>
                      <Td dataLabel="Serial">{lun.serial ?? '—'}</Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
          )}

          {/* Inline data-loss warning for the current selection. The modal
              additionally gates Save behind a danger confirmation (lunUsedByVG),
              but surfacing it here keeps the consequence next to the choice. */}
          {vgDataLoss.length > 0 && (
            <FormHelperText>
              <HelperText>
                {vgDataLoss.map((warning) => (
                  <HelperTextItem
                    key={warning.id}
                    variant="warning"
                    icon={<ExclamationTriangleIcon />}
                  >
                    {warning.reason}
                  </HelperTextItem>
                ))}
              </HelperText>
            </FormHelperText>
          )}
        </StackItem>
      )}
    </Stack>
  )
}
