import { DEFAULT_PRODUCT_NAME } from '../api/schemas/platform-settings'

// The console ships two brand identities and picks between them at runtime from
// the engine's product_info (api/schemas/system.ts): stock oVirt, and OLVM
// (Oracle Linux Virtualization Manager), which is oVirt rebadged by Oracle.
// Detection lives here (pure, no asset imports so it stays node-testable); the
// logo art it maps to lives in ./logos.
export type ProductBrand = 'ovirt' | 'olvm'

// Fallback product name per brand — the logo alt text and browser-tab title
// when no admin custom product name (platform settings) is set. oVirt reuses
// the shared default so the stock name has one source of truth.
export const PRODUCT_NAMES: Record<ProductBrand, string> = {
  ovirt: DEFAULT_PRODUCT_NAME,
  olvm: 'OLVM Console',
}

// Resolve the brand from GET /ovirt-engine/api's product_info. OLVM reports
// Oracle in the product name and/or vendor (e.g. name "Oracle Linux
// Virtualization Manager"); everything else is oVirt, the default. The match is
// deliberately broad — substring, case-insensitive, across both fields — so a
// version or vendor-string tweak still resolves; a miss just falls back to the
// stock oVirt mark rather than breaking.
export function detectBrand(
  productInfo: { name?: string; vendor?: string } | null | undefined,
): ProductBrand {
  if (!productInfo) return 'ovirt'
  const haystack = `${productInfo.name ?? ''} ${productInfo.vendor ?? ''}`.toLowerCase()
  return haystack.includes('oracle') || haystack.includes('olvm') ? 'olvm' : 'ovirt'
}

// --- pre-auth mirror --------------------------------------------------------
//
// The sign-in screen renders before any token exists, so it cannot read the
// engine to detect the brand. Every authenticated resolution mirrors the
// detected brand to localStorage (patterned on the platform-settings mirror in
// api/resources/platformSettings.ts), letting the login page show the right
// mark on this browser's return visits. A brand-new browser shows stock oVirt
// until its first session. The value is a public product identity — the same
// string the engine hands every user — so nothing sensitive lives here.

const MIRROR_KEY = 'console-brand'

export function writeBrandMirror(brand: ProductBrand): void {
  try {
    localStorage.setItem(MIRROR_KEY, brand)
  } catch {
    // storage unavailable (lockdown/private mode) — the live query still brands
    // the authenticated app; only the next pre-auth screen misses the hint
  }
}

// Defensive read: localStorage crosses a trust boundary, so only the two known
// brand tokens pass — anything else (stale, hand-edited, absent) reads as null,
// and callers fall back to the oVirt default.
export function readBrandMirror(): ProductBrand | null {
  try {
    const raw = localStorage.getItem(MIRROR_KEY)
    return raw === 'ovirt' || raw === 'olvm' ? raw : null
  } catch {
    return null
  }
}
