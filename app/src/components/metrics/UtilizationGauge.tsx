import { ChartDonut, ChartLabel } from '@patternfly/react-charts/victory'
import chart_color_black_300 from '@patternfly/react-tokens/dist/esm/chart_color_black_300'
import chart_color_blue_300 from '@patternfly/react-tokens/dist/esm/chart_color_blue_300'
import chart_color_red_orange_300 from '@patternfly/react-tokens/dist/esm/chart_color_red_orange_300'
import chart_color_yellow_300 from '@patternfly/react-tokens/dist/esm/chart_color_yellow_300'

const GAUGE = 135
const TEXT_FILL = 'var(--pf-t--global--text--color--regular)'
const SUBTLE_FILL = 'var(--pf-t--global--text--color--subtle)'
const CAPTION = {
  textAlign: 'center',
  color: SUBTLE_FILL,
  fontSize: 'var(--pf-t--global--font--size--sm)',
} as const
// The configured capacity (e.g. "4 vCPU", "32 GiB") reads as a fact, so it sits
// in regular text under the donut; the collecting/unavailable status stays subtle.
const TOTAL_CAPTION = {
  textAlign: 'center',
  color: TEXT_FILL,
  fontSize: 'var(--pf-t--global--font--size--sm)',
} as const

// Utilization severity color — mirrors DashboardPage.usedColorFor so the VM
// gauges read the same as the dashboard's utilization donuts.
function usedColorFor(percent: number): string {
  if (percent >= 90) return chart_color_red_orange_300.var
  if (percent >= 75) return chart_color_yellow_300.var
  return chart_color_blue_300.var
}

// A current-utilization gauge (donut) for one metric, styled like the
// dashboard's donuts. The live plane polls the CURRENT gauge value, and a gauge
// needs only the latest reading (unlike the sparkline it replaces), so it shows
// a value as soon as the first poll lands. `percent` undefined → still
// collecting, or — when the engine reports no gauge for this metric — the
// caption reads "not available".
export function UtilizationGauge({
  title,
  name,
  percent,
  total,
  unavailable,
}: {
  title: string
  name: string
  percent?: number
  // configured capacity caption (e.g. "4 vCPU", "32 GiB"); omitted when unknown
  total?: string
  unavailable: boolean
}) {
  const value = percent === undefined ? undefined : Math.min(100, Math.max(0, percent))
  const color = value === undefined ? chart_color_black_300.var : usedColorFor(value)
  return (
    <div style={{ width: `${GAUGE}px` }}>
      <div
        style={{
          textAlign: 'center',
          fontWeight: 'var(--pf-t--global--font--weight--body--bold)',
        }}
      >
        {title}
      </div>
      {/* maxWidth (not width): the SVG scales down with its column so a narrow
          card never overflows into a scroll region (PF6 cards are overflow:auto) */}
      <div style={{ height: `${GAUGE}px`, maxWidth: `${GAUGE}px`, margin: '0 auto' }}>
        <ChartDonut
          ariaTitle={`${title} utilization`}
          ariaDesc={
            value === undefined
              ? `${title} utilization of this virtual machine is not yet available`
              : `${title}: ${Math.round(value)} percent used`
          }
          constrainToVisibleArea
          data={[
            { x: 'Used', y: value ?? 0 },
            { x: 'Available', y: 100 - (value ?? 0) },
          ]}
          labels={({ datum }: { datum: { x: string; y: number } }) =>
            `${datum.x}: ${Math.round(datum.y)}%`
          }
          colorScale={[color, chart_color_black_300.var]}
          title={value === undefined ? '—' : `${Math.round(value)}%`}
          titleComponent={<ChartLabel style={{ fill: TEXT_FILL }} />}
          subTitle="used"
          subTitleComponent={<ChartLabel style={{ fill: SUBTLE_FILL }} />}
          height={GAUGE}
          width={GAUGE}
          padding={10}
          name={name}
        />
      </div>
      {total !== undefined && <div style={TOTAL_CAPTION}>{total}</div>}
      {value === undefined && (
        <div style={CAPTION}>{unavailable ? 'not available' : 'collecting…'}</div>
      )}
    </div>
  )
}
