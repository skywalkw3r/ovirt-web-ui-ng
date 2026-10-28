import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('quotes fields with commas/quotes/newlines and doubles embedded quotes', () => {
    const csv = toCsv(
      ['Name', 'Description'],
      [
        ['web-01', 'plain'],
        ['db,primary', 'says "hi"\nsecond line'],
      ],
    )
    expect(csv).toBe(
      'Name,Description\r\n' + 'web-01,plain\r\n' + '"db,primary","says ""hi""\nsecond line"\r\n',
    )
  })

  it('neutralizes spreadsheet formula injection with a leading apostrophe', () => {
    const csv = toCsv(
      ['Description'],
      [['=HYPERLINK("http://evil")'], ['+1234'], ['@cmd'], ['-2+3']],
    )
    const lines = csv.trimEnd().split('\r\n').slice(1)
    // the apostrophe lands INSIDE the RFC quoting (the field also carries
    // quote characters): '=HYPERLINK... → "'=HYPERLINK(""http://evil"")"
    expect(lines[0]).toBe('"\'=HYPERLINK(""http://evil"")"')
    expect(lines[1]).toBe("'+1234")
    expect(lines[2]).toBe("'@cmd")
    expect(lines[3]).toBe("'-2+3")
  })

  it('passes numbers through bare and renders undefined as empty', () => {
    const csv = toCsv(['Memory', 'Uptime'], [[17179869184, undefined]])
    expect(csv).toBe('Memory,Uptime\r\n17179869184,\r\n')
  })
})
