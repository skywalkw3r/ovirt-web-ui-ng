import { useId } from 'react'
import chart_color_black_300 from '@patternfly/react-tokens/dist/esm/chart_color_black_300'

// A dependency-free SVG donut for the VM, host and cluster Monitoring gauges.
// It replaced PatternFly's Victory-backed ChartDonut, a 270 KB (73 KB
// gzipped) chart runtime that was a lot to ship for a ring and a number,
// while keeping the same anatomy: segments clockwise from 12 o'clock, a centred headline with a
// subtle qualifier under it, an accessible <title>/<desc> pair, and a native
// tooltip per segment.

export interface DonutSegment {
  label: string
  value: number
  color: string
}

// The "rest of the ring" colour: the Available slice of a utilization donut,
// and the whole ring when there is nothing to chart.
export const DONUT_TRACK_COLOR = chart_color_black_300.var
const TEXT_FILL = 'var(--pf-t--global--text--color--regular)'
const SUBTLE_FILL = 'var(--pf-t--global--text--color--subtle)'

export interface DonutProps {
  // drawn in order; non-positive values are skipped
  segments: DonutSegment[]
  // centre text: the headline value and an optional qualifier under it
  title: string
  subTitle?: string
  // the SVG's accessible name and description
  ariaTitle: string
  ariaDesc: string
  // per-segment native tooltip; defaults to "label: value"
  tooltip?: (segment: DonutSegment) => string
  // viewBox size; the SVG scales down with its container
  width?: number
  height?: number
  // gap between the ring and the viewBox edge
  padding?: number
  // ring thickness
  thickness?: number
  // rides on the SVG as data-name — a stable hook for tests
  name?: string
}

const DEFAULT_SIZE = 135
const DEFAULT_PADDING = 10
// A slim ring: the fill proportion is the signal, and a fat band crowds the
// centre text at the 135px gauge size.
const DEFAULT_THICKNESS = 12
// PatternFly's donut label sizes, so the swap reads the same as before.
const TITLE_FONT_PX = 24
const SUBTITLE_FONT_PX = 14

export function Donut({
  segments,
  title,
  subTitle,
  ariaTitle,
  ariaDesc,
  tooltip,
  width = DEFAULT_SIZE,
  height = width,
  padding = DEFAULT_PADDING,
  thickness = DEFAULT_THICKNESS,
  name,
}: DonutProps) {
  const id = useId()
  const titleId = `${id}-title`
  const descId = `${id}-desc`
  const cx = width / 2
  const cy = height / 2
  // the stroke is centred on the radius, so half the thickness sits outside it
  const radius = Math.min(width, height) / 2 - padding - thickness / 2
  const circumference = 2 * Math.PI * radius

  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0)
  let start = 0
  const arcs =
    total > 0
      ? segments
          .filter((segment) => segment.value > 0)
          .map((segment) => {
            const length = (segment.value / total) * circumference
            const arc = { segment, length, start }
            start += length
            return arc
          })
      : []

  // An SVG circle's stroke starts at 3 o'clock and runs clockwise; the rotate
  // moves the start to 12 o'clock. Each arc is a dash of its own length in a
  // pattern as long as the ring, offset to begin where the previous one ended.
  const ring = {
    cx,
    cy,
    r: radius,
    fill: 'none',
    strokeWidth: thickness,
    transform: `rotate(-90 ${cx} ${cy})`,
  }
  const titleY = subTitle === undefined ? cy : cy - SUBTITLE_FONT_PX * 0.45

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-name={name}
    >
      <title id={titleId}>{ariaTitle}</title>
      <desc id={descId}>{ariaDesc}</desc>
      {arcs.length === 0 && <circle {...ring} stroke={DONUT_TRACK_COLOR} />}
      {arcs.map(({ segment, length, start: offset }, index) => (
        <circle
          key={`${segment.label}-${index}`}
          {...ring}
          stroke={segment.color}
          strokeDasharray={`${length} ${circumference - length}`}
          strokeDashoffset={-offset}
          data-segment={segment.label}
        >
          <title>{tooltip ? tooltip(segment) : `${segment.label}: ${segment.value}`}</title>
        </circle>
      ))}
      <text
        x={cx}
        y={titleY}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fill: TEXT_FILL, fontSize: TITLE_FONT_PX }}
      >
        {title}
      </text>
      {subTitle !== undefined && (
        <text
          x={cx}
          y={cy + TITLE_FONT_PX * 0.55}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fill: SUBTLE_FILL, fontSize: SUBTITLE_FONT_PX }}
        >
          {subTitle}
        </text>
      )}
    </svg>
  )
}
