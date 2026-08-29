import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchPalette } from '@renderer/components/SearchPalette'
import { TimeMachine } from '@renderer/components/TimeMachine'
import { Onboarding } from '@renderer/components/Onboarding'
import { useAppStore } from '@renderer/state/useAppStore'
import { bridge, seedStore } from './harness'

describe('SearchPalette', () => {
  it('is closed until the store opens it', () => {
    seedStore()
    render(<SearchPalette />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('searches the offline catalogue as you type', async () => {
    seedStore()
    useAppStore.setState({ searchOpen: true })
    render(<SearchPalette />)

    const input = screen.getByRole('textbox', { name: 'Search the sky' })
    await userEvent.type(input, 'Betelgeuse')
    expect(await screen.findByRole('option', { name: /Betelgeuse/ })).toBeInTheDocument()
  })

  it('finds a Messier object by catalogue number', async () => {
    seedStore()
    useAppStore.setState({ searchOpen: true })
    render(<SearchPalette />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Search the sky' }), 'M42')
    expect(await screen.findByRole('option', { name: /Orion Nebula/ })).toBeInTheDocument()
  })

  it('selects a result with the keyboard and shows it on the sky map', async () => {
    seedStore()
    useAppStore.setState({ searchOpen: true })
    render(<SearchPalette />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Search the sky' }), 'Polaris')
    // "Polaris" also prefix-matches Polaris Australis; the exact match ranks first.
    const options = await screen.findAllByRole('option')
    expect(options[0]).toHaveTextContent('Polaris')
    await userEvent.keyboard('{Enter}')

    await waitFor(() => {
      const state = useAppStore.getState()
      expect(state.selectedId).toBe('star:11734')
      expect(state.screen).toBe('sky')
      expect(state.searchOpen).toBe(false)
      // Selecting from search also recentres the map.
      expect(state.focusRequest?.id).toBe('star:11734')
    })
  })

  it('moves the highlight with the arrow keys', async () => {
    seedStore()
    useAppStore.setState({ searchOpen: true })
    render(<SearchPalette />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Search the sky' }), 'and')
    const options = await screen.findAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{ArrowDown}')
    expect((await screen.findAllByRole('option'))[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('explains an empty result set', async () => {
    seedStore()
    useAppStore.setState({ searchOpen: true })
    render(<SearchPalette />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Search the sky' }), 'zzzqqq')
    expect(await screen.findByText(/Nothing matches/)).toBeInTheDocument()
  })

  it('offers starting suggestions before anything is typed', () => {
    seedStore()
    useAppStore.setState({ searchOpen: true })
    render(<SearchPalette />)
    expect(screen.getByRole('button', { name: 'Orion' })).toBeInTheDocument()
  })
})

describe('TimeMachine', () => {
  it('is hidden until opened', () => {
    seedStore()
    render(<TimeMachine />)
    expect(screen.queryByRole('region', { name: 'Time Machine' })).not.toBeInTheDocument()
  })

  it('shows the current sky time in the observer time zone', () => {
    seedStore()
    useAppStore.setState({ timeMachineOpen: true, time: new Date('2027-01-15T22:00:00Z') })
    render(<TimeMachine />)
    // Greenwich is on GMT in January.
    expect(screen.getByLabelText('Date and time')).toHaveValue('2027-01-15T22:00')
  })

  it('shifts the sky time by an hour', async () => {
    seedStore()
    const start = new Date('2027-01-15T22:00:00Z')
    useAppStore.setState({ timeMachineOpen: true, time: start })
    render(<TimeMachine />)

    await userEvent.click(screen.getByRole('button', { name: '+1h' }))
    const after = useAppStore.getState().time
    expect(after.getTime() - start.getTime()).toBe(3600000)
    // Moving the clock leaves live mode.
    expect(useAppStore.getState().live).toBe(false)
  })

  it('returns to the present', async () => {
    seedStore()
    useAppStore.setState({ timeMachineOpen: true, live: false })
    render(<TimeMachine />)
    await userEvent.click(screen.getByRole('button', { name: 'Now' }))
    expect(useAppStore.getState().live).toBe(true)
  })

  it('accepts a typed date and applies it to the sky', async () => {
    seedStore()
    useAppStore.setState({ timeMachineOpen: true })
    render(<TimeMachine />)

    // A datetime-local input is edited segment by segment by real users and by the
    // native picker; firing the change directly is the faithful equivalent.
    fireEvent.change(screen.getByLabelText('Date and time'), {
      target: { value: '2030-06-21T21:15' }
    })

    await waitFor(() => {
      const time = useAppStore.getState().time
      expect(time.getUTCFullYear()).toBe(2030)
      expect(time.getUTCMonth()).toBe(5)
    })
  })

  it('starts and stops playback', async () => {
    seedStore()
    useAppStore.setState({ timeMachineOpen: true })
    render(<TimeMachine />)
    await userEvent.click(screen.getByRole('button', { name: 'Play sky forward' }))
    expect(useAppStore.getState().playing).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Pause sky playback' }))
    expect(useAppStore.getState().playing).toBe(false)
  })

  it('offers jump targets drawn from tonight’s twilight times', () => {
    seedStore()
    useAppStore.setState({ timeMachineOpen: true })
    render(<TimeMachine />)
    expect(screen.getByRole('button', { name: /Sunset/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Full dark/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dawn/ })).toBeInTheDocument()
  })

  it('closes on request', async () => {
    seedStore()
    useAppStore.setState({ timeMachineOpen: true })
    render(<TimeMachine />)
    await userEvent.click(screen.getByRole('button', { name: 'Close Time Machine' }))
    expect(useAppStore.getState().timeMachineOpen).toBe(false)
  })
})

describe('Onboarding', () => {
  it('walks through its steps and can be skipped at any point', async () => {
    seedStore({ onboardingComplete: false })
    useAppStore.setState({ onboardingOpen: true })
    render(<Onboarding />)

    expect(screen.getByRole('heading', { name: 'Welcome to NovaSky' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByRole('heading', { name: /Where are you observing from/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(useAppStore.getState().onboardingOpen).toBe(false))
    expect(bridge.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingComplete: true })
    )
  })

  it('asks before turning notifications on', async () => {
    seedStore({ onboardingComplete: false })
    useAppStore.setState({ onboardingOpen: true })
    render(<Onboarding />)

    // Step forward to the notifications step.
    for (let i = 0; i < 4; i++) {
      await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    }
    expect(screen.getByRole('heading', { name: /Notifications/ })).toBeInTheDocument()
    const toggle = screen.getByRole('switch', { name: 'Send me desktop notifications' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(toggle)
    expect(bridge.enableNotifications).toHaveBeenCalledWith(true)
  })
})
