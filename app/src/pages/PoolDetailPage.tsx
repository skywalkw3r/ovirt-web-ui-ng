import { useState } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  EmptyState,
  EmptyStateBody,
  FormGroup,
  PageSection,
  Skeleton,
  Stack,
  StackItem,
  Tab,
  TabContentBody,
  Tabs,
  TabTitleText,
  TextInput,
} from '@patternfly/react-core'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../api/transport'
import { getPool } from '../api/resources/pools'
import { listClusters } from '../api/resources/clusters'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { PoolFormModal } from '../components/pool-form/PoolFormModal'
import { PoolGeneralTab } from '../components/pool-tabs/PoolGeneralTab'
import { PoolPermissionsTab } from '../components/pool-tabs/PoolPermissionsTab'
import { PoolVmsTab } from '../components/pool-tabs/PoolVmsTab'
import { useAdminResourcePollInterval } from '../hooks/useAdminResources'
import { useDeletePool } from '../hooks/usePoolMutations'
import { useT } from '../i18n/useT'
import { poolDetailRoute } from '../routes/router'

export function PoolDetailPage() {
  const t = useT()
  const { poolId } = poolDetailRoute.useParams()
  const navigate = useNavigate()
  const refetchInterval = useAdminResourcePollInterval()
  const pool = useQuery({
    queryKey: ['pool', poolId],
    queryFn: () => getPool(poolId),
    refetchInterval,
  })

  // The pool read returns cluster as an id-only link (VmPoolMapper), so resolve
  // the display name client-side against the clusters inventory — the same
  // unsearched ['clusters', ''] cache PoolFormModal seeds its picker from.
  const clusters = useQuery({
    queryKey: ['clusters', ''],
    queryFn: () => listClusters(),
    enabled: pool.isSuccess,
  })
  const clusterId = pool.data?.cluster?.id
  const clusterName =
    clusterId === undefined ? undefined : clusters.data?.find((c) => c.id === clusterId)?.name

  const [activeKey, setActiveKey] = useState<string | number>('general')
  const [editing, setEditing] = useState(false)
  // non-null while the remove confirm is up; holds the typed-name gate
  const [removing, setRemoving] = useState<{ nameInput: string } | null>(null)
  const remove = useDeletePool()

  const notFound = pool.error instanceof ApiError && pool.error.status === 404

  return (
    <PageSection>
      {pool.isPending && (
        <>
          <Skeleton
            width="30%"
            height="2rem"
            style={{ marginBottom: '1rem' }}
            screenreaderText={t('poolDetail.loading')}
          />
          <Skeleton height="12rem" />
        </>
      )}

      {pool.isError && notFound && (
        <EmptyState titleText={t('poolDetail.notFound.title')} status="warning">
          <EmptyStateBody>
            No pool with ID {poolId} is visible to you — it may have been removed.
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void navigate({ to: '/pools' })}>
            {t('poolDetail.breadcrumb')}
          </Button>
        </EmptyState>
      )}

      {pool.isError && !notFound && (
        <EmptyState titleText={t('poolDetail.error.title')} status="danger">
          <EmptyStateBody>
            {pool.error instanceof Error ? pool.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void pool.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {pool.isSuccess && (
        <>
          <ListPageHeader
            title={pool.data.name}
            breadcrumb={
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/pools" className={className}>
                      {t('poolDetail.breadcrumb')}
                    </Link>
                  )}
                />
                <BreadcrumbItem isActive>{pool.data.name}</BreadcrumbItem>
              </Breadcrumb>
            }
            actions={
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  {t('common.action.edit')}
                </Button>
                <Button
                  variant="secondary"
                  isDanger
                  isDisabled={remove.isPending}
                  onClick={() => setRemoving({ nameInput: '' })}
                >
                  {t('common.action.remove')}
                </Button>
              </>
            }
          />

          <PoolFormModal pool={pool.data} isOpen={editing} onClose={() => setEditing(false)} />

          {removing && (
            <ConfirmModal
              isOpen
              title={`Remove ${pool.data.name}?`}
              body={
                <Stack hasGutter>
                  <StackItem>
                    Every virtual machine in this pool will be stopped and permanently removed, then
                    the pool itself. This cannot be undone.
                  </StackItem>
                  <StackItem>
                    <FormGroup
                      label={`Type "${pool.data.name}" to confirm`}
                      isRequired
                      fieldId="remove-confirm-name"
                    >
                      <TextInput
                        id="remove-confirm-name"
                        aria-label="Type the pool name to confirm removal"
                        value={removing.nameInput}
                        onChange={(_event, value) => setRemoving({ nameInput: value })}
                      />
                    </FormGroup>
                  </StackItem>
                </Stack>
              }
              confirmLabel="Remove"
              isConfirmDisabled={removing.nameInput !== pool.data.name}
              onConfirm={() => {
                setRemoving(null)
                remove.mutate(
                  { id: poolId, name: pool.data.name },
                  { onSuccess: () => void navigate({ to: '/pools' }) },
                )
              }}
              onCancel={() => setRemoving(null)}
            />
          )}

          {/* unmountOnExit keeps hidden tabs from polling — a mounted tab's
              query observers would otherwise keep their refetchInterval alive */}
          <Tabs
            activeKey={activeKey}
            onSelect={(_event, tabKey) => setActiveKey(tabKey)}
            mountOnEnter
            unmountOnExit
            aria-label="pool details tabs"
          >
            <Tab
              eventKey="general"
              title={<TabTitleText>{t('poolDetail.tab.general')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <PoolGeneralTab pool={pool.data} clusterName={clusterName} />
              </TabContentBody>
            </Tab>
            <Tab eventKey="vms" title={<TabTitleText>{t('poolDetail.tab.vms')}</TabTitleText>}>
              <TabContentBody hasPadding>
                <PoolVmsTab poolId={poolId} />
              </TabContentBody>
            </Tab>
            <Tab
              eventKey="permissions"
              title={<TabTitleText>{t('poolDetail.tab.permissions')}</TabTitleText>}
            >
              <TabContentBody hasPadding>
                <PoolPermissionsTab poolId={poolId} />
              </TabContentBody>
            </Tab>
          </Tabs>
        </>
      )}
    </PageSection>
  )
}
