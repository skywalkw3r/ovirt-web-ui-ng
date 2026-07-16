import { Fragment, useState } from 'react'
import {
  Button,
  Grid,
  GridItem,
  Modal,
  ModalBody,
  ModalHeader,
  Title,
} from '@patternfly/react-core'
import { ExternalLinkAltIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import { useQuery } from '@tanstack/react-query'
import { fetchApiInfo } from '../api/resources/system'
import { brandAssets } from '../branding/logos'
import { useProductBrand } from '../hooks/useProductBrand'
import { APP_VERSION, COMPONENT_VERSIONS } from '../lib/version'

// Engine facts share the dashboard's cache entry: same key/fn pair as
// useDashboard's apiInfo query, so opening the dialog reuses whatever the
// dashboard already fetched instead of hitting the engine again. Product info
// is effectively static, hence no refetch interval.
function useApiInfo() {
  return useQuery({ queryKey: ['apiInfo'], queryFn: fetchApiInfo })
}

// The four-states rule applies loosely here: the modal never blanks on a
// failed or pending engine query — the app-version row always renders, and the
// engine rows degrade to their own placeholder text.
function engineValue(
  apiInfo: ReturnType<typeof useApiInfo>,
  pick: (root: NonNullable<ReturnType<typeof useApiInfo>['data']>) => string | undefined,
): string {
  if (apiInfo.isPending) return 'Loading…'
  if (apiInfo.isError || !apiInfo.data) return 'Unavailable'
  return pick(apiInfo.data) ?? 'Unknown'
}

export function AboutDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  // Only fetch while the dialog is mounted-open; a closed dialog stays at zero
  // engine cost and shares the cache when it does open.
  const apiInfo = useApiInfo()

  // The header carries the console's brand-resolved product identity (same
  // resolution as the masthead and tab title — OLVM engines must not read
  // "oVirt Console" here); the "Engine product" row below reports the
  // engine's raw product_info string.
  const brandName = brandAssets(useProductBrand()).productName

  const productName = engineValue(apiInfo, (root) => root.product_info.name)
  const engineVersion = engineValue(apiInfo, (root) => root.product_info.version?.full_version)

  // Build-time-injected (vite.config.ts); empty outside a Vite build, in which
  // case the Components section simply doesn't render.
  const componentVersions = Object.entries(COMPONENT_VERSIONS)

  const hasComponents = componentVersions.length > 0

  // A compact content-height dialog instead of PF's AboutModal (which is
  // always a full-bleed hero panel — mostly whitespace for a short facts
  // list). Two columns at md+: the product/engine facts on the left, the
  // build components on the right; both stack on a narrow viewport.
  return (
    <Modal variant="medium" isOpen={isOpen} onClose={onClose} aria-labelledby="about-title">
      <ModalHeader title={brandName} labelId="about-title" />
      <ModalBody>
        <Grid hasGutter>
          <GridItem md={hasComponents ? 6 : 12}>
            {/* A plain term/value grid (.about-facts, brand-tokens.css) rather
                than PF's DescriptionList, which flowed groups into columns and
                crushed the term track. This owns its layout: max-content
                terms, one value column. */}
            <dl className="about-facts">
              <dt>Console version</dt>
              <dd>{APP_VERSION}</dd>
              <dt>Engine product</dt>
              <dd>{productName}</dd>
              <dt>Engine version</dt>
              <dd>{engineVersion}</dd>
            </dl>
          </GridItem>

          {hasComponents && (
            <GridItem md={6}>
              <Title
                headingLevel="h3"
                size="md"
                style={{ marginBlockEnd: 'var(--pf-t--global--spacer--sm)' }}
              >
                Components
              </Title>
              <dl className="about-facts">
                {componentVersions.map(([name, version]) => (
                  <Fragment key={name}>
                    <dt>{name}</dt>
                    <dd>{version}</dd>
                  </Fragment>
                ))}
              </dl>
            </GridItem>
          )}
        </Grid>

        {/* The docs link moved here from the user menu (it's reference
            material, not a daily action); reuses the menu's i18n id. */}
        <div style={{ marginBlockStart: 'var(--pf-t--global--spacer--lg)' }}>
          <Button
            variant="link"
            isInline
            component="a"
            href="https://www.ovirt.org/documentation/"
            target="_blank"
            rel="noopener noreferrer"
            icon={<ExternalLinkAltIcon />}
            iconPosition="end"
          >
            <FormattedMessage id="settings.menu.documentation" />
          </Button>
        </div>

        <div
          style={{
            marginBlockStart: 'var(--pf-t--global--spacer--sm)',
            color: 'var(--pf-t--global--text--color--subtle)',
            fontSize: 'var(--pf-t--global--font--size--sm)',
          }}
        >
          Managed with oVirt — https://www.ovirt.org
        </div>
      </ModalBody>
    </Modal>
  )
}

// Self-contained trigger + dialog: drop <AboutButton /> anywhere (a UserMenu
// item, a masthead action) and it owns its own open state. Integration can
// also render <AboutDialog> directly against external state when it wires the
// UserMenu item.
export function AboutButton({ variant = 'link' }: { variant?: 'link' | 'plain' | 'secondary' }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button variant={variant} onClick={() => setIsOpen(true)}>
        About
      </Button>
      <AboutDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}
