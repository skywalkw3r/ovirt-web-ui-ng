import { useState } from 'react'
import {
  Button,
  FormGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { ActionsColumn } from '@patternfly/react-table'
import type { GlusterVolume } from '../../api/schemas/gluster-volume'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { BricksModal } from './BricksModal'
import { ManageOptionsModal } from './ManageOptionsModal'
import {
  useDeleteVolume,
  useRebalanceVolume,
  useStartVolume,
  useStartVolumeProfile,
  useStopVolume,
  useStopVolumeProfile,
} from './useVolumeMutations'

// The volume verb set behind the per-row kebab: Start (force optional), Stop
// (force optional, data-inaccessible → danger confirm), Rebalance (distributed
// types only), Bricks (opens the bricks view), Remove (typed-name danger confirm).
// Items are gated by status — Start when the volume is not up, Stop/Rebalance when
// it is — mirroring webadmin's per-status enablement. The component owns its
// modals so the page only drops in <VolumeActionsMenu volume={…} /> inside the
// action cell.
export function VolumeActionsMenu({ volume }: { volume: GlusterVolume }) {
  const t = useT()
  const clusterId = volume.cluster?.id ?? ''
  const start = useStartVolume()
  const stop = useStopVolume()
  const rebalance = useRebalanceVolume()
  const remove = useDeleteVolume()
  const startProfile = useStartVolumeProfile()
  const stopProfile = useStopVolumeProfile()

  // one lifecycle option dialog up at a time; each seeds its own toggles
  const [dialog, setDialog] = useState<
    | { kind: 'start'; force: boolean }
    | { kind: 'stop'; force: boolean }
    | { kind: 'rebalance'; fixLayout: boolean; force: boolean }
    | null
  >(null)
  const [removing, setRemoving] = useState<{ nameInput: string } | null>(null)
  const [bricksOpen, setBricksOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)

  const status = (volume.status ?? '').toLowerCase()
  const isUp = status === 'up'
  // distribute / distributed_replicate both carry a distributed layout to rebalance
  const isDistributed = (volume.volume_type ?? '').includes('distribut')
  const busy =
    start.isPending ||
    stop.isPending ||
    rebalance.isPending ||
    remove.isPending ||
    startProfile.isPending ||
    stopProfile.isPending

  const items = [
    ...(!isUp
      ? [
          {
            title: t('volumes.action.start'),
            onClick: () => setDialog({ kind: 'start', force: false }),
          },
        ]
      : []),
    ...(isUp
      ? [
          {
            title: t('volumes.action.stop'),
            onClick: () => setDialog({ kind: 'stop', force: false }),
          },
        ]
      : []),
    ...(isUp && isDistributed
      ? [
          {
            title: t('volumes.action.rebalance'),
            onClick: () => setDialog({ kind: 'rebalance', fixLayout: false, force: false }),
          },
        ]
      : []),
    { title: t('volumes.action.bricks'), onClick: () => setBricksOpen(true) },
    { title: 'Manage options', onClick: () => setOptionsOpen(true) },
    // Profiling status isn't exposed on the volume read model, so both toggles
    // are always offered (webadmin shows Start/Stop Profiling the same way).
    {
      title: 'Start profiling',
      onClick: () =>
        startProfile.mutate({ clusterId, volumeId: volume.id, volumeName: volume.name }),
    },
    {
      title: 'Stop profiling',
      onClick: () =>
        stopProfile.mutate({ clusterId, volumeId: volume.id, volumeName: volume.name }),
    },
    { isSeparator: true },
    {
      title: t('common.action.remove'),
      isDanger: true,
      onClick: () => setRemoving({ nameInput: '' }),
    },
  ]

  return (
    <>
      <ActionsColumn isDisabled={busy} items={items} />

      {/* Start — non-destructive, but the force option needs UI, so a small
          plain modal rather than a bare fire. */}
      {dialog?.kind === 'start' && (
        <Modal
          variant="small"
          isOpen
          onClose={() => setDialog(null)}
          aria-labelledby="volume-start-title"
        >
          <ModalHeader
            title={t('volumes.start.title', { name: volume.name })}
            labelId="volume-start-title"
          />
          <ModalBody>
            <Switch
              id={`volume-start-force-${volume.id}`}
              label={t('volumes.start.force')}
              isChecked={dialog.force}
              onChange={(_event, checked) => setDialog({ kind: 'start', force: checked })}
            />
          </ModalBody>
          <ModalFooter>
            <Button
              variant="primary"
              onClick={() => {
                const force = dialog.force
                setDialog(null)
                start.mutate({ clusterId, volumeId: volume.id, volumeName: volume.name, force })
              }}
            >
              {t('volumes.action.start')}
            </Button>
            <Button variant="link" onClick={() => setDialog(null)}>
              {t('common.action.cancel')}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Stop — data becomes inaccessible, so a danger confirm with a force
          toggle in the body. */}
      {dialog?.kind === 'stop' && (
        <ConfirmModal
          isOpen
          title={t('volumes.stop.title', { name: volume.name })}
          body={
            <Stack hasGutter>
              <StackItem>{t('volumes.stop.body')}</StackItem>
              <StackItem>
                <Switch
                  id={`volume-stop-force-${volume.id}`}
                  label={t('volumes.stop.force')}
                  isChecked={dialog.force}
                  onChange={(_event, checked) => setDialog({ kind: 'stop', force: checked })}
                />
              </StackItem>
            </Stack>
          }
          confirmLabel={t('volumes.action.stop')}
          onConfirm={() => {
            const force = dialog.force
            setDialog(null)
            stop.mutate({ clusterId, volumeId: volume.id, volumeName: volume.name, force })
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {/* Rebalance — non-destructive; fix-layout and force are the two knobs. */}
      {dialog?.kind === 'rebalance' && (
        <Modal
          variant="small"
          isOpen
          onClose={() => setDialog(null)}
          aria-labelledby="volume-rebalance-title"
        >
          <ModalHeader
            title={t('volumes.rebalance.title', { name: volume.name })}
            labelId="volume-rebalance-title"
          />
          <ModalBody>
            <Stack hasGutter>
              <StackItem>
                <Switch
                  id={`volume-rebalance-fixlayout-${volume.id}`}
                  label={t('volumes.rebalance.fixLayout')}
                  isChecked={dialog.fixLayout}
                  onChange={(_event, checked) =>
                    setDialog({ kind: 'rebalance', fixLayout: checked, force: dialog.force })
                  }
                />
              </StackItem>
              <StackItem>
                <Switch
                  id={`volume-rebalance-force-${volume.id}`}
                  label={t('volumes.rebalance.force')}
                  isChecked={dialog.force}
                  onChange={(_event, checked) =>
                    setDialog({ kind: 'rebalance', fixLayout: dialog.fixLayout, force: checked })
                  }
                />
              </StackItem>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="primary"
              onClick={() => {
                const { fixLayout, force } = dialog
                setDialog(null)
                rebalance.mutate({
                  clusterId,
                  volumeId: volume.id,
                  volumeName: volume.name,
                  fixLayout,
                  force,
                })
              }}
            >
              {t('volumes.action.rebalance')}
            </Button>
            <Button variant="link" onClick={() => setDialog(null)}>
              {t('common.action.cancel')}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {bricksOpen && <BricksModal volume={volume} onClose={() => setBricksOpen(false)} />}

      {optionsOpen && <ManageOptionsModal volume={volume} onClose={() => setOptionsOpen(false)} />}

      {/* Typed-name destructive confirm (docs/COMPONENTS.md: typed-name confirm
          for delete). */}
      {removing && (
        <ConfirmModal
          isOpen
          title={t('volumes.remove.title', { name: volume.name })}
          body={
            <Stack hasGutter>
              <StackItem>{t('volumes.remove.body')}</StackItem>
              <StackItem>
                <FormGroup
                  label={t('volumes.remove.typeLabel', { name: volume.name })}
                  isRequired
                  fieldId={`volume-remove-confirm-${volume.id}`}
                >
                  <TextInput
                    id={`volume-remove-confirm-${volume.id}`}
                    aria-label={t('volumes.remove.confirmAria')}
                    value={removing.nameInput}
                    onChange={(_event, value) => setRemoving({ nameInput: value })}
                  />
                </FormGroup>
              </StackItem>
            </Stack>
          }
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={removing.nameInput !== volume.name}
          onConfirm={() => {
            setRemoving(null)
            remove.mutate({ clusterId, volumeId: volume.id, volumeName: volume.name })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
