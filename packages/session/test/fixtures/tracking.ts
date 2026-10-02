import type { LiveTracking } from '@fixmate/api-client'

/**
 * One tracking payload, shaped exactly as `LiveTrackingController` answers.
 *
 * Shared because two test files need it and a copy in each would drift — and a
 * fixture that has drifted from the schema is worse than no fixture, because the
 * failure it produces reads like a bug in the screen. This one is caught by
 * TypeScript at the point of use, because `LiveTracking` is a declared type
 * rather than a shape somebody described in prose.
 *
 * It is the controller's own literal, not an idealised version of it: the booking
 * identifier is the one the controller writes, the stage list is the one it
 * writes, and the two completed stages carry the two timestamps it writes. So a
 * change to the controller that a screen could not cope with shows up here as a
 * type error rather than as a rendering surprise.
 *
 * ## The positions worth testing
 *
 * Two completed, one active, one upcoming — which is the middle of the lifecycle
 * and the position the design draws. The all-complete and none-complete cases
 * are not here on purpose: they are the two a single fixture cannot be, and
 * `reachedStage` in `customer-dashboard.tsx` is a pure function precisely so both
 * can be checked without inventing a second fixture.
 */
export const TRACKING: LiveTracking = {
    booking_id: 'BK-2041',
    status: 'on_the_way',
    service: 'Kitchen sink leak',
    worker: {
        id: 'WK-118',
        name: 'Imran Qureshi',
        phone: null,
        rating: 4.8,
        photo_url: null,
    },
    location: {
        worker_lat: 12.9719,
        worker_lng: 77.5946,
        destination_lat: 12.9784,
        destination_lng: 77.5912,
        distance_km: 0.8,
        eta_minutes: 5,
    },
    stages: [
        { name: 'Accepted', completed: true, timestamp: '2026-10-02T09:00:00+00:00' },
        { name: 'On the way', completed: true, timestamp: '2026-10-02T09:09:00+00:00' },
        { name: 'Arriving now', completed: false, timestamp: null },
        { name: 'Work completed', completed: false, timestamp: null },
    ],
}
