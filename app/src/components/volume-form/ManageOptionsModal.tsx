import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Split,
  SplitItem,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { GlusterVolume } from '../../api/schemas/gluster-volume'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { FieldHelp } from '../forms/FieldHelp'
import {
  useResetAllVolumeOptions,
  useResetVolumeOption,
  useSetVolumeOption,
  useVolumeOptions,
} from './useVolumeMutations'

// Stacking a confirm inside this modal: portal it into the modal box rather than
// <body> so PF's aria-hidden sweep on the lower modal never strips the confirm
// from the a11y tree (same guard as TagManagerModal).
const OPTIONS_MODAL_ID = 'volume-options-modal'
const appendToOptions = () => document.getElementById(OPTIONS_MODAL_ID) ?? document.body

// The Manage Options modal (opened from the volume kebab). Reads the volume's
// current tunables with the standard four states, lets an admin add/change a key
// (setoption), reset a single key to its default (per-row), or reset every key
// (reset-all danger confirm).
export function ManageOptionsModal({
  volume,
  onClose,
}: {
  volume: GlusterVolume
  onClose: () => void
}) {
  const t = useT()
  const clusterId = volume.cluster?.id ?? ''
  const options = useVolumeOptions(clusterId, volume.id, true)
  const setOption = useSetVolumeOption()
  const resetOption = useResetVolumeOption()
  const resetAll = useResetAllVolumeOptions()

  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [resetAllOpen, setResetAllOpen] = useState(false)

  const addFilled = newKey.trim() !== '' && newValue.trim() !== ''
  const busy = setOption.isPending || resetOption.isPending || resetAll.isPending

  const submitAdd = () => {
    if (!addFilled) return
    setOption.mutate(
      { clusterId, volumeId: volume.id, name: newKey, value: newValue },
      {
        onSuccess: () => {
          setNewKey('')
          setNewValue('')
        },
      },
    )
  }

  return (
    <Modal
      id={OPTIONS_MODAL_ID}
      variant="medium"
      isOpen
      onClose={onClose}
      aria-labelledby="volume-options-title"
      aria-describedby="volume-options-body"
    >
      <ModalHeader
        title={t('volumes.options.title', { name: volume.name })}
        labelId="volume-options-title"
      />
      <ModalBody id="volume-options-body">
        <Stack hasGutter>
          <StackItem>
            {options.isPending && (
              <>
                <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
                <Skeleton height="2rem" screenreaderText={t('volumes.options.loading')} />
              </>
            )}

            {options.isError && (
              <EmptyState titleText={t('volumes.options.error.title')} status="danger">
                <EmptyStateBody>
                  {options.error instanceof Error
                    ? options.error.message
                    : t('volumes.options.error.body')}
                </EmptyStateBody>
                <EmptyStateFooter>
                  <EmptyStateActions>
                    <Button variant="primary" onClick={() => void options.refetch()}>
                      {t('common.action.retry')}
                    </Button>
                  </EmptyStateActions>
                </EmptyStateFooter>
              </EmptyState>
            )}

            {options.isSuccess && options.data.length === 0 && (
              <EmptyState titleText={t('volumes.options.empty.title')}>
                <EmptyStateBody>{t('volumes.options.empty.body')}</EmptyStateBody>
              </EmptyState>
            )}

            {options.isSuccess && options.data.length > 0 && (
              <Table
                aria-label={t('volumes.options.tableAria', { name: volume.name })}
                variant="compact"
              >
                <Thead>
                  <Tr>
                    <Th>{t('volumes.options.column.option')}</Th>
                    <Th>{t('volumes.options.column.value')}</Th>
                    <Th screenReaderText={t('common.field.actions')} />
                  </Tr>
                </Thead>
                <Tbody>
                  {options.data.map((option, index) => (
                    <Tr key={option.name ?? index}>
                      <Td dataLabel={t('volumes.options.column.option')}>{option.name ?? '—'}</Td>
                      <Td
                        dataLabel={t('volumes.options.column.value')}
                        modifier="truncate"
                        title={option.value ?? ''}
                      >
                        {option.value ?? '—'}
                      </Td>
                      <Td dataLabel={t('common.field.actions')} isActionCell>
                        <Button
                          variant="link"
                          isInline
                          isDisabled={busy || !option.name}
                          aria-label={t('volumes.options.resetOption', { name: option.name ?? '' })}
                          onClick={() =>
                            option.name &&
                            resetOption.mutate({
                              clusterId,
                              volumeId: volume.id,
                              name: option.name,
                            })
                          }
                        >
                          {t('common.action.reset')}
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </StackItem>

          <StackItem>
            <Form onSubmit={(event) => event.preventDefault()}>
              <FormGroup
                label={t('volumes.options.add')}
                fieldId="volume-option-key"
                labelHelp={
                  <FieldHelp
                    field={t('volumes.options.add')}
                    content={t('fieldHelp.volume.addOption')}
                  />
                }
              >
                <Split hasGutter>
                  <SplitItem style={{ minWidth: '14rem' }}>
                    <TextInput
                      id="volume-option-key"
                      aria-label={t('volumes.options.keyAria')}
                      placeholder={t('volumes.options.keyPlaceholder')}
                      value={newKey}
                      onChange={(_event, value) => setNewKey(value)}
                    />
                  </SplitItem>
                  <SplitItem isFilled>
                    <TextInput
                      id="volume-option-value"
                      aria-label={t('volumes.options.valueAria')}
                      placeholder={t('volumes.options.valuePlaceholder')}
                      value={newValue}
                      onChange={(_event, value) => setNewValue(value)}
                    />
                  </SplitItem>
                  <SplitItem>
                    <Button
                      variant="secondary"
                      onClick={submitAdd}
                      isLoading={setOption.isPending}
                      isDisabled={busy || !addFilled}
                    >
                      {t('common.action.add')}
                    </Button>
                  </SplitItem>
                </Split>
              </FormGroup>
            </Form>
          </StackItem>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="danger"
          onClick={() => setResetAllOpen(true)}
          isDisabled={busy || !options.isSuccess || options.data.length === 0}
        >
          {t('volumes.options.resetAll')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.close')}
        </Button>
      </ModalFooter>

      {resetAllOpen && (
        <ConfirmModal
          isOpen
          appendTo={appendToOptions}
          title={t('volumes.options.resetAll.confirm.title', { name: volume.name })}
          body={t('volumes.options.resetAll.confirm.body')}
          confirmLabel={t('volumes.options.resetAll.confirm.label')}
          onConfirm={() => {
            setResetAllOpen(false)
            resetAll.mutate({ clusterId, volumeId: volume.id, volumeName: volume.name })
          }}
          onCancel={() => setResetAllOpen(false)}
        />
      )}
    </Modal>
  )
}
