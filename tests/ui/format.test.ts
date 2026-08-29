import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatMagnitude,
  formatRelative,
  formatTime,
  fromLocalInputValue,
  timeZoneLabel,
  toLocalInputValue,
  zoneOffsetMs
} from '@renderer/lib/format'
import { INDORE, GREENWICH } from '../fixtures'

describe('time formatting', () => {
  it('renders a timestamp in the observer time zone, not the machine one', () => {
    // 18:30 UTC is midnight in India and half past six in the evening in London.
    // The app deliberately formats in the user's own locale, so the assertion accepts
    // both 24-hour and 12-hour renderings.
    const utc = new Date('2027-03-15T18:30:00Z')
    expect(formatTime(utc, INDORE)).toMatch(/^(00:00|12:00\s?AM)$/)
    expect(formatTime(utc, GREENWICH)).toMatch(/^(18:30|06:30\s?PM)$/)
    expect(formatTime(utc, INDORE)).not.toBe(formatTime(utc, GREENWICH))
  })

  it('agrees with the time-zone-independent input encoding', () => {
    const utc = new Date('2027-03-15T18:30:00Z')
    expect(toLocalInputValue(utc, INDORE)).toBe('2027-03-16T00:00')
    expect(toLocalInputValue(utc, GREENWICH)).toBe('2027-03-15T18:30')
  })

  it('renders the date in the observer time zone', () => {
    const utc = new Date('2027-03-15T18:30:00Z')
    // Already the 16th in India while it is still the 15th in London.
    expect(formatDate(utc, INDORE)).toContain('16')
    expect(formatDate(utc, GREENWICH)).toContain('15')
  })

  it('renders an em dash for a missing time', () => {
    expect(formatTime(null, INDORE)).toBe('—')
    expect(formatDate(null, INDORE)).toBe('—')
  })

  it('labels the zone offset', () => {
    expect(timeZoneLabel(INDORE, new Date('2027-03-15T00:00:00Z'))).toContain('5:30')
  })
})

describe('relative time', () => {
  const now = new Date('2027-03-15T12:00:00Z')

  it('describes the future and the past', () => {
    expect(formatRelative(new Date('2027-03-18T12:00:00Z'), now)).toMatch(/3 days|in 3/)
    expect(formatRelative(new Date('2027-03-15T10:00:00Z'), now)).toMatch(/2 hours ago|ago/)
  })

  it('is measured against the moment it is given, not the wall clock', () => {
    // The Events screen passes the sky time, so a date near it must read as "soon"
    // even when the real clock is years away.
    const skyTime = new Date('2030-01-01T00:00:00Z')
    const soon = new Date('2030-01-03T00:00:00Z')
    expect(formatRelative(soon, skyTime)).toMatch(/2 days|in 2/)
  })
})

describe('datetime-local round trip', () => {
  it('round trips through the observer time zone', () => {
    for (const location of [INDORE, GREENWICH]) {
      for (const iso of [
        '2027-03-15T18:30:00Z',
        '2027-01-01T00:00:00Z',
        '2027-07-04T23:59:00Z',
        '2027-12-31T12:00:00Z'
      ]) {
        const date = new Date(iso)
        const value = toLocalInputValue(date, location)
        expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
        const parsed = fromLocalInputValue(value, location)
        expect(parsed).not.toBeNull()
        // Round tripping is exact to the minute, which is the input's resolution.
        expect(Math.abs((parsed as Date).getTime() - date.getTime())).toBeLessThan(60000)
      }
    }
  })

  it('survives a daylight-saving transition', () => {
    // British Summer Time began on 28 March 2027 at 01:00 UTC.
    const before = new Date('2027-03-27T23:00:00Z')
    const after = new Date('2027-03-28T09:00:00Z')
    for (const date of [before, after]) {
      const parsed = fromLocalInputValue(toLocalInputValue(date, GREENWICH), GREENWICH)
      expect(Math.abs((parsed as Date).getTime() - date.getTime())).toBeLessThan(60000)
    }
  })

  it('rejects malformed input', () => {
    expect(fromLocalInputValue('', INDORE)).toBeNull()
    expect(fromLocalInputValue('not-a-date', INDORE)).toBeNull()
    expect(fromLocalInputValue('2027-03-15', INDORE)).toBeNull()
  })

  it('computes zone offsets', () => {
    expect(zoneOffsetMs(new Date('2027-01-01T00:00:00Z'), 'Asia/Kolkata')).toBe(5.5 * 3600000)
    expect(zoneOffsetMs(new Date('2027-01-01T00:00:00Z'), 'UTC')).toBe(0)
    // London is on GMT in January and BST in July.
    expect(zoneOffsetMs(new Date('2027-07-01T00:00:00Z'), 'Europe/London')).toBe(3600000)
  })
})

describe('formatMagnitude', () => {
  it('shows two decimals, or says the value is missing', () => {
    expect(formatMagnitude(-1.44)).toBe('-1.44')
    expect(formatMagnitude(null)).toBe('Not catalogued')
  })
})
