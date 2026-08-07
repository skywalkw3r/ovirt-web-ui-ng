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
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
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
  const t = useT()
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
        title={
          profile
            ? t('storage.diskProfiles.edit.title', { name: profile.name ?? '' })
            : t('storage.diskProfiles.new')
        }
        labelId="disk-profile-form-title"
      />
      <ModalBody id="disk-profile-form-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('common.field.name')} isRequired fieldId="disk-profile-name">
            <TextInput
              id="disk-profile-name"
              aria-label={t('common.field.name')}
              isRequired
              value={name}
              isDisabled={pending}
              onChange={(_event, value) => setName(value)}
            />
          </FormGroup>
          <FormGroup label={t('common.field.description')} fieldId="disk-profile-description">
            <TextInput
              id="disk-profile-description"
              aria-label={t('common.field.description')}
              value={description}
              isDisabled={pending}
              onChange={(_event, value) => setDescription(value)}
            />
          </FormGroup>
          <FormGroup
            label={t('storage.diskProfiles.qos')}
            fieldId="disk-profile-qos"
            labelHelp={
              <FieldHelp
                field={t('storage.diskProfiles.qos')}
                content={t('fieldHelp.storage.diskProfileQos')}
              />
            }
          >
            <FormSelect
              id="disk-profile-qos"
              aria-label={t('storage.diskProfiles.qos')}
              value={qosId}
              isDisabled={pending || !hasDataCenter || qossPending || qossError}
              onChange={(_event, value) => setQosId(value)}
            >
              {canClearQos ? (
                <FormSelectOption
                  value=""
                  label={
                    qossPending
                      ? t('storage.diskProfiles.qos.loading')
                      : t('storage.diskProfiles.qos.unlimited')
                  }
                />
              ) : (
                // the REST update cannot clear a bound QoS (see
                // updateDiskProfile) — no way back to unlimited here
                <FormSelectOption
                  value=""
                  label={t('storage.diskProfiles.qos.select')}
                  isDisabled
                />
              )}
              {storageQoss.map((qos) => (
                <FormSelectOption key={qos.id} value={qos.id} label={qos.name ?? qos.id ?? ''} />
              ))}
            </FormSelect>
            {!hasDataCenter && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>{t('storage.diskProfiles.qos.noDataCenter')}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
            {qossError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('storage.diskProfiles.qos.error')}{' '}
                    <Button variant="link" isInline onClick={onRetryQoss}>
                      {t('common.action.retry')}
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
          {profile ? t('common.action.save') : t('common.action.create')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// Every data column in visual order so each Th's index matches its position
// (the trailing actions cell is screen-reader-only).
const SD_DISK_PROFILE_KEYS = ['name', 'description', 'qos'] as const

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
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()

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

  // QoS sorts on the resolved name the cell renders (never the bare id); an
  // unbound profile renders '—' and sorts as absent, so those rows sink.
  const sortedProfiles = sortRows(profiles.data ?? [], sort, (profile, key) =>
    key === 'name'
      ? profile.name
      : key === 'description'
        ? profile.description
        : profile.qos?.id
          ? qosName(profile)
          : undefined,
  )

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
                  {t('storage.diskProfiles.new')}
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      )}

      {profiles.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('storage.diskProfiles.loading')} />
        </>
      )}

      {profiles.isError && (
        <EmptyState titleText={t('storage.diskProfiles.error.title')} status="danger">
          <EmptyStateBody>
            {profiles.error instanceof Error ? profiles.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void profiles.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {profiles.isSuccess && profiles.data.length === 0 && (
        <EmptyState titleText={t('storage.diskProfiles.empty.title')}>
          <EmptyStateBody>{t('storage.diskProfiles.empty.body')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('storage.diskProfiles.new')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {profiles.isSuccess && profiles.data.length > 0 && (
        <Table aria-label={t('storage.diskProfiles.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(SD_DISK_PROFILE_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th sort={thSort(SD_DISK_PROFILE_KEYS, 1)}>{t('common.field.description')}</Th>
              <Th sort={thSort(SD_DISK_PROFILE_KEYS, 2)}>{t('storage.diskProfiles.qos')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {sortedProfiles.map((profile) => (
              <Tr key={profile.id}>
                <Td dataLabel={t('common.field.name')}>{profile.name ?? DASH}</Td>
                <Td dataLabel={t('common.field.description')}>{profile.description ?? DASH}</Td>
                <Td dataLabel={t('storage.diskProfiles.qos')}>{qosName(profile)}</Td>
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
          title={t('storage.diskProfiles.remove.confirm.title', {
            name: removing.name ?? removing.id,
          })}
          body={t('storage.diskProfiles.remove.confirm.body')}
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
