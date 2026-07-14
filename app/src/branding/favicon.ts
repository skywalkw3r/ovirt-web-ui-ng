import type { ProductBrand } from './brand'

// index.html ships a single static favicon (the shipped oVirt mark) since it
// can't know the engine flavour before the app boots. Once the brand resolves,
// this swaps the <link rel="icon"> href to the matching mark — and resets it to
// the oVirt default for oVirt engines, so a browser that last saw OLVM doesn't
// keep the wrong tab icon. The files live in app/public and are served under
// the app's base path (import.meta.env.BASE_URL), matching how config.js loads.
const FAVICONS: Record<ProductBrand, string> = {
  ovirt: `${import.meta.env.BASE_URL}favicon.svg`,
  olvm: `${import.meta.env.BASE_URL}favicon-olvm.svg`,
}

export function applyBrandFavicon(brand: ProductBrand): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (link !== null) link.href = FAVICONS[brand]
}
