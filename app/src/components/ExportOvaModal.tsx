import { useEffect, useState } from 'react'
import {
  Button,
  DropdownItem,
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
import { ExportIcon } from '@patternfly/react-icons'
import type { Vm } from '../api/schemas/vm'
import { useExportOva } from '../hooks/useExportOva'
import { useHosts } from '../hooks/useHosts'
import type { MessageId } from '../i18n/messages/en'
import { useT } from '../i18n/useT'
import { statusText } from '../lib/format'

// Marker class the click shield below uses to recognize its own modal.
const MODAL_CLASS = 'export-ova-modal'

// Same shield as CloneVmModal: the kebab Dropdown closes on any window-level
// click outside its menu, and closing unmounts its items — including this one
// and the modal it renders. The modal is portaled to document.body, so stop
// its clicks at the document level; backdrop clicks stay unshielded and
// dismiss menu and modal together.
function useMenuClickShield() {
  useEffect(() => {
    const shield = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(`.${MODAL_CLASS}`)) {
        event.stopPropagation()
      }
    }
    document.addEventListener('click', shield)
    return () => document.removeEventListener('click', shield)
  }, [])
}

// Disk-locked states block export (the engine needs a consistent disk image;
// a running VM auto-snapshots, so up/paused are fine). Kept narrow — webadmin
// permits export in most states.
const EXPORT_DENIED_STATUSES = new Set(['image_locked', 'not_responding', 'unknown', 'unassigned'])

// An absolute POSIX path on the host — the OVA lands here. Mirrors the
// export-path check but for a plain directory (no host:/ prefix). Returns a
// message id resolved via t() at the render site (the newHostDraft idiom).
function directoryError(value: string): MessageId | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return 'exportOva.directory.required'
  if (!trimmed.startsWith('/')) return 'exportOva.directory.absolute'
  return undefined
}

// Kebab item owning the Export as OVA modal (CloneVmModalItem pattern). POST
// /vms/{id}/exporttopathonhost kicks an async engine job that packages the
// VM's disks into an OVA on the chosen host. Disk-locked statuses keep the
// item hoverable but disabled with the reason in a tooltip.
export function ExportOvaModalItem({ vm }: { vm: Vm }) {
  const t = useT()
  const [isOpen, setIsOpen] = useState(false)

  if (vm.status !== undefined && EXPORT_DENIED_STATUSES.has(vm.status)) {
    return (
      <DropdownItem
        icon={<ExportIcon />}
        isAriaDisabled
        tooltipProps={{
          content: t('exportOva.deniedReason', { status: statusText(vm.status) }),
        }}
      >
        {t('exportOva.item')}
      </DropdownItem>
    )
  }

  return (
    <>
      <DropdownItem icon={<ExportIcon />} onClick={() => setIsOpen(true)}>
        {t('exportOva.item')}
      </DropdownItem>
      {isOpen && <ExportOvaModal vm={vm} onClose={() => setIsOpen(false)} />}
    </>
  )
}

// The Export as OVA dialog (webadmin's ExportOvaModel): a host that can reach
// the target path, an absolute directory, and a filename defaulting to
// <vm>.ova. The engine runs the export as a job, so useExportOva toasts
// "Exporting" and the Tasks drawer tracks it. Modal unmounts on close so state
// resets for free.
function ExportOvaModal({ vm, onClose }: { vm: Vm; onClose: () => void }) {
  const t = useT()
  const [hostId, setHostId] = useState('')
  const [directory, setDirectory] = useState('')
  const [filename, setFilename] = useState(`${vm.name}.ova`)
  const exportOva = useExportOva()
  useMenuClickShield()

  const hosts = useHosts()
  // only an up host can run the export job
  const eligibleHosts = (hosts.data ?? []).filter((host) => host.status === 'up')

  const pending = exportOva.isPending
  const dirError = directoryError(directory)
  const canSubmit = hostId !== '' && dirError === undefined && !pending

  const save = () => {
    exportOva.mutate(
      {
        vm,
        spec: {
          hostId,
          directory: directory.trim(),
          filename: filename.trim() === '' ? undefined : filename.trim(),
        },
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal
      variant="small"
      className={MODAL_CLASS}
      isOpen
      onClose={onClose}
      aria-labelledby="export-ova-title"
      aria-describedby="export-ova-body"
    >
      <ModalHeader
        title={t('exportOva.title', { name: vm.name ?? '' })}
        labelId="export-ova-title"
      />
      <ModalBody id="export-ova-body">
        <Form
          id="export-ova-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmit) save()
          }}
        >
          <FormGroup label={t('exportOva.host.label')} isRequired fieldId="export-ova-host">
            {hosts.isPending ? (
              <Skeleton height="2.25rem" screenreaderText={t('exportOva.host.loading')} />
            ) : hosts.isError ? (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('exportOva.host.error', { message: hosts.error.message })}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            ) : (
              <FormSelect
                id="export-ova-host"
                aria-label={t('exportOva.host.label')}
                value={hostId}
                onChange={(_event, value) => setHostId(value)}
              >
                <FormSelectOption value="" label={t('exportOva.host.placeholder')} isDisabled />
                {eligibleHosts.map((host) => (
                  <FormSelectOption key={host.id} value={host.id} label={host.name ?? host.id} />
                ))}
              </FormSelect>
            )}
          </FormGroup>

          <FormGroup
            label={t('exportOva.directory.label')}
            isRequired
            fieldId="export-ova-directory"
          >
            <TextInput
              id="export-ova-directory"
              isRequired
              aria-label={t('exportOva.directory.label')}
              placeholder={t('exportOva.directory.placeholder')}
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
                    : t('exportOva.directory.help')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label={t('exportOva.filename')} fieldId="export-ova-filename">
            <TextInput
              id="export-ova-filename"
              aria-label={t('exportOva.filename')}
              value={filename}
              onChange={(_event, value) => setFilename(value)}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="export-ova-form"
          isLoading={pending}
          isDisabled={!canSubmit}
        >
          {t('exportOva.action')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
