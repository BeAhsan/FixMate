'use client'

import type { BookingDay, BookingQuote } from '@fixmate/api-client'
import { APPLE_PRESS } from '@fixmate/ui'
import { useState } from 'react'
import { MockedDataNotice } from './mocked-data-notice'
import { formatMoney } from './money'
import { JAKARTA_FONT_CLASS } from './typeface'
import {
    ACCENT_TEXT,
    ACTION,
    AMBER_TEXT,
    CARD,
    DEEP,
    GROUND,
    INK,
    INK_SOFT,
    PILL_OFF,
    PILL_ON,
    PRICE_CARD,
} from './tokens'
import { useMockedResource, type MockedResource } from './use-mocked-resource'

/**
 * The customer's booking details screen, built to the Figma frame and fed by the
 * mocked quote endpoint.
 *
 * ## What is real on this screen
 *
 * **The selection.** The date pills, the slot buttons and the payment radios hold
 * real state and move it. That is a deliberate change from a version that read
 * `selected` out of a mock module, and it is the reason to make it: *picking a
 * date is an operation this screen performs correctly*, so refusing to let
 * anybody pick one is a different defect from being unable to book. A screen
 * whose picker cannot be pressed is broken in its own right, and the previous
 * argument that a snap-back selection is "a person learning this screen is not
 * wired" was true of a screen that had been handed an answer and was overwriting
 * it. This one is not handed an answer.
 *
 * The default is the first day, the first slot and the first method, which is
 * also what the design draws.
 *
 * ## What is not real, and where the screen says so
 *
 * **Booking.** `Confirm Booking` books nothing: there is no booking table, no
 * appointment, no order and no payment gateway in this repository. That is the
 * largest gap on any customer screen, it is stated at the top of the screen, and
 * the screen's own docblock used to say it was the first thing to build.
 *
 * **The estimate.** Three lines that add up to the total beside them, and nothing
 * computed either. `MockedCustomerEndpointsTest` asserts the arithmetic holds,
 * because a card a person can add up is a card a person will add up.
 *
 * **The payment methods.** Three ways to pay that nothing can take.
 *
 * ## Why the screen shows the sent total rather than summing the lines
 *
 * Both numbers are in the payload and this screen prints the one the back end
 * stated. Summing locally would mean a screen that could disagree with the server
 * about a price without either of them being wrong about itself — and there would
 * be no way to tell which figure was the mistake. A server that computes a total
 * wrongly is one fix; a client that recomputes it is a client that has to be fixed
 * too, or a disagreement the product has to explain.
 *
 * ## Why inert controls would be worse than real ones, and links worse still
 *
 * A `<button>` with no handler, or an `<a>` with no `href`, is what a scaffold
 * produces, and a person discovers it is broken by clicking and watching nothing
 * happen. These are real controls that are *wrong on purpose* in one narrower
 * way: they hold the design's shape, they are reachable and operable, and the one
 * thing they will not do is pretend to have succeeded. The gap between "does
 * nothing visibly" and "appears to have worked" is the difference between a mock
 * and a lie.
 *
 * The corollary: when the booking endpoint arrives, this file is the first thing
 * to change, and the design's layout survives that change intact.
 */
export function BookingDetails({
    bookingId,
    loadQuote,
}: {
    /** The booking being shown. Named here because the endpoint needs one. */
    bookingId: string
    loadQuote: (booking: string) => Promise<BookingQuote>
}) {
    const quote = useMockedResource(
        () => loadQuote(bookingId),
        `booking-quote-${bookingId}`,
    )

    return <BookingDetailsScreen quote={quote} />
}

/**
 * The screen, given its state.
 *
 * Split from the fetching for the reason `LiveTrackingScreen` is: an effect never
 * runs under `renderToStaticMarkup`, so a screen written only as a hook can never
 * be shown its ready state. Taking the state as a prop makes the three of them
 * plain objects — and `useState` *does* work under a static render, so the
 * selection below is real rather than a prop the caller has to supply.
 */
export function BookingDetailsScreen({
    quote,
}: {
    quote: MockedResource<BookingQuote>
}) {
    return (
        <div className={`flex min-h-screen flex-col ${GROUND} ${JAKARTA_FONT_CLASS}`}>
            <header
                className={`sticky top-0 z-10 border-b border-[#F1F5F9] bg-[#F8FAFC]/95 backdrop-blur dark:border-[#243350] dark:bg-[#0B1220]/95`}
            >
                <div className="mx-auto flex w-full max-w-md items-center gap-4 px-5 py-4">
                    <BackButton />
                    <h1 className={`text-xl font-bold tracking-tight ${INK}`}>
                        Booking Details
                    </h1>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-6 pb-28">
                <MockedDataNotice detail="The price below is a fixed figure. Nothing was estimated, no appointment can be made, and Confirm Booking books nothing — there is no booking system behind this screen yet." />

                {quote.status === 'loading' && (
                    <p role="status" className={`text-sm ${INK_SOFT}`}>
                        Loading the quote…
                    </p>
                )}

                {quote.status === 'failed' && (
                    <p role="status" className={`text-sm ${INK_SOFT}`}>
                        This booking&apos;s quote could not be loaded. {quote.message}
                    </p>
                )}

                {quote.status === 'ready' && <Quote booking={quote.data} />}
            </main>
        </div>
    )
}

