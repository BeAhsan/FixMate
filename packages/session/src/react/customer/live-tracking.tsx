'use client'

import type { LiveTracking } from '@fixmate/api-client'
import { Alert } from '@fixmate/ui'
import { MockedDataNotice } from './mocked-data-notice'
import { JAKARTA_FONT_CLASS } from './typeface'
import { ACCENT_TEXT, ACTION, AMBER_TEXT, CARD, GROUND, INK, INK_SOFT } from './tokens'
import { useMockedResource, type MockedResource } from './use-mocked-resource'

/**
 * The Live Mistri Tracker frame, built to the design and fed by the mocked
 * endpoint.
 *
 * ## The screen that most needed the notice
 *
 * This is the one where a fixture is hardest to see. A map with a technician's
 * coordinates on it, an ETA and a four-stage timeline looks exactly like a
 * working tracker, and the difference — that nothing moves, ever, and the
 * coordinates are two fixed points — is invisible in a screenshot and invisible
 * in review. So the disclosure is the first thing on the screen rather than a
 * footnote, and the wording names the specific false impression:
 * **the coordinates do not change between requests.**
 *
 * ## Why there is no map and no polling
 *
 * Both were tempting and both would have made this screen lie convincingly.
 *
 * A map needs a tile provider, an API key and a build-time address, none of which
 * this repository has; what it would actually render is a background image with a
 * marker on it, which is the *most* convincing possible fake. A position plot
 * would be honest by comparison, and is what is here instead: the two coordinates
 * and the distance between them, named as the example they are.
 *
 * Polling is absent because the endpoint does not move. A `setInterval` here
 * would re-request the same literal every few seconds, burn requests, and produce
 * a refresh counter that ticks — which reads as live telemetry and is the most
 * persuasive lie available. The refresh control re-requests on demand instead,
 * and the screen says what a second request will return.
 */
export function LiveTracking({ loadTracking }: { loadTracking: () => Promise<LiveTracking> }) {
    const tracking = useMockedResource(loadTracking, 'tracking')

    return (
        <LiveTrackingScreen
            tracking={tracking}
            onRefresh={tracking.reload}
        />
    )
}

/**
 * The screen, given its state.
 *
 * Split from the fetching for the reason `AiDiagnosisScreen` is: an effect never
 * runs under `renderToStaticMarkup`, so a screen that only exists as a hook can
 * never be shown its ready state in a test. Taking the state as a prop makes the
 * three of them plain objects, and the honest one — a technician standing still
 * — is the one most worth pinning.
 */
export function LiveTrackingScreen({
    tracking,
    onRefresh,
}: {
    tracking: MockedResource<LiveTracking>
    onRefresh: () => void
}) {
    return (
        <div className={`flex min-h-screen flex-col ${GROUND} ${JAKARTA_FONT_CLASS}`}>
            <header className="sticky top-0 z-10 border-b border-[#F1F5F9] bg-[#F8FAFC]/95 backdrop-blur dark:border-[#243350] dark:bg-[#0B1220]/95">
                <div className="mx-auto flex w-full max-w-md items-center gap-4 px-5 py-4">
                    <h1 className={`text-xl font-bold tracking-tight ${INK}`}>Track your technician</h1>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-6">
                <MockedDataNotice detail="The coordinates are two fixed points and do not change between requests, so nothing on this screen is moving." />

                {tracking.status === 'loading' && (
                    <p role="status" className={`text-sm ${INK_SOFT}`}>
                        Loading tracking…
                    </p>
                )}

                {tracking.status === 'failed' && <Alert tone="error">{tracking.message}</Alert>}

                {tracking.status === 'ready' && (
                    <Tracking tracking={tracking.data} onRefresh={onRefresh} />
                )}
            </main>
        </div>
    )
}

/**
 * The position, the technician and the timeline.
 */
