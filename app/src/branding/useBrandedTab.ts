import { useEffect } from 'react'
import { PRODUCT_NAMES, type ProductBrand } from './brand'
import { applyBrandFavicon } from './favicon'

// A branded browser tab is two halves — document.title and the favicon — that
// must always move together, so every tab-owning surface (AppShell, LoginPage,
// VmConsolePage) applies both through this one hook. The console tab once
// applied neither and sat on index.html's static oVirt default against OLVM
// engines; a shared hook makes that class of half-branded tab unrepresentable.
export function useBrandedTab(brand: ProductBrand): void {
  useEffect(() => {
    document.title = PRODUCT_NAMES[brand]
    applyBrandFavicon(brand)
  }, [brand])
}
