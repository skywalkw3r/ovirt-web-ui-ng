import { Banner, Flex, FlexItem } from '@patternfly/react-core'
import { ExclamationCircleIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import { useEngineReachable } from '../hooks/useEngineReachable'
import { useT } from '../i18n/useT'

// Non-blocking connectivity warning: a danger Banner pinned above the page
// content whenever the engine stops answering (repeated query failures) or the
// browser reports itself offline. Driven entirely by useEngineReachable, so it
// clears itself the moment a request succeeds again. Renders nothing while the
// engine is reachable.
export function OfflineBanner() {
  const reachable = useEngineReachable()
  const t = useT()
  if (reachable) return null

  return (
    <Banner status="danger" screenReaderText={t('common.offline.screenReader')}>
      <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
        <FlexItem>
          <ExclamationCircleIcon />
        </FlexItem>
        <FlexItem>
          <FormattedMessage id="common.offline.message" />
        </FlexItem>
      </Flex>
    </Banner>
  )
}
