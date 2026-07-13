import type { ReactNode } from 'react'
import {
  Button,
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  Grid,
  GridItem,
  Label,
  LabelGroup,
  Skeleton,
} from '@patternfly/react-core'
import type { ReportedDevice } from '../../api/schemas/reported-device'
import type { Vm } from '../../api/schemas/vm'
import { useVmReportedDevices } from '../../hooks/useVmDetail'
import { useT } from '../../i18n/useT'

const DASH = '—'

// Flatten every guest-reported IP across all reported devices into a single
// list. The engine nests them as reported_device[].ips.ip[].address; a device
// (or the whole collection) can report none, so both hops are optional.
function flattenIps(devices: ReportedDevice[]): { address: string; version?: string }[] {
  return devices.flatMap((device) =>
    (device.ips?.ip ?? [])
      .filter((ip): ip is { address: string; version?: string } => ip.address !== undefined)
      .map((ip) => ({ address: ip.address, version: ip.version })),
  )
}

// The guest OS line webadmin shows: distribution + version, falling back to the
// OS family, then an em dash when the agent reports nothing.
function guestOsLabel(vm: Vm): string {
  const os = vm.guest_operating_system
  if (!os) return DASH
  const parts = [os.distribution, os.version?.full_version].filter(Boolean)
  if (parts.length > 0) return parts.join(' ')
  return os.family ?? DASH
}

function TextGroup({ term, value }: { term: string; value: string | undefined }) {
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>{value || DASH}</DescriptionListDescription>
    </DescriptionListGroup>
  )
}

// Same bordered-section idiom as the sibling GeneralTab (and the other detail
// pages' overview tabs): Card + h2 title + compact two-column facts.
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

export function GuestInfoTab({ vm }: { vm: Vm }) {
  const t = useT()
  const reportedDevices = useVmReportedDevices(vm.id)

  // The guest OS block comes from the VM entity itself (already loaded to reach
  // this tab); only the reported IPs need the subcollection query. Treat "the
  // guest is not reporting anything" as: no reported devices AND none of the
  // guest-agent-only VM fields present.
  const guestOs = vm.guest_operating_system
  const kernel = guestOs?.kernel?.version?.full_version
  const hasVmGuestData =
    vm.fqdn !== undefined || guestOs !== undefined || vm.guest_time_zone?.name !== undefined

  return (
    <>
      {reportedDevices.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('guestInfo.loading')} />
        </>
      )}

      {reportedDevices.isError && (
        <EmptyState titleText={t('guestInfo.error.title')} status="danger">
          <EmptyStateBody>
            {reportedDevices.error instanceof Error
              ? reportedDevices.error.message
              : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void reportedDevices.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {reportedDevices.isSuccess && reportedDevices.data.length === 0 && !hasVmGuestData && (
        <EmptyState titleText={t('guestInfo.notReporting.title')}>
          <EmptyStateBody>{t('guestInfo.notReporting.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {reportedDevices.isSuccess &&
        (reportedDevices.data.length > 0 || hasVmGuestData) &&
        (() => {
          const ips = flattenIps(reportedDevices.data)
          return (
            <Grid hasGutter aria-label={t('guestInfo.ariaLabel')}>
              <GridItem lg={6}>
                <SectionCard title={t('guestInfo.card.network')}>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('guestInfo.term.ipAddresses')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {ips.length === 0 ? (
                        DASH
                      ) : (
                        <LabelGroup
                          aria-label={t('guestInfo.ipAddresses.ariaLabel')}
                          numLabels={ips.length}
                        >
                          {ips.map((ip) => (
                            <Label key={ip.address} isCompact color="blue">
                              {ip.version
                                ? t('guestInfo.ip.withVersion', {
                                    address: ip.address,
                                    version: ip.version,
                                  })
                                : ip.address}
                            </Label>
                          ))}
                        </LabelGroup>
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <TextGroup term={t('guestInfo.term.fqdn')} value={vm.fqdn} />
                </SectionCard>
              </GridItem>
              <GridItem lg={6}>
                <SectionCard title={t('guestInfo.card.os')}>
                  <TextGroup term={t('guestInfo.term.guestOs')} value={guestOsLabel(vm)} />
                  <TextGroup
                    term={t('guestInfo.term.architecture')}
                    value={guestOs?.architecture}
                  />
                  <TextGroup term={t('guestInfo.term.kernelVersion')} value={kernel} />
                  <TextGroup
                    term={t('guestInfo.term.guestTimeZone')}
                    value={vm.guest_time_zone?.name}
                  />
                </SectionCard>
              </GridItem>
            </Grid>
          )
        })()}
    </>
  )
}
