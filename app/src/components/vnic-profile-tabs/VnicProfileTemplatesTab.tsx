import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useVnicProfileTemplates } from './useVnicProfileDetail'

// Templates with a vNIC bound to this profile. No server-side read exists (the
// api-model offers no templates locator on a vNIC profile — its only
// subcollection is permissions), so useVnicProfileTemplates derives membership
// from a single GET /templates?follow=nics join, mirroring the VMs subtab —
// see resources/vnicProfiles.ts. Strings are hardcoded English pending the
// i18n externalization pass (parity with VnicProfileVmsTab).
export function VnicProfileTemplatesTab({ profileId }: { profileId: string }) {
  const templates = useVnicProfileTemplates(profileId)

  return (
    <>
      {templates.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading templates" />
        </>
      )}

      {templates.isError && (
        <EmptyState titleText="Could not load templates" status="danger">
          <EmptyStateBody>
            {templates.error instanceof Error ? templates.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void templates.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {templates.isSuccess && templates.data.length === 0 && (
        <EmptyState titleText="No templates">
          <EmptyStateBody>No template uses this vNIC profile.</EmptyStateBody>
        </EmptyState>
      )}

      {templates.isSuccess && templates.data.length > 0 && (
        <Table aria-label="Templates using this vNIC profile" variant="compact">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Description</Th>
            </Tr>
          </Thead>
          <Tbody>
            {templates.data.map((template) => (
              <Tr key={template.id}>
                <Td dataLabel="Name">
                  <Link to="/templates/$templateId" params={{ templateId: template.id }}>
                    {template.name}
                  </Link>
                </Td>
                <Td dataLabel="Description">{template.description || '—'}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
