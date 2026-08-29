/**
 * Desktop notifications for upcoming astronomical events.
 *
 * Notifications are opt-in: nothing is scheduled until the user answers the permission
 * prompt in the app and `notificationsEnabled` is stored. Turning the setting off
 * cancels every pending timer immediately.
 */
import { Notification } from 'electron'
import type { AstroEvent, AstroEventKind, Settings } from '../shared/types'
import { getEvents } from '../shared/astro/events'

/** How far ahead events are scheduled in one pass. */
const HORIZON_DAYS = 7
/** Lead time before the event itself. */
const LEAD_MINUTES = 60
/** setTimeout cannot be trusted beyond this, so the scheduler re-runs periodically. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1
const RESCHEDULE_INTERVAL_MS = 6 * 60 * 60 * 1000

export class NotificationScheduler {
  private timers: NodeJS.Timeout[] = []
  private rescheduleTimer: NodeJS.Timeout | null = null
  private notified = new Set<string>()

  /** Rebuilds the schedule from the current settings. Safe to call repeatedly. */
  refresh(settings: Settings, now: Date = new Date()): AstroEvent[] {
    this.cancel()
    if (!settings.notificationsEnabled) return []
    if (!Notification.isSupported()) return []

    const kinds = new Set<AstroEventKind>(settings.notificationKinds)
    const events = getEvents({
      from: now,
      to: new Date(now.getTime() + HORIZON_DAYS * 86400000),
      location: settings.location,
      kinds: settings.notificationKinds
    }).filter((event) => kinds.has(event.kind))

    for (const event of events) {
      const fireAt = new Date(event.time).getTime() - LEAD_MINUTES * 60000
      const delay = fireAt - now.getTime()
      if (delay < 0 || delay > MAX_TIMEOUT_MS) continue
      const timer = setTimeout(() => this.show(event), delay)
      // Do not hold the app open just to deliver a notification.
      timer.unref?.()
      this.timers.push(timer)
    }

    this.rescheduleTimer = setTimeout(() => this.refresh(settings), RESCHEDULE_INTERVAL_MS)
    this.rescheduleTimer.unref?.()
    return events
  }

  private show(event: AstroEvent): void {
    if (this.notified.has(event.id)) return
    this.notified.add(event.id)
    const local = new Date(event.time).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    })
    new Notification({
      title: `NovaSky: ${event.title}`,
      body: `${local} · ${event.localVisibility ?? event.description}`.slice(0, 220),
      silent: false
    }).show()
  }

  /** Fires a sample notification so the user can confirm the permission works. */
  test(): boolean {
    if (!Notification.isSupported()) return false
    new Notification({
      title: 'NovaSky notifications are on',
      body: 'You will get a heads-up an hour before the events you selected.'
    }).show()
    return true
  }

  cancel(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers = []
    if (this.rescheduleTimer) clearTimeout(this.rescheduleTimer)
    this.rescheduleTimer = null
  }
}
