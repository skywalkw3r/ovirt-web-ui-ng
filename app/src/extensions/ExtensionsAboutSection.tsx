import { Fragment } from 'react'
import { Title } from '@patternfly/react-core'
import { useT } from '../i18n/useT'
import { useExtensionSnapshot, type PluginState } from './registry'

// About dialog transparency (ADR-0001 §4): every allow-listed plugin with its
// version, origin and state, failures included, so an admin can see what
// code this console is running and why a plugin is missing. Absent when no
// plugin is configured.
export function ExtensionsAboutSection() {
  const t = useT()
  const { plugins } = useExtensionSnapshot()
  if (plugins.length === 0) return null

  const statusText = (plugin: PluginState): string => {
    if (plugin.status === 'active') return t('about.extensions.status.active')
    if (plugin.status === 'loading') return t('about.extensions.status.loading')
    if (plugin.status === 'skipped') return t('about.extensions.status.skipped')
    return t('about.extensions.status.failed', { reason: plugin.error ?? '' })
  }

  return (
    <div style={{ marginBlockStart: 'var(--pf-t--global--spacer--lg)' }}>
      <Title
        headingLevel="h3"
        size="md"
        style={{ marginBlockEnd: 'var(--pf-t--global--spacer--sm)' }}
      >
        {t('about.extensions')}
      </Title>
      <dl className="about-facts">
        {plugins.map((plugin) => (
          <Fragment key={plugin.name}>
            <dt>
              {plugin.displayName}
              {plugin.version !== undefined && ` ${plugin.version}`}
            </dt>
            <dd>
              {statusText(plugin)}
              <br />
              <code>{plugin.origin}</code>
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}
