import { Label } from '@patternfly/react-core'
import type { Provider } from '../../api/schemas/provider'
import { useT } from '../../i18n/useT'
import { PROVIDER_TYPE_COLORS, PROVIDER_TYPE_LABEL_IDS } from './providerTypeMeta'

// The colored kind chip. It is a category tag (which typed collection an entry
// came from), not a runtime status, so it stays a plain Label rather than a
// StatusBadge.
export function ProviderTypeLabel({ providerType }: { providerType: Provider['providerType'] }) {
  const t = useT()
  return (
    <Label isCompact color={PROVIDER_TYPE_COLORS[providerType]}>
      {t(PROVIDER_TYPE_LABEL_IDS[providerType])}
    </Label>
  )
}
