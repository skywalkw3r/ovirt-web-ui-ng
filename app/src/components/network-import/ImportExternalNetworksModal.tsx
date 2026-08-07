import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { listDataCenters } from '../../api/resources/datacenters'
import {
  importExternalNetwork,
  listProviderNetworks,
  listProviders,
} from '../../api/resources/providers'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'

// Webadmin's "Import Networks" dialog (ImportNetworksModel): pick an
// openstack-network provider, list the networks it holds, tick some, pick a
// target data center, import. Each import is the canonical oVirt 4.5 action —
// POST /openstacknetworkproviders/{pid}/networks/{nid}/import with the
// data_center — see resources/providers.ts importExternalNetwork.
//
// Already-imported networks are NOT filtered out of the list: the REST Network
// read model never exposes a network's provider-side id, so there is nothing
// client-side to join on (webadmin filters engine-side). A duplicate import
// faults per-network and surfaces as its own toast; successfully imported rows
// are dropped from the selection so a partial batch can be retried in place.
//
// Mount per open (the page renders it conditionally), so selection state never
// leaks between openings.
export function ImportExternalNetworksModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const { notify } = useNotify()
  const queryClient = useQueryClient()
  const [providerId, setProviderId] = useState('')
  const [dataCenterId, setDataCenterId] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  // The ['providers'] key is shared with useProviders/NetworkFormModal, so an
  // admin session reuses the cached inventory instead of re-fanning out.
  const providers = useQuery({
    queryKey: ['providers'],
    queryFn: () => listProviders(),
    enabled: isOpen,
  })
  const networkProviders = (providers.data ?? []).filter(
    (provider) => provider.providerType === 'network',
  )

  const dataCenters = useQuery({
    queryKey: ['datacenters'],
    queryFn: () => listDataCenters(),
    enabled: isOpen,
  })

  const providerNetworks = useQuery({
    queryKey: ['provider', providerId, 'networks'],
    queryFn: () => listProviderNetworks(providerId),
    enabled: isOpen && providerId !== '',
  })
  const rows = providerNetworks.data ?? []

  // Switching provider re-scopes the list; stale ticks must not survive it.
  const changeProvider = (value: string) => {
    setProviderId(value)
    setSelected([])
  }

  const toggleRow = (id: string, checked: boolean) => {
    setSelected((current) => (checked ? [...current, id] : current.filter((entry) => entry !== id)))
  }
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id))

  // One POST per ticked network, allSettled so a single fault doesn't abort
  // the batch — failures toast per network (webadmin reports per-network
  // faults the same way) and stay selected for an in-place retry; the dialog
  // closes only when every import landed.
  const importMutation = useMutation({
    mutationFn: async () => {
      const targets = rows.filter((row) => selected.includes(row.id))
      const settled = await Promise.allSettled(
        targets.map((row) => importExternalNetwork(providerId, row.id, dataCenterId)),
      )
      const failedIds: string[] = []
      settled.forEach((result, index) => {
        if (result.status === 'rejected') {
          const target = targets[index]
          failedIds.push(target.id)
          const message = result.reason instanceof Error ? result.reason.message : 'Unknown error'
          notify({
            title: t('network.import.toast.failure', { name: target.name ?? target.id, message }),
            variant: 'danger',
          })
        }
      })
      return { imported: targets.length - failedIds.length, failedIds }
    },
    onSuccess: ({ imported, failedIds }) => {
      if (imported > 0) {
        notify({
          title: t('network.import.toast.success', { count: imported }),
          variant: 'success',
        })
        void queryClient.invalidateQueries({ queryKey: ['networks'] })
      }
      if (failedIds.length === 0) {
        onClose()
      } else {
        setSelected(failedIds)
      }
    },
  })
  const pending = importMutation.isPending

  const importDisabled =
    pending || providerId === '' || dataCenterId === '' || selected.length === 0

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="network-import-title"
      aria-describedby="network-import-body"
    >
      <ModalHeader title={t('network.import.title')} labelId="network-import-title" />
      <ModalBody id="network-import-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('network.import.provider')} isRequired fieldId="import-provider">
            {providers.isPending ? (
              <Skeleton height="2.25rem" screenreaderText={t('network.import.provider.loading')} />
            ) : providers.isError ? (
              <HelperText>
                <HelperTextItem variant="error">
                  {t('network.import.provider.error', {
                    message:
                      providers.error instanceof Error
                        ? providers.error.message
                        : t('common.error.unknown'),
                  })}
                </HelperTextItem>
              </HelperText>
            ) : networkProviders.length === 0 ? (
              <HelperText>
                <HelperTextItem>{t('network.import.provider.empty')}</HelperTextItem>
              </HelperText>
            ) : (
              <FormSelect
                id="import-provider"
                aria-label={t('network.import.provider')}
                value={providerId}
                onChange={(_event, value) => changeProvider(value)}
              >
                <FormSelectOption
                  value=""
                  label={t('network.import.provider.placeholder')}
                  isDisabled
                />
                {networkProviders.map((provider) => (
                  <FormSelectOption key={provider.id} value={provider.id} label={provider.name} />
                ))}
              </FormSelect>
            )}
          </FormGroup>

          <FormGroup label={t('network.import.networks.label')} fieldId="import-networks">
            {providerId === '' ? (
              <HelperText>
                <HelperTextItem>{t('network.import.networks.prompt')}</HelperTextItem>
              </HelperText>
            ) : providerNetworks.isPending ? (
              <>
                <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
                <Skeleton height="2.5rem" screenreaderText={t('network.import.networks.loading')} />
              </>
            ) : providerNetworks.isError ? (
              <EmptyState
                titleText={t('network.import.networks.error.title')}
                status="danger"
                variant="sm"
              >
                <EmptyStateBody>
                  {providerNetworks.error instanceof Error
                    ? providerNetworks.error.message
                    : t('common.error.unknown')}
                </EmptyStateBody>
                <EmptyStateFooter>
                  <EmptyStateActions>
                    <Button variant="primary" onClick={() => void providerNetworks.refetch()}>
                      {t('common.action.retry')}
                    </Button>
                  </EmptyStateActions>
                </EmptyStateFooter>
              </EmptyState>
            ) : rows.length === 0 ? (
              <EmptyState titleText={t('network.import.networks.empty.title')} variant="sm">
                <EmptyStateBody>{t('network.import.networks.empty.body')}</EmptyStateBody>
              </EmptyState>
            ) : (
              <Table aria-label={t('network.import.networks.ariaLabel')} variant="compact">
                <Thead>
                  <Tr>
                    <Th aria-label={t('network.import.selectAll')}>
                      <Checkbox
                        id="import-select-all"
                        aria-label={t('network.import.selectAll')}
                        isChecked={allSelected}
                        onChange={(_event, checked) =>
                          setSelected(checked ? rows.map((row) => row.id) : [])
                        }
                      />
                    </Th>
                    <Th>{t('common.field.name')}</Th>
                    <Th>{t('common.field.description')}</Th>
                    <Th>{t('network.import.column.externalId')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map((row) => (
                    <Tr key={row.id}>
                      <Td>
                        <Checkbox
                          id={`import-select-${row.id}`}
                          aria-label={t('network.import.select', { name: row.name ?? row.id })}
                          isChecked={selected.includes(row.id)}
                          onChange={(_event, checked) => toggleRow(row.id, checked)}
                        />
                      </Td>
                      <Td dataLabel={t('common.field.name')}>{row.name ?? '—'}</Td>
                      <Td dataLabel={t('common.field.description')}>{row.description || '—'}</Td>
                      <Td dataLabel={t('network.import.column.externalId')}>
                        <code>{row.id}</code>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </FormGroup>

          <FormGroup label={t('network.import.datacenter')} isRequired fieldId="import-datacenter">
            {dataCenters.isPending ? (
              <Skeleton
                height="2.25rem"
                screenreaderText={t('network.import.datacenter.loading')}
              />
            ) : dataCenters.isError ? (
              <HelperText>
                <HelperTextItem variant="error">
                  {t('network.import.datacenter.error', {
                    message:
                      dataCenters.error instanceof Error
                        ? dataCenters.error.message
                        : t('common.error.unknown'),
                  })}
                </HelperTextItem>
              </HelperText>
            ) : (
              <FormSelect
                id="import-datacenter"
                aria-label={t('network.import.datacenter')}
                value={dataCenterId}
                onChange={(_event, value) => setDataCenterId(value)}
              >
                <FormSelectOption
                  value=""
                  label={t('network.import.datacenter.placeholder')}
                  isDisabled
                />
                {(dataCenters.data ?? []).map((dataCenter) => (
                  <FormSelectOption
                    key={dataCenter.id}
                    value={dataCenter.id}
                    label={dataCenter.name ?? dataCenter.id}
                  />
                ))}
              </FormSelect>
            )}
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={() => importMutation.mutate()}
          isLoading={pending}
          isDisabled={importDisabled}
        >
          {t('network.import.submit')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
