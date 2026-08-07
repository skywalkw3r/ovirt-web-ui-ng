// Minimal CSV writer for the list-view "Export CSV" buttons. RFC 4180: any
// field containing a comma, quote, or newline is quoted with embedded quotes
// doubled; rows join with CRLF.
//
// SECURITY — spreadsheet formula injection: a text field beginning with
// = + - @ (or a tab/CR) executes as a formula when the file opens in
// Excel/LibreOffice/Sheets, so a VM description like "=HYPERLINK(...)" could
// become an active cell. Those fields get a leading apostrophe (the
// spreadsheet convention for "literal text"), which neutralizes execution.
// Numbers pass through bare — they can't carry a payload. Beyond that the
// export is client-side only: it serializes exactly the rows and columns the
// user is already looking at, touches no new endpoint, and never includes
// credentials or tickets.

const FORMULA_LEADERS = ['=', '+', '-', '@', '\t', '\r']

export type CsvValue = string | number | undefined

function encodeField(value: CsvValue): string {
  if (value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  let text = value
  if (FORMULA_LEADERS.some((leader) => text.startsWith(leader))) text = `'${text}`
  if (/[",\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`
  return text
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(encodeField).join(','))
  return lines.join('\r\n') + '\r\n'
}

// Client-side download via a transient object URL. The UTF-8 BOM makes Excel
// decode non-ASCII (VM names, localized headers) correctly.
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
