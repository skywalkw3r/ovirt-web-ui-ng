import { Brand } from '@patternfly/react-core'
import { brandAssets } from '../branding/logos'
import { usePlatformSettings } from '../hooks/usePlatformSettings'
import { useProductBrand } from '../hooks/useProductBrand'

// The masthead mark. A white/light-on-transparent SVG per detected engine
// flavour (oVirt vs OLVM — useProductBrand + brandAssets), which reads on the
// dark masthead strip in BOTH themes (dark ink chrome in the dark theme; a
// dark-slate island in light — see brand-tokens.css). The black bw variant
// would disappear on the light-mode slate, so only the white marks ship.
// Platform settings (admin-uploaded custom logo + product name) override the
// shipped mark; the pre-auth mirrors (brand + platform settings) keep both the
// flavour and any custom logo flash-free across sign-ins on a browser that has
// seen them before.
export function BrandLogo({ height = '32px' }: { height?: string }) {
  const { settings } = usePlatformSettings()
  const assets = brandAssets(useProductBrand())
  const src = settings.logoDataUri ?? assets.logo
  const alt = settings.productName.trim() !== '' ? settings.productName : assets.productName
  return <Brand src={src} alt={alt} heights={{ default: height }} />
}
