import { useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  FormGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Skeleton,
  Stack,
  StackItem,
  Switch,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { GlusterVolume } from '../../api/schemas/gluster-volume'
import type { BrickDraft, BrickRef, GlusterBrick } from '../../api/resources/volumes'
import { useT } from '../../i18n/useT'
import { useHosts } from '../../hooks/useHosts'
import { StatusBadge } from '../StatusBadge'
import { statusText } from '../../lib/format'
import { ConfirmModal } from '../ConfirmModal'
import { FieldHelp } from '../forms/FieldHelp'
import { BrickRows } from './BrickRows'
import {
  useAddBricks,
  useGlusterBricks,
  useMigrateBricks,
  useRemoveBricks,
  useStopMigrateBricks,
} from './useVolumeMutations'

// Stacking the remove confirm inside this modal: portal it into the modal box so
// PF's aria-hidden sweep on the lower modal doesn't strip it from the a11y tree
// (same guard as TagManagerModal / ManageOptionsModal).
const BRICKS_MODAL_ID = 'volume-bricks-modal'
const appendToBricks = () => document.getElementById(BRICKS_MODAL_ID) ?? document.body

// A stable selection key for a brick — the id when present, else the
// "server:dir" name. Bricks carrying neither can't be referenced in a
// remove/migrate action, so they aren't selectable.
function brickKey(brick: GlusterBrick): string {
  return brick.id ?? brick.name ?? ''
}

function BrickStatus({ status }: { status?: string }) {
  if (!status) return <>—</>
  const normalized = status.toLowerCase()
  const color = normalized === 'up' ? 'green' : normalized === 'down' ? 'red' : 'grey'
  return <StatusBadge color={color}>{statusText(status)}</StatusBadge>
}

// The per-volume bricks view (opened from the volume kebab). Reads the bricks
// subcollection with the standard four states and resolves each brick's server id
// to a host name against the cluster's cached hosts. An "Add bricks" affordance
// expands the volume in place, reusing the same BrickRows editor as the create
// modal. Selecting bricks enables the 2-step remove-brick flow: a confirm with a
// "migrate data first" toggle (webadmin's RemoveBrickModel) that either starts an
// async data migration or force-removes immediately, plus a Stop migration
// escape hatch. clusterId comes from the volume's cluster link.
export function BricksModal({ volume, onClose }: { volume: GlusterVolume; onClose: () => void }) {
  const t = useT()
  const clusterId = volume.cluster?.id ?? ''
  const bricks = useGlusterBricks(clusterId, volume.id, true)
  const hosts = useHosts()
  const addBricks = useAddBricks()
  const removeBricks = useRemoveBricks()
  const migrateBricks = useMigrateBricks()
  const stopMigrate = useStopMigrateBricks()

  const clusterHosts = useMemo(
    () => (hosts.data ?? []).filter((host) => host.cluster?.id === clusterId),
    [hosts.data, clusterId],
  )
  const serverName = (serverId?: string) =>
    (serverId && clusterHosts.find((host) => host.id === serverId)?.name) || serverId || '—'

  // null while the add-bricks form is closed; an array of draft rows while open.
  const [adding, setAdding] = useState<BrickDraft[] | null>(null)
  const addRowsFilled =
    adding !== null &&
    adding.length > 0 &&
    adding.every((brick) => brick.serverId !== '' && brick.brickDir.trim() !== '')

  // selected brick keys and the remove-confirm dialog state
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [removing, setRemoving] = useState<{ migrateData: boolean; replicaCount: number } | null>(
    null,
  )

  const replicated = (volume.volume_type ?? '').includes('replicate')
  const currentReplica = volume.replica_count ?? 2

  const rows = bricks.data ?? []
  const selectableKeys = useMemo(
    () => (bricks.data ?? []).map(brickKey).filter((key) => key !== ''),
    [bricks.data],
  )
  const selectedBricks: BrickRef[] = rows
    .filter((brick) => selected.has(brickKey(brick)) && brickKey(brick) !== '')
    .map((brick) => ({ id: brick.id, name: brick.name }))

  const mutating =
    addBricks.isPending ||
    removeBricks.isPending ||
    migrateBricks.isPending ||
    stopMigrate.isPending

  const toggleRow = (key: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(selectableKeys) : new Set())
  const allSelected = selectableKeys.length > 0 && selectableKeys.every((key) => selected.has(key))

  const submitAdd = () => {
    if (!adding) return
    addBricks.mutate(
      { clusterId, volumeId: volume.id, volumeName: volume.name, bricks: adding },
      { onSuccess: () => setAdding(null) },
    )
  }

  const clearSelection = () => setSelected(new Set())

  const submitRemove = () => {
    if (!removing || selectedBricks.length === 0) return
    if (removing.migrateData) {
      migrateBricks.mutate(
        { clusterId, volumeId: volume.id, volumeName: volume.name, bricks: selectedBricks },
        { onSuccess: clearSelection },
      )
    } else {
      // Send a reduced replica count only when the user actually lowered it;
      // leaving it at the current value removes whole replica sets without a
      // replica-factor change (the engine's default).
      const replicaCount =
        replicated && removing.replicaCount !== currentReplica ? removing.replicaCount : undefined
      removeBricks.mutate(
        {
          clusterId,
          volumeId: volume.id,
          volumeName: volume.name,
          bricks: selectedBricks,
          replicaCount,
        },
        { onSuccess: clearSelection },
      )
    }
    setRemoving(null)
  }

  return (
    <Modal
      id={BRICKS_MODAL_ID}
      variant="medium"
      isOpen
      onClose={onClose}
      aria-labelledby="bricks-modal-title"
      aria-describedby="bricks-modal-body"
    >
      <ModalHeader
        title={t('volumes.bricks.title', { name: volume.name })}
        labelId="bricks-modal-title"
      />
      <ModalBody id="bricks-modal-body">
        <Stack hasGutter>
          <StackItem>
            {bricks.isPending && (
              <>
                <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
                <Skeleton height="2rem" screenreaderText={t('volumes.bricks.loading')} />
              </>
            )}

            {bricks.isError && (
              <EmptyState titleText={t('volumes.bricks.error.title')} status="danger">
                <EmptyStateBody>
                  {bricks.error instanceof Error
                    ? bricks.error.message
                    : t('volumes.bricks.error.body')}
                </EmptyStateBody>
                <EmptyStateFooter>
                  <EmptyStateActions>
                    <Button variant="primary" onClick={() => void bricks.refetch()}>
                      {t('common.action.retry')}
                    </Button>
                  </EmptyStateActions>
                </EmptyStateFooter>
              </EmptyState>
            )}

            {bricks.isSuccess && bricks.data.length === 0 && (
              <EmptyState titleText={t('volumes.bricks.empty.title')}>
                <EmptyStateBody>{t('volumes.bricks.empty.body')}</EmptyStateBody>
              </EmptyState>
            )}

            {bricks.isSuccess && bricks.data.length > 0 && (
              <Table
                aria-label={t('volumes.bricks.tableAria', { name: volume.name })}
                variant="compact"
              >
                <Thead>
                  <Tr>
                    <Th aria-label={t('volumes.bricks.selectColumn')}>
                      <Checkbox
                        id="bricks-select-all"
                        aria-label={t('volumes.bricks.selectAll')}
                        isChecked={allSelected}
                        isDisabled={mutating || selectableKeys.length === 0}
                        onChange={(_event, checked) => toggleAll(checked)}
                      />
                    </Th>
                    <Th>{t('volumes.bricks.server')}</Th>
                    <Th>{t('volumes.bricks.directory')}</Th>
                    <Th>{t('common.field.status')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {bricks.data.map((brick, index) => {
                    const key = brickKey(brick)
                    return (
                      <Tr key={key || `${brick.server_id}-${brick.brick_dir}-${index}`}>
                        <Td>
                          <Checkbox
                            id={`brick-select-${index}`}
                            aria-label={t('volumes.bricks.selectBrick', {
                              name: (brick.name ?? key) || index + 1,
                            })}
                            isChecked={key !== '' && selected.has(key)}
                            isDisabled={mutating || key === ''}
                            onChange={(_event, checked) => toggleRow(key, checked)}
                          />
                        </Td>
                        <Td dataLabel={t('volumes.bricks.server')}>
                          {serverName(brick.server_id)}
                        </Td>
                        <Td dataLabel={t('volumes.bricks.directory')}>
                          {brick.brick_dir ?? brick.name ?? '—'}
                        </Td>
                        <Td dataLabel={t('common.field.status')}>
                          <BrickStatus status={brick.status} />
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            )}
          </StackItem>

          {adding !== null && (
            <StackItem>
              <BrickRows
                hosts={clusterHosts}
                hostsLoading={hosts.isPending}
                bricks={adding}
                onChange={setAdding}
                idPrefix="add-brick"
              />
            </StackItem>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        {adding === null ? (
          <>
            <Button
              variant="secondary"
              onClick={() => setAdding([{ serverId: '', brickDir: '' }])}
              isDisabled={!bricks.isSuccess || mutating}
            >
              {t('volumes.bricks.addBricks')}
            </Button>
            <Button
              variant="danger"
              onClick={() => setRemoving({ migrateData: true, replicaCount: currentReplica })}
              isDisabled={mutating || selectedBricks.length === 0}
            >
              {t('volumes.bricks.removeSelected')}
            </Button>
            <Button
              variant="link"
              onClick={() =>
                stopMigrate.mutate(
                  {
                    clusterId,
                    volumeId: volume.id,
                    volumeName: volume.name,
                    bricks: selectedBricks,
                  },
                  { onSuccess: clearSelection },
                )
              }
              isDisabled={mutating || selectedBricks.length === 0}
            >
              {t('volumes.bricks.stopMigration')}
            </Button>
            <Button variant="link" onClick={onClose}>
              {t('common.action.close')}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              onClick={submitAdd}
              isLoading={addBricks.isPending}
              isDisabled={addBricks.isPending || !addRowsFilled}
            >
              {t('common.action.add')}
            </Button>
            <Button variant="link" onClick={() => setAdding(null)} isDisabled={addBricks.isPending}>
              {t('common.action.cancel')}
            </Button>
          </>
        )}
      </ModalFooter>

      {removing && (
        <ConfirmModal
          isOpen
          appendTo={appendToBricks}
          title={t('volumes.bricks.remove.confirm.title', {
            count: selectedBricks.length,
            name: volume.name,
          })}
          body={
            <Stack hasGutter>
              <StackItem>
                <Switch
                  id="brick-remove-migrate"
                  label={t('volumes.bricks.migrateFirst')}
                  isChecked={removing.migrateData}
                  onChange={(_event, checked) =>
                    setRemoving((current) =>
                      current ? { ...current, migrateData: checked } : current,
                    )
                  }
                />
              </StackItem>
              <StackItem>
                {removing.migrateData
                  ? t('volumes.bricks.remove.migrateBody')
                  : t('volumes.bricks.remove.immediateBody')}
              </StackItem>
              {replicated && !removing.migrateData && (
                <StackItem>
                  <FormGroup
                    label={t('volumes.bricks.newReplicaCount')}
                    fieldId="brick-remove-replica"
                    labelHelp={
                      <FieldHelp
                        field={t('volumes.bricks.newReplicaCount')}
                        content={t('fieldHelp.volume.newReplicaCount')}
                      />
                    }
                  >
                    <NumberInput
                      id="brick-remove-replica"
                      value={removing.replicaCount}
                      min={1}
                      max={currentReplica}
                      inputAriaLabel={t('volumes.bricks.newReplicaCount')}
                      onMinus={() =>
                        setRemoving((current) =>
                          current
                            ? { ...current, replicaCount: Math.max(1, current.replicaCount - 1) }
                            : current,
                        )
                      }
                      onPlus={() =>
                        setRemoving((current) =>
                          current
                            ? {
                                ...current,
                                replicaCount: Math.min(currentReplica, current.replicaCount + 1),
                              }
                            : current,
                        )
                      }
                      onChange={(event) => {
                        const next = Number((event.target as HTMLInputElement).value)
                        setRemoving((current) =>
                          current
                            ? {
                                ...current,
                                replicaCount: Number.isNaN(next)
                                  ? 1
                                  : Math.min(currentReplica, Math.max(1, next)),
                              }
                            : current,
                        )
                      }}
                    />
                  </FormGroup>
                </StackItem>
              )}
            </Stack>
          }
          confirmLabel={
            removing.migrateData ? t('volumes.bricks.startMigration') : t('common.action.remove')
          }
          onConfirm={submitRemove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </Modal>
  )
}
