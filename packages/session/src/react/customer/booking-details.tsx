'use client'

import { APPLE_PRESS } from '@fixmate/ui'
import { MOCK_BOOKING } from './mock-data'
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

/**
 * The customer's booking details screen, built to the Figma frame.
 *
 * ## Everything on this screen is a mock except the layout
 *
 * There is no booking, no worker, no appointment table, no price estimator and
 * no payment gateway in this repository. What is here is the *shape* of a booking
 * screen, drawn accurately, with every invented value named in
 * `UNSUPPORTED_CUSTOMER_CLAIMS`.
 *
 * The controls are the sharpest case. The date pills, the slot buttons, the
 * payment radios and Confirm Booking are all real, focusable, correctly-labelled
 * form controls — and none of them does anything.
 *
 * ## Why inert controls and not links that go nowhere
 *
 * A `<button>` with no handler, or an `<a>` with no `href`, is what a scaffold
 * produces, and a person discovers it is broken by clicking and watching nothing
 * happen. These are real controls that are *wrong on purpose* in a narrower way:
 * they hold the design's shape, they are reachable and operable, and the one thing
 * they will not do is pretend to have succeeded. The gap between "does nothing
 * visibly" and "appears to have worked" is the difference between a mock and a
 * lie.
 *
 * The corollary: when the back end arrives, this file is the first thing to
 * change, and the design's layout survives that change intact.
 */
