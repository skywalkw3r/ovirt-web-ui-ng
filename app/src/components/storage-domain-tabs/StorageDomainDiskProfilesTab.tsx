import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
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
  Skeleton,
  TextInput,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { listDataCenterQoss, type DataCenterQos } from '../../api/resources/datacenters'
import {
  createStorageDomainDiskProfile,
  deleteDiskProfile,
  listStorageDomainDiskProfiles,
  updateDiskProfile,
  type DiskProfileSpec,
  type StorageDomainDiskProfile,
} from '../../api/resources/diskProfiles'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS } from '../../hooks/useStorageDomainDetail'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'
import { useSettings } from '../../settings/SettingsProvider'
import { ConfirmModal } from '../ConfirmModal'
import { FieldHelp } from '../forms/FieldHelp'
import { attachedDataCenterId } from '../storage-domain-form/lifecycle'

const DASH = '—'

// The diskprofiles subcollection isn't part of the shared useStorageDomainDetail
// module (owned elsewhere), so its query rides here inline — same posture as
// StorageDomainImagesTab's images query. It reuses the ['storagedomain', id, …]
// key prefix and 60s floor of its siblings, so the detail page's wholesale
// invalidate refreshes it too.
function useStorageDomainDiskProfiles(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['storagedomain', id, 'diskprofiles'],
    queryFn: () => listStorageDomainDiskProfiles(id),
    refetchInterval: Math.max(refreshIntervalMs, STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS),
  })
}

// The QoS entries a profile can bind: the attached data center's storage-type
// QoS list. Shares the ['datacenter', dcId, 'qoss'] cache entry with
// useDataCenterQoss (hooks/useDataCenterDetail) — a local hook only because
// that one has no enabled gate and this tab must tolerate an unattached
// domain (no DC → no QoS to offer).
function useStorageQoss(dataCenterId: string | undefined) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['datacenter', dataCenterId, 'qoss'],
    queryFn: () => listDataCenterQoss(dataCenterId ?? ''),
    enabled: dataCenterId !== undefined,
    refetchInterval: Math.max(refreshIntervalMs, STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS),
  })
}

