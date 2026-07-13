import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  EmptyState,
  EmptyStateBody,
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
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { importImage } from '../../api/resources/repoImages'
import {
  listStorageDomainImages,
  type StorageDomainImage,
} from '../../api/resources/storageDomains'
import { useClustersInventory } from '../../hooks/useAdminResources'
import { STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS } from '../../hooks/useStorageDomainDetail'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import { useNotify } from '../../notifications/context'
import { useSettings } from '../../settings/SettingsProvider'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'

// The images subcollection isn't part of the shared useStorageDomainDetail
// module (owned elsewhere), so its query rides here inline. It reuses the same
// ['storagedomain', id, …] key prefix and 60s floor as its siblings, which
// keeps the detail page's wholesale invalidate refreshing it too.
function useStorageDomainImages(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['storagedomain', id, 'images'],
    queryFn: () => listStorageDomainImages(id),
    refetchInterval: Math.max(refreshIntervalMs, STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS),
  })
}

// The Import target picker (webadmin ImportExportImagePopupView): a data
// domain the image's bytes land on, plus the optional import-as-template leg
// (cluster + template name — api-model ImageService.Import reads cluster only
// on that leg, so the picker reveals it with the checkbox). Fires POST
// /storagedomains/{sd}/images/{image}/import (resources/repoImages.ts) with
// async=true; the copy runs server-side for minutes, so the toast says
// "started" rather than pretending completion.
function ImportImageModal({
  storageDomainId,
  image,
  onClose,
}: {
  storageDomainId: string
  image: StorageDomainImage
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const [targetDomainId, setTargetDomainId] = useState('')
  const [asTemplate, setAsTemplate] = useState(false)
  const [clusterId, setClusterId] = useState('')
  const [templateName, setTemplateName] = useState('')

  // Target candidates: data domains only — an image/ISO/export domain cannot
  // receive an imported disk. The source domain itself is excluded.
  const domains = useStorageDomains()
  const clusters = useClustersInventory()
  const targets = (domains.data ?? []).filter(
    (domain) => domain.type?.toLowerCase() === 'data' && domain.id !== storageDomainId,
  )

  const run = useMutation({
    mutationFn: () =>
      importImage(storageDomainId, image.id, {
        storageDomainId: targetDomainId,
        importAsTemplate: asTemplate,
        clusterId: asTemplate ? clusterId : undefined,
        templateName: asTemplate && templateName.trim() !== '' ? templateName.trim() : undefined,
      }),
    onSuccess: () => {
      notify({
        title: `Import of ${image.name ?? image.id} started`,
        variant: 'success',
      })
      onClose()
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      // the import mints a disk (and, on the template leg, a template) — both
      // catalogs pick the newcomer up on their prefix invalidate
      void queryClient.invalidateQueries({ queryKey: ['disks'] })
      void queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })

  const pending = run.isPending
  const valid = targetDomainId !== '' && (!asTemplate || clusterId !== '')

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="import-image-title"
      aria-describedby="import-image-body"
    >
      <ModalHeader title={`Import ${image.name ?? image.id}`} labelId="import-image-title" />
      <ModalBody id="import-image-body">
        <Form onSubmit={(event) => event.preventDefault()}>
          {/* Four states on the source list: a failed fetch would otherwise
              leave Import permanently disabled with no explanation or retry. */}
          <FormGroup label="Target storage domain" isRequired fieldId="import-image-domain">
            <FormSelect
              id="import-image-domain"
              aria-label="Target storage domain"
              value={targetDomainId}
              isDisabled={pending || domains.isPending || domains.isError}
              onChange={(_event, value) => setTargetDomainId(value)}
            >
              <FormSelectOption
                value=""
                label={
                  domains.isPending
                    ? 'Loading storage domains…'
                    : targets.length === 0
                      ? 'No data domain available'
                      : 'Select a data domain'
                }
                isDisabled
              />
              {targets.map((domain) => (
                <FormSelectOption key={domain.id} value={domain.id} label={domain.name} />
              ))}
            </FormSelect>
            {domains.isError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    Could not load storage domains.{' '}
                    <Button variant="link" isInline onClick={() => void domains.refetch()}>
                      Retry
                    </Button>
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup fieldId="import-image-as-template">
            <Checkbox
              id="import-image-as-template"
              label="Import as template"
              aria-label="Import as template"
              isChecked={asTemplate}
              isDisabled={pending}
              onChange={(_event, checked) => setAsTemplate(checked)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Creates a template from the imported disk instead of a bare disk.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          {asTemplate && (
            <>
              <FormGroup label="Cluster" isRequired fieldId="import-image-cluster">
                <FormSelect
                  id="import-image-cluster"
                  aria-label="Cluster"
                  value={clusterId}
                  isDisabled={pending || clusters.isPending || clusters.isError}
                  onChange={(_event, value) => setClusterId(value)}
                >
                  <FormSelectOption
                    value=""
                    label={clusters.isPending ? 'Loading clusters…' : 'Select a cluster'}
                    isDisabled
                  />
                  {(clusters.data ?? []).map((cluster) => (
                    <FormSelectOption
                      key={cluster.id}
                      value={cluster.id}
                      label={cluster.name ?? cluster.id}
                    />
                  ))}
                </FormSelect>
                {clusters.isError && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">
                        Could not load clusters.{' '}
                        <Button variant="link" isInline onClick={() => void clusters.refetch()}>
                          Retry
                        </Button>
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
              <FormGroup label="Template name" fieldId="import-image-template-name">
                <TextInput
                  id="import-image-template-name"
                  aria-label="Template name"
                  value={templateName}
                  isDisabled={pending}
                  onChange={(_event, value) => setTemplateName(value)}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      Left blank, the engine names it GlanceTemplate-XXX.
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            </>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={() => run.mutate()}
          isLoading={pending}
          isDisabled={pending || !valid}
        >
          Import
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}

export function StorageDomainImagesTab({ storageDomainId }: { storageDomainId: string }) {
  const t = useT()
  const images = useStorageDomainImages(storageDomainId)
  const [importing, setImporting] = useState<StorageDomainImage | null>(null)

  return (
    <>
      {images.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('storage.images.loading')} />
        </>
      )}

      {images.isError && (
        <EmptyState titleText={t('storage.images.error.title')} status="danger">
          <EmptyStateBody>
            {images.error instanceof Error ? images.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void images.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {images.isSuccess && images.data.length === 0 && (
        <EmptyState titleText={t('storage.images.empty.title')}>
          <EmptyStateBody>{t('storage.images.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {images.isSuccess && images.data.length > 0 && (
        <Table aria-label={t('storage.images.tab')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('storage.images.column.name')}</Th>
              <Th>{t('storage.images.column.size')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {images.data.map((image) => (
              <Tr key={image.id}>
                <Td dataLabel={t('storage.images.column.name')}>{image.name ?? '—'}</Td>
                <Td dataLabel={t('storage.images.column.size')}>{formatBytes(image.size)}</Td>
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  <ActionsColumn
                    items={[
                      {
                        // pull the image into the engine as a disk/template —
                        // meaningful on a Glance image domain; an ISO-domain
                        // row that can't be imported gets the engine's fault
                        // verbatim as a danger toast
                        title: 'Import',
                        onClick: () => setImporting(image),
                      },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {importing && (
        <ImportImageModal
          storageDomainId={storageDomainId}
          image={importing}
          onClose={() => setImporting(null)}
        />
      )}
    </>
  )
}
