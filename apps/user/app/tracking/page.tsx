'use client'

import { LiveTracking } from '@fixmate/session'
import { operations } from '@/lib/application'

/**
 * The Live Mistri Tracker screen, at `/tracking/`.
 *
 * Delegation only. The screen is in `@fixmate/session` because it draws its own
 * header, and an application page that drew one would be caught by
 * `FrontEndApplicationsTest` — which is the check that keeps the four
 * applications thin.
 *
 * `loadTracking` is handed over rather than called here so the screen decides
 * when to fetch. That is also what makes it testable: given a function, all
 * three of its states render without a network at all.
 */
export default function TrackingPage() {
    return <LiveTracking loadTracking={() => operations.tracking()} />
}