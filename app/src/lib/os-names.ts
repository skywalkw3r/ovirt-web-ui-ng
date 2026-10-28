// oVirt osinfo type codes → human-friendly names (webadmin shows the os
// "description"). Not exhaustive: the common families are mapped, and an
// unmapped code falls back to itself so callers can detect "no friendly name"
// (osDisplayName(type) === type) and skip the parenthetical.
const OS_DISPLAY_NAMES: Record<string, string> = {
  other: 'Other OS',
  other_linux: 'Other Linux',
  other_linux_ppc64: 'Other Linux (ppc64)',
  other_linux_s390x: 'Other Linux (s390x)',
  rhel_6: 'RHEL 6',
  rhel_6x64: 'RHEL 6.x x64',
  rhel_7x64: 'RHEL 7.x x64',
  rhel_8x64: 'RHEL 8.x x64',
  rhel_9x64: 'RHEL 9.x x64',
  rhcos_x64: 'RHEL CoreOS',
  sles_11: 'SUSE Linux Enterprise Server 11',
  sles_12: 'SUSE Linux Enterprise Server 12',
  sles_15: 'SUSE Linux Enterprise Server 15',
  ubuntu_18_04: 'Ubuntu 18.04',
  ubuntu_20_04: 'Ubuntu 20.04',
  ubuntu_22_04: 'Ubuntu 22.04',
  debian_10: 'Debian 10',
  debian_11: 'Debian 11',
  windows_10: 'Windows 10',
  windows_10x64: 'Windows 10 x64',
  windows_11: 'Windows 11',
  windows_2016x64: 'Windows Server 2016 x64',
  windows_2019x64: 'Windows Server 2019 x64',
  windows_2022: 'Windows Server 2022',
}

// Returns the friendly name for a known os type, or the raw code unchanged when
// it is unknown/empty. Callers show the raw code in parentheses only when this
// differs from the code (i.e. a friendly name was found).
export function osDisplayName(type: string | undefined | null): string | undefined {
  if (!type) return undefined
  return OS_DISPLAY_NAMES[type] ?? type
}
