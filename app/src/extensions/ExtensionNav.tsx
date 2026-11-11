import { useState } from 'react'
import { NavExpandable, NavItem, Tooltip } from '@patternfly/react-core'
import { PuzzlePieceIcon } from '@patternfly/react-icons'
import { Link } from '@tanstack/react-router'
import { useT } from '../i18n/useT'
import { useExtensionNavPages } from './useExtensionNavPages'

// Plugin pages live in one dedicated "Extensions" sidebar group (the answer
// to ADR-0001 open question 2): plugins cannot rearrange or crowd the
// built-in navigation, and an admin can tell at a glance what came from a
// plugin. The group is absent when no plugin registered a page.

function pagePath(plugin: string, pageId: string): string {
  return `/extensions/${plugin}/${pageId}`
}

export function ExtensionNavGroup({ pathname }: { pathname: string }) {
  const t = useT()
  const pages = useExtensionNavPages()
  const isActive = pathname.startsWith('/extensions/')
  const [expanded, setExpanded] = useState<boolean | undefined>(undefined)
  if (pages.length === 0) return null
  return (
    <NavExpandable
      title={
        <span className="app-nav-group-title">
          <PuzzlePieceIcon className="app-nav-group-icon" />
          {t('nav.group.extensions')}
        </span>
      }
      groupId="nav.group.extensions"
      isActive={isActive}
      isExpanded={expanded ?? isActive}
      onExpand={(_event, isOpen) => setExpanded(isOpen)}
    >
      {pages.map((page) => (
        <NavItem
          key={page.key}
          itemId={page.key}
          isActive={pathname === pagePath(page.plugin, page.pageId)}
        >
          <Link
            to="/extensions/$pluginName/$pageId"
            params={{ pluginName: page.plugin, pageId: page.pageId }}
          >
            {page.title}
          </Link>
        </NavItem>
      ))}
    </NavExpandable>
  )
}

// Collapsed-rail entry: expands the sidebar, like the built-in group icons.
export function ExtensionMiniRailItem({
  pathname,
  onOpen,
}: {
  pathname: string
  onOpen: () => void
}) {
  const t = useT()
  const pages = useExtensionNavPages()
  if (pages.length === 0) return null
  const label = t('nav.group.extensions')
  return (
    <Tooltip content={label} position="right">
      <button
        type="button"
        aria-label={label}
        role="listitem"
        className={`app-mini-item${pathname.startsWith('/extensions/') ? ' app-mini-active' : ''}`}
        onClick={onOpen}
      >
        <PuzzlePieceIcon />
      </button>
    </Tooltip>
  )
}
