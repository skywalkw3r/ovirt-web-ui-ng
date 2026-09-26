import {
  Button,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Radio,
  Skeleton,
} from '@patternfly/react-core'
import type { DiscoveredLun } from '../../api/schemas/host-storage'
import type { useHosts } from '../../hooks/useHosts'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'
import { SanStorageSection } from '../storage-domain-form/SanStorageSection'

// The Direct LUN branch both disk create forms render: the discovery host
// (every SAN round-trip is host-scoped, so only UP hosts are candidates), the
// SAN fabric kind, then the reused discover/login/LUN-pick flow in
// single-select mode — one LUN per disk (webadmin semantics). The full
// DiscoveredLun rides up so the create body can carry the iSCSI connection
// coordinates (address/port/target). `idPrefix` keeps each dialog's element
// ids ('add-disk-lun-host' / 'disk-lun-host', …) exactly as before.
export function DirectLunFields({
  idPrefix,
  hosts,
  hostId,
  onHostChange,
  storageType,
  onStorageTypeChange,
  selectedLunIds,
  onSelectedLunIdsChange,
  selectedLuns,
  onSelectedLunsChange,
}: {
  idPrefix: string
  // the caller's host inventory query (mounted with the dialog, not the branch)
  hosts: ReturnType<typeof useHosts>
  hostId: string
  onHostChange: (hostId: string) => void
  storageType: 'iscsi' | 'fcp'
  onStorageTypeChange: (storageType: 'iscsi' | 'fcp') => void
  selectedLunIds: string[]
  onSelectedLunIdsChange: (ids: string[]) => void
  selectedLuns: DiscoveredLun[]
  onSelectedLunsChange: (luns: DiscoveredLun[]) => void
}) {
  const t = useT()
  const upHosts = (hosts.data ?? []).filter((host) => host.status === 'up')
  // exactly one LUN backs a direct-LUN disk; the section's radio mode enforces
  // the "at most one" half, the caller's submit gate the "at least one"
  const lunSelected = selectedLuns.length === 1
  return (
    <>
      <FormGroup label={t('disk.lun.host.label')} isRequired fieldId={`${idPrefix}-lun-host`}>
        {hosts.isPending && (
          <Skeleton height="2.25rem" screenreaderText={t('disk.lun.host.loading')} />
        )}
        {hosts.isError && (
          <>
            <HelperText>
              <HelperTextItem variant="error">
                {t('disk.lun.host.error', {
                  message:
                    hosts.error instanceof Error ? hosts.error.message : t('common.error.unknown'),
                })}
              </HelperTextItem>
            </HelperText>
            <Button variant="link" isInline onClick={() => void hosts.refetch()}>
              {t('common.action.retry')}
            </Button>
          </>
        )}
        {hosts.isSuccess && (
          <FormSelect
            id={`${idPrefix}-lun-host`}
            aria-label={t('disk.lun.host.label')}
            value={hostId}
            onChange={(_event, value) => onHostChange(value)}
          >
            <FormSelectOption
              value=""
              label={upHosts.length === 0 ? t('disk.lun.host.none') : t('disk.lun.host.select')}
              isPlaceholder
              isDisabled
            />
            {upHosts.map((host) => (
              <FormSelectOption key={host.id} value={host.id} label={host.name ?? host.id} />
            ))}
          </FormSelect>
        )}
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{t('disk.lun.host.help')}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup
        label={t('disk.lun.storageType.label')}
        role="radiogroup"
        isInline
        fieldId={`${idPrefix}-lun-storage-type`}
      >
        <Radio
          id={`${idPrefix}-lun-type-iscsi`}
          name={`${idPrefix}-lun-storage-type`}
          label={t('disk.lun.storageType.iscsi')}
          aria-label={t('disk.lun.storageType.iscsi')}
          isChecked={storageType === 'iscsi'}
          onChange={() => onStorageTypeChange('iscsi')}
        />
        <Radio
          id={`${idPrefix}-lun-type-fcp`}
          name={`${idPrefix}-lun-storage-type`}
          label={t('disk.lun.storageType.fcp')}
          aria-label={t('disk.lun.storageType.fcp')}
          isChecked={storageType === 'fcp'}
          onChange={() => onStorageTypeChange('fcp')}
        />
      </FormGroup>

      <FormGroup
        label={storageType === 'iscsi' ? t('disk.lun.section.iscsi') : t('disk.lun.section.fcp')}
        isRequired
        fieldId={`${idPrefix}-lun-san`}
      >
        <SanStorageSection
          storageType={storageType}
          hostId={hostId}
          selectedLunIds={selectedLunIds}
          onSelectedLunIdsChange={onSelectedLunIdsChange}
          onSelectedLunsChange={onSelectedLunsChange}
          selectionVariant="radio"
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {lunSelected
                ? t('disk.lun.selected', {
                    id: selectedLuns[0].id,
                    size: formatBytes(selectedLuns[0].size),
                  })
                : t('disk.lun.selectOne')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </>
  )
}
