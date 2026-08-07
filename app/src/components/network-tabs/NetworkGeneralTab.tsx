import type { ReactNode } from 'react'
import {
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Grid,
  GridItem,
  Label,
  LabelGroup,
} from '@patternfly/react-core'
import type { Network } from '../../api/schemas/network'
import { useT } from '../../i18n/useT'
import { statusText } from '../../lib/format'

const DASH = '—'

// Render an optional string/number as-is, or an em dash when absent — the
// contract is explicit that every optional field is guarded with a — fallback.
function orDash(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return DASH
  return String(value)
}

// The engine serializes booleans as JSON strings ("true"/"false"); the schema
// coerces them, so a real boolean (or undefined) reaches here. Mirrors
// HostGeneralTab's BoolLabel.
function BoolLabel({ value }: { value: boolean | undefined }) {
  const t = useT()
  if (value === undefined) return <>{DASH}</>
  return (
    <Label isCompact color={value ? 'green' : 'grey'}>
      {value ? t('common.enabled') : t('common.disabled')}
    </Label>
  )
}

// A term whose description is a plain string (em dash when missing).
function TextGroup({ term, value }: { term: string; value: string | number | undefined | null }) {
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>{orDash(value)}</DescriptionListDescription>
    </DescriptionListGroup>
  )
}

// One bordered overview card: an h2 section heading over a compact two-column
// description list — mirrors the VM General tab. Page keeps its single h1.
function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card isCompact isFullHeight>
      <CardTitle component="h2">{title}</CardTitle>
      <CardBody>
        <DescriptionList isCompact columnModifier={{ default: '1Col', md: '2Col' }}>
          {children}
        </DescriptionList>
      </CardBody>
    </Card>
  )
}

export function NetworkGeneralTab({ network }: { network: Network }) {
  const t = useT()
  // Network roles ({ usage: ['vm', 'management', …] }) — the key is omitted
  // entirely when the network carries no roles.
  const usages = network.usages?.usage ?? []

  // webadmin renders an unset or zero MTU as "Default" (the bridge inherits the
  // host default); any other value is the explicit byte count.
  const mtu =
    network.mtu === undefined || network.mtu === 0
      ? t('networkGeneral.mtu.default')
      : String(network.mtu)

  return (
    <Grid hasGutter>
      <GridItem lg={6}>
        <SectionCard title={t('networkGeneral.heading')}>
          <TextGroup term={t('common.field.name')} value={network.name} />
          <TextGroup term={t('common.field.description')} value={network.description} />
          <TextGroup term={t('common.field.comment')} value={network.comment} />
          <TextGroup term={t('common.field.id')} value={network.id} />
          {/* No data-center detail route exists yet — render the followed
              data center name as text, mirroring TemplateGeneralTab. */}
          <TextGroup term={t('networkGeneral.term.dataCenter')} value={network.data_center?.name} />
          {/* statusText returns '—' for an absent status, matching orDash's fallback */}
          <TextGroup term={t('common.field.status')} value={statusText(network.status)} />
        </SectionCard>
      </GridItem>

      <GridItem lg={6}>
        <SectionCard title={t('networkGeneral.card.connectivity')}>
          <TextGroup term={t('networkGeneral.term.vlanTag')} value={network.vlan?.id} />
          <TextGroup term={t('networkGeneral.term.mtu')} value={mtu} />
          <DescriptionListGroup>
            <DescriptionListTerm>{t('networkGeneral.term.stp')}</DescriptionListTerm>
            <DescriptionListDescription>
              <BoolLabel value={network.stp} />
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('networkGeneral.term.portIsolation')}</DescriptionListTerm>
            <DescriptionListDescription>
              <BoolLabel value={network.port_isolation} />
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('networkGeneral.term.usages')}</DescriptionListTerm>
            <DescriptionListDescription>
              {usages.length === 0 ? (
                DASH
              ) : (
                // numLabels expands past the default show-3 collapse — a
                // network carries at most a handful of roles.
                <LabelGroup
                  aria-label={t('networkGeneral.usages.ariaLabel')}
                  numLabels={usages.length}
                >
                  {usages.map((usage) => (
                    <Label key={usage} isCompact>
                      {usage}
                    </Label>
                  ))}
                </LabelGroup>
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>
        </SectionCard>
      </GridItem>
    </Grid>
  )
}
