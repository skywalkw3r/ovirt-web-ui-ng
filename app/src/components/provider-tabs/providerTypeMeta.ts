import type { Provider } from '../../api/schemas/provider'
import type { MessageId } from '../../i18n/messages/en'

// providerType is the client-side tag for which typed collection an entry came
// from. The color split keeps the OpenStack family (image/network/volume) and
// the external host provider scannable wherever a provider is shown (the list,
// the detail header, the General tab). Shared so the mapping lives in one place;
// kept in a plain module (no component export) so fast refresh stays happy.
export const PROVIDER_TYPE_COLORS: Record<
  Provider['providerType'],
  'blue' | 'teal' | 'purple' | 'orange'
> = {
  image: 'purple',
  network: 'teal',
  volume: 'orange',
  host: 'blue',
}

export const PROVIDER_TYPE_LABEL_IDS: Record<Provider['providerType'], MessageId> = {
  image: 'providers.type.image',
  network: 'providers.type.network',
  volume: 'providers.type.volume',
  host: 'providers.type.host',
}
