import { Brand } from '@patternfly/react-core'
import { DEFAULT_PRODUCT_NAME } from '../api/schemas/platform-settings'
import { usePlatformSettings } from '../hooks/usePlatformSettings'
// The white/green mark. BrandLogo only ever renders in the masthead, which is a
// dark strip in BOTH themes now (dark ink chrome in the dark theme; a dark-slate
// island in light — see brand-tokens.css), so the white variant reads in both.
// The black bw variant would disappear on the light-mode slate, so it's gone.
import ovirtLogo from '../assets/ovirt-logo.svg'

// Platform settings (admin-uploaded custom logo + product name) override the
// shipped mark; the pre-auth mirror inside usePlatformSettings keeps the swap
// flash-free across sign-ins on a browser that has seen the branding before.
export function BrandLogo({ height = '32px' }: { height?: string }) {
  const { settings } = usePlatformSettings()
  const src = settings.logoDataUri ?? ovirtLogo
  const alt = settings.productName.trim() !== '' ? settings.productName : DEFAULT_PRODUCT_NAME
  return <Brand src={src} alt={alt} heights={{ default: height }} />
}
