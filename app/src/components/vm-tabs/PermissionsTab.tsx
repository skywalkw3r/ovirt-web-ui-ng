import { useVm } from '../../hooks/useVm'
import { useVmInheritedPermissionIds, useVmPermissions } from '../../hooks/useVmDetail'
import { useT } from '../../i18n/useT'
import { PermissionsPanel } from '../permissions/PermissionsPanel'

// VM detail is user-visible (unlike the admin-gated host detail), so this tab
// does not gate on isAdmin — the engine's Filter header enforces which
// permissions a given account may read, and PermissionsPanel itself hides the
// add/remove affordances from non-admin sessions.
export function PermissionsTab({ vmId }: { vmId: string }) {
  const t = useT()
  const permissions = useVmPermissions(vmId)
  // shares the detail page's ['vm', vmId] cache; its cluster id seeds the
  // ancestor read that classifies each grant as direct vs. inherited
  const vm = useVm(vmId)
  const inheritedIds = useVmInheritedPermissionIds(vm.data?.cluster?.id)

  return (
    <PermissionsPanel
      entityKind="vm"
      entityId={vmId}
      entityNoun={t('permissions.noun.vm')}
      permissions={permissions}
      inheritedIds={inheritedIds}
    />
  )
}
