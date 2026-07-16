import { Checkbox, Tooltip } from '@patternfly/react-core'
import { AngleDownIcon, AngleRightIcon } from '@patternfly/react-icons'
import { useIntl } from 'react-intl'
import {
  isAdministrativePermit,
  permitLabel,
  type PermitCategory,
  type PermitGroup,
} from '../../api/resources/roles'
import { useT } from '../../i18n/useT'
import { CATEGORY_LABEL_ID } from './roleDraft'
import './PermitTree.css'

// The permission checkbox tree: webadmin's RoleTreeView. Categories are
// expandable groups with a tri-state header checkbox (PF Checkbox renders
// isChecked={null} as indeterminate) that selects/clears every enabled permit
// in the group; individual permits are checkboxes inside. Admin-only permits
// are disabled (with an explaining tooltip) while the role's account type is
// User — the engine rejects an admin permit on a user role.

// The subset of a category's permits that can currently be toggled: everything
// unless the role is a user role, which excludes the administrative permits.
function enabledPermitIds(group: PermitGroup, adminDisabled: boolean): string[] {
  return group.permits
    .filter((permit) => !adminDisabled || !isAdministrativePermit(permit))
    .map((permit) => permit.id)
}

// Tri-state for a group header: true = all enabled checked, false = none,
// null = some (indeterminate).
function groupState(
  group: PermitGroup,
  checked: Set<string>,
  adminDisabled: boolean,
): boolean | null {
  const enabled = enabledPermitIds(group, adminDisabled)
  if (enabled.length === 0) return false
  const checkedCount = enabled.filter((id) => checked.has(id)).length
  if (checkedCount === 0) return false
  if (checkedCount === enabled.length) return true
  return null
}

export function PermitTree({
  groups,
  checked,
  adminDisabled,
  expanded,
  onToggleGroupExpanded,
  onToggleCategory,
  onTogglePermit,
}: {
  groups: PermitGroup[]
  checked: Set<string>
  adminDisabled: boolean
  expanded: Record<string, boolean>
  onToggleGroupExpanded: (category: PermitCategory, isOpen: boolean) => void
  onToggleCategory: (category: PermitCategory, nextChecked: boolean) => void
  onTogglePermit: (permitId: string, nextChecked: boolean) => void
}) {
  const intl = useIntl()
  const t = useT()

  return (
    <div className="role-permit-tree">
      {groups.map((group) => {
        const categoryLabel = intl.formatMessage({ id: CATEGORY_LABEL_ID[group.category] })
        const isOpen = expanded[group.category] ?? false
        const state = groupState(group, checked, adminDisabled)
        const checkedCount = group.permits.filter((permit) => checked.has(permit.id)).length
        const Caret = isOpen ? AngleDownIcon : AngleRightIcon
        const groupId = `role-permit-group-${group.category.replace(/\W+/g, '-')}`

        return (
          <div key={group.category} className="role-permit-group">
            <div className="role-permit-group-header">
              <button
                type="button"
                className="role-permit-group-toggle"
                aria-expanded={isOpen}
                aria-label={t(
                  isOpen ? 'roles.permissions.collapseGroup' : 'roles.permissions.expandGroup',
                  { category: categoryLabel },
                )}
                onClick={() => onToggleGroupExpanded(group.category, !isOpen)}
              >
                <Caret />
              </button>
              <Checkbox
                id={`${groupId}-all`}
                isChecked={state}
                aria-label={t('roles.category.selectAll.ariaLabel', { category: categoryLabel })}
                label={t('roles.category.countLabel', {
                  categoryLabel,
                  checkedCount,
                  length: group.permits.length,
                })}
                onChange={(_event, next) => onToggleCategory(group.category, next)}
              />
            </div>

            {isOpen && (
              <div className="role-permit-group-body">
                {group.permits.map((permit) => {
                  const disabled = adminDisabled && isAdministrativePermit(permit)
                  const permitCheckbox = (
                    <Checkbox
                      id={`role-permit-${permit.id}`}
                      isChecked={checked.has(permit.id)}
                      isDisabled={disabled}
                      label={permitLabel(permit.name)}
                      onChange={(_event, next) => onTogglePermit(permit.id, next)}
                    />
                  )
                  return (
                    <div key={permit.id} className="role-permit-item">
                      {disabled ? (
                        <Tooltip content={t('roles.permit.adminOnly.tooltip')}>
                          {permitCheckbox}
                        </Tooltip>
                      ) : (
                        permitCheckbox
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
