import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
  Skeleton,
} from '@patternfly/react-core'
import { PuzzlePieceIcon } from '@patternfly/react-icons'
import { useNavigate } from '@tanstack/react-router'
import { ListPageHeader } from '../components/ListPageHeader'
import { getRuntimeConfig } from '../config/runtime'
import { useT } from '../i18n/useT'
import { extensionPageRoute } from '../routes/router'
import { ExtensionBoundary } from './ExtensionBoundary'
import { useExtensionSnapshot } from './registry'
import { useExtensionNavPages } from './useExtensionNavPages'

// /extensions/$pluginName/$pageId: a page a plugin registered with
// registerNavPage. While the plugin is still loading the page shows a
// skeleton (a deep link can arrive before activation finishes); once it is
// known not to provide the page (removed from config.js, failed, hidden for
// this session) it shows a not-found state with a way back.
export function ExtensionPage() {
  const t = useT()
  const navigate = useNavigate()
  const { pluginName, pageId } = extensionPageRoute.useParams()
  const snapshot = useExtensionSnapshot()
  const pages = useExtensionNavPages()
  const page = pages.find((entry) => entry.plugin === pluginName && entry.pageId === pageId)
  const status = snapshot.plugins.find((plugin) => plugin.name === pluginName)?.status
  // allow-listed but not started yet: the loader starts in an effect, after
  // this first render
  const { plugins } = getRuntimeConfig()
  const pending =
    status === 'loading' ||
    (status === undefined &&
      plugins.enabled &&
      plugins.list.some((entry) => entry.name === pluginName))

  if (page !== undefined) {
    const Contributed = page.registered.contribution.component
    return (
      <PageSection>
        <ListPageHeader icon={<PuzzlePieceIcon />} title={page.title} />
        <ExtensionBoundary plugin={pluginName}>
          <Contributed />
        </ExtensionBoundary>
      </PageSection>
    )
  }

  if (pending) {
    return (
      <PageSection>
        <Skeleton
          width="30%"
          height="2rem"
          style={{ marginBottom: '1rem' }}
          screenreaderText={t('extensions.page.loading')}
        />
        <Skeleton height="12rem" />
      </PageSection>
    )
  }

  return (
    <PageSection>
      <EmptyState titleText={t('extensions.page.notFound.title')} status="warning">
        <EmptyStateBody>{t('extensions.page.notFound.body')}</EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" onClick={() => void navigate({ to: '/' })}>
              {t('extensions.page.notFound.back')}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    </PageSection>
  )
}