// The create/edit form. Name is mandatory (AssignedDiskProfilesService.Add);
// the QoS select offers the DC's storage-type entries plus "(unlimited)" —
// note updateDiskProfile's documented divergence: once bound, a QoS can be
// switched but not cleared, so the edit form drops the unlimited option when
// the profile already carries one.
function DiskProfileFormModal({
  storageDomainId,
  profile,
  storageQoss,
  qossPending,
  qossError,
  onRetryQoss,
  hasDataCenter,
  onClose,
}: {
  storageDomainId: string
  // set → edit; unset → create
  profile?: StorageDomainDiskProfile
  storageQoss: DataCenterQos[]
  qossPending: boolean
  qossError: boolean
  onRetryQoss: () => void
  hasDataCenter: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const [name, setName] = useState(profile?.name ?? '')
  const [description, setDescription] = useState(profile?.description ?? '')
  const [qosId, setQosId] = useState(profile?.qos?.id ?? '')

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ['storagedomain', storageDomainId, 'diskprofiles'],
    })
  }

  const save = useMutation({
    mutationFn: (spec: DiskProfileSpec) =>
      profile
        ? updateDiskProfile(profile.id, spec)
        : createStorageDomainDiskProfile(storageDomainId, spec),
    onSuccess: (saved) => {
      notify({
        title: profile
          ? `Changes to disk profile ${saved.name ?? name} saved`
          : `Disk profile ${saved.name ?? name} created`,
        variant: 'success',
      })
      onClose()
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: invalidate,
  })

  const pending = save.isPending
  const canClearQos = !profile?.qos?.id

  const submit = () => {
    if (name.trim() === '') return
    save.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      qosId: qosId || undefined,
    })
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="disk-profile-form-title"
      aria-describedby="disk-profile-form-body"
    >
      <ModalHeader
        title={profile ? `Edit disk profile ${profile.name ?? ''}`.trim() : 'New disk profile'}
        labelId="disk-profile-form-title"
      />
      <ModalBody id="disk-profile-form-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label="Name" isRequired fieldId="disk-profile-name">
            <TextInput
              id="disk-profile-name"
              aria-label="Name"
              isRequired
              value={name}
              isDisabled={pending}
              onChange={(_event, value) => setName(value)}
            />
          </FormGroup>
          <FormGroup label="Description" fieldId="disk-profile-description">
            <TextInput
              id="disk-profile-description"
              aria-label="Description"
              value={description}
              isDisabled={pending}
              onChange={(_event, value) => setDescription(value)}
            />
          </FormGroup>
          <FormGroup
            label="QoS"
            fieldId="disk-profile-qos"
            labelHelp={
              <FieldHelp
                field="QoS"
                content="Caps the throughput and IOPS of every disk using this profile. The options are the storage QoS entries defined on the domain's data center; leave unlimited for no cap."
              />
            }
          >
            <FormSelect
              id="disk-profile-qos"
              aria-label="QoS"
              value={qosId}
              isDisabled={pending || !hasDataCenter || qossPending || qossError}
              onChange={(_event, value) => setQosId(value)}
            >
              {canClearQos ? (
                <FormSelectOption value="" label={qossPending ? 'Loading QoS…' : '(unlimited)'} />
              ) : (
                // the REST update cannot clear a bound QoS (see
                // updateDiskProfile) — no way back to unlimited here
                <FormSelectOption value="" label="Select a QoS" isDisabled />
              )}
              {storageQoss.map((qos) => (
                <FormSelectOption key={qos.id} value={qos.id} label={qos.name ?? qos.id ?? ''} />
              ))}
            </FormSelect>
            {!hasDataCenter && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    Attach the domain to a data center to bind a storage QoS.
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
            {qossError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    Could not load QoS entries.{' '}
                    <Button variant="link" isInline onClick={onRetryQoss}>
                      Retry
                    </Button>
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={submit}
          isLoading={pending}
          isDisabled={pending || name.trim() === ''}
        >
          {profile ? 'Save' : 'Create'}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// The storage domain's Disk Profiles subtab (webadmin DiskProfileListModel):
// list + New/Edit/Remove. A disk profile groups a domain's disks under an
// optional storage QoS; every data domain gets a default one at attach time.
//
// CRUD is admin-only server-side; the whole SD detail route is already gated
// behind loaded && isAdmin in StorageDomainDetailPage, so this tab does not
// re-gate (mirrors the sibling tabs).
export function StorageDomainDiskProfilesTab({ domain }: { domain: StorageDomain }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const profiles = useStorageDomainDiskProfiles(domain.id)

  // The QoS picker (and the QoS name join below) reads the attached DC's
  // storage-type entries; an unattached domain has none to offer.
  const dcId = attachedDataCenterId(domain)
  const qoss = useStorageQoss(dcId)
  const storageQoss = (qoss.data ?? []).filter((qos) => qos.type?.toLowerCase() === 'storage')

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<StorageDomainDiskProfile | null>(null)
  const [removing, setRemoving] = useState<StorageDomainDiskProfile | null>(null)

  const remove = useMutation({
    mutationFn: (profile: StorageDomainDiskProfile) => deleteDiskProfile(profile.id),
    onSuccess: (_data, profile) => {
      notify({
        title: `Disk profile ${profile.name ?? ''} removed`.replace('  ', ' ').trim(),
        variant: 'success',
      })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim (e.g. the
      // profile is the domain's last, or disks still reference it)
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ['storagedomain', domain.id, 'diskprofiles'],
      })
    },
  })

  // The bare qos link on a profile carries only the id — resolve the display
  // name from the DC's cached QoS list (client-side join; never ?follow=).
  const qosName = (profile: StorageDomainDiskProfile) => {
    const id = profile.qos?.id
    if (!id) return DASH
    const match = (qoss.data ?? []).find((qos) => qos.id === id)
    return match?.name ?? profile.qos?.name ?? id
  }

  const formProps = {
    storageDomainId: domain.id,
    storageQoss,
    qossPending: dcId !== undefined && qoss.isPending,
    qossError: qoss.isError,
    onRetryQoss: () => void qoss.refetch(),
    hasDataCenter: dcId !== undefined,
  }

  return (
    <>
      {profiles.isSuccess && profiles.data.length > 0 && (
        <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button variant="secondary" onClick={() => setCreating(true)}>
                  New disk profile
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      )}

      {profiles.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading disk profiles" />
        </>
      )}

      {profiles.isError && (
        <EmptyState titleText="Could not load disk profiles" status="danger">
          <EmptyStateBody>
            {profiles.error instanceof Error ? profiles.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void profiles.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {profiles.isSuccess && profiles.data.length === 0 && (
        <EmptyState titleText="No disk profiles">
          <EmptyStateBody>
            Disk profiles group this domain&apos;s disks under an optional storage QoS.
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                New disk profile
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {profiles.isSuccess && profiles.data.length > 0 && (
        <Table aria-label="Disk profiles" variant="compact">
          <Thead>
            <Tr>
              <Th>{t('common.field.name')}</Th>
              <Th>{t('common.field.description')}</Th>
              <Th>QoS</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {profiles.data.map((profile) => (
              <Tr key={profile.id}>
                <Td dataLabel={t('common.field.name')}>{profile.name ?? DASH}</Td>
                <Td dataLabel={t('common.field.description')}>{profile.description ?? DASH}</Td>
                <Td dataLabel="QoS">{qosName(profile)}</Td>
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  <ActionsColumn
                    isDisabled={remove.isPending}
                    items={[
                      { title: t('common.action.edit'), onClick: () => setEditing(profile) },
                      {
                        title: t('common.action.remove'),
                        isDanger: true,
                        onClick: () => setRemoving(profile),
                      },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {creating && <DiskProfileFormModal {...formProps} onClose={() => setCreating(false)} />}
      {editing && (
        <DiskProfileFormModal {...formProps} profile={editing} onClose={() => setEditing(null)} />
      )}
      {removing && (
        <ConfirmModal
          isOpen
          title={`Remove disk profile ${removing.name ?? removing.id}?`}
          body="Disks referencing this profile keep working; new disks can no longer pick it. The engine rejects removing a domain's last profile."
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            remove.mutate(target)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