function Tracking({ tracking, onRefresh }: { tracking: LiveTracking; onRefresh: () => void }) {
    const { worker, location, stages, status } = tracking

    return (
        <>
            <section
                aria-label="Position"
                className={`flex flex-col gap-4 p-5 ${CARD}`}
            >
                <h2 className={`text-lg font-semibold ${INK}`}>On the way</h2>

                <p className={`text-sm ${INK_SOFT}`}>
                    The technician is about {location.distance_km} km away and roughly{' '}
                    {location.eta_minutes} minutes away. This is an example position and it does not
                    change when you refresh.
                </p>

                {/*
                  The coordinates are shown as text rather than plotted. A plot would
                  imply movement, and there is no motion here to plot: these two points
                  are literals in a controller. Spelled as latitude and longitude so the
                  numbers are recognisable for what they are.
                */}
                <dl className="grid grid-cols-2 gap-3 text-sm">
                    <Coordinate term="Technician" latitude={location.worker_lat} longitude={location.worker_lng} />
                    <Coordinate
                        term="Destination"
                        latitude={location.destination_lat}
                        longitude={location.destination_lng}
                    />
                </dl>

                {/*
                  The refresh control, and the sentence that says what it will do.
                  A button that re-requests without saying so would invite somebody to
                  press it twice expecting to watch the marker move — and the honest
                  answer, which is that nothing will, is the reason the sentence sits
                  under the button rather than in the banner at the top.
                */}
                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={onRefresh}
                        className={`self-start rounded-lg px-3 py-1 text-sm font-medium ${ACTION} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F5B55] dark:focus-visible:outline-[#6FFBBE]`}
                    >
                        Refresh position
                    </button>
                    <p className={`text-xs ${INK_SOFT}`}>
                        A refresh asks the service again. It will return these same numbers, because
                        they are fixed examples rather than a position being reported.
                    </p>
                </div>
            </section>

            <section
                aria-label="Technician"
                className={`flex items-center justify-between gap-4 p-5 ${CARD}`}
            >
                <div className="flex flex-col gap-1">
                    <h2 className={`font-semibold ${INK}`}>{worker.name}</h2>
                    <p className={`text-sm ${INK_SOFT}`}>
                        Booking {tracking.booking_id} · {status}
                    </p>
                </div>
                <p className={`text-sm font-medium ${AMBER_TEXT}`}>{worker.rating.toFixed(1)} ★</p>
            </section>

            {/*
              An ordered list, because a timeline has an order that is the point of
              it. `stage.completed` is rendered as both a tick glyph and a word in the
              markup, so the state is not carried by the glyph alone.
            */}
            <section aria-label="Progress">
                <h2 className={`mb-3 text-sm font-semibold uppercase tracking-wide ${INK_SOFT}`}>Progress</h2>
                <ol className="flex flex-col gap-0">
                    {stages.map((stage, index) => (
                        <li
                            key={stage.name}
                            className="flex flex-col gap-1 pb-5 last:pb-0"
                        >
                            <div className="flex items-center gap-3">
                                {index < stages.length - 1 && (
                                    <span
                                        aria-hidden="true"
                                        className={`h-full w-0.5 ${stage.completed ? 'bg-[#0F5B55] dark:bg-[#6FFBBE]' : 'bg-[#E2E8F0] dark:bg-[#243350]'}`}
                                    />
                                )}
                                <span
                                    aria-hidden="true"
                                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                                        stage.completed
                                            ? 'bg-[#0F5B55] text-white dark:bg-[#6FFBBE] dark:text-[#04231F]'
                                            : 'ring-1 ring-[#E2E8F0] text-[#94A3B8] dark:ring-[#243350]'
                                    }`}
                                >
                                    {stage.completed ? '✓' : index + 1}
                                </span>
                                <span className={stage.completed ? `${INK} font-medium` : INK_SOFT}>
                                    {stage.name}
                                    <span className="sr-only">
                                        {stage.completed ? ' — completed' : ' — not yet reached'}
                                    </span>
                                </span>
                            </div>
                            {stage.completed && stage.timestamp !== null && (
                                <time
                                    dateTime={stage.timestamp}
                                    className={`pl-9 text-xs ${INK_SOFT}`}
                                >
                                    {new Date(stage.timestamp).toLocaleTimeString('en-IN', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </time>
                            )}
                        </li>
                    ))}
                </ol>
            </section>
        </>
    )
}

/**
 * One coordinate pair.
 *
 * `<dl>` with `<dt>`/`<dd>` rather than two spans, so "technician" is programmatically
 * associated with its numbers — the reason the pair is in a definition list and
 * not a row of text.
 */
function Coordinate({
    term,
    latitude,
    longitude,
}: {
    term: string
    latitude: number
    longitude: number
}) {
    return (
        <div className="flex flex-col gap-0.5">
            <dt className={`text-xs uppercase tracking-wide ${INK_SOFT}`}>{term}</dt>
            <dd className={`font-mono text-sm ${ACCENT_TEXT}`}>
                {latitude.toFixed(4)}, {longitude.toFixed(4)}
            </dd>
        </div>
    )
}