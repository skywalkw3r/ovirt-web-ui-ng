import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  attachVmDisk,
  createVmDirectLunDisk,
  createVmDisk,
  detachVmDisk,
  resizeVmDisk,
  setVmDiskAttachmentActive,
  type AttachDiskSpec,
  type NewDiskSpec,
  type NewVmDirectLunDiskSpec,
} from '../api/resources/disks'
import type { DiskAttachment } from '../api/schemas/disk'
import { useNotify } from '../notifications/context'

// Attachments always carry an id; the human-readable name lives on the
// embedded disk entity and may be absent on stub responses.
function diskName(attachment: DiskAttachment): string {
  return attachment.disk?.name ?? attachment.id
}

// The VM Add-Disk dialog's image-disk spec. createVmDisk's NewDiskSpec does not
// yet carry the disk profile — resources/disks owns that one-line add (put the
// profile id on the disk body: `disk_profile: { id }`).
// Widen the create hook's input here so the dialog can thread the picked
// profile through now; createVmDisk simply drops the extra field until the
// resource forwards it, at which point the id lands on the wire with no further
// change here.
export type NewVmImageDiskSpec = NewDiskSpec & { diskProfileId?: string }

// Disk ops finish asynchronously on the engine (fresh disks sit in 'locked'
// until the image lands); the disks-tab poll is what lets the UI watch them
// settle. Each hook invalidates both the VM's attachment list and the flat
// /disks collection because create/resize/detach also change what
// Storage → Disks shows. Toast wording mirrors useVmActions:
// "started"/"requested" because the engine only acknowledges the op here.
// ApiError.message carries the engine fault detail verbatim.
export function useCreateVmDisk(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (spec: NewVmImageDiskSpec) => createVmDisk(vmId, spec),
    onSuccess: (_data, spec) => {
      notify({ title: `Disk '${spec.name}' creation started`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'disks'] })
      void queryClient.invalidateQueries({ queryKey: ['disks'] })
    },
  })
}

// Create + attach a direct-LUN disk in one POST (the Add-disk dialog's Direct
// LUN branch). The engine binds the LUN synchronously — no locked settle — but
// the invalidation posture matches useCreateVmDisk so both lists refresh.
export function useCreateVmDirectLunDisk(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (spec: NewVmDirectLunDiskSpec) => createVmDirectLunDisk(vmId, spec),
    onSuccess: (_data, spec) => {
      notify({ title: `Disk '${spec.alias}' attached`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'disks'] })
      void queryClient.invalidateQueries({ queryKey: ['disks'] })
    },
  })
}

export function useResizeVmDisk(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      attachment,
      newSizeBytes,
    }: {
      attachment: DiskAttachment
      newSizeBytes: number
    }) => resizeVmDisk(vmId, attachment.id, newSizeBytes),
    onSuccess: (_data, { attachment }) => {
      notify({ title: `Resize requested for disk '${diskName(attachment)}'`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'disks'] })
      void queryClient.invalidateQueries({ queryKey: ['disks'] })
    },
  })
}

export function useDetachVmDisk(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (attachment: DiskAttachment) => detachVmDisk(vmId, attachment.id),
    onSuccess: (_data, attachment) => {
      // detach_only semantics: the disk survives in the flat /disks collection
      notify({
        title: `Disk '${diskName(attachment)}' detached — it remains in Storage → Disks`,
        variant: 'success',
      })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'disks'] })
      void queryClient.invalidateQueries({ queryKey: ['disks'] })
    },
  })
}

// Attach an existing (floating) disk. Same async-settle + dual-invalidation
// posture as useCreateVmDisk; the attach spec carries the chosen disk's id.
export function useAttachVmDisk(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (spec: AttachDiskSpec & { diskName: string }) =>
      attachVmDisk(vmId, {
        diskId: spec.diskId,
        active: spec.active,
        bootable: spec.bootable,
        interface: spec.interface,
      }),
    onSuccess: (_data, spec) => {
      notify({ title: `Disk '${spec.diskName}' attached`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'disks'] })
      void queryClient.invalidateQueries({ queryKey: ['disks'] })
    },
  })
}

// Activate / deactivate an attachment (hot plug/unplug on a running VM). Toast
// names the resulting plug state so the wording matches the clicked item.
export function useSetVmDiskActive(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ attachment, active }: { attachment: DiskAttachment; active: boolean }) =>
      setVmDiskAttachmentActive(vmId, attachment.id, active),
    onSuccess: (_data, { attachment, active }) => {
      notify({
        title: `Disk '${diskName(attachment)}' ${active ? 'activated' : 'deactivated'}`,
        variant: 'success',
      })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'disks'] })
      void queryClient.invalidateQueries({ queryKey: ['disks'] })
    },
  })
}
