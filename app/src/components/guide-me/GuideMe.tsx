import { useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { GuideActionModal } from './GuideActionModal'
import { GuideMeModal } from './GuideMeModal'
import type { GuideAction } from './guidePlan'
import type { GuideState } from './guideState'

// The dialog plus the step it launched. While a step's dialog is up the guide
// steps aside (two stacked modals would fight over focus), and comes back,
// re-read, when that dialog closes — webadmin's guide refreshes the same way.
export function GuideMe({
  title,
  createdText,
  configuredText,
  state,
  queries,
  onClose,
}: {
  title: string
  createdText?: string
  configuredText: string
  state: GuideState
  // re-read when a step's dialog closes (the mutations invalidate most of
  // these already; the hosts and storage lists may not be among them)
  queries: UseQueryResult<unknown>[]
  onClose: () => void
}) {
  const [action, setAction] = useState<GuideAction | null>(null)
  return (
    <>
      <GuideMeModal
        isOpen={action === null}
        title={title}
        createdText={createdText}
        configuredText={configuredText}
        state={state}
        onStep={(step) => setAction(step.action)}
        onClose={onClose}
      />
      {action && (
        <GuideActionModal
          action={action}
          onClose={() => {
            setAction(null)
            queries.forEach((query) => void query.refetch())
          }}
        />
      )}
    </>
  )
}
