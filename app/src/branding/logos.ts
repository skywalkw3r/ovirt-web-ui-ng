import { PRODUCT_NAMES, type ProductBrand } from './brand'
import ovirtLogo from '../assets/ovirt-logo.svg'
import olvmLogo from '../assets/olvm-logo.svg'

// The shipped mark per brand. Both are white/light-on-transparent SVGs so they
// read on the dark masthead strip (dark in both themes — brand-tokens.css). An
// admin-uploaded custom logo (platform settings logoDataUri) overrides these.
// Kept apart from ./brand so the detection logic stays free of asset imports.
const BRAND_LOGOS: Record<ProductBrand, string> = {
  ovirt: ovirtLogo,
  olvm: olvmLogo,
}

export interface BrandAssets {
  // Imported SVG resolved to a URL string (Vite asset handling).
  logo: string
  // Fallback product name (logo alt text / tab title) when unset by an admin.
  productName: string
}

export function brandAssets(brand: ProductBrand): BrandAssets {
  return { logo: BRAND_LOGOS[brand], productName: PRODUCT_NAMES[brand] }
}
