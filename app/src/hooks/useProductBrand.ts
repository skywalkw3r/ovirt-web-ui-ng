import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApiInfo } from '../api/resources/system'
import {
  detectBrand,
  readBrandMirror,
  writeBrandMirror,
  type ProductBrand,
} from '../branding/brand'

// Which engine flavour the authenticated app brands as (oVirt vs OLVM), derived
// from the engine's product_info. Shares the ['apiInfo'] cache entry with the
// dashboard and About dialog — product info is effectively static, hence no
// refetch interval. Until the query lands (or if it fails), this browser's last
// mirrored brand stands in, then the shipped oVirt default; branding may flash
// from stale to fresh but never blocks. Every live resolution refreshes the
// mirror so the NEXT pre-auth login screen brands right (LoginPage reads it).
export function useProductBrand(): ProductBrand {
  const { data } = useQuery({ queryKey: ['apiInfo'], queryFn: fetchApiInfo })
  const live = data ? detectBrand(data.product_info) : null
  // Read once per mount: the mirror only matters until the live parse lands.
  const [mirror] = useState(() => readBrandMirror())

  useEffect(() => {
    if (live !== null) writeBrandMirror(live)
  }, [live])

  return live ?? mirror ?? 'ovirt'
}
