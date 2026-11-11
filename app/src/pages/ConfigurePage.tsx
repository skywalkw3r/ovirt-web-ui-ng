import {
  Card,
  CardBody,
  CardTitle,
  Content,
  Gallery,
  GalleryItem,
  PageSection,
  Skeleton,
} from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import { useCapabilities } from '../auth/capabilities'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import type { MessageId } from '../i18n/messages/en'
import { useT } from '../i18n/useT'

// webadmin's Administration › Configure dialog (ConfigurePopupView) gathers
// five engine-wide surfaces in one place. Each already has its own routed page
// here, so this page is only an index: it links to them and never embeds or
// re-implements them. Order follows the webadmin dialog's tabs.
interface ConfigureSurface {
  // Reuses the sidebar nav.* id so the card title matches the menu entry.
  titleId: MessageId
  descriptionId: MessageId
  to: '/roles' | '/system-permissions' | '/scheduling-policies' | '/instance-types' | '/mac-pools'
  // Mirrors the AppShell sidebar gating for the same route.
  adminOnly: boolean
}

const CONFIGURE_SURFACES: readonly ConfigureSurface[] = [
  {
    titleId: 'nav.roles',
    descriptionId: 'configure.card.roles',
    to: '/roles',
    adminOnly: true,
  },
  {
    titleId: 'nav.systemPermissions',
    descriptionId: 'configure.card.systemPermissions',
    to: '/system-permissions',
    adminOnly: true,
  },
  {
    titleId: 'nav.schedulingPolicies',
    descriptionId: 'configure.card.schedulingPolicies',
    to: '/scheduling-policies',
    adminOnly: true,
  },
  {
    titleId: 'nav.instanceTypes',
    descriptionId: 'configure.card.instanceTypes',
    to: '/instance-types',
    adminOnly: true,
  },
  {
    titleId: 'nav.macPools',
    descriptionId: 'configure.card.macPools',
    to: '/mac-pools',
    adminOnly: true,
  },
]

// The surfaces a tier may open: admin sees all, user tier only the ones the
// sidebar would also offer it (none today — every surface is adminOnly).
function visibleConfigureSurfaces(isAdmin: boolean): ConfigureSurface[] {
  return CONFIGURE_SURFACES.filter((surface) => isAdmin || !surface.adminOnly)
}

export function ConfigurePage() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const surfaces = visibleConfigureSurfaces(isAdmin)

  return (
    <PageSection>
      <ListPageHeader title={t('configure.title')} />

      {/* Skeletons cover the pre-capability window instead of flashing the
          lock at users who will turn out to be admins. */}
      {!loaded && (
        <>
          <Skeleton height="5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="5rem" screenreaderText={t('configure.loading')} />
        </>
      )}

      {/* The nav hides Configure from user-tier accounts; this covers deep
          links typed straight into the address bar. */}
      {loaded && surfaces.length === 0 && <NotPermitted what={t('configure.notPermitted')} />}

      {loaded && surfaces.length > 0 && (
        <>
          <Content component="p" style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
            {t('configure.intro')}
          </Content>
          <Gallery
            hasGutter
            component="ul"
            aria-label={t('configure.list.ariaLabel')}
            minWidths={{ default: '100%', md: '18rem' }}
          >
            {surfaces.map((surface) => (
              <GalleryItem key={surface.to} component="li">
                <Card isFullHeight isCompact>
                  <CardTitle component="h2">
                    <Link to={surface.to}>{t(surface.titleId)}</Link>
                  </CardTitle>
                  <CardBody>{t(surface.descriptionId)}</CardBody>
                </Card>
              </GalleryItem>
            ))}
          </Gallery>
        </>
      )}
    </PageSection>
  )
}
