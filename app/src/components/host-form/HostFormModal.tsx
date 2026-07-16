import { useCallback, useState } from 'react'
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'
import type { Host } from '../../api/schemas/host'
import { useUpdateHost } from '../../hooks/useHostMutations'
import { useT } from '../../i18n/useT'
import { ModalVerticalTabs } from '../forms/ModalVerticalTabs'
import { ConsoleGpuSection } from './ConsoleGpuSection'
import { draftToPayload, hostToDraft, type EditHostDraft } from './editHostDraft'
import { GeneralSection } from './GeneralSection'
import { KernelSection } from './KernelSection'
import { PowerManagementSection } from './PowerManagementSection'
import { SpmSection } from './SpmSection'

// The Edit host modal. Edit-only — hosts are added through an install flow (a
// later feature), so there is no create mode. Owns the shared draft plus the
// seed it was created from; Save diffs the two through draftToPayload and PUTs
// only the sections the user actually changed, then closes on success.
// Mirrors EditVmModal's left-rail section layout (ModalVerticalTabs): the
// sections are presentational and all state lives here.
export function HostFormModal({
  host,
  isOpen,
  onClose,
}: {
  host: Host
  isOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  // The seed is kept in state alongside the draft so the save-time diff runs
  // against the values the modal opened with — not a host object that may
  // have refetched underneath the open modal.
  const [seed, setSeed] = useState<EditHostDraft>(() => hostToDraft(host))
  const [draft, setDraft] = useState<EditHostDraft>(seed)
  // Re-seed when the modal is pointed at a different host. Tracking the id we
  // last seeded from and resetting during render keeps the draft in sync
  // without an extra commit/flicker.
  const [seededId, setSeededId] = useState(host.id)
  if (seededId !== host.id) {
    const next = hostToDraft(host)
    setSeededId(host.id)
    setSeed(next)
    setDraft(next)
  }

  // Stable updater so sections don't re-render on every keystroke elsewhere.
  const set = useCallback(<K extends keyof EditHostDraft>(key: K, value: EditHostDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }, [])

  const update = useUpdateHost()
  const pending = update.isPending

  const save = () => {
    update.mutate({ id: host.id, payload: draftToPayload(draft, seed) }, { onSuccess: onClose })
  }

  const nameEmpty = draft.name.trim() === ''

  return (
    <Modal
      variant="large"
      isOpen={isOpen}
      onClose={onClose}
      aria-labelledby="host-form-title"
      aria-describedby="host-form-body"
    >
      <ModalHeader
        title={t('hostForm.edit.title', { name: host.name })}
        labelId="host-form-title"
      />
      <ModalBody id="host-form-body">
        <ModalVerticalTabs
          idPrefix="edit-host"
          ariaLabel={t('hostForm.edit.sectionsAria')}
          sections={[
            {
              key: 'general',
              title: t('hostForm.section.general'),
              content: <GeneralSection host={host} draft={draft} set={set} />,
            },
            {
              key: 'power-management',
              title: t('hostForm.section.powerManagement'),
              content: (
                <PowerManagementSection
                  draft={draft}
                  set={set}
                  hostId={host.id}
                  pmProxies={draft.pmProxies}
                  setProxies={(proxies) => set('pmProxies', proxies)}
                />
              ),
            },
            {
              key: 'spm',
              title: t('hostForm.section.spm'),
              content: <SpmSection draft={draft} set={set} />,
            },
            {
              key: 'console-gpu',
              title: t('hostForm.section.consoleGpu'),
              content: <ConsoleGpuSection draft={draft} set={set} />,
            },
            {
              key: 'kernel',
              title: t('hostForm.section.kernel'),
              content: <KernelSection draft={draft} set={set} />,
            },
          ]}
        />
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={save}
          isLoading={pending}
          isDisabled={pending || nameEmpty}
        >
          {t('common.action.save')}
        </Button>
        <Button variant="secondary" onClick={onClose} isDisabled={pending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
