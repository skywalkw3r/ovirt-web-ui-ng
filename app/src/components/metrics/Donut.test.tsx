// @vitest-environment jsdom
import '../../test/env'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Donut } from './Donut'

const USED_AVAILABLE = [
  { label: 'Used', value: 65, color: 'red' },
  { label: 'Available', value: 35, color: 'grey' },
]

// 135px box, 10px padding, 12px ring → the stroke runs on a 51.5px radius
const RING_LENGTH = 2 * Math.PI * 51.5

const dashLength = (arc: Element) => Number(arc.getAttribute('stroke-dasharray')?.split(' ')[0])

describe('Donut', () => {
  it('is an image named by its title, described by its desc, with the centre text inline', () => {
    render(
      <Donut
        segments={USED_AVAILABLE}
        title="65%"
        subTitle="used"
        ariaTitle="CPU utilization"
        ariaDesc="CPU: 65 percent used"
      />,
    )
    const svg = screen.getByRole('img', { name: 'CPU utilization' })
    expect(svg.querySelector('desc')?.textContent).toBe('CPU: 65 percent used')
    expect(svg.querySelectorAll('text')[0]?.textContent).toBe('65%')
    expect(svg.querySelectorAll('text')[1]?.textContent).toBe('used')
  })

  it('draws each positive segment as a proportional arc, clockwise from 12 o’clock', () => {
    const { container } = render(
      <Donut segments={USED_AVAILABLE} title="65%" ariaTitle="CPU" ariaDesc="65 percent" />,
    )
    const arcs = container.querySelectorAll('circle[data-segment]')
    expect(arcs).toHaveLength(2)
    expect(dashLength(arcs[0]!)).toBeCloseTo(0.65 * RING_LENGTH, 6)
    expect(Number(arcs[0]!.getAttribute('stroke-dashoffset'))).toBe(0)
    expect(dashLength(arcs[1]!)).toBeCloseTo(0.35 * RING_LENGTH, 6)
    expect(Number(arcs[1]!.getAttribute('stroke-dashoffset'))).toBeCloseTo(-0.65 * RING_LENGTH, 6)
    expect(arcs[0]!.getAttribute('transform')).toBe('rotate(-90 67.5 67.5)')
    expect(arcs[0]!.getAttribute('stroke')).toBe('red')
    // no bare track behind real segments
    expect(container.querySelectorAll('circle')).toHaveLength(2)
  })

  it('names each arc with the caller’s tooltip, or label: value by default', () => {
    const { container, rerender } = render(
      <Donut segments={USED_AVAILABLE} title="65%" ariaTitle="CPU" ariaDesc="65 percent" />,
    )
    expect(container.querySelector('circle[data-segment="Used"] title')?.textContent).toBe(
      'Used: 65',
    )
    rerender(
      <Donut
        segments={USED_AVAILABLE}
        title="65%"
        ariaTitle="CPU"
        ariaDesc="65 percent"
        tooltip={(segment) => `${segment.label}: ${Math.round(segment.value)}%`}
      />,
    )
    expect(container.querySelector('circle[data-segment="Used"] title')?.textContent).toBe(
      'Used: 65%',
    )
  })

  it('skips empty segments and shows a plain track when nothing is charted', () => {
    const { container, rerender } = render(
      <Donut
        segments={[
          { label: 'Running', value: 3, color: 'green' },
          { label: 'Paused', value: 0, color: 'yellow' },
        ]}
        title="3"
        ariaTitle="VMs by status"
        ariaDesc="3 VMs"
      />,
    )
    expect(container.querySelectorAll('circle[data-segment]')).toHaveLength(1)
    expect(dashLength(container.querySelector('circle[data-segment]')!)).toBeCloseTo(RING_LENGTH, 6)

    rerender(
      <Donut
        segments={[{ label: 'Running', value: 0, color: 'green' }]}
        title="0"
        ariaTitle="VMs by status"
        ariaDesc="no VMs"
      />,
    )
    expect(container.querySelectorAll('circle[data-segment]')).toHaveLength(0)
    expect(container.querySelectorAll('circle')).toHaveLength(1)
  })

  it('scales the ring to the box it is given', () => {
    const { container } = render(
      <Donut
        segments={USED_AVAILABLE}
        title="65%"
        ariaTitle="CPU"
        ariaDesc="65 percent"
        width={230}
        height={200}
        padding={20}
      />,
    )
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 230 200')
    // the ring fits the shorter side: 200 / 2 − 20 padding − 6 half-stroke
    expect(container.querySelector('circle')!.getAttribute('r')).toBe('74')
    expect(container.querySelector('circle')!.getAttribute('cx')).toBe('115')
  })
})
