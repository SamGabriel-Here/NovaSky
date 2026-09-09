import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NavRail } from '@renderer/components/NavRail'
import { ZenMode } from '@renderer/components/ZenMode'
import { useAppStore } from '@renderer/state/useAppStore'
import { bridge, seedStore } from './harness'

/** Sirius and the Orion Nebula, by their catalogue ids. */
const SIRIUS = 'star:32263'
const M42 = 'dso:NGC1976'

describe('entering and leaving zen mode', () => {
  it('is off until asked for, and renders nothing', () => {
    seedStore()
    render(<ZenMode />)
    expect(useAppStore.getState().zenMode).toBe(false)
    expect(screen.queryByText(/crosshair/i)).not.toBeInTheDocument()
  })

  it('goes fullscreen and clears anything sitting on top of the sky', async () => {
    seedStore()
    useAppStore.setState({
      screen: 'events',
      searchOpen: true,
      timeMachineOpen: true,
      selectedId: SIRIUS
    })

    await useAppStore.getState().setZenMode(true)

    const state = useAppStore.getState()
    expect(state.zenMode).toBe(true)
    expect(state.screen).toBe('sky')
    expect(state.searchOpen).toBe(false)
    expect(state.timeMachineOpen).toBe(false)
    expect(state.selectedId).toBeNull()
    expect(bridge.setFullscreen).toHaveBeenCalledWith(true)
  })

  it('leaves fullscreen and drops the selection on the way out', async () => {
    seedStore()
    await useAppStore.getState().setZenMode(true)
    useAppStore.getState().select(SIRIUS)

    await useAppStore.getState().setZenMode(false)

    const state = useAppStore.getState()
    expect(state.zenMode).toBe(false)
    // Otherwise the ordinary layout returns with a details panel already open.
    expect(state.selectedId).toBeNull()
    expect(state.aimedId).toBeNull()
    expect(bridge.setFullscreen).toHaveBeenLastCalledWith(false)
  })

  it('stays usable when the window manager refuses fullscreen', async () => {
    seedStore()
    bridge.setFullscreen.mockRejectedValueOnce(new Error('refused'))
    await useAppStore.getState().setZenMode(true)
    // The mode is the point; fullscreen is a nicety on top of it.
    expect(useAppStore.getState().zenMode).toBe(true)
  })
})

describe('the crosshair', () => {
  it('names whatever it is pointing at', async () => {
    seedStore()
    await useAppStore.getState().setZenMode(true)
    useAppStore.getState().setAimed(SIRIUS)
    render(<ZenMode />)

    expect(await screen.findByText('Sirius')).toBeInTheDocument()
  })

  it('says so when it is pointing at nothing', async () => {
    seedStore()
    await useAppStore.getState().setZenMode(true)
    useAppStore.getState().setAimed(null)
    render(<ZenMode />)

    expect(screen.getByText(/nothing under the crosshair/i)).toBeInTheDocument()
  })

  it('keeps aiming separate from selecting', async () => {
    seedStore()
    await useAppStore.getState().setZenMode(true)
    useAppStore.getState().setAimed(M42)
    // Sweeping the crosshair over something must not select it.
    expect(useAppStore.getState().selectedId).toBeNull()
  })
})

describe('locking on', () => {
  it('replaces the name with a card of the figures worth having outside', async () => {
    seedStore()
    await useAppStore.getState().setZenMode(true)
    useAppStore.setState({ aimedId: SIRIUS, selectedId: SIRIUS })
    render(<ZenMode />)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sirius' })).toBeInTheDocument())
    expect(screen.getByText('alt')).toBeInTheDocument()
    expect(screen.getByText('az')).toBeInTheDocument()
    expect(screen.getByText('mag')).toBeInTheDocument()
    expect(screen.getByText(/Esc to let go/)).toBeInTheDocument()
  })

  it('shows the location and time quietly rather than in the card', async () => {
    seedStore()
    await useAppStore.getState().setZenMode(true)
    render(<ZenMode />)
    expect(screen.getByText(/Royal Observatory, Greenwich/)).toBeInTheDocument()
  })
})

describe('reaching zen mode from the sidebar', () => {
  it('offers it below the screens, since it is not one of them', () => {
    seedStore()
    render(<NavRail />)
    const zen = screen.getByRole('button', { name: /zen/i })
    // The screen list is a set of pages; zen mode replaces the window instead.
    expect(zen).not.toHaveAttribute('aria-current')
  })

  it('goes fullscreen when clicked, the same as pressing Z', async () => {
    seedStore()
    render(<NavRail />)

    await userEvent.click(screen.getByRole('button', { name: /zen/i }))

    await waitFor(() => expect(useAppStore.getState().zenMode).toBe(true))
    expect(bridge.setFullscreen).toHaveBeenCalledWith(true)
  })
})