export function BookingDetails() {
    return (
        <div className={`flex min-h-screen flex-col ${GROUND} ${JAKARTA_FONT_CLASS}`}>
            <header
                className={`sticky top-0 z-10 border-b border-[#F1F5F9] bg-[#F8FAFC]/95 backdrop-blur dark:border-[#243350] dark:bg-[#0B1220]/95`}
            >
                <div className="mx-auto flex w-full max-w-md items-center gap-4 px-5 py-4">
                    <BackButton />
                    <h1
                        className={`text-xl font-bold tracking-tight ${INK}`}
                    >
                        Booking Details
                    </h1>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-6 pb-28">
                <ProfessionalCard />
                <DateTimeSelection />
                <PriceEstimateCard />
                <PaymentMethods />
            </main>

            <StickyFooter />
        </div>
    )
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
 * It is a button rather than a link so it is not announced as navigation, and it
 * is disabled-by-refusal rather than inert — see {@link RefusesToPretend}.
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
 */
function ProfessionalCard() {
    return (
        <section className={`flex items-center gap-4 p-4 ${CARD}`}>
            <span className="relative shrink-0">
                <span
                    aria-hidden="true"
                    className="flex size-16 items-center justify-center rounded-xl bg-[#F1F5F9] text-2xl text-[#94A3B8] dark:bg-[#1A2438] dark:text-[#64748B]"
                >
                    {MOCK_BOOKING.worker.charAt(0)}
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
                    {MOCK_BOOKING.worker}
                </h2>
                <p className="flex items-center gap-2 text-sm">
                    <span className={INK_SOFT}>{MOCK_BOOKING.trade}</span>
                    <span
                        aria-hidden="true"
                        className="size-1 rounded-full bg-[#CBD5E1] dark:bg-[#475569]"
                    />
                    <span
                        className={`rounded-full bg-[#CBD5E1]/60 px-1.5 py-0.5 text-xs font-semibold text-[#1E293B] dark:bg-[#243350] dark:text-[#E2E8F0]`}
                    >
                        <span className="sr-only">Rated </span>★{' '}
                        {MOCK_BOOKING.rating}
                    </span>
                </p>
                <p className={`text-sm font-semibold ${ACCENT_TEXT}`}>
                    {MOCK_BOOKING.service}
                </p>
            </div>
        </section>
    )
}

/**
 * The date and slot pickers.
 *
 * **The selection is drawn, not made.** `selected` comes from the mock, pressing
 * a pill does not move it, and there is nothing to submit the choice to. The
 * controls are nonetheless real buttons with `aria-pressed`, so a keyboard or
 * screen-reader user meets the same three options and the same announced state
 * the design specifies — the screen is honest about its *shape* even while it is
 * a lie about its *function*.
 */
function DateTimeSelection() {
    return (
        <section className="flex flex-col gap-3.5">
            <h2 className={`text-lg font-bold ${INK}`}>
                Select Date &amp; Time
            </h2>

            <div
                role="group"
                aria-label="Choose a date"
                className="grid grid-cols-3 gap-2.5"
            >
                {MOCK_BOOKING.dates.map((d) => (
                    <button
                        key={d.day}
                        type="button"
                        aria-pressed={d.selected}
                        className={[
                            'flex flex-col items-center gap-0.5 rounded-2xl px-3 py-2.5 text-sm font-bold',
                            d.selected
                                ? PILL_ON
                                : `${PILL_OFF} hover:ring-[#CBD5E1] dark:hover:ring-[#334155]`,
                            APPLE_PRESS,
                        ].join(' ')}
                    >
                        <span
                            className={`text-[11px] font-semibold tracking-wide ${
                                d.selected
                                    ? 'text-[#99F6E4]'
                                    : 'text-[#64748B] dark:text-[#94A3B8]'
                            }`}
                        >
                            {d.weekday}
                        </span>
                        {d.day}
                    </button>
                ))}
            </div>

            <div
                role="group"
                aria-label="Choose a time slot"
                className="grid grid-cols-3 gap-2.5"
            >
                {MOCK_BOOKING.times.map((t) => (
                    <button
                        key={t.label}
                        type="button"
                        aria-pressed={t.selected}
                        className={[
                            'rounded-xl px-3 py-2.5 text-sm font-semibold',
                            t.selected
                                ? PILL_ON
                                : PILL_OFF,
                            APPLE_PRESS,
                        ].join(' ')}
                    >
                        {t.label}
                    </button>
                ))}
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
 * rows below it are radio buttons that store nothing. A badge that says a
 * transaction is secure, sitting above a total and a Confirm Booking button,
 * invites a person to enter card details on the strength of it. It is rendered
 * because the design specifies it and it is first in the list to cut; see the
 * module docblock in mock-data.ts.
 */
function PriceEstimateCard() {
    return (
        <section className="flex flex-col gap-1.5">
            <div className={`flex flex-col gap-3.5 p-5 ${PRICE_CARD}`}>
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-white">
                        {MOCK_BOOKING.estimate.heading}
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
                        {MOCK_BOOKING.estimate.badge}
                    </span>
                </div>

                <dl className="flex flex-col gap-2.5">
                    {MOCK_BOOKING.estimate.lines.map((l) => (
                        <div
                            key={l.label}
                            className="flex items-center justify-between gap-4"
                        >
                            <dt className="text-sm text-[#94A3B8]">
                                {l.label}
                            </dt>
                            <dd className="text-sm font-medium text-[#E2E8F0]">
                                {l.amount}
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
                        {MOCK_BOOKING.estimate.totalLabel}
                    </span>
                    <span
                        className={`text-2xl font-extrabold ${AMBER_TEXT}`}
                    >
                        {MOCK_BOOKING.estimate.total}
                    </span>
                </div>
            </div>

            <p className={`px-1 text-xs ${INK_SOFT}`}>
                {MOCK_BOOKING.estimate.footnote}
            </p>
        </section>
    )
}

/**
 * The three ways to pay.
 *
 * **These are radio inputs, and choosing one changes nothing.** A `<fieldset>`
 * with a shared `name` is used rather than a row of divs, so the three are one
 * group as far as a form and a screen reader are concerned, arrow keys move
 * between them, and the group has a name. The *state* is the mock's, so the
 * browser's own selection is overridden by `checked` — which is the honest
 * outcome: pressing "Cash After Service" and watching the selection snap back is
 * a person learning that this screen is not wired, rather than a screen that
 * accepted an input it cannot honour.
 */
function PaymentMethods() {
    return (
        <fieldset className="flex flex-col gap-3">
            <legend className={`pb-1 text-lg font-bold ${INK}`}>
                Payment Method
            </legend>

            {MOCK_BOOKING.paymentMethods.map((pm) => (
                <label
                    key={pm.id}
                    className={[
                        'flex cursor-pointer items-center justify-between gap-4 rounded-2xl p-4',
                        pm.selected
                            ? 'bg-white ring-2 ring-[#0F766E] dark:bg-[#111A2B]'
                            : 'bg-white ring-1 ring-[#E2E8F0]/90 hover:ring-[#CBD5E1] dark:bg-[#111A2B] dark:ring-[#243350] dark:hover:ring-[#334155]',
                    ].join(' ')}
                >
                    <span className="flex min-w-0 items-center gap-3">
                        <input
                            type="radio"
                            name="payment-method"
                            value={pm.id}
                            checked={pm.selected}
                            readOnly
                            className="size-5 shrink-0 accent-[#0F766E]"
                        />
                        <span className="flex min-w-0 flex-col">
                            <span className={`text-sm font-semibold ${INK}`}>
                                {pm.title}
                            </span>
                            <span className={`text-xs ${INK_SOFT}`}>
                                {pm.note}
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
 * `Confirm Booking` books nothing. See the module docblock.
 */
function StickyFooter() {
    return (
        <div
            className={`sticky bottom-0 z-10 border-t border-[#F1F5F9] bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:border-[#243350] dark:bg-[#0B1220]`}
        >
            <div className="mx-auto flex w-full max-w-md items-center justify-between gap-6 px-5 py-4">
                <div className="flex flex-col">
                    <span className={`text-xs ${INK_SOFT}`}>
                        {MOCK_BOOKING.footer.totalLabel}
                    </span>
                    <span className={`text-xl font-extrabold ${INK}`}>
                        {MOCK_BOOKING.estimate.total}
                    </span>
                </div>

                <button
                    type="button"
                    className={`rounded-xl px-6 py-3 text-sm font-bold ${ACTION} ${APPLE_PRESS}`}
                >
                    {MOCK_BOOKING.footer.confirmLabel}
                </button>
            </div>
        </div>
    )
}
