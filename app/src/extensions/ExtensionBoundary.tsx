import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Alert, AlertActionLink } from '@patternfly/react-core'
import { useT } from '../i18n/useT'
import { getPluginState } from './registry'

// Error boundary around every plugin-rendered element (ADR-0001 §5). A plugin
// component that throws shows an inline error naming the plugin in place of
// that one tab, page or card; the rest of the page keeps working.
interface Props {
  plugin: string
  children: ReactNode
}

interface State {
  error: Error | null
}

function ExtensionErrorState({
  plugin,
  error,
  onRetry,
}: {
  plugin: string
  error: Error
  onRetry: () => void
}) {
  const t = useT()
  const name = getPluginState(plugin)?.displayName ?? plugin
  return (
    <Alert
      variant="danger"
      isInline
      title={t('extensions.error.title', { plugin: name })}
      actionLinks={<AlertActionLink onClick={onRetry}>{t('common.action.retry')}</AlertActionLink>}
    >
      {error.message || t('common.error.unknown')}
    </Alert>
  )
}

export class ExtensionBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[plugins] "${this.props.plugin}" failed to render`, error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <ExtensionErrorState
          plugin={this.props.plugin}
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}
