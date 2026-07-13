import { describe, expect, it } from 'vitest'
import {
  cleanPanelTitle,
  parseChart,
  parseDashboard,
  substituteVars,
  type DwhPanel,
} from './grafana-query'

const gauge: DwhPanel = { id: 7, title: 'CPU', type: 'gauge', rawSql: '' }
const graph: DwhPanel = { id: 14, title: 'CPU over time', type: 'graph', rawSql: '' }

describe('cleanPanelTitle', () => {
  it('strips a trailing "(over time)" suffix', () => {
    expect(cleanPanelTitle('Average and Peak CPU Usage (over time)')).toBe(
      'Average and Peak CPU Usage',
    )
  })

  it('strips a bare trailing "over time"', () => {
    expect(cleanPanelTitle('CPU Usage over time')).toBe('CPU Usage')
  })

  it('leaves titles without the suffix untouched', () => {
    expect(cleanPanelTitle('Disk I/O operations')).toBe('Disk I/O operations')
  })

  it('does not clip a word ending in "over" (Discover time)', () => {
    expect(cleanPanelTitle('Discover time')).toBe('Discover time')
  })

  it('handles undefined', () => {
    expect(cleanPanelTitle(undefined)).toBe('')
  })
})

describe('substituteVars', () => {
  it('substitutes $name and ${name} forms', () => {
    expect(
      substituteVars("where vm_id = '$vm_id' and x = '${show_deleted}'", {
        vm_id: 'abc',
        show_deleted: 'No',
      }),
    ).toBe("where vm_id = 'abc' and x = 'No'")
  })

  it('never lets a shorter name clobber a longer one sharing its prefix', () => {
    expect(substituteVars('$vm_id vs $vm', { vm: 'SHORT', vm_id: 'LONG' })).toBe('LONG vs SHORT')
  })

  it('treats $ in a value literally (no replacement-pattern expansion)', () => {
    expect(substituteVars('x = $a', { a: 'pre$&post' })).toBe('x = pre$&post')
  })
})

describe('parseDashboard', () => {
  const body = {
    dashboard: {
      panels: [
        {
          id: 1,
          title: 'CPU Usage (over time)',
          type: 'graph',
          targets: [{ rawSql: 'select 1' }],
          datasource: { uid: '${datasource}' },
        },
        {
          type: 'row',
          panels: [{ id: 2, title: 'Memory', type: 'gauge', targets: [{ rawSql: 'select 2' }] }],
        },
        { id: 3, title: 'Unrequested', type: 'graph', targets: [{ rawSql: 'select 3' }] },
        { id: 4, title: 'No SQL', type: 'graph', targets: [] },
      ],
      templating: {
        list: [
          { name: 'datasource', type: 'datasource', current: { value: 'P123' } },
          { name: 'show_deleted', type: 'custom', current: { value: 'No' } },
          { name: 'vm_id', type: 'query', current: { value: '$__all' } },
        ],
      },
    },
  }

  it('selects requested panels (recursing rows), cleans titles, drops SQL-less ones', () => {
    const dashboard = parseDashboard(body, [1, 2, 4])
    expect(dashboard.panels.map((panel) => panel.id)).toEqual([1, 2])
    expect(dashboard.panels[0].title).toBe('CPU Usage')
    expect(dashboard.panels[1].type).toBe('gauge')
  })

  it('collects template-variable defaults, skipping unresolved $ values', () => {
    const dashboard = parseDashboard(body, [1])
    expect(dashboard.vars).toEqual({ show_deleted: 'No' })
  })

  it('resolves the datasource from the datasource variable when panels template it', () => {
    expect(parseDashboard(body, [1]).datasourceUid).toBe('P123')
  })

  it('prefers a panel-level literal datasource uid over the variable', () => {
    const withPanelUid = {
      dashboard: {
        panels: [
          {
            id: 1,
            title: 'CPU',
            type: 'graph',
            targets: [{ rawSql: 'select 1' }],
            datasource: { uid: 'PANEL_DS' },
          },
        ],
        templating: {
          list: [{ name: 'datasource', type: 'datasource', current: { value: 'P123' } }],
        },
      },
    }
    expect(parseDashboard(withPanelUid, [1]).datasourceUid).toBe('PANEL_DS')
  })

  it('leaves the datasource undefined when nothing usable is present', () => {
    expect(parseDashboard({ dashboard: { panels: [] } }, []).datasourceUid).toBeUndefined()
  })
})

describe('parseChart', () => {
  it('reads a gauge (table) frame as a single value', () => {
    const chart = parseChart(gauge, [
      { schema: { fields: [{ name: 'avg', type: 'number' }] }, data: { values: [[42]] } },
    ])
    expect(chart.time).toBe(false)
    expect(chart.value).toBe(42)
    expect(chart.series).toEqual([])
  })

  it('reads a time-series frame into per-field series, sorted by time', () => {
    const chart = parseChart(graph, [
      {
        schema: {
          fields: [
            { name: 'Time', type: 'time' },
            { name: 'CPU', type: 'number' },
            { name: 'Peak', type: 'number' },
          ],
        },
        // column-oriented: [timeCol, cpuCol, peakCol]
        data: {
          values: [
            [200, 100],
            [5, 3],
            [9, 7],
          ],
        },
      },
    ])
    expect(chart.time).toBe(true)
    expect(chart.series.map((entry) => entry.name)).toEqual(['CPU', 'Peak'])
    expect(chart.series.find((entry) => entry.name === 'CPU')?.points).toEqual([
      { x: 100, y: 3 },
      { x: 200, y: 5 },
    ])
  })

  it('merges the same series across frames (target A + B) and sorts by time', () => {
    const chart = parseChart(graph, [
      {
        schema: {
          fields: [
            { name: 'Time', type: 'time' },
            { name: 'CPU', type: 'number' },
          ],
        },
        data: { values: [[300], [9]] },
      },
      {
        schema: {
          fields: [
            { name: 'Time', type: 'time' },
            { name: 'CPU', type: 'number' },
          ],
        },
        data: {
          values: [
            [100, 200],
            [5, 7],
          ],
        },
      },
    ])
    expect(chart.series[0].points).toEqual([
      { x: 100, y: 5 },
      { x: 200, y: 7 },
      { x: 300, y: 9 },
    ])
  })

  it('drops non-finite values', () => {
    const chart = parseChart(graph, [
      {
        schema: {
          fields: [
            { name: 'Time', type: 'time' },
            { name: 'v', type: 'number' },
          ],
        },
        data: {
          values: [
            [100, 200],
            [5, 'x'],
          ],
        },
      },
    ])
    expect(chart.series[0].points).toEqual([{ x: 100, y: 5 }])
  })
})
