import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
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
  Stack,
  StackItem,
} from '@patternfly/react-core'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { extendStorageDomainLuns } from '../../api/resources/storageDomains'
import { listHosts } from '../../api/resources/hosts'
import { useNotify } from '../../notifications/context'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { SanStorageSection, type LunVgDataLoss } from './SanStorageSection'

// Extend a block (iSCSI/FCP) domain with newly selected LUNs — webadmin's
// "Manage Domain" LUN grid, carved out as its own dialog so the metadata Edit
// modal stays file-agnostic. The SAN sub-form owns the discover→login→pick
// machinery exactly as in the create wizard; the chosen ids ride a PUT
// /storagedomains/{id} with storage.logical_units (the backend diffs the set
// and fires ExtendSANStorageDomain — see extendStorageDomainLuns). The action
// is gated to an ACTIVE block domain by the kebab (canExtendLuns); LUNs
// already backing THIS domain are grayed with a "this storage domain" tooltip
// via currentStorageDomainId. A selection that would wipe a foreign volume
// group routes through the same danger confirmation as the create wizard and
// then rides with override_luns (the BLL force flag). Strings are hardcoded
// English pending the externalization pass, except the ids the create modal
// already shipped (host picker, SAN section labels).
export function ExtendStorageDomainModal({
  domain,
  isOpen,
  onClose,
}: {
  domain: StorageDomain
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const { notify } = useNotify()
  const queryClient = useQueryClient()

  const [hostName, setHostName] = useState('')
  const [lunIds, setLunIds] = useState<string[]>([])
  const [vgDataLoss, setVgDataLoss] = useState<LunVgDataLoss[]>([])
  const [confirmingVgLoss, setConfirmingVgLoss] = useState(false)

  // The caller gates on canExtendLuns (a block domain), so the type is always
  // iscsi/fcp here; default defensively to iscsi rather than crash.
  const storageType = (domain.storage?.type?.toLowerCase() === 'fcp' ? 'fcp' : 'iscsi') as
    'iscsi' | 'fcp'

  const hosts = useQuery({
    queryKey: ['hosts'],
    queryFn: () => listHosts(),
    enabled: isOpen,
  })

  // One-shot inline mutation (same pattern as StorageDomainActions' Update
  // OVFs / Refresh LUNs): the PUT changes the domain's capacity, so refresh
  // both the list and detail slices on settle.
  const extend = useMutation({
    mutationFn: (spec: { lunIds: string[]; overrideLuns?: boolean }) =>
      extendStorageDomainLuns(domain.id, { storageType, ...spec }),
    onSuccess: (updated) => {
      notify({ title: `Storage domain ${updated.name} extended`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['storagedomains'] })
      void queryClient.invalidateQueries({ queryKey: ['storagedomain', domain.id] })
    },
  })
  const pending = extend.isPending

  // The SAN round-trips are host-scoped by id; resolve it from the loaded
  // host list (the picker tracks names, mirroring the create modal).
  const selectedHostId = (hosts.data ?? []).find((host) => host.name === hostName)?.id ?? ''

  const onSaved = () => {
    setHostName('')
    setLunIds([])
    setVgDataLoss([])
    setConfirmingVgLoss(false)
    onClose()
  }

  const runExtend = (overrideLuns?: boolean) => {
    extend.mutate({ lunIds, overrideLuns }, { onSuccess: onSaved })
  }

  const save = () => {
    // Any selected LUN still carved into a foreign volume group demands an
    // explicit data-loss acknowledgement first (lunUsedByVG) — confirm, then
    // extend with the override (force) flag.
    if (vgDataLoss.length > 0) setConfirmingVgLoss(true)
    else runExtend()
  }

  return (
    <>
      <Modal
        variant="medium"
        isOpen={isOpen}
        onClose={onClose}
        aria-labelledby="extend-storage-domain-title"
        aria-describedby="extend-storage-domain-body"
      >
        <ModalHeader
          title={`Extend ${domain.name} with new LUNs`}
          labelId="extend-storage-domain-title"
        />
        <ModalBody id="extend-storage-domain-body">
          <Form onSubmit={(event) => event.preventDefault()}>
            {/* Four states on the host list: a failed load would otherwise
                leave Extend permanently disabled with no explanation or retry. */}
            <FormGroup
              label={t('storageForm.field.host')}
              isRequired
              fieldId="extend-storage-domain-host"
            >
              <FormSelect
                id="extend-storage-domain-host"
                aria-label={t('storageForm.field.host')}
                value={hostName}
                isDisabled={hosts.isPending || hosts.isError}
                onChange={(_event, value) => setHostName(value)}
              >
                <FormSelectOption
                  value=""
                  label={
                    hosts.isPending ? t('storageForm.host.loading') : t('storageForm.host.select')
                  }
                  isDisabled
                />
                {(hosts.data ?? []).map((host) => (
                  <FormSelectOption key={host.id} value={host.name} label={host.name} />
                ))}
              </FormSelect>
              {hosts.isError && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">
                      {t('storageForm.host.error')}{' '}
                      <Button variant="link" isInline onClick={() => void hosts.refetch()}>
                        {t('common.action.retry')}
                      </Button>
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>

            <FormGroup
              label={
                storageType === 'iscsi' ? t('storageForm.san.iscsi') : t('storageForm.san.fcp')
              }
              isRequired
              fieldId="extend-storage-domain-san"
            >
              <SanStorageSection
                storageType={storageType}
                hostId={selectedHostId}
                selectedLunIds={lunIds}
                onSelectedLunIdsChange={setLunIds}
                onVgDataLossChange={setVgDataLoss}
                currentStorageDomainId={domain.id}
              />
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={save}
            isLoading={pending}
            isDisabled={pending || hostName === '' || lunIds.length === 0}
          >
            Extend
          </Button>
          <Button variant="secondary" onClick={onClose} isDisabled={pending}>
            {t('common.action.cancel')}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Data-loss gate: reusing a LUN still carved into a foreign volume
          group destroys that VG (lunUsedByVG). Confirm runs the extend with
          the override flag; cancel returns to the form. */}
      <ConfirmModal
        isOpen={confirmingVgLoss}
        title="Destroy existing volume groups?"
        confirmLabel="Extend and destroy data"
        body={
          <Stack hasGutter>
            <StackItem>
              The selected LUNs still belong to existing volume groups. Extending the domain with
              them destroys those volume groups and everything stored on them.
            </StackItem>
            <StackItem>
              <ul>
                {vgDataLoss.map((warning) => (
                  <li key={warning.id}>{warning.reason}</li>
                ))}
              </ul>
            </StackItem>
          </Stack>
        }
        onConfirm={() => {
          setConfirmingVgLoss(false)
          runExtend(true)
        }}
        onCancel={() => setConfirmingVgLoss(false)}
      />
    </>
  )
}
