import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
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
import { listDataCenters } from '../../api/resources/datacenters'
import { importExternalNetwork, type OpenStackNetwork } from '../../api/resources/providers'
import { useT } from '../../i18n/useT'
import { useNotify } from '../../notifications/context'

// The per-row Import action from the provider Networks tab. It reuses the exact
// import machinery ImportExternalNetworksModal drives — POST
// /openstacknetworkproviders/{pid}/networks/{nid}/import with the target
// data_center (resources/providers.ts importExternalNetwork) — scoped to one
// already-chosen provider network. The batch modal (network-import) picks the
// provider AND the networks; here both are fixed, so all this dialog asks for
// is the target data center. Mount per open so the DC selection never leaks
// between rows.
export function ProviderNetworkImportModal({
  providerId,
  network,
  isOpen,
  onClose,
}: {
  providerId: string
  network: OpenStackNetwork
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const { notify } = useNotify()
  const queryClient = useQueryClient()
  const [dataCenterId, setDataCenterId] = useState('')

  // Shares the ['datacenters'] key with the batch import modal, so the cached
  // inventory is reused instead of re-fetched.
  const dataCenters = useQuery({
    queryKey: ['datacenters'],
    queryFn: () => listDataCenters(),
    enabled: isOpen,
  })

  const name = network.name ?? network.id

  const importMutation = useMutation({
    mutationFn: () => importExternalNetwork(providerId, network.id, dataCenterId),
    onSuccess: () => {
      notify({ title: t('network.import.toast.success', { count: 1 }), variant: 'success' })
      // Refresh the engine networks (the batch modal invalidates the same key)
      // and this provider's imported markers on the Networks tab.
      void queryClient.invalidateQueries({ queryKey: ['networks'] })
      void queryClient.invalidateQueries({ queryKey: ['provider', providerId, 'networks'] })
      onClose()
    },
    onError: (error) => {
      notify({
        title: t('network.import.toast.failure', {
          name,
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
        variant: 'danger',
      })
    },
  })
  const pending = importMutation.isPending

  return (
    <Modal
      variant="small"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="provider-network-import-title"
    >
      <ModalHeader title={t('network.import.title')} labelId="provider-network-import-title" />
      <ModalBody>
        <Form onSubmit={(event) => event.preventDefault()}>
          <FormGroup label={t('network.import.networks.label')} fieldId="provider-import-network">
            <HelperText>
              <HelperTextItem>{name}</HelperTextItem>
            </HelperText>
          </FormGroup>

          <FormGroup
            label={t('network.import.datacenter')}
            isRequired
            fieldId="provider-import-datacenter"
          >
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
                        : 'Unknown error',
                  })}
                </HelperTextItem>
              </HelperText>
            ) : (
              <FormSelect
                id="provider-import-datacenter"
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
          isDisabled={pending || dataCenterId === ''}
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
