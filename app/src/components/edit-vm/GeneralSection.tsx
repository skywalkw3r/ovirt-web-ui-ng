import {
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { FieldHelp } from '../forms/FieldHelp'
import { OPTIMIZED_FOR_OPTIONS, vmNameError, type EditVmDraft } from './editVmDraft'

// Presentational "General" section of the Edit Virtual Machine modal. It owns
// no state and fetches nothing — the modal passes the shared draft plus the
// already-loaded cluster and operating-system option lists, and every change
// flows back up through set().
export function GeneralSection({
  draft,
  set,
  clusters,
  operatingSystems,
}: {
  draft: EditVmDraft
  set: <K extends keyof EditVmDraft>(key: K, value: EditVmDraft[K]) => void
  clusters: { id: string; name?: string }[]
  operatingSystems: { name: string; description?: string }[]
}) {
  // Inline field validation (webadmin parity) — the modal's Save gate uses the
  // same vmNameError, so an invalid name both shows why and blocks the save.
  const nameError = vmNameError(draft.name)

  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <FormGroup label="Name" isRequired fieldId="edit-vm-name">
        <TextInput
          id="edit-vm-name"
          isRequired
          aria-label="Virtual machine name"
          validated={nameError !== undefined ? 'error' : 'default'}
          value={draft.name}
          onChange={(_event, value) => set('name', value)}
        />
        {nameError !== undefined && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{nameError}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup label="Description" fieldId="edit-vm-description">
        <TextInput
          id="edit-vm-description"
          aria-label="Virtual machine description"
          value={draft.description}
          onChange={(_event, value) => set('description', value)}
        />
      </FormGroup>

      <FormGroup label="Comment" fieldId="edit-vm-comment">
        <TextInput
          id="edit-vm-comment"
          aria-label="Virtual machine comment"
          value={draft.comment}
          onChange={(_event, value) => set('comment', value)}
        />
      </FormGroup>

      <FormGroup label="Cluster" fieldId="edit-vm-cluster">
        <FormSelect
          id="edit-vm-cluster"
          aria-label="Cluster"
          value={draft.clusterId}
          onChange={(_event, value) => set('clusterId', value)}
        >
          {clusters.map((cluster) => (
            <FormSelectOption
              key={cluster.id}
              value={cluster.id}
              label={cluster.name ?? cluster.id}
            />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label="Operating System"
        fieldId="edit-vm-os"
        labelHelp={
          <FieldHelp
            field="Operating System"
            content="The guest OS hint. It does not install anything — it tells the engine which virtual hardware, drivers, and defaults suit the guest (VirtIO, clock, watchdog, and so on)."
          />
        }
      >
        <FormSelect
          id="edit-vm-os"
          aria-label="Operating system"
          value={draft.osType}
          onChange={(_event, value) => set('osType', value)}
        >
          {operatingSystems.map((os) => (
            <FormSelectOption key={os.name} value={os.name} label={os.description ?? os.name} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label="Optimized for"
        fieldId="edit-vm-optimized-for"
        labelHelp={
          <FieldHelp
            field="Optimized for"
            content="Tunes memory, devices, and defaults for the workload. Desktop favors interactivity; Server favors throughput; High Performance strips overhead and pins resources for latency-sensitive VMs."
          />
        }
      >
        <FormSelect
          id="edit-vm-optimized-for"
          aria-label="Optimized for"
          value={draft.optimizedFor}
          onChange={(_event, value) => set('optimizedFor', value)}
        >
          {OPTIMIZED_FOR_OPTIONS.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={option.label} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup
        label="Stateless"
        fieldId="edit-vm-stateless"
        labelHelp={
          <FieldHelp
            field="Stateless"
            content="Run the VM from a temporary snapshot that is discarded on every shutdown, so it always boots from the template’s clean state. Data written during a session does not persist."
          />
        }
      >
        <Switch
          id="edit-vm-stateless"
          aria-label="Stateless"
          isChecked={draft.stateless}
          onChange={(_event, checked) => set('stateless', checked)}
        />
      </FormGroup>

      <FormGroup
        label="Delete Protection"
        fieldId="edit-vm-delete-protected"
        labelHelp={
          <FieldHelp
            field="Delete Protection"
            content="Blocks this VM from being deleted until the protection is turned off — a guard against accidentally removing an important VM."
          />
        }
      >
        <Switch
          id="edit-vm-delete-protected"
          aria-label="Delete protection"
          isChecked={draft.deleteProtected}
          onChange={(_event, checked) => set('deleteProtected', checked)}
        />
      </FormGroup>
    </Form>
  )
}
