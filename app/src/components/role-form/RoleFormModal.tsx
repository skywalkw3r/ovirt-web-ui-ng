import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
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
  Radio,
  Skeleton,
  Split,
  SplitItem,
  TextInput,
} from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import {
  diffPermitIds,
  groupPermits,
  isAdministrativePermit,
  type PermitCategory,
  type Role,
  type RoleDraft,
} from '../../api/resources/roles'
import { useT } from '../../i18n/useT'
import {
  useCreateRole,
  usePermitCatalog,
  useRolePermits,
  useUpdateRole,
} from '../../hooks/useRoles'
import { PermitTree } from './PermitTree'
import { blankDraft, cloneDraft, roleToDraft } from './roleDraft'

export type RoleEditorMode = 'create' | 'edit' | 'clone'

// The custom role editor. Owns the flat RoleDraft (name/description/account
// type + the checked permit id set) and the permission tree. On save: create /
// clone POST the role with its inline permits; edit PUTs the metadata and
// applies the permit diff. The permit catalog (SuperUser's permits) and, for
// edit/clone, the source role's current permits are fetched at open time —
// the tree region carries its own loading / error / empty states while they
// resolve.
export function RoleFormModal({
  mode,
  role,
  isOpen,
  onClose,
}: {
  mode: RoleEditorMode
  role?: Role
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const needsSource = mode !== 'create'

  const catalog = usePermitCatalog(isOpen)
  const sourcePermits = useRolePermits(role?.id, isOpen && needsSource)

  const create = useCreateRole()
  const update = useUpdateRole()
  const pending = create.isPending || update.isPending

  // Draft is seeded once the data each mode needs has resolved (create needs
  // nothing; edit/clone need the source role's permits). Null until then, which
  // drives the form's own loading skeleton.
  const [draft, setDraft] = useState<RoleDraft | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (draft !== null) return
    if (mode === 'create') {
      setDraft(blankDraft())
      return
    }
    if (role && sourcePermits.isSuccess) {
      const cloneName = t('roles.editor.cloneName', { name: role.name ?? '' })
      setDraft(
        mode === 'clone'
          ? cloneDraft(role, sourcePermits.data, cloneName)
          : roleToDraft(role, sourcePermits.data),
      )
    }
  }, [draft, mode, role, sourcePermits.isSuccess, sourcePermits.data, t])

  const groups = useMemo(() => groupPermits(catalog.data ?? []), [catalog.data])
  const adminPermitIds = useMemo(
    () => new Set((catalog.data ?? []).filter(isAdministrativePermit).map((p) => p.id)),
    [catalog.data],
  )

  const checked = useMemo(() => new Set(draft?.permitIds ?? []), [draft?.permitIds])
  const adminDisabled = draft ? !draft.administrative : true

  const setAccountType = (administrative: boolean) => {
    setDraft((current) => {
      if (!current) return current
      // Switching to a user role clears any administrative permits the engine
      // would refuse on it.
      const permitIds = administrative
        ? current.permitIds
        : current.permitIds.filter((id) => !adminPermitIds.has(id))
      return { ...current, administrative, permitIds }
    })
  }

  const togglePermit = (permitId: string, next: boolean) => {
    setDraft((current) => {
      if (!current) return current
      const set = new Set(current.permitIds)
      if (next) set.add(permitId)
      else set.delete(permitId)
      return { ...current, permitIds: [...set] }
    })
  }

  const toggleCategory = (category: PermitCategory, next: boolean) => {
    const group = groups.find((g) => g.category === category)
    if (!group) return
    const enabledIds = group.permits
      .filter((permit) => !adminDisabled || !isAdministrativePermit(permit))
      .map((permit) => permit.id)
    setDraft((current) => {
      if (!current) return current
      const set = new Set(current.permitIds)
      for (const id of enabledIds) {
        if (next) set.add(id)
        else set.delete(id)
      }
      return { ...current, permitIds: [...set] }
    })
  }

  const expandAll = () =>
    setExpanded(Object.fromEntries(groups.map((group) => [group.category, true])))
  const collapseAll = () => setExpanded({})

  const save = () => {
    if (!draft) return
    if (mode === 'edit' && role) {
      const original = sourcePermits.data?.map((permit) => permit.id) ?? []
      update.mutate(
        {
          id: role.id,
          metadata: {
            name: draft.name.trim(),
            description: draft.description.trim(),
            administrative: draft.administrative,
          },
          diff: diffPermitIds(original, draft.permitIds),
        },
        { onSuccess: () => onClose() },
      )
    } else {
      create.mutate(draft, { onSuccess: () => onClose() })
    }
  }

  const nameEmpty = (draft?.name ?? '').trim() === ''
  const saveDisabled = pending || draft === null || nameEmpty || !catalog.isSuccess

  const title =
    mode === 'create'
      ? t('roles.editor.create.title')
      : mode === 'clone'
        ? t('roles.editor.clone.title', { name: role?.name ?? '' })
        : t('roles.editor.edit.title', { name: role?.name ?? '' })

  const selectedCount = checked.size
  const totalCount = catalog.data?.length ?? 0

  return (
    <Modal
      variant="large"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="role-form-title"
      aria-describedby="role-form-body"
    >
      <ModalHeader title={title} labelId="role-form-title" />
      <ModalBody id="role-form-body">
        {/* Edit/clone can't seed the draft without the source role's permits —
            a failed fetch must surface as error + retry, not skeletons forever
            (four-states). Mirrors the catalog's
            error state below. */}
        {draft === null && needsSource && sourcePermits.isError ? (
          <EmptyState titleText={t('roles.permissions.error')} status="danger">
            <EmptyStateBody>
              {sourcePermits.error instanceof Error ? sourcePermits.error.message : ''}
            </EmptyStateBody>
            <Button variant="primary" onClick={() => void sourcePermits.refetch()}>
              <FormattedMessage id="common.action.retry" />
            </Button>
          </EmptyState>
        ) : draft === null ? (
          <>
            <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="12rem" screenreaderText={t('roles.permissions.loading')} />
          </>
        ) : (
          <Form onSubmit={(event) => event.preventDefault()}>
            <FormGroup label={t('common.field.name')} isRequired fieldId="role-name">
              <TextInput
                id="role-name"
                isRequired
                aria-label={t('common.field.name')}
                value={draft.name}
                validated={nameEmpty ? 'error' : 'default'}
                onChange={(_event, value) => setDraft({ ...draft, name: value })}
              />
              {nameEmpty && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">
                      <FormattedMessage id="roles.field.name.required" />
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>

            <FormGroup label={t('common.field.description')} fieldId="role-description">
              <TextInput
                id="role-description"
                aria-label={t('common.field.description')}
                value={draft.description}
                onChange={(_event, value) => setDraft({ ...draft, description: value })}
              />
            </FormGroup>

            <FormGroup
              label={t('roles.field.accountType')}
              fieldId="role-account-type"
              role="radiogroup"
              aria-label={t('roles.field.accountType')}
            >
              <Flex>
                <FlexItem>
                  <Radio
                    id="role-account-type-user"
                    name="role-account-type"
                    label={t('roles.accountType.user')}
                    isChecked={!draft.administrative}
                    onChange={() => setAccountType(false)}
                  />
                </FlexItem>
                <FlexItem>
                  <Radio
                    id="role-account-type-admin"
                    name="role-account-type"
                    label={t('roles.accountType.admin')}
                    isChecked={draft.administrative}
                    onChange={() => setAccountType(true)}
                  />
                </FlexItem>
              </Flex>
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    <FormattedMessage id="roles.field.accountType.help" />
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>

            <FormGroup label={t('roles.permissions.legend')} fieldId="role-permits">
              <Split hasGutter style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}>
                <SplitItem isFilled>
                  <HelperText>
                    <HelperTextItem>
                      <FormattedMessage
                        id="roles.permissions.summary"
                        values={{ selected: selectedCount, total: totalCount }}
                      />
                    </HelperTextItem>
                  </HelperText>
                </SplitItem>
                <SplitItem>
                  <Button variant="link" isInline onClick={expandAll}>
                    <FormattedMessage id="roles.permissions.expandAll" />
                  </Button>
                </SplitItem>
                <SplitItem>
                  <Button variant="link" isInline onClick={collapseAll}>
                    <FormattedMessage id="roles.permissions.collapseAll" />
                  </Button>
                </SplitItem>
              </Split>

              {catalog.isPending && (
                <Skeleton height="12rem" screenreaderText={t('roles.permissions.loading')} />
              )}
              {catalog.isError && (
                <EmptyState titleText={t('roles.permissions.error')} status="danger">
                  <EmptyStateBody>
                    {catalog.error instanceof Error ? catalog.error.message : ''}
                  </EmptyStateBody>
                  <Button variant="primary" onClick={() => void catalog.refetch()}>
                    <FormattedMessage id="common.action.retry" />
                  </Button>
                </EmptyState>
              )}
              {catalog.isSuccess && groups.length === 0 && (
                <EmptyState titleText={t('roles.permissions.empty')} />
              )}
              {catalog.isSuccess && groups.length > 0 && (
                <PermitTree
                  groups={groups}
                  checked={checked}
                  adminDisabled={adminDisabled}
                  expanded={expanded}
                  onToggleGroupExpanded={(category, isOpen) =>
                    setExpanded((prev) => ({ ...prev, [category]: isOpen }))
                  }
                  onToggleCategory={toggleCategory}
                  onTogglePermit={togglePermit}
                />
              )}
            </FormGroup>
          </Form>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={save} isLoading={pending} isDisabled={saveDisabled}>
          <FormattedMessage id="common.action.save" />
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          <FormattedMessage id="common.action.cancel" />
        </Button>
      </ModalFooter>
    </Modal>
  )
}
