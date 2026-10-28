import type { MessageId } from '../../i18n/messages/en'

// One editable driver option row. `id` is a client-only React key (rows are
// added/removed freely); name/value map onto the api-model Property.
export interface DriverOptionRow {
  id: number
  name: string
  value: string
}

// Row-level validation for one editor: a row with a value but no name is an
// error (the engine would drop or misread it), as is a repeated name (the
// engine builds a map, so a duplicate silently loses one value). Blank rows
// are ignored. Returns the error's message id (DriverOptionsEditor renders it)
// or undefined.
export function driverOptionsError(rows: DriverOptionRow[]): MessageId | undefined {
  const named = rows.filter((row) => row.name.trim() !== '' || row.value !== '')
  if (named.some((row) => row.name.trim() === '')) return 'storageForm.driverOptions.nameRequired'
  const names = named.map((row) => row.name.trim())
  if (new Set(names).size !== names.length) return 'storageForm.driverOptions.duplicate'
  return undefined
}

// Whether at least one row carries a name. A cinderlib domain cannot work
// without driver options (volume_driver at minimum), so New Domain requires one.
export function hasNamedRow(rows: DriverOptionRow[]): boolean {
  return rows.some((row) => row.name.trim() !== '')
}

// The api-model Property list a row set maps to (blank rows are dropped by the
// resource builder, storageDomains.ts propertyList).
export function toStorageProperties(rows: DriverOptionRow[]): { name: string; value: string }[] {
  return rows.map((row) => ({ name: row.name, value: row.value }))
}
