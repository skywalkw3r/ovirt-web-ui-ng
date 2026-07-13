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
  Skeleton,
  TextInput,
} from '@patternfly/react-core'
import type { Disk } from '../../api/schemas/disk'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { useStorageDomains } from '../../hooks/useStorageDomains'

// Move and Copy share a form (target storage-domain select); Copy adds an
// editable alias (webadmin's MoveOrCopyDiskModel makes the alias editable only
// on copy). One modal, a `mode` discriminator, so the two flows never drift.
export type MoveCopyMode = 'move' | 'copy'

function diskLabel(disk: Disk): string {
  return disk.alias ?? disk.name ?? disk.id
}

// The disk's current storage-domain ids — excluded from the target list (moving
// or copying onto the same domain is a no-op the engine rejects). LUN disks
// carry none, but move/copy are gated off for those upstream anyway.
function currentDomainIds(disk: Disk): Set<string> {
  return new Set(
    (disk.storage_domains?.storage_domain ?? [])
      .map((sd) => sd.id)
      .filter((id): id is string => id !== undefined),
  )
}

// Only data domains can hold VM/upload images (ISO/export domains cannot be a
// move/copy target). The flat /storagedomains list does not inline
// data_centers, so the same-data-center gate DiskOperationsHelper applies on
// webadmin can't be enforced client-side here — the engine faults on a
// cross-DC target and ApiError.message surfaces it. We narrow to the domains we
// *can* filter: data-type, not the disk's current one(s).
function eligibleTargets(domains: StorageDomain[], disk: Disk): StorageDomain[] {
  const current = currentDomainIds(disk)
  return domains.filter((sd) => sd.type === 'data' && !current.has(sd.id))
}

export function MoveCopyDiskModal({
  mode,
  disk,
  onSubmit,
  onClose,
}: {
  mode: MoveCopyMode
  disk: Disk
  // move: name stays undefined; copy: the optional new alias (empty ⇒ undefined
  // so the engine keeps the source alias)
  onSubmit: (input: { storageDomainId: string; name?: string }) => void
  onClose: () => void
}) {
  const domains = useStorageDomains()
  const [storageDomainId, setStorageDomainId] = useState('')
  // Copy defaults the new alias to "<source>-copy", matching webadmin's
  // suggested copy name; move never shows this field.
  const [alias, setAlias] = useState(mode === 'copy' ? `${diskLabel(disk)}-copy` : '')

  const targets = eligibleTargets(domains.data ?? [], disk)
  const title =
    mode === 'move' ? `Move disk '${diskLabel(disk)}'` : `Copy disk '${diskLabel(disk)}'`
  const confirmLabel = mode === 'move' ? 'Move' : 'Copy'
  const formId = `${mode}-disk-form`

  const submit = () => {
    if (!storageDomainId) return
    const trimmed = alias.trim()
    onSubmit({
      storageDomainId,
      name: mode === 'copy' && trimmed !== '' ? trimmed : undefined,
    })
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="move-copy-disk-title"
      aria-describedby="move-copy-disk-body"
    >
      <ModalHeader title={title} labelId="move-copy-disk-title" />
      <ModalBody id="move-copy-disk-body">
        <Form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <FormGroup label="Target storage domain" isRequired fieldId="move-copy-target">
            {domains.isPending && (
              <Skeleton height="2.25rem" screenreaderText="Loading storage domains" />
            )}
            {domains.isError && (
              <>
                <HelperText>
                  <HelperTextItem variant="error">
                    Could not load storage domains:{' '}
                    {domains.error instanceof Error ? domains.error.message : 'Unknown error'}
                  </HelperTextItem>
                </HelperText>
                <Button variant="link" isInline onClick={() => void domains.refetch()}>
                  Retry
                </Button>
              </>
            )}
            {domains.isSuccess && (
              <>
                <FormSelect
                  id="move-copy-target"
                  aria-label="Target storage domain"
                  value={storageDomainId}
                  onChange={(_event, value) => setStorageDomainId(value)}
                >
                  <FormSelectOption
                    value=""
                    label={
                      targets.length === 0
                        ? 'No eligible storage domain'
                        : 'Select a storage domain'
                    }
                    isPlaceholder
                    isDisabled
                  />
                  {targets.map((sd) => (
                    <FormSelectOption key={sd.id} value={sd.id} label={sd.name} />
                  ))}
                </FormSelect>
                {targets.length === 0 && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="warning">
                        No other data storage domain is available to{' '}
                        {mode === 'move' ? 'move' : 'copy'} this disk to.
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </>
            )}
          </FormGroup>

          {mode === 'copy' && (
            <FormGroup label="New alias" fieldId="copy-disk-alias">
              <TextInput
                id="copy-disk-alias"
                aria-label="New disk alias"
                value={alias}
                onChange={(_event, value) => setAlias(value)}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>Leave unchanged to keep the source alias.</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" type="submit" form={formId} isDisabled={!storageDomainId}>
          {confirmLabel}
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
