import { describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataRow, OriginBadge, Toggle, Tooltip } from '@renderer/components/ui'
import { ObjectDetails } from '@renderer/components/ObjectDetails'
import { buildSnapshot } from '@shared/astro/ephemeris'
import { GREENWICH, testCatalog } from '../fixtures'
import { useAppStore, useEffectiveSettings } from '@renderer/state/useAppStore'
import { bridge, seedStore } from './harness'

describe('Toggle', () => {
  it('exposes itself as a switch with the right state', () => {
    render(<Toggle checked={false} onChange={() => {}} label="Constellation lines" />)
    const control = screen.getByRole('switch', { name: 'Constellation lines' })
    expect(control).toHaveAttribute('aria-checked', 'false')
  })

  it('reports the new value when clicked', async () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} label="Star names" />)
    await userEvent.click(screen.getByRole('switch', { name: 'Star names' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('does not fire when disabled', async () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} label="Satellites" disabled />)
    await userEvent.click(screen.getByRole('switch', { name: 'Satellites' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows its description', () => {
    render(<Toggle checked onChange={() => {}} label="Beginner mode" description="Bright stars only." />)
    expect(screen.getByText('Bright stars only.')).toBeInTheDocument()
  })
})

describe('Tooltip', () => {
  it('appears on hover and is linked to its trigger for screen readers', async () => {
    render(
      <Tooltip label="Angle above the horizon">
        <button type="button">Altitude</button>
      </Tooltip>
    )
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await userEvent.hover(screen.getByRole('button', { name: 'Altitude' }))
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('Angle above the horizon')
  })
})

describe('OriginBadge', () => {
  it('labels where a value came from', () => {
    const { rerender } = render(<OriginBadge origin="calculated" />)
    expect(screen.getByText('Calculated')).toBeInTheDocument()
    rerender(<OriginBadge origin="cached" />)
    expect(screen.getByText('Cached')).toBeInTheDocument()
  })
})

describe('DataRow', () => {
  it('renders a label and value pair', () => {
    render(
      <dl>
        <DataRow label="Altitude" value="34.2°" />
      </dl>
    )
    expect(screen.getByText('Altitude')).toBeInTheDocument()
    expect(screen.getByText('34.2°')).toBeInTheDocument()
  })
})

describe('ObjectDetails', () => {
  const catalog = testCatalog()
  const snapshotFor = (id: string) => {
    const object = catalog.objects.get(id)
    if (!object) throw new Error(`missing ${id}`)
    return buildSnapshot(object, new Date('2027-01-15T22:00:00Z'), GREENWICH, catalog)
  }

  it('shows the name, type, visibility and the key measurements', () => {
    seedStore()
    render(<ObjectDetails snapshot={snapshotFor('star:32263')} />)

    expect(screen.getByRole('heading', { name: 'Sirius' })).toBeInTheDocument()
    expect(screen.getByText('Altitude')).toBeInTheDocument()
    expect(screen.getByText('Azimuth')).toBeInTheDocument()
    expect(screen.getByText('Magnitude')).toBeInTheDocument()
    expect(screen.getByText('-1.44')).toBeInTheDocument()
    expect(screen.getByText('Best viewing')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('attributes every value to its source', () => {
    seedStore()
    render(<ObjectDetails snapshot={snapshotFor('star:32263')} />)
    // Position is computed; the magnitude is read from the catalogue.
    expect(screen.getAllByText('Calculated').length).toBeGreaterThan(2)
    expect(screen.getAllByText('Catalogue').length).toBeGreaterThan(0)
  })

  it('shows mythology and a finding hint for a constellation', () => {
    seedStore()
    render(<ObjectDetails snapshot={snapshotFor('con:Ori')} />)
    expect(screen.getByText('Background')).toBeInTheDocument()
    expect(screen.getByText(/great hunter/i)).toBeInTheDocument()
    expect(screen.getByText(/How to find it/)).toBeInTheDocument()
  })

  it('explains that a black hole emits no light', () => {
    seedStore()
    render(<ObjectDetails snapshot={snapshotFor('bh:Cygnus_X-1')} />)
    expect(screen.getByRole('heading', { name: 'Cygnus X-1' })).toBeInTheDocument()
    expect(screen.getByText(/emits no light/i)).toBeInTheDocument()
  })

  it('says a value is absent rather than inventing one', () => {
    seedStore()
    // OpenNGC carries no distances, so the Pleiades entry must admit that.
    render(<ObjectDetails snapshot={snapshotFor('dso:Mel022')} />)
    expect(screen.getAllByText('Not catalogued').length).toBeGreaterThan(0)
  })

  it('opens reference links through the vetted bridge, never directly', async () => {
    seedStore()
    render(<ObjectDetails snapshot={snapshotFor('star:32263')} />)
    const link = screen.getByRole('button', { name: /Wikipedia/ })
    await userEvent.click(link)
    expect(bridge.openExternal).toHaveBeenCalledWith(expect.stringContaining('https://en.wikipedia.org/'))
  })

  it('calls back when closed', async () => {
    seedStore()
    const onClose = vi.fn()
    render(<ObjectDetails snapshot={snapshotFor('star:32263')} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('useEffectiveSettings', () => {
  it('returns the stored settings unchanged when beginner mode is off', () => {
    seedStore({ beginnerMode: false, starMagnitudeLimit: 6 })
    const { result } = renderHook(() => useEffectiveSettings())
    expect(result.current.starMagnitudeLimit).toBe(6)
    expect(result.current.showDeepSky).toBe(true)
  })

  it('applies the beginner overrides without touching what is stored', () => {
    seedStore({ beginnerMode: true, starMagnitudeLimit: 6, showDeepSky: true })
    const { result } = renderHook(() => useEffectiveSettings())
    expect(result.current.starMagnitudeLimit).toBe(3.5)
    expect(result.current.showDeepSky).toBe(false)
    // The user's own preferences survive, so turning beginner mode off restores them.
    expect(useAppStore.getState().settings.starMagnitudeLimit).toBe(6)
    expect(useAppStore.getState().settings.showDeepSky).toBe(true)
  })

  it('is referentially stable across re-renders in beginner mode', () => {
    // A new object on every render makes useSyncExternalStore think the store changed,
    // which sends React into an infinite update loop and blanks the sky screen.
    seedStore({ beginnerMode: true })
    const { result, rerender } = renderHook(() => useEffectiveSettings())
    const first = result.current
    rerender()
    rerender()
    expect(result.current).toBe(first)
  })

  it('produces a new object only when the settings actually change', () => {
    seedStore({ beginnerMode: true })
    const { result, rerender } = renderHook(() => useEffectiveSettings())
    const before = result.current
    act(() => {
      // showHorizon is not one of the beginner overrides, so it passes straight through.
      useAppStore.setState((state) => ({ settings: { ...state.settings, showHorizon: false } }))
    })
    rerender()
    expect(result.current).not.toBe(before)
    expect(result.current.showHorizon).toBe(false)
  })
})
