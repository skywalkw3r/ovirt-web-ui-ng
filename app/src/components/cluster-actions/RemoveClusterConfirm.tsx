import { useState } from 'react'
import { FormGroup, Stack, StackItem, TextInput } from '@patternfly/react-core'
import type { Cluster } from '../../api/schemas/cluster'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'

// The cluster Remove confirm (typed-name gate — docs/COMPONENTS.md: typed-name
// confirm for delete), extracted from ClusterActionsBar so the tree's
// right-click menu (ClusterContextMenu) shares the identical copy. Wording
// mirrors ClustersPage / ClusterDetailPage via the shared
// clusters.remove.confirm.* ids. The caller owns the delete mutation:
// onConfirm can only fire once the typed name matches, so callers mutate
// unconditionally inside it (and close this modal themselves).
export function RemoveClusterConfirm({
  cluster,
  onConfirm,
  onCancel,
}: {
  cluster: Cluster
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useT()
  // the typed-name gate; confirm stays disabled until it matches exactly
  const [nameInput, setNameInput] = useState('')

  return (
    <ConfirmModal
      isOpen
      title={t('clusters.remove.confirm.title', { name: cluster.name })}
      body={
        <Stack hasGutter>
          <StackItem>{t('clusters.remove.confirm.body')}</StackItem>
          <StackItem>
            <FormGroup
              label={t('clusters.remove.confirm.typeLabel', { name: cluster.name })}
              isRequired
              fieldId="cluster-actions-remove-confirm-name"
            >
              <TextInput
                id="cluster-actions-remove-confirm-name"
                aria-label={t('clusters.remove.confirm.inputAria')}
                value={nameInput}
                onChange={(_event, value) => setNameInput(value)}
              />
            </FormGroup>
          </StackItem>
        </Stack>
      }
      confirmLabel={t('common.action.remove')}
      isConfirmDisabled={nameInput !== cluster.name}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
