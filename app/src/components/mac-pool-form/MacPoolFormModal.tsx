import { useState } from 'react'
import {
  Button,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons'
import type { MacPool } from '../../api/schemas/mac-pool'
import {
  buildMacPoolPayload,
  isRangeFilled,
  isValidMac,
  type MacPoolDraft,
} from '../../api/resources/macPools'
import { useCreateMacPool, useUpdateMacPool } from '../../hooks/useMacPools'
import { blankDraft, blankRange, poolToDraft, type MacPoolFormDraft } from './macPoolDraft'

// The Create/Edit MAC-pool modal. Owns a single flat draft — seeded from the
// pool's read model in edit mode, blank defaults in create mode. Save POSTs
// (create) or PUTs (edit) the built payload and closes on success; faults keep
// it open. Mirrors VnicProfileFormModal's draft/set/re-seed/Save-Cancel shape.
//
// Ranges are an add/remove list of from/to MAC inputs (at least one filled range
// is required). MAC format is validated lightly (xx:xx:xx:xx:xx:xx) — the engine
// does the authoritative range-ordering/overlap validation and any fault
// surfaces verbatim through the mutation's error toast.
export function MacPoolFormModal({
  pool,
  isOpen,
  onClose,
}: {
  pool?: MacPool
  isOpen: boolean
  onClose: () => void
}) {
  const isEdit = pool !== undefined
  const [draft, setDraft] = useState<MacPoolFormDraft>(() =>
    pool ? poolToDraft(pool) : blankDraft(),
  )
  // Re-seed when the modal is pointed at a different pool (or flips between
  // create and edit). Tracking the id we last seeded from and resetting during
  // render keeps the draft in sync without an extra commit/flicker — same idiom
  // as VnicProfileFormModal.
  const [seededId, setSeededId] = useState(pool?.id)
  if (seededId !== pool?.id) {
    setSeededId(pool?.id)
    setDraft(pool ? poolToDraft(pool) : blankDraft())
  }

  const set = <K extends keyof MacPoolFormDraft>(key: K, value: MacPoolFormDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const addRange = () => set('ranges', [...draft.ranges, blankRange()])
  const removeRange = (id: string) =>
    set(
      'ranges',
      draft.ranges.filter((range) => range.id !== id),
    )
  const setRange = (id: string, field: 'from' | 'to', value: string) =>
    set(
      'ranges',
      draft.ranges.map((range) => (range.id === id ? { ...range, [field]: value } : range)),
    )

  const create = useCreateMacPool()
  const update = useUpdateMacPool()
  const pending = create.isPending || update.isPending

  const save = () => {
    // Drop the editor-only row ids before handing the draft to the shared
    // payload builder (it reads only from/to per range).
    const payloadDraft: MacPoolDraft = {
      name: draft.name,
      description: draft.description,
      allowDuplicates: draft.allowDuplicates,
      ranges: draft.ranges.map((range) => ({ from: range.from, to: range.to })),
    }
    const body = buildMacPoolPayload(payloadDraft)
    if (isEdit) {
      update.mutate({ id: pool.id, body }, { onSuccess: () => onClose() })
    } else {
      create.mutate(body, { onSuccess: () => onClose() })
    }
  }

  const nameEmpty = draft.name.trim() === ''
  const filledRanges = draft.ranges.filter(isRangeFilled)
  // At least one range with content is required (webadmin requires a pool to
  // define its address range).
  const noRanges = filledRanges.length === 0
  // Every filled row must have both bounds, and each present bound must look
  // like a MAC — light client check ahead of the engine's authoritative one.
  const rangesInvalid = filledRanges.some(
    (range) =>
      range.from.trim() === '' ||
      range.to.trim() === '' ||
      !isValidMac(range.from) ||
      !isValidMac(range.to),
  )
  const saveDisabled = pending || nameEmpty || noRanges || rangesInvalid

  const title = isEdit ? `Edit MAC pool — ${pool.name ?? pool.id}` : 'New MAC pool'

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="mac-pool-form-title"
      aria-describedby="mac-pool-form-body"
    >
      <ModalHeader title={title} labelId="mac-pool-form-title" />
      <ModalBody id="mac-pool-form-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label="Name" isRequired fieldId="mac-pool-name">
            <TextInput
              id="mac-pool-name"
              isRequired
              aria-label="MAC pool name"
              value={draft.name}
              validated={nameEmpty ? 'error' : 'default'}
              onChange={(_event, value) => set('name', value)}
            />
            {nameEmpty && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">The pool name is required.</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label="Description" fieldId="mac-pool-description">
            <TextInput
              id="mac-pool-description"
              aria-label="MAC pool description"
              value={draft.description}
              onChange={(_event, value) => set('description', value)}
            />
          </FormGroup>

          <FormGroup fieldId="mac-pool-allow-duplicates">
            <Switch
              id="mac-pool-allow-duplicates"
              label="Allow duplicates"
              aria-label="Allow duplicates"
              isChecked={draft.allowDuplicates}
              onChange={(_event, checked) => set('allowDuplicates', checked)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  When enabled, the same MAC address may be assigned to more than one vNIC.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="MAC address ranges" isRequired fieldId="mac-pool-ranges">
            {draft.ranges.map((range) => {
              const fromInvalid = range.from.trim() !== '' && !isValidMac(range.from)
              const toInvalid = range.to.trim() !== '' && !isValidMac(range.to)
              return (
                <Flex
                  key={range.id}
                  spaceItems={{ default: 'spaceItemsSm' }}
                  alignItems={{ default: 'alignItemsFlexStart' }}
                  style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
                >
                  <FlexItem grow={{ default: 'grow' }}>
                    <TextInput
                      aria-label="Range from"
                      placeholder="00:1a:4a:00:00:00"
                      value={range.from}
                      validated={fromInvalid ? 'error' : 'default'}
                      onChange={(_event, value) => setRange(range.id, 'from', value)}
                    />
                  </FlexItem>
                  <FlexItem grow={{ default: 'grow' }}>
                    <TextInput
                      aria-label="Range to"
                      placeholder="00:1a:4a:00:00:ff"
                      value={range.to}
                      validated={toInvalid ? 'error' : 'default'}
                      onChange={(_event, value) => setRange(range.id, 'to', value)}
                    />
                  </FlexItem>
                  <FlexItem>
                    <Button
                      variant="plain"
                      aria-label="Remove range"
                      icon={<MinusCircleIcon />}
                      isDisabled={draft.ranges.length === 1}
                      onClick={() => removeRange(range.id)}
                    />
                  </FlexItem>
                </Flex>
              )
            })}
            <Button
              variant="link"
              icon={<PlusCircleIcon />}
              aria-label="Add range"
              onClick={addRange}
            >
              Add range
            </Button>
            <FormHelperText>
              <HelperText>
                {noRanges ? (
                  <HelperTextItem variant="error">
                    At least one MAC address range is required.
                  </HelperTextItem>
                ) : rangesInvalid ? (
                  <HelperTextItem variant="error">
                    Each range needs a valid start and end MAC address (xx:xx:xx:xx:xx:xx).
                  </HelperTextItem>
                ) : (
                  <HelperTextItem>
                    Each range is an inclusive start–end pair of MAC addresses.
                  </HelperTextItem>
                )}
              </HelperText>
            </FormHelperText>
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={save} isLoading={pending} isDisabled={saveDisabled}>
          Save
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