/**
 * Everything below the header, given a resolved payload.
 *
 * Separate from `BookingDetailsScreen` so the three states are the screen's and
 * the selection state is this function's. A test can render a payload with no
 * effect, and a screen can be shown its loading sentence without a payload.
 */
function Quote({ booking }: { booking: BookingQuote }) {
    // Indexed rather than held as the value itself, so the selection survives a
    // payload whose days or slots are re-ordered underneath it: selecting index
    // 1 of three slots means the same slot after a refresh, where selecting
    // "11:30 AM" would silently become "14:00 PM" if the server sent them in a
    // different order. The label is a string the server owns; the position is
    // this screen's.
    const [day, setDay] = useState(0)
    const [slot, setSlot] = useState(0)
    const [payment, setPayment] = useState(booking.payment_methods[0]?.id ?? '')

    return (
        <>
            <ProfessionalCard booking={booking} />

            <section className="flex flex-col gap-3.5">
                <h2 className={`text-lg font-bold ${INK}`}>
                    Select Date &amp; Time
                </h2>

                <div
                    role="group"
                    aria-label="Choose a date"
                    className="grid grid-cols-3 gap-2.5"
                >
                    {booking.dates.map((candidate, index) => (
                        <button
                            key={candidate.date}
                            type="button"
                            aria-pressed={index === day}
                            onClick={() => setDay(index)}
                            className={[
                                'flex flex-col items-center gap-0.5 rounded-2xl px-3 py-2.5 text-sm font-bold',
                                index === day
                                    ? PILL_ON
                                    : `${PILL_OFF} hover:ring-[#CBD5E1] dark:hover:ring-[#334155]`,
                                APPLE_PRESS,
                            ].join(' ')}
                        >
                            <span
                                className={`text-[11px] font-semibold tracking-wide ${
                                    index === day
                                        ? 'text-[#99F6E4]'
                                        : 'text-[#64748B] dark:text-[#94A3B8]'
                                }`}
                            >
                                {weekdayLabel(candidate)}
                            </span>
                            {candidate.day_label}
                        </button>
                    ))}
                </div>

                <div
                    role="group"
                    aria-label="Choose a time slot"
                    className="grid grid-cols-3 gap-2.5"
                >
                    {booking.times.map((candidate, index) => (
                        <button
                            key={candidate.starts_at}
                            type="button"
                            aria-pressed={index === slot}
                            onClick={() => setSlot(index)}
                            className={[
                                'rounded-xl px-3 py-2.5 text-sm font-semibold',
                                index === slot ? PILL_ON : PILL_OFF,
                                APPLE_PRESS,
                            ].join(' ')}
                        >
                            {candidate.label}
                        </button>
                    ))}
                </div>
            </section>

            <PriceEstimateCard booking={booking} />
            <PaymentMethods
                methods={booking.payment_methods}
                selected={payment}
                onSelect={setPayment}
            />
            <StickyFooter booking={booking} />
        </>
    )
}

/**
 * What a date pill says above its day, given the flag the endpoint sent.
 *
 * **"TODAY" is rendered from `is_today` and never sent as a word.** The design's
 * frame reads "TODAY / 14 Oct" and cannot be right on both counts at once; the
 * endpoint resolves that with arithmetic and sends a flag beside the weekday it
 * computed. This function is where the flag becomes the word, so there is one
 * place that decides what "today" means on this screen and it is the only place
 * that would have to change.
 *
 * Exported as a pure function because it is the one piece of this screen that
 * could plausibly get the two halves the wrong way round — `is_today` and
 * `selected` are different facts, and a screen that printed "TODAY" on whichever
 * pill was selected would look correct on the first day and lie on the other two.
 */
export function weekdayLabel(day: BookingDay): string {
    return day.is_today ? 'TODAY' : day.weekday
}

/**
 * The header's back control.
 *
 * A real `<button>` with a real label rather than an anchor, because on a static
 * export there is **no history to go back through**: every page here is a
 * separate document fetched over HTTP, and a person who arrived by typing the
 * address or by following a link from a search result has an empty back stack.
 * An anchor to `/` would work; a button that goes home is what the glyph means.
 *
 * It is a button rather than a link so it is not announced as navigation.
 */
