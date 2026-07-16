import { useState } from 'react'
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
  Radio,
  Skeleton,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { useQuery } from '@tanstack/react-query'
import { getCluster } from '../../api/resources/clusters'
import { listDataCenterStorageDomains } from '../../api/resources/datacenters'
import type { Template } from '../../api/schemas/template'
import { useT } from '../../i18n/useT'
import type { MessageId } from '../../i18n/messages/en'
import { useExportTemplateOva, useExportTemplateToDomain } from '../../hooks/useTemplateMutations'
import { useHosts } from '../../hooks/useHosts'

// An absolute POSIX path on the host — the OVA lands here. Mirrors
// ExportOvaModal.directoryError: a plain directory (no host:/ prefix). Returns
// an i18n id the modal resolves, or undefined when valid.
function directoryError(value: string): MessageId | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return 'templateExport.directory.error.required'
  if (!trimmed.startsWith('/')) return 'templateExport.directory.error.absolute'
  return undefined
}

// The Export template dialog — the template analogue of VmDetail's export flows.
// A single POST /templates/{id}/export folds both destinations (webadmin's OVA
// export and the legacy export-domain flow); a radio picks which:
//   • OVA: host + directory (+ filename) — packages the disks into an OVA on the
//     chosen host (Export.ToPathOnHost).
//   • Export domain: an export-type storage domain attached to the template's
//     data center, mirroring ExportVmModal (Export.ToExportDomain), with an
//     overwrite toggle (exclusive) for a same-named template already there.
// Rendered at the detail level (not inside a kebab Dropdown), so it needs no
// menu-click shield. Modal unmounts on close so state resets for free.
export function TemplateExportModal({
  template,
  onClose,
}: {
  template: Template
  onClose: () => void
}) {
  const t = useT()
  const [destination, setDestination] = useState<'ova' | 'domain'>('ova')
  const [hostId, setHostId] = useState('')
  const [directory, setDirectory] = useState('')
  const [filename, setFilename] = useState(`${template.name}.ova`)
  const [storageDomainId, setStorageDomainId] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const exportOva = useExportTemplateOva()
  const exportDomain = useExportTemplateToDomain()

  const hosts = useHosts()
  // only an up host can run the OVA export job
  const eligibleHosts = (hosts.data ?? []).filter((host) => host.status === 'up')

  // template → cluster → data center: an export domain must be attached and
  // active in the template's own data center for the export to have a target,
  // so the options are scoped there (same chained-query shape as ExportVmModal).
  const clusterId = template.cluster?.id
  const cluster = useQuery({
    queryKey: ['cluster', clusterId],
    queryFn: () => getCluster(clusterId ?? ''),
    enabled: clusterId !== undefined,
  })
  const dataCenterId = cluster.data?.data_center?.id
  const storageDomains = useQuery({
    queryKey: ['datacenter', dataCenterId, 'storageDomains'],
    queryFn: () => listDataCenterStorageDomains(dataCenterId ?? ''),
    enabled: dataCenterId !== undefined,
  })
  const exportDomains = (storageDomains.data ?? []).filter(
    (domain) => domain.type === 'export' && domain.status === 'active',
  )
  const domainsLoading = cluster.isLoading || storageDomains.isLoading
  const domainsError = cluster.error ?? storageDomains.error

  const pending = exportOva.isPending || exportDomain.isPending
  const dirError = directoryError(directory)
  const canSubmit =
    destination === 'ova'
      ? hostId !== '' && dirError === undefined && !pending
      : storageDomainId !== '' && !pending

  const save = () => {
    if (destination === 'ova') {
      exportOva.mutate(
        {
          template,
          spec: {
            hostId,
            directory: directory.trim(),
            filename: filename.trim() === '' ? undefined : filename.trim(),
          },
        },
        { onSuccess: onClose },
      )
      return
    }
    exportDomain.mutate(
      {
        template,
        // exclusive overwrites a same-named template already in the domain;
        // default off, only ride when on
        spec: { storageDomainId, exclusive: overwrite ? true : undefined },
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="template-export-title"
      aria-describedby="template-export-body"
    >
      <ModalHeader
        title={t('templateExport.modalTitle', { name: template.name })}
        labelId="template-export-title"
      />
      <ModalBody id="template-export-body">
        <Form
          id="template-export-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmit) save()
          }}
        >
          <FormGroup
            label={t('templateExport.destination')}
            role="radiogroup"
            isInline
            fieldId="template-export-dest"
          >
            <Radio
              id="template-export-dest-ova"
              name="template-export-dest"
              label={t('templateExport.dest.ova')}
              aria-label={t('templateExport.dest.ova')}
              isChecked={destination === 'ova'}
              onChange={() => setDestination('ova')}
            />
            <Radio
              id="template-export-dest-domain"
              name="template-export-dest"
              label={t('templateExport.exportDomain')}
              aria-label={t('templateExport.exportDomain')}
              isChecked={destination === 'domain'}
              onChange={() => setDestination('domain')}
            />
          </FormGroup>

          {destination === 'ova' && (
            <>
              <FormGroup label={t('templateExport.host')} isRequired fieldId="template-export-host">
                {hosts.isPending ? (
                  <Skeleton height="2.25rem" screenreaderText={t('templateExport.host.loading')} />
                ) : hosts.isError ? (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">
                        {t('templateExport.host.error', { message: hosts.error.message })}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                ) : (
                  <FormSelect
                    id="template-export-host"
                    aria-label={t('templateExport.host')}
                    value={hostId}
                    onChange={(_event, value) => setHostId(value)}
                  >
                    <FormSelectOption
                      value=""
                      label={t('templateExport.host.placeholder')}
                      isDisabled
                    />
                    {eligibleHosts.map((host) => (
                      <FormSelectOption
                        key={host.id}
                        value={host.id}
                        label={host.name ?? host.id}
                      />
                    ))}
                  </FormSelect>
                )}
              </FormGroup>

              <FormGroup
                label={t('templateExport.directory')}
                isRequired
                fieldId="template-export-directory"
              >
                <TextInput
                  id="template-export-directory"
                  isRequired
                  aria-label={t('templateExport.directory')}
                  placeholder={t('templateExport.directory.placeholder')}
                  validated={directory !== '' && dirError !== undefined ? 'error' : 'default'}
                  value={directory}
                  onChange={(_event, value) => setDirectory(value)}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem
                      variant={directory !== '' && dirError !== undefined ? 'error' : 'default'}
                    >
                      {directory !== '' && dirError !== undefined
                        ? t(dirError)
                        : t('templateExport.directory.help')}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              <FormGroup label={t('templateExport.filename')} fieldId="template-export-filename">
                <TextInput
                  id="template-export-filename"
                  aria-label={t('templateExport.filename')}
                  value={filename}
                  onChange={(_event, value) => setFilename(value)}
                />
              </FormGroup>
            </>
          )}

          {destination === 'domain' && (
            <>
              <FormGroup
                label={t('templateExport.exportDomain')}
                isRequired
                fieldId="template-export-domain"
              >
                {domainsLoading ? (
                  <Skeleton
                    height="2.25rem"
                    screenreaderText={t('templateExport.domain.loading')}
                  />
                ) : domainsError ? (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">
                        {t('templateExport.domain.error', { message: domainsError.message })}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                ) : (
                  <>
                    <FormSelect
                      id="template-export-domain"
                      aria-label={t('templateExport.exportDomain')}
                      value={storageDomainId}
                      onChange={(_event, value) => setStorageDomainId(value)}
                    >
                      <FormSelectOption
                        value=""
                        label={t('templateExport.domain.placeholder')}
                        isDisabled
                      />
                      {exportDomains.map((domain) => (
                        <FormSelectOption key={domain.id} value={domain.id} label={domain.name} />
                      ))}
                    </FormSelect>
                    {exportDomains.length === 0 && (
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem variant="warning">
                            {t('templateExport.domain.none')}
                          </HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    )}
                  </>
                )}
              </FormGroup>

              <FormGroup fieldId="template-export-overwrite">
                <Switch
                  id="template-export-overwrite"
                  label={t('templateExport.overwrite')}
                  aria-label={t('templateExport.overwrite')}
                  isChecked={overwrite}
                  onChange={(_event, checked) => setOverwrite(checked)}
                />
              </FormGroup>
            </>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="template-export-form"
          isLoading={pending}
          isDisabled={!canSubmit}
        >
          {t('templateExport.action')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
