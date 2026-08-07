import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApiInfo } from '../api/resources/system'
import {
  detectBrand,
  readBrandMirror,
  writeBrandMirror,
  type ProductBrand,
} from '../branding/brand'

// Which engine flavour the app brands as (oVirt vs OLVM), derived from the
// engine's product_info. Shares the ['apiInfo'] cache entry with the dashboard
// and About dialog — product info is effectively static, hence no refetch
// interval. Until the query lands (or if it fails), this browser's last
// mirrored brand stands in, then the shipped oVirt default; branding may flash
// from stale to fresh but never blocks. Every live resolution refreshes the
// mirror so the NEXT pre-auth surface brands right.
//
// Surfaces holding no API credentials pass { live: false } to park the engine
// query (it could only 401): the pre-auth login screen always, and the console
// tab until its opener handshake lands a token. The mirror (plus any
// already-cached resolution) carries the brand while parked.
export function useProductBrand(options?: { live?: boolean }): ProductBrand {
  const live = options?.live ?? true
  const { data } = useQuery({ queryKey: ['apiInfo'], queryFn: fetchApiInfo, enabled: live })
  const detected = data ? detectBrand(data.product_info) : null
  // Read once per mount: the mirror only matters until the live parse lands.
  const [mirror] = useState(() => readBrandMirror())

  useEffect(() => {
    if (detected !== null) writeBrandMirror(detected)
  }, [detected])

  return detected ?? mirror ?? 'ovirt'
}
