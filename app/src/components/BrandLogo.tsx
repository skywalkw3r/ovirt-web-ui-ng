import { Brand } from '@patternfly/react-core'
import { brandAssets } from '../branding/logos'
import { useProductBrand } from '../hooks/useProductBrand'

// The masthead mark. A white/light-on-transparent SVG per detected engine
// flavour (oVirt vs OLVM — useProductBrand + brandAssets), which reads on the
// dark masthead strip in BOTH themes (dark ink chrome in the dark theme; a
// dark-slate island in light — see brand-tokens.css). The black bw variant
// would disappear on the light-mode slate, so only the white marks ship.
// useProductBrand's pre-auth mirror keeps the flavour flash-free across
// sign-ins on a browser that has seen this engine before.
export function BrandLogo({ height = '32px' }: { height?: string }) {
  const assets = brandAssets(useProductBrand())
  return <Brand src={assets.logo} alt={assets.productName} heights={{ default: height }} />
}
