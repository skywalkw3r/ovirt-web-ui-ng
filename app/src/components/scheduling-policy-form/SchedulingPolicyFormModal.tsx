import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  Checkbox,
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
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Skeleton,
  TextInput,
} from '@patternfly/react-core'
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons'
import {
  groupPolicyUnits,
  type FilterPosition,
  type SchedulingPolicy,
  type SchedulingPolicyUnit,
} from '../../api/resources/schedulingPolicies'
import { FieldHelp } from '../forms/FieldHelp'
import {
  blankDraft,
  blankProperty,
  cloneDraft,
  policyToDraft,
  toPayloadDraft,
  type SchedulingPolicyFormDraft,
} from './schedulingPolicyDraft'
import {
  useCreateSchedulingPolicy,
  usePolicyAssignments,
  usePolicyUnitCatalog,
  useUpdateSchedulingPolicy,
} from './useSchedulingPolicies'

export type SchedulingPolicyEditorMode = 'create' | 'edit' | 'clone'

const POSITION_OPTIONS: { value: FilterPosition; label: string }[] = [
  { value: 'none', label: 'No position' },
  { value: 'first', label: 'First' },
  { value: 'last', label: 'Last' },
]

// The scheduling-policy editor: name/description, the policy properties
// key/value rows, and webadmin's Manage-Policy-Units equivalent — filter
// checkboxes (+ optional first/last chain position), weight checkboxes
// (+ factor), and the single load-balancer select, all fed from the
// GET /schedulingpolicyunits catalog grouped by unit type. On save: create /
// clone POST the policy then its unit assignments; edit PUTs the metadata and
// applies the assignment diff. Mirrors RoleFormModal's draft-seeding shape and
// MacPoolFormModal's add/remove row idiom; strings are hardcoded English
// pending the dedicated i18n pass.
export function SchedulingPolicyFormModal({
  mode,
  policy,
  isOpen,
  onClose,
}: {
  mode: SchedulingPolicyEditorMode
  policy?: SchedulingPolicy
  isOpen: boolean
  onClose: () => void
}) {
  const needsSource = mode !== 'create'

  const catalog = usePolicyUnitCatalog(isOpen)
  const assignments = usePolicyAssignments(policy?.id, isOpen && needsSource)

  const create = useCreateSchedulingPolicy()
  const update = useUpdateSchedulingPolicy()
  const pending = create.isPending || update.isPending

  // Draft is seeded once the data each mode needs has resolved (create needs
  // nothing; edit/clone need the source policy's unit assignments). Null until
  // then, which drives the form's own loading skeleton — mirror RoleFormModal.
  const [draft, setDraft] = useState<SchedulingPolicyFormDraft | null>(null)

  useEffect(() => {
    if (draft !== null) return
    if (mode === 'create') {
      setDraft(blankDraft())
      return
    }
    if (policy && assignments.isSuccess) {
      setDraft(
        mode === 'clone'
          ? cloneDraft(policy, assignments.data, `Copy of ${policy.name ?? ''}`)
          : policyToDraft(policy, assignments.data),
      )
    }
  }, [draft, mode, policy, assignments.isSuccess, assignments.data])

  const units = useMemo(() => groupPolicyUnits(catalog.data ?? []), [catalog.data])
  const catalogEmpty =
    units.filters.length === 0 && units.weights.length === 0 && units.balancers.length === 0

  const set = <K extends keyof SchedulingPolicyFormDraft>(
    key: K,
    value: SchedulingPolicyFormDraft[K],
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  // -- properties rows (MacPoolFormModal ranges idiom; rows are optional) ----
  const addProperty = () => draft && set('properties', [...draft.properties, blankProperty()])
  const removeProperty = (id: string) =>
    draft &&
    set(
      'properties',
      draft.properties.filter((row) => row.id !== id),
    )
  const setProperty = (id: string, field: 'key' | 'value', value: string) =>
    draft &&
    set(
      'properties',
      draft.properties.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    )

  // -- filter assignments ----------------------------------------------------
  const toggleFilter = (unitId: string, next: boolean) => {
    if (!draft) return
    set(
      'filters',
      next
        ? [...draft.filters, { unitId, position: 'none' as const }]
        : draft.filters.filter((row) => row.unitId !== unitId),
    )
  }
  // Webadmin keeps at most one filter per non-zero position
  // (NewClusterPolicyModel.addFilter evicts the previous holder) — mirror that
  // so First/Last stay unique.
  const setFilterPosition = (unitId: string, position: FilterPosition) => {
    if (!draft) return
    set(
      'filters',
      draft.filters.map((row) => {
        if (row.unitId === unitId) return { ...row, position }
        if (position !== 'none' && row.position === position) return { ...row, position: 'none' }
        return row
      }),
    )
  }

  // -- weight assignments ----------------------------------------------------
  const toggleWeight = (unitId: string, next: boolean) => {
    if (!draft) return
    set(
      'weights',
      next
        ? [...draft.weights, { unitId, factor: 1 }]
        : draft.weights.filter((row) => row.unitId !== unitId),
    )
  }
  const setWeightFactor = (unitId: string, factor: number) => {
    if (!draft) return
    set(
      'weights',
      draft.weights.map((row) => (row.unitId === unitId ? { ...row, factor } : row)),
    )
  }

  const save = () => {
    if (!draft) return
    if (mode === 'edit' && policy) {
      // The draft was seeded from assignments.data, so it is present here; it
      // is the diff baseline for the sub-collection add/remove calls.
      const current = assignments.data
      if (!current) return
      update.mutate(
        { id: policy.id, draft: toPayloadDraft(draft), current },
        { onSuccess: () => onClose() },
      )
    } else {
      create.mutate(toPayloadDraft(draft), { onSuccess: () => onClose() })
    }
  }

  const nameEmpty = (draft?.name ?? '').trim() === ''
  // Light client check ahead of the engine's authoritative one: each factor
  // must be a whole number of at least 1 (webadmin's spinner enforces the
  // same floor).
  const factorInvalid = (draft?.weights ?? []).some(
    (row) => !Number.isInteger(row.factor) || row.factor < 1,
  )
  const saveDisabled = pending || draft === null || nameEmpty || factorInvalid || !catalog.isSuccess

  const title =
    mode === 'create'
      ? 'New scheduling policy'
      : mode === 'clone'
        ? `Clone scheduling policy — ${policy?.name ?? ''}`
        : `Edit scheduling policy — ${policy?.name ?? ''}`

  const unitRow = (unit: SchedulingPolicyUnit, control: ReactNode) => (
    <Flex
      key={unit.id}
      spaceItems={{ default: 'spaceItemsSm' }}
      alignItems={{ default: 'alignItemsCenter' }}
      flexWrap={{ default: 'nowrap' }}
      style={{ marginBottom: 'var(--pf-t--global--spacer--xs)' }}
    >
      {control}
    </Flex>
  )

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="scheduling-policy-form-title"
      aria-describedby="scheduling-policy-form-body"
    >
      <ModalHeader title={title} labelId="scheduling-policy-form-title" />
      <ModalBody id="scheduling-policy-form-body">
        {/* Edit/clone can't seed the draft without the source policy's unit
            assignments — a failed fetch must surface as error + retry, not
            skeletons forever (four-states). */}
        {draft === null && needsSource && assignments.isError ? (
          <EmptyState titleText="Could not load the policy's unit assignments" status="danger">
            <EmptyStateBody>
              {assignments.error instanceof Error ? assignments.error.message : ''}
            </EmptyStateBody>
            <Button variant="primary" onClick={() => void assignments.refetch()}>
              Retry
            </Button>
          </EmptyState>
        ) : draft === null ? (
          <>
            <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="12rem" screenreaderText="Loading scheduling policy" />
          </>
        ) : (
          <Form onSubmit={(event) => event.preventDefault()}>
            <FormGroup label="Name" isRequired fieldId="scheduling-policy-name">
              <TextInput
                id="scheduling-policy-name"
                isRequired
                aria-label="Scheduling policy name"
                value={draft.name}
                validated={nameEmpty ? 'error' : 'default'}
                onChange={(_event, value) => set('name', value)}
              />
              {nameEmpty && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">The policy name is required.</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>

            <FormGroup label="Description" fieldId="scheduling-policy-description">
              <TextInput
                id="scheduling-policy-description"
                aria-label="Scheduling policy description"
                value={draft.description}
                onChange={(_event, value) => set('description', value)}
              />
            </FormGroup>

            {/* The Manage-Policy-Units section: filters / weights / balancer,
                fed from the /schedulingpolicyunits catalog. The whole region
                carries its own loading / error / empty states while the
                catalog resolves. */}
            {catalog.isPending && (
              <Skeleton height="10rem" screenreaderText="Loading policy units" />
            )}
            {catalog.isError && (
              <EmptyState titleText="Could not load the policy-unit catalog" status="danger">
                <EmptyStateBody>
                  {catalog.error instanceof Error ? catalog.error.message : ''}
                </EmptyStateBody>
                <Button variant="primary" onClick={() => void catalog.refetch()}>
                  Retry
                </Button>
              </EmptyState>
            )}
            {catalog.isSuccess && catalogEmpty && (
              <EmptyState titleText="No policy units available">
                <EmptyStateBody>
                  The engine returned no scheduling policy units, so filters, weights, and load
                  balancing cannot be configured here.
                </EmptyStateBody>
              </EmptyState>
            )}

            {catalog.isSuccess && units.filters.length > 0 && (
              <FormGroup
                label="Filter modules"
                fieldId="scheduling-policy-filters"
                labelHelp={
                  <FieldHelp
                    field="Filter modules"
                    content="Filters are hard constraints: a host must pass every enabled filter to be considered for a VM. A filter marked First runs at the head of the chain and one marked Last at the tail; unpositioned filters run in between. At most one filter can hold each position."
                  />
                }
              >
                {units.filters.map((unit) => {
                  const assignment = draft.filters.find((row) => row.unitId === unit.id)
                  return unitRow(
                    unit,
                    <>
                      <FlexItem grow={{ default: 'grow' }}>
                        <Checkbox
                          id={`policy-filter-${unit.id}`}
                          label={unit.name ?? unit.id}
                          isChecked={assignment !== undefined}
                          onChange={(_event, checked) => toggleFilter(unit.id, checked)}
                        />
                      </FlexItem>
                      {assignment && (
                        <FlexItem>
                          <FormSelect
                            id={`policy-filter-position-${unit.id}`}
                            aria-label={`${unit.name ?? unit.id} position`}
                            value={assignment.position}
                            style={{ width: '10rem' }}
                            onChange={(_event, value) =>
                              setFilterPosition(unit.id, value as FilterPosition)
                            }
                          >
                            {POSITION_OPTIONS.map((option) => (
                              <FormSelectOption
                                key={option.value}
                                value={option.value}
                                label={option.label}
                              />
                            ))}
                          </FormSelect>
                        </FlexItem>
                      )}
                    </>,
                  )
                })}
              </FormGroup>
            )}

            {catalog.isSuccess && units.weights.length > 0 && (
              <FormGroup
                label="Weight modules"
                fieldId="scheduling-policy-weights"
                labelHelp={
                  <FieldHelp
                    field="Weight modules"
                    content="Weights are soft preferences: each enabled module scores the candidate hosts and the scores are combined, each multiplied by its factor. A higher factor gives that module more influence on host selection."
                  />
                }
              >
                {units.weights.map((unit) => {
                  const assignment = draft.weights.find((row) => row.unitId === unit.id)
                  return unitRow(
                    unit,
                    <>
                      <FlexItem grow={{ default: 'grow' }}>
                        <Checkbox
                          id={`policy-weight-${unit.id}`}
                          label={unit.name ?? unit.id}
                          isChecked={assignment !== undefined}
                          onChange={(_event, checked) => toggleWeight(unit.id, checked)}
                        />
                      </FlexItem>
                      {assignment && (
                        <FlexItem>
                          <NumberInput
                            id={`policy-weight-factor-${unit.id}`}
                            value={assignment.factor}
                            min={1}
                            widthChars={4}
                            inputAriaLabel={`${unit.name ?? unit.id} factor`}
                            onMinus={() =>
                              setWeightFactor(unit.id, Math.max(1, assignment.factor - 1))
                            }
                            onPlus={() => setWeightFactor(unit.id, assignment.factor + 1)}
                            onChange={(event) =>
                              setWeightFactor(
                                unit.id,
                                Number((event.target as HTMLInputElement).value),
                              )
                            }
                          />
                        </FlexItem>
                      )}
                    </>,
                  )
                })}
                {factorInvalid && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">
                        Each factor must be a whole number of at least 1.
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
            )}

            {catalog.isSuccess && units.balancers.length > 0 && (
              <FormGroup
                label="Load balancer"
                fieldId="scheduling-policy-balancer"
                labelHelp={
                  <FieldHelp
                    field="Load balancer"
                    content="The single load-balancing module that periodically picks over- or under-utilized hosts and migrates VMs off them. Its thresholds are tuned through the policy properties below (for example HighUtilization or CpuOverCommitDurationMinutes)."
                  />
                }
              >
                <FormSelect
                  id="scheduling-policy-balancer"
                  aria-label="Load balancer"
                  value={draft.balancerUnitId ?? ''}
                  onChange={(_event, value) => set('balancerUnitId', value === '' ? null : value)}
                >
                  <FormSelectOption value="" label="None" />
                  {units.balancers.map((unit) => (
                    <FormSelectOption key={unit.id} value={unit.id} label={unit.name ?? unit.id} />
                  ))}
                </FormSelect>
              </FormGroup>
            )}

            <FormGroup
              label="Properties"
              fieldId="scheduling-policy-properties"
              labelHelp={
                <FieldHelp
                  field="Properties"
                  content="Free-form name/value pairs consumed by the selected policy units — for example HighUtilization=80, LowUtilization=20, or CpuOverCommitDurationMinutes=2 for the utilization-based balancers. The engine validates names and values against the selected units."
                />
              }
            >
              {draft.properties.map((row) => (
                <Flex
                  key={row.id}
                  spaceItems={{ default: 'spaceItemsSm' }}
                  alignItems={{ default: 'alignItemsFlexStart' }}
                  style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
                >
                  <FlexItem grow={{ default: 'grow' }}>
                    <TextInput
                      aria-label="Property name"
                      placeholder="HighUtilization"
                      value={row.key}
                      onChange={(_event, value) => setProperty(row.id, 'key', value)}
                    />
                  </FlexItem>
                  <FlexItem grow={{ default: 'grow' }}>
                    <TextInput
                      aria-label="Property value"
                      placeholder="80"
                      value={row.value}
                      onChange={(_event, value) => setProperty(row.id, 'value', value)}
                    />
                  </FlexItem>
                  <FlexItem>
                    <Button
                      variant="plain"
                      aria-label="Remove property"
                      icon={<MinusCircleIcon />}
                      onClick={() => removeProperty(row.id)}
                    />
                  </FlexItem>
                </Flex>
              ))}
              <Button
                variant="link"
                icon={<PlusCircleIcon />}
                aria-label="Add property"
                onClick={addProperty}
              >
                Add property
              </Button>
            </FormGroup>
          </Form>
        )}
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