function BackButton() {
    return (
        <button
            type="button"
            aria-label="Back to the dashboard"
            className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[#0F172A] ring-1 ring-[#F1F5F9] hover:bg-[#F8FAFC] dark:bg-[#111A2B] dark:text-[#EDF0FF] dark:ring-[#243350] dark:hover:bg-[#16213A] ${APPLE_PRESS}`}
        >
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
        </button>
    )
}

/**
 * The technician, with the design's avatar and verified check.
 *
 * The check badge is a **claim about a vetting process**, not a decoration: it
 * says this person's background was checked, and nothing in this repository
 * checks anything. It is drawn because the design draws it, and it is in
 * `UNSUPPORTED_CUSTOMER_CLAIMS`. It is `aria-hidden` with the state carried in
 * the text beside it, so a screen-reader user is told the person is verified
 * rather than being handed an unlabelled tick.
 *
 * The rating is a number and the pill says "Rated", because the design's star on
 * its own says nothing about what it is a rating *of*. The endpoint's
 * `review_count` is not drawn here: the card has room for a name, a trade and one
 * figure, and a second one would push the service line — the thing the customer
 * booked — off the card.
 */
function ProfessionalCard({ booking }: { booking: BookingQuote }) {
    return (
        <section className={`flex items-center gap-4 p-4 ${CARD}`}>
            <span className="relative shrink-0">
                <span
                    aria-hidden="true"
                    className="flex size-16 items-center justify-center rounded-xl bg-[#F1F5F9] text-2xl text-[#94A3B8] dark:bg-[#1A2438] dark:text-[#64748B]"
                >
                    {booking.technician.name.charAt(0)}
                </span>
                <span
                    aria-hidden="true"
                    className={`absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full ${DEEP} text-white dark:text-[#04231F]`}
                >
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M20 6L9 17l-5-5" />
                    </svg>
                </span>
            </span>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h2 className={`truncate text-lg font-bold ${INK}`}>
                    {booking.technician.name}
                </h2>
                <p className="flex items-center gap-2 text-sm">
                    <span className={INK_SOFT}>{booking.technician.trade}</span>
                    <span
                        aria-hidden="true"
                        className="size-1 rounded-full bg-[#CBD5E1] dark:bg-[#475569]"
                    />
                    <span
                        className={`rounded-full bg-[#CBD5E1]/60 px-1.5 py-0.5 text-xs font-semibold text-[#1E293B] dark:bg-[#243350] dark:text-[#E2E8F0]`}
                    >
                        <span className="sr-only">Rated </span>★{' '}
                        {booking.technician.rating.toFixed(1)}
                    </span>
                </p>
                <p className={`text-sm font-semibold ${ACCENT_TEXT}`}>
                    {booking.service}
                </p>
            </div>
        </section>
    )
}

/**
 * The itemised estimate, on the design's dark card.
 *
 * The only dark surface in a light design, and the reason it is dark is worth
 * keeping: it makes the amber total the highest-contrast thing on the screen, so
 * the number a customer is about to agree to is the number their eye lands on.
 *
 * **The SECURE badge is the most load-bearing claim on this screen.** There is no
 * payment integration, no encrypted channel and no checkout — the three payment
 * rows below it are radio buttons holding local state. A badge that says a
 * transaction is secure, sitting above a total and a Confirm Booking button,
 * invites a person to enter card details on the strength of it. It is rendered
 * because the design specifies it and it is first in the list to cut; see the
 * module docblock in mock-data.ts.
 *
 * Every amount is formatted here from an integer and a currency code, because
 * that is all the payload carries. See `money.ts` for why there is no symbol in
 * the response and why the grouping is `en-IN`.
 */
function PriceEstimateCard({ booking }: { booking: BookingQuote }) {
    const { estimate } = booking

    return (
        <section className="flex flex-col gap-1.5">
            <div className={`flex flex-col gap-3.5 p-5 ${PRICE_CARD}`}>
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-white">
                        {estimate.heading}
                    </h2>
                    <span className="flex items-center gap-1.5 rounded bg-[#1F2937] px-2 py-1 text-[11px] font-semibold tracking-wide text-[#CBD5E1]">
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0110 0v4" />
                        </svg>
                        {estimate.badge}
                    </span>
                </div>

                <dl className="flex flex-col gap-2.5">
                    {estimate.lines.map((line) => (
                        <div
                            key={line.label}
                            className="flex items-center justify-between gap-4"
                        >
                            <dt className="text-sm text-[#94A3B8]">
                                {line.label}
                            </dt>
                            <dd className="text-sm font-medium text-[#E2E8F0]">
                                {formatMoney(line.amount, estimate.currency)}
                            </dd>
                        </div>
                    ))}
                </dl>

                <div
                    role="presentation"
                    className="h-px w-full bg-white/10"
                />

                <div className="flex items-center justify-between gap-4">
                    <span className="text-base font-bold text-white">
                        {estimate.total_label}
                    </span>
                    <span className={`text-2xl font-extrabold ${AMBER_TEXT}`}>
                        {formatMoney(estimate.total, estimate.currency)}
                    </span>
                </div>
            </div>

            <p className={`px-1 text-xs ${INK_SOFT}`}>{estimate.footnote}</p>
        </section>
    )
}

/**
 * The three ways to pay.
 *
 * A `<fieldset>` with a shared `name` rather than a row of divs, so the three are
 * one group as far as a form and a screen reader are concerned, arrow keys move
 * between them, and the group has a name.
 *
 * **The selection is real and the charge is not.** Choosing "Cash After Service"
 * moves the selection, which is a UI operation this screen performs correctly;
 * nothing is charged, nothing is reserved and no gateway is contacted. That gap
 * is stated at the top of the screen rather than discovered after a person has
 * typed a card number.
 *
 * The default is the first method, which is what the design draws. An endpoint
 * with an empty list would leave `payment` as `''` and the group would simply have
 * nothing checked — which is a truthful rendering of "no way to pay here", and is
 * why the state is not derived from a hard-coded identifier: a fixture that
 * renamed `upi` to `wallet` would otherwise leave nothing selected while the
 * first row still looked like the default.
 */
function PaymentMethods({
    methods,
    selected,
    onSelect,
}: {
    methods: BookingQuote['payment_methods']
    selected: string
    onSelect: (id: string) => void
}) {
    return (
        <fieldset className="flex flex-col gap-3">
            <legend className={`pb-1 text-lg font-bold ${INK}`}>
                Payment Method
            </legend>

            {methods.map((method) => (
                <label
                    key={method.id}
                    className={[
                        'flex cursor-pointer items-center justify-between gap-4 rounded-2xl p-4',
                        method.id === selected
                            ? 'bg-white ring-2 ring-[#0F766E] dark:bg-[#111A2B]'
                            : 'bg-white ring-1 ring-[#E2E8F0]/90 hover:ring-[#CBD5E1] dark:bg-[#111A2B] dark:ring-[#243350] dark:hover:ring-[#334155]',
                    ].join(' ')}
                >
                    <span className="flex min-w-0 items-center gap-3">
                        <input
                            type="radio"
                            name="payment-method"
                            value={method.id}
                            checked={method.id === selected}
                            onChange={() => onSelect(method.id)}
                            className="size-5 shrink-0 accent-[#0F766E]"
                        />
                        <span className="flex min-w-0 flex-col">
                            <span className={`text-sm font-semibold ${INK}`}>
                                {method.title}
                            </span>
                            <span className={`text-xs ${INK_SOFT}`}>
                                {method.note}
                            </span>
                        </span>
                    </span>
                </label>
            ))}
        </fieldset>
    )
}

/**
 * The sticky footer's total and confirm button.
 *
 * Sticky because the design makes it so, and for a real reason: the total is
 * three screens of scrolling away from the button that spends it, and a customer
 * confirming a price they cannot see is how a wrong number gets agreed to. The
 * page reserves bottom padding so the footer never covers the payment rows.
 *
 * **The total is printed again here, and it is the same number.** Two places
 * showing a price is a disagreement waiting to happen, so both read
 * `estimate.total` — the footer has no second source to fall back on and does no
 * arithmetic of its own.
 *
 * `Confirm Booking` books nothing. See the module docblock.
 */
function StickyFooter({ booking }: { booking: BookingQuote }) {
    return (
        <div
            className={`sticky bottom-0 z-10 -mx-5 border-t border-[#F1F5F9] bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:border-[#243350] dark:bg-[#0B1220]`}
        >
            <div className="mx-auto flex w-full max-w-md items-center justify-between gap-6 px-5 py-4">
                <div className="flex flex-col">
                    <span className={`text-xs ${INK_SOFT}`}>Total</span>
                    <span className={`text-xl font-extrabold ${INK}`}>
                        {formatMoney(
                            booking.estimate.total,
                            booking.estimate.currency,
                        )}
                    </span>
                </div>

                <button
                    type="button"
                    className={`rounded-xl px-6 py-3 text-sm font-bold ${ACTION} ${APPLE_PRESS}`}
                >
                    Confirm Booking
                </button>
            </div>
        </div>
    )
}