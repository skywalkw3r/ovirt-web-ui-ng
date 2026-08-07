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
} from '@patternfly/react-core'
import type { OvirtUser } from '../../api/schemas/user'
import { useT } from '../../i18n/useT'
import { DomainLabel, EmailCell } from './PrincipalIdentity'
import { userDisplayName } from './principal'

const DASH = '—'

// Render an optional string as-is, or an em dash when absent — the detail-page
// overview idiom (mirrors DataCenterGeneralTab): every optional field is
// guarded with a — fallback so the card never shows a blank value.
function orDash(value: string | undefined | null): string {
  if (value === undefined || value === null || value === '') return DASH
  return value
}

function TextGroup({ term, value }: { term: string; value: string | undefined | null }) {
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>{orDash(value)}</DescriptionListDescription>
    </DescriptionListGroup>
  )
}

// A description group whose value is rich (a mailto link, a domain chip) rather
// than plain text — each child already degrades to an em dash on its own.
function NodeGroup({ term, children }: { term: string; children: ReactNode }) {
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>{children}</DescriptionListDescription>
    </DescriptionListGroup>
  )
}

// One bordered overview card: an h2 section heading over a compact two-column
// description list — the shared SectionCard idiom (vm-tabs/GuestInfoTab,
// DataCenterGeneralTab). The page keeps its single h1.
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

// 'name' carries the first name in the oVirt User model (last_name the family
// name); the principal lives in user_name.
function fullName(user: OvirtUser): string | undefined {
  const parts = [user.name, user.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : undefined
}

// The identity facts UserGeneralModel/UserListModel surface, split across two
// balanced overview cards: the Account card (display name, principal, email as a
// mailto link, department) and the Directory card (the coordinates the engine
// resolved the principal under — domain chip + namespace).
export function UserGeneralTab({ user }: { user: OvirtUser }) {
  const t = useT()
  return (
    <Grid hasGutter>
      <GridItem lg={6}>
        <SectionCard title={t('common.user')}>
          <TextGroup
            term={t('users.column.fullName')}
            value={fullName(user) ?? userDisplayName(user)}
          />
          <TextGroup term={t('users.column.username')} value={user.user_name} />
          <NodeGroup term={t('users.column.email')}>
            <EmailCell email={user.email} />
          </NodeGroup>
          <TextGroup term={t('userDetail.field.department')} value={user.department} />
        </SectionCard>
      </GridItem>

      <GridItem lg={6}>
        <SectionCard title={t('userDetail.section.directory')}>
          <NodeGroup term={t('users.column.domain')}>
            <DomainLabel domain={user.domain} />
          </NodeGroup>
          <TextGroup term={t('groups.column.namespace')} value={user.namespace} />
        </SectionCard>
      </GridItem>
    </Grid>
  )
}
