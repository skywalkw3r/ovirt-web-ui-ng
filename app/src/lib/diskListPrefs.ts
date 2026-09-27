// Flat Disks list preferences — durable per browser (localStorage, same
// posture as settings/SettingsProvider: durable preferences never live in
// sessionStorage and survive sign-out on purpose).
//
// The engine keeps two OVF_STORE disks per storage domain (the OVF metadata
// of the VMs/templates on it); a fleet with dozens of domains shows a hundred
// of them in the flat list, all named alike, and nobody manages them by hand.
// The Disks page hides them by default and remembers the choice here.
const HIDE_OVF_STORE_KEY = 'console-disks-hide-ovf-store'

// Only the literal 'false' opts out — anything missing, malformed or unreadable
// (private mode, lockdown) keeps the default of hiding them.
export function readHideOvfStore(): boolean {
  try {
    return localStorage.getItem(HIDE_OVF_STORE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function writeHideOvfStore(hide: boolean): void {
  try {
    localStorage.setItem(HIDE_OVF_STORE_KEY, hide ? 'true' : 'false')
  } catch {
    // storage unavailable — the choice lasts this page
  }
}

// The engine tags them content_type 'ovf_store'; the alias/name fallback covers
// engines or reads that leave content_type out (the disk is always named
// OVF_STORE by the engine, never by a user).
export function isOvfStoreDisk(disk: {
  content_type?: string
  alias?: string
  name?: string
}): boolean {
  return disk.content_type === 'ovf_store' || (disk.alias ?? disk.name) === 'OVF_STORE'
}
