import { Tooltip } from '@patternfly/react-core'
import { InfrastructureIcon, VirtualMachineIcon } from '@patternfly/react-icons'
import { Link } from '@tanstack/react-router'
import { useCapabilities } from '../auth/capabilities'
import { useT } from '../i18n/useT'

// Icon-tab strip pinned above each inventory tree, switching between the two
// inventory surfaces (VMs & Templates, Hosts & Clusters). Rendered as a real
// <nav> of links, not PF Tabs: each item navigates to a different route, so
// there is no on-page tabpanel for a tablist to control — links keep the
// markup accessible (and open-in-new-tab working) while the PF tabs classes
// carry the underline look. Admin-only; a user-tier session has one surface,
// so it renders nothing. `fill` spans the strip across the tree panel header.
export function InventoryViewSwitcher({
  active,
  fill = false,
}: {
  active: 'inventory' | 'infra'
  fill?: boolean
}) {
  const { isAdmin } = useCapabilities()
  const t = useT()
  if (!isAdmin) return null
  const views = [
    {
      key: 'inventory' as const,
      to: '/vms-templates' as const,
      label: t('nav.vmsTemplates'),
      icon: <VirtualMachineIcon />,
    },
    {
      key: 'infra' as const,
      to: '/hosts-clusters' as const,
      label: t('nav.hostsClusters'),
      icon: <InfrastructureIcon />,
    },
  ]
  return (
    <nav className={`pf-v6-c-tabs${fill ? ' pf-m-fill' : ''}`} aria-label={t('inventory.title')}>
      <ul className="pf-v6-c-tabs__list">
        {views.map((view) => (
          <li
            key={view.key}
            className={`pf-v6-c-tabs__item${view.key === active ? ' pf-m-current' : ''}`}
          >
            <Tooltip content={view.label}>
              <Link
                to={view.to}
                className="pf-v6-c-tabs__link"
                aria-label={view.label}
                aria-current={view.key === active ? 'page' : undefined}
              >
                <span className="pf-v6-c-tabs__item-icon" aria-hidden>
                  {view.icon}
                </span>
              </Link>
            </Tooltip>
          </li>
        ))}
      </ul>
    </nav>
  )
}
