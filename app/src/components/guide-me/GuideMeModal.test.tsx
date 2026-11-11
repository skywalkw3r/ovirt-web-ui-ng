import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import type { UseQueryResult } from '@tanstack/react-query'
import { enMessages } from '../../i18n/messages/en'
import type { GuidePlan } from './guidePlan'
import { guideState, type GuideState } from './guideState'

// vitest runs in node (no jsdom) and PF's node entry pulls raw CSS, so PF is
// stubbed with semantic passthroughs (the ClusterFormModal.test.tsx pattern)
// and the dialog is asserted on its static markup.
vi.mock('@patternfly/react-core', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    Alert: ({ title, children }: { title?: ReactNode; children?: ReactNode }) => (
      <div role="status">
        <strong>{title}</strong>
        {children}
      </div>
    ),
    Button: ({
      children,
      isDisabled,
      'aria-describedby': describedBy,
    }: {
      children?: ReactNode
      isDisabled?: boolean
      'aria-describedby'?: string
    }) => (
      <button disabled={isDisabled} aria-describedby={describedBy}>
        {children}
      </button>
    ),
    Content: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
    EmptyState: ({ titleText, children }: { titleText?: ReactNode; children?: ReactNode }) => (
      <div>
        <h4>{titleText}</h4>
        {children}
      </div>
    ),
    EmptyStateActions: Pass,
    EmptyStateBody: Pass,
    EmptyStateFooter: Pass,
    HelperText: ({ id, children }: { id?: string; children?: ReactNode }) => (
      <div id={id}>{children}</div>
    ),
    HelperTextItem: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
    Modal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
      isOpen ? <div role="dialog">{children}</div> : null,
    ModalBody: Pass,
    ModalFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
    ModalHeader: ({ title }: { title?: ReactNode }) => <h1>{title}</h1>,
    Skeleton: ({ screenreaderText }: { screenreaderText?: string }) => (
      <span>{screenreaderText ?? 'skeleton'}</span>
    ),
    Stack: Pass,
    StackItem: Pass,
    Title: ({ children }: { children?: ReactNode }) => <h3>{children}</h3>,
  }
})

const { GuideMeModal } = await import('./GuideMeModal')

function render(state: GuideState, createdText?: string) {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <GuideMeModal
        isOpen
        title="Guide Me: dc"
        createdText={createdText}
        configuredText="The data center is fully configured and ready for use."
        state={state}
        onStep={() => {}}
        onClose={() => {}}
      />
    </IntlProvider>,
  )
}

const PARTIAL: GuidePlan = {
  configured: false,
  steps: [
    {
      id: 'cluster',
      labelId: 'guideMe.step.configureCluster',
      required: true,
      action: { kind: 'newCluster', dataCenterId: 'dc' },
      disabledReasons: [],
    },
    {
      id: 'host',
      labelId: 'guideMe.step.configureHost',
      required: true,
      action: { kind: 'newHost' },
      disabledReasons: ['guideMe.reason.noCluster'],
    },
    {
      id: 'addIso',
      labelId: 'guideMe.step.configureIsoLibrary',
      required: false,
      action: { kind: 'newStorageDomain', dataCenterId: 'dc', local: false, domainType: 'iso' },
      disabledReasons: [],
    },
  ],
}

describe('GuideMeModal', () => {
  it('lists required then optional steps, with reasons tied to disabled buttons', () => {
    const html = render({ status: 'success', plan: PARTIAL }, 'Data center created.')
    expect(html).toContain('Data center created.')
    expect(html).toContain('Some entities still need to be configured.')
    expect(html.indexOf('Required steps')).toBeLessThan(html.indexOf('Configure cluster'))
    expect(html.indexOf('Configure host')).toBeLessThan(html.indexOf('Optional steps'))
    expect(html.indexOf('Optional steps')).toBeLessThan(html.indexOf('Configure ISO library'))
    expect(html).toContain(
      '<button disabled="" aria-describedby="guide-me-step-host-reasons">Configure host</button>',
    )
    expect(html).toContain(
      '<div id="guide-me-step-host-reasons"><span>Add a cluster to the data center first.</span>',
    )
    expect(html).toContain('<button>Configure cluster</button>')
    expect(html).toContain('Configure later')
    expect(html).not.toContain('Configuration completed')
  })

  it('says the entity is configured when nothing is required, and offers Close', () => {
    const plan: GuidePlan = { configured: true, steps: [PARTIAL.steps[2]] }
    const html = render({ status: 'success', plan })
    expect(html).toContain('Configuration completed')
    expect(html).toContain('The data center is fully configured and ready for use.')
    expect(html).not.toContain('Required steps')
    expect(html).toContain('Optional steps')
    expect(html).toContain('<footer><button>Close</button></footer>')
  })

  it('shows a note without claiming completion when nothing can be offered', () => {
    const html = render({
      status: 'success',
      plan: { configured: false, steps: [], noteId: 'guideMe.note.clusterNoActions' },
    })
    expect(html).toContain('No actions are available for this cluster')
    expect(html).not.toContain('Configuration completed')
    expect(html).toContain('<footer><button>Close</button></footer>')
  })

  it('renders the loading and error states', () => {
    expect(render({ status: 'pending' })).toContain('Loading the next steps')
    const html = render({ status: 'error', message: 'engine down', retry: () => {} })
    expect(html).toContain('Could not load the next steps')
    expect(html).toContain('engine down')
    expect(html).toContain('Retry')
  })
})

describe('guideState', () => {
  const query = (over: Partial<UseQueryResult<unknown>>) =>
    ({ isError: false, isSuccess: true, refetch: vi.fn(), ...over }) as UseQueryResult<unknown>
  const plan: GuidePlan = { configured: true, steps: [] }

  it('is pending until every read succeeds, then computes the plan', () => {
    const compute = vi.fn(() => plan)
    expect(guideState([query({}), query({ isSuccess: false })], 'x', compute)).toEqual({
      status: 'pending',
    })
    expect(compute).not.toHaveBeenCalled()
    expect(guideState([query({})], 'x', compute)).toEqual({ status: 'success', plan })
  })

  it('reports the first failure and retries only the failed reads', () => {
    const ok = query({})
    const failed = query({ isError: true, isSuccess: false, error: new Error('boom') })
    const state = guideState([ok, failed], 'fallback', () => plan)
    expect(state).toMatchObject({ status: 'error', message: 'boom' })
    if (state.status === 'error') state.retry()
    expect(failed.refetch).toHaveBeenCalledTimes(1)
    expect(ok.refetch).not.toHaveBeenCalled()
  })
})
