import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
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
// (reset-all danger confirm). Strings are hardcoded English this pass; a later
// externalization sweep owns the catalog ids.
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
      <ModalHeader title={`Volume options — ${volume.name}`} labelId="volume-options-title" />
      <ModalBody id="volume-options-body">
        <Stack hasGutter>
          <StackItem>
            {options.isPending && (
              <>
                <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
                <Skeleton height="2rem" screenreaderText="Loading volume options" />
              </>
            )}

            {options.isError && (
              <EmptyState titleText="Couldn't load volume options" status="danger">
                <EmptyStateBody>
                  {options.error instanceof Error
                    ? options.error.message
                    : 'The volume options could not be read.'}
                </EmptyStateBody>
                <Button variant="primary" onClick={() => void options.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </EmptyState>
            )}

            {options.isSuccess && options.data.length === 0 && (
              <EmptyState titleText="No custom options set">
                <EmptyStateBody>
                  Every tunable is at its gluster default. Add one below to override a default.
                </EmptyStateBody>
              </EmptyState>
            )}

            {options.isSuccess && options.data.length > 0 && (
              <Table aria-label={`Options for ${volume.name}`} variant="compact">
                <Thead>
                  <Tr>
                    <Th>Option</Th>
                    <Th>Value</Th>
                    <Th screenReaderText="Actions" />
                  </Tr>
                </Thead>
                <Tbody>
                  {options.data.map((option, index) => (
                    <Tr key={option.name ?? index}>
                      <Td dataLabel="Option">{option.name ?? '—'}</Td>
                      <Td dataLabel="Value" modifier="truncate" title={option.value ?? ''}>
                        {option.value ?? '—'}
                      </Td>
                      <Td dataLabel="Actions" isActionCell>
                        <Button
                          variant="link"
                          isInline
                          isDisabled={busy || !option.name}
                          aria-label={`Reset option ${option.name ?? ''}`}
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
                label="Add option"
                fieldId="volume-option-key"
                labelHelp={
                  <FieldHelp
                    field="Add option"
                    content="A gluster volume tunable, entered as key and value — for example auth.allow with a value of 10.0.0.*, or performance.cache-size with 256MB. Setting an existing key changes its value."
                  />
                }
              >
                <Split hasGutter>
                  <SplitItem style={{ minWidth: '14rem' }}>
                    <TextInput
                      id="volume-option-key"
                      aria-label="Option key"
                      placeholder="key (e.g. auth.allow)"
                      value={newKey}
                      onChange={(_event, value) => setNewKey(value)}
                    />
                  </SplitItem>
                  <SplitItem isFilled>
                    <TextInput
                      id="volume-option-value"
                      aria-label="Option value"
                      placeholder="value"
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
          Reset all to default
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.close')}
        </Button>
      </ModalFooter>

      {resetAllOpen && (
        <ConfirmModal
          isOpen
          appendTo={appendToOptions}
          title={`Reset all options on ${volume.name}?`}
          body="Every tunable on this volume returns to its gluster default. Options you set here will be lost. This cannot be undone."
          confirmLabel="Reset all"
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
