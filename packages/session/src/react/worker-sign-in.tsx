'use client'

import { useId, useState } from 'react'
import {
    Alert,
    APPLE_GROUND,
    APPLE_PRESS,
    Field,
    PasswordField,
    PrivacyNotice,
    fieldInputProps,
} from '@fixmate/ui'

/**
 * The worker's sign-in screen, built to the Figma design.
 *
 * ## What is real and what is a mock
 *
 * The routes that exist for a worker are the same five the other account types
 * have: sign-in, renewal, sign-out, `me`, and the two password flows. This
 * design is built around OTP, and **none of what it offers has a back end**:
 *
 * - **Email and password — real.** It calls the sign-in operation this
 *   application already binds, and everything downstream of a refusal
 *   (announcing, routing, `?next=`) is the code that was already here.
 * - **One-time password — mocked.** Reveals the code field, sends nothing. There
 *   is no OTP route for any account type, and the design's own "Partner Verified"
 *   and "6-digit delivery" copy describes a verification system this repository
 *   does not have.
 * - **Partner ID / PIN — not built.** The design offers it as a second tab; there
 *   is no badge ID on any model and no PIN route.
 *
 * Each mock is a named entry in {@link MOCKED_FEATURES} rather than a stub
 * spread through the markup, so "is this real?" is answered by reading one list.
 *
 * ## The claims on this screen
 *
 * This design promises considerably more than the customer's did, and almost none
 * of it is supported by any code here: a ₹38,500 average monthly income, a
 * ₹5,00,000 accidental-insurance product, a commission holiday, daily instant
 * payouts, an Aadhaar KYC flow, a 24/7 desk, and a helpline number that would
 * ring a real telephone. There is no payment system, no insurance product, no
 * KYC, no ledger, no metrics and no telephony in this repository.
 *
 * They are rendered because the design specifies them and this is a faithful
 * build of it, and every one is named in {@link UNSUPPORTED_WORKER_CLAIMS} so
 * the removal is one edit. The judgement is the same as the customer's screen,
 * and it is the same one the privacy notice in this repository is held to: **a
 * claim that cannot be substantiated is worse than no claim.** The income figure
 * and the helpline are the two to cut first — a number somebody plans their
 * life around, and a phone number that does not exist.
 */

/** The parts of this screen that are drawn but not yet built. */
export const MOCKED_FEATURES = {
    otp: 'One-time password sign-in has no back-end route yet.',
    partnerId: 'Partner ID and PIN sign-in has no back-end route yet.',
    support: 'The support desk and helpline are not connected to anything yet.',
} as const

/**
 * Copy this design specifies that this repository cannot substantiate.
 *
 * Kept as a record for the same reason as the customer's: "this was in the
 * design and we have not built it" is a decision somebody will ask about, and
 * the answer should be one line rather than an archaeology exercise. A test
 * asserts the list is complete, so a new claim cannot be added to the screen
 * without also being added here — which is the point: it has to be noticed.
 */
export const UNSUPPORTED_WORKER_CLAIMS = [
    '12,000+ Active Mistris',
    '₹38,500 Avg. Monthly',
    'Daily Instant Payouts',
    '₹5,00,000 Accidental Cover',
    '0% Commission in Month 1',
    'Complete Aadhaar KYC & Onboarding',
    'Call Helpline: 1800-FIX-MATE',
    '24/7 Desk',
    'Partner Verified',
] as const

export interface WorkerSignInProps {
    /** Called with the address and password. Resolves to sign in. */
    onSignIn: (email: string, password: string) => Promise<void>
    /** A refusal from the back end, already worded by `describeSignInFailure`. */
    failure: { message: string } | null
    /** True while the sign-in request is in flight. */
    pending: boolean
    /** The signed-out explanation, or null to say nothing. */
    notice: string | null
    /** This application's own title in the header. */
    title: string
}

export function WorkerSignIn({
    onSignIn,
    failure,
    pending,
    notice,
    title,
}: WorkerSignInProps) {
    const phoneFieldId = useId()
    const partnerIdFieldId = useId()

    /**
     * Which credential the design is offering. It is a two-tab control in the
     * design and a pair of mutually exclusive forms here, because two
     * password-capable forms visible at once is a form nobody can tell apart.
     */
    const [method, setMethod] = useState<'otp' | 'partnerId' | 'email'>('otp')

    /** The mocked OTP flow, as on the customer's screen. */
    const [requested, setRequested] = useState(false)
    const [code, setCode] = useState('')

    /** A refusal from a control that has nothing behind it. */
    const [refusal, setRefusal] = useState<string | null>(null)

    return (
        <div className={`min-h-screen ${APPLE_GROUND}`}>
            <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200/60 bg-white/70 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 [font-family:var(--font-jakarta,system-ui,-apple-system,sans-serif)] dark:border-slate-800/60 dark:bg-slate-950/70">
                <a
                    href="/"
                    aria-label="Go back"
                    className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-900/5 dark:text-slate-200 dark:hover:bg-white/10 ${APPLE_PRESS}`}
                >
                    <BackIcon />
                </a>

                <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                    {title}
                </h1>

                <span
                    aria-hidden="true"
                    className="size-8 shrink-0 rounded-full bg-emerald-950 dark:bg-emerald-50"
                />
            </header>

            <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6 [font-family:var(--font-jakarta,system-ui,-apple-system,sans-serif)]">
                {/*
                    The design's "Mode Switcher Banner" and its "Footer
                    Cross-Navigation" are **not rendered**.

                    Both exist to move somebody between the worker's door and the
                    customer's. This screen is the worker's, and it reaches only
                    the operations this application was given; the customer is a
                    separate application on a separate address, and its door
                    refuses this account type. A link there is a link out of the
                    thing this repository is arranged to keep sealed.

                    Kept here as a decision rather than an omission, because the
                    design will keep drawing them and the next reader will wonder.
                */}

                <WorkerHero />

                {notice !== null && <Alert tone="info">{notice}</Alert>}

                {failure !== null && <Alert tone="error">{failure.message}</Alert>}

                <div className="flex flex-col gap-5 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900/70 dark:ring-slate-700/60">
                    {/*
                        The two-tab credential selector, as a real tablist rather
                        than two buttons. Arrow-key movement and the
                        selected-tab relationship are what a screen reader uses to
                        announce this, and a pair of buttons with
                        `aria-pressed` reads as two unrelated controls.
                    */}
                    <div
                        role="tablist"
                        aria-label="How would you like to sign in?"
                        className="grid grid-cols-2 gap-1 rounded-full bg-indigo-50 p-1 dark:bg-slate-800"
                    >
                        <Tab
                            selected={method === 'otp'}
                            onSelect={() => setMethod('otp')}
                            disabled={method === 'email'}
                        >
                            Instant Mobile OTP
                        </Tab>
                        <Tab
                            selected={method === 'partnerId'}
                            onSelect={() => setMethod('partnerId')}
                            disabled={method === 'email'}
                        >
                            Partner ID / PIN
                        </Tab>
                    </div>

                    {method === 'otp' && (
                        <OtpPanel
                            fieldId={phoneFieldId}
                            requested={requested}
                            code={code}
                            onRequest={() => setRequested(true)}
                            onCode={setCode}
                        />
                    )}

                    {method === 'partnerId' && (
                        <PartnerIdPanel
                            fieldId={partnerIdFieldId}
                            onRefuse={() => setRefusal(MOCKED_FEATURES.partnerId)}
                        />
                    )}

                    {method === 'email' && (
                        <EmailPanel onSignIn={onSignIn} pending={pending} />
                    )}

                    <div className="flex items-center gap-3" role="separator">
                        <span className="h-px flex-1 bg-indigo-100 dark:bg-slate-700" />
                        <span className="bg-white px-1 text-[11px] font-bold uppercase tracking-[0.55px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                            or
                        </span>
                        <span className="h-px flex-1 bg-indigo-100 dark:bg-slate-700" />
                    </div>

                    {/*
                        The email fallback. `aria-expanded` because it opens and
                        closes a form, and a control that does that without saying
                        so is a control whose effect a screen-reader user has to
                        discover.
                    */}
                    <button
                        type="button"
                        onClick={() => setMethod(method === 'email' ? 'otp' : 'email')}
                        aria-expanded={method === 'email'}
                        aria-controls="worker-sign-in-email"
                        className={`mx-auto flex items-center gap-2 text-xs font-semibold text-emerald-950 hover:underline dark:text-emerald-300 ${APPLE_PRESS}`}
                    >
                        <span aria-hidden="true" className="shrink-0">
                            {method === 'email' ? <ChevronUpIcon /> : <KeyIcon />}
                        </span>
                        {method === 'email'
                            ? 'Hide email sign-in'
                            : 'Sign in with Email & Password'}
                    </button>
                </div>

                {/* A refusal from a control with nothing behind it. Assertive, as
                    every refusal on this screen is. */}
                {refusal !== null && <Alert tone="error">{refusal}</Alert>}

                <SupportHub onRefuse={() => setRefusal(MOCKED_FEATURES.support)} />

                <SocialProof />

                <BenefitsGrid />

                {/*
                    The design's footer links out to the customer app and to
                    partner registration. Neither is rendered: see the note at the
                    top of this file.
                */}

                <PrivacyNotice className="rounded-lg border border-slate-200/70 bg-white/50 px-4 py-3 text-xs text-slate-600 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-400" />
            </main>
        </div>
    )
}

/**
 * The hero: the worker's identity card, with a mint badge, a monogram tile and
 * one line of copy, over two soft concentric circles.
 *
 * The circles are decoration and marked as such — an announced circle is noise
 * before the badge has said anything.
 */
function WorkerHero() {
    return (
        <section className="relative flex flex-col gap-3 overflow-hidden rounded-xl bg-emerald-900 p-5 text-white shadow-lg shadow-emerald-950/20 dark:bg-emerald-950 dark:shadow-black/40">
            <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-12 -top-10 size-44 rounded-full bg-emerald-300/10"
            />
            <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-4 top-4 size-28 rounded-full bg-emerald-950/20"
            />

            <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-300/20 px-2 py-0.5 text-[11px] font-bold uppercase leading-[14px] tracking-[0.55px] text-emerald-200">
                <span aria-hidden="true" className="shrink-0">
                    <BadgeIcon />
                </span>
                Verified Technician Portal
            </p>

            <div className="flex items-center gap-4">
                <span
                    aria-hidden="true"
                    className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-200 text-emerald-950"
                >
                    <ToolIcon />
                </span>
                <div className="min-w-0">
                    <h2 className="text-2xl font-bold leading-[30px] tracking-[-0.6px]">
                        Welcome Back
                    </h2>
                    <p className="text-sm text-emerald-100/90">Mistri / Partner</p>
                </div>
            </div>

            <p className="text-sm leading-[23px] text-teal-200">
                Log in to view available job leads, manage your daily schedule and track your
                earnings
            </p>
        </section>
    )
}

/**
 * One tab of the credential selector.
 *
 * `disabled` while the email form is open is deliberate: the two tabs choose
 * *which* credential, and while the email form is showing the question has been
 * answered a third way. Offering to switch back to a tab would replace the email
 * form without being asked, which is the kind of surprise that loses what a
 * person has typed.
 */
function Tab({
    selected,
    onSelect,
    disabled,
    children,
}: {
    selected: boolean
    onSelect: () => void
    disabled: boolean
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={onSelect}
            className={[
                'rounded-full px-3 py-2 text-xs font-semibold transition-colors',
                disabled ? 'opacity-40' : '',
                selected
                    ? 'bg-emerald-900 text-white shadow-sm dark:bg-emerald-100 dark:text-emerald-950'
                    : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-700/70',
            ].join(' ')}
        >
            {children}
        </button>
    )
}

/** The OTP half. Mocked end to end, and labelled as such. */
function OtpPanel({
    fieldId,
    requested,
    code,
    onRequest,
    onCode,
}: {
    fieldId: string
    requested: boolean
    code: string
    onRequest: () => void
    onCode: (value: string) => void
}) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <label htmlFor={fieldId} className="text-xs font-semibold text-slate-900 dark:text-white">
                    Registered Mobile Number
                </label>
                {/*
                    "Partner Verified" is one of the claims this repository cannot
                    support — there is no verification system for any account type
                    — and the design pairs it with a tick that implies a check has
                    already happened. So there is no tick here, only the words, and
                    the words are in `UNSUPPORTED_WORKER_CLAIMS`.
                */}
                <span
                    aria-hidden="true"
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-bold leading-[14px] tracking-[0.44px] text-emerald-900 dark:bg-emerald-300/20 dark:text-emerald-200"
                >
                    Partner Verified
                </span>
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-indigo-50 px-4 dark:bg-slate-800">
                {/*
                    A `<span>` and not a select: choosing a country is a decision
                    this screen cannot act on, because the number it would be sent
                    to goes nowhere yet. `aria-hidden`, and the phone field
                    carries the whole label. The design's chevron is left off for
                    the same reason — a caret promises that something opens.
                */}
                <span
                    aria-hidden="true"
                    className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white"
                >
                    <FlagIcon />+91
                </span>
                <span aria-hidden="true" className="h-5 w-px shrink-0 bg-slate-300 dark:bg-slate-600" />
                <input
                    id={fieldId}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    name="phone"
                    required
                    placeholder="98765 43210"
                    className="min-w-0 flex-1 bg-transparent py-3 text-base font-semibold tracking-[0.45px] text-slate-900 outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-500 dark:text-white dark:placeholder:text-slate-400"
                />
            </div>

            {requested && (
                <div className="flex flex-col gap-1.5">
                    <label
                        htmlFor={`${fieldId}-code`}
                        className="text-xs font-semibold text-slate-900 dark:text-white"
                    >
                        6-digit code
                    </label>
                    <input
                        id={`${fieldId}-code`}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={code}
                        onChange={(event) => onCode(event.target.value)}
                        className="rounded-xl border border-transparent bg-indigo-50 px-4 py-3 text-center font-mono text-lg tracking-[0.5em] text-slate-900 outline-none focus:border-emerald-900 focus:bg-white dark:bg-slate-800 dark:text-white dark:focus:border-white dark:focus:bg-slate-800"
                    />
                </div>
            )}

            <p className="text-xs leading-4 text-slate-600 dark:text-slate-400">
                Must be linked with your FixMate Technician Badge ID
            </p>

            {/*
                The two delivery channels, as drawn but inert. There is no SMS
                gateway and no WhatsApp Business account behind either one, and a
                control that claims to choose a delivery channel it cannot affect
                is a choice that silently does nothing.
            */}
            <p className="text-[11px] font-bold tracking-[0.44px] text-slate-500 dark:text-slate-400">
                Send via:{' '}
                <span className="text-slate-900 dark:text-white">SMS</span>{' '}
                <span aria-hidden="true">·</span>{' '}
                <span className="text-slate-900 dark:text-white">WhatsApp</span>
            </p>

            <button
                type="button"
                onClick={onRequest}
                className={`flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-950 py-3 text-sm font-semibold text-white hover:bg-emerald-900 dark:bg-emerald-100 dark:text-emerald-950 dark:hover:bg-white ${APPLE_PRESS}`}
            >
                {requested ? 'Resend code' : 'Send Partner Login OTP'}
                <ArrowIcon />
            </button>

            <p className="flex items-start gap-2 text-xs leading-4 text-slate-600 dark:text-slate-400">
                <span aria-hidden="true" className="mt-px shrink-0 text-emerald-800 dark:text-emerald-400">
                    <InfoIcon />
                </span>
                <span>Instant 6-digit OTP delivery to registered SIM &amp; WhatsApp</span>
            </p>

            {/*
                The design's promise, and this repository's answer to it: the line
                above says a code is delivered, and the button reveals a field for
                a code that is never going to arrive. Delete this block when the
                OTP route exists.
            */}
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                {MOCKED_FEATURES.otp}
            </p>
        </div>
    )
}

/**
 * The partner-ID half. Drawn, and refusing.
 *
 * There is no badge ID on any model in this repository and no PIN route, so
 * there is nothing to submit. The form is still a form rather than a disabled
 * pair of boxes, because a person arriving here needs to be told *why* it does
 * not work, and a form they can fill in and submit is how they find out.
 */
function PartnerIdPanel({
    fieldId,
    onRefuse,
}: {
    fieldId: string
    onRefuse: () => void
}) {
    return (
        <form
            onSubmit={(event) => {
                event.preventDefault()
                onRefuse()
            }}
            className="flex flex-col gap-3"
        >
            <Field label="Technician Badge ID">
                {(props) => (
                    <input
                        {...fieldInputProps(props, {
                            name: 'badge_id',
                            type: 'text',
                            autoComplete: 'off',
                            required: true,
                            className:
                                'w-full rounded-xl border border-transparent bg-indigo-50 px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-900 focus:bg-white dark:bg-slate-800 dark:text-white dark:focus:border-white dark:focus:bg-slate-800',
                        })}
                    />
                )}
            </Field>

            <PasswordField
                label="PIN"
                name="pin"
                autoComplete="current-password"
                className="w-full rounded-xl border border-transparent bg-indigo-50 px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-900 focus:bg-white dark:bg-slate-800 dark:text-white dark:focus:border-white dark:focus:bg-slate-800"
            />

            <button
                type="submit"
                className={`flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-950 py-3 text-sm font-semibold text-white hover:bg-emerald-900 dark:bg-emerald-100 dark:text-emerald-950 dark:hover:bg-white ${APPLE_PRESS}`}
            >
                Sign in with Badge ID
            </button>
        </form>
    )
}

/** The email half — the one part of this screen with a back end behind it. */
function EmailPanel({
    onSignIn,
    pending,
}: {
    onSignIn: (email: string, password: string) => Promise<void>
    pending: boolean
}) {
    return (
        <form
            // The id the email link points `aria-controls` at.
            id="worker-sign-in-email"
            onSubmit={(event) => {
                event.preventDefault()
                const data = new FormData(event.currentTarget)
                void onSignIn(String(data.get('email') ?? ''), String(data.get('password') ?? ''))
            }}
            className="flex flex-col gap-3"
        >
            <Field label="Email address">
                {(props) => (
                    <input
                        {...fieldInputProps(props, {
                            name: 'email',
                            type: 'email',
                            autoComplete: 'username',
                            required: true,
                            className:
                                'w-full rounded-xl border border-transparent bg-indigo-50 px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-900 focus:bg-white dark:bg-slate-800 dark:text-white dark:focus:border-white dark:focus:bg-slate-800',
                        })}
                    />
                )}
            </Field>

            <PasswordField
                label="Password"
                name="password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-transparent bg-indigo-50 px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-900 focus:bg-white dark:bg-slate-800 dark:text-white dark:focus:border-white dark:focus:bg-slate-800"
            />

            <button
                type="submit"
                disabled={pending}
                className={`w-full rounded-xl bg-emerald-950 py-3 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-100 dark:text-emerald-950 dark:hover:bg-white ${APPLE_PRESS}`}
            >
                {pending ? 'Signing in…' : 'Sign in'}
            </button>
        </form>
    )
}

/**
 * The support hub: two utility rows.
 *
 * **Neither row does anything.** There is no KYC flow, no SIM-replacement
 * process, and no helpline — the number in the second row is a real telephone
 * number that would ring nobody. Both are drawn as links because the design draws
 * them as links, and both are buttons rather than anchors for the same reason as
 * the provider buttons on the customer's screen: a link to a route that does not
 * exist is a 404 with no explanation, and this is an explanation.
 */
function SupportHub({ onRefuse }: { onRefuse: () => void }) {
    return (
        <section className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900/70 dark:ring-slate-700/60">
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold tracking-[0.6px] text-emerald-950 dark:text-emerald-300">
                    Partner Support Hub
                </h2>
                <span
                    aria-hidden="true"
                    className="rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-bold leading-[14px] tracking-[0.44px] text-emerald-900 dark:bg-emerald-300/20 dark:text-emerald-200"
                >
                    24/7 Desk
                </span>
            </div>

            <UtilityRow
                icon={<IdCardIcon />}
                title="New Mistri joining FixMate?"
                note="Complete Aadhaar KYC & Onboarding"
                onClick={onRefuse}
            />
            <UtilityRow
                icon={<SimIcon />}
                title="Lost your registered SIM?"
                note="Call Helpline: 1800-FIX-MATE"
                onClick={onRefuse}
            />
        </section>
    )
}

function UtilityRow({
    icon,
    title,
    note,
    onClick,
}: {
    icon: React.ReactNode
    title: string
    note: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full items-center gap-3 rounded-xl bg-indigo-50 px-4 py-3 text-left dark:bg-slate-800 ${APPLE_PRESS}`}
        >
            <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-900 text-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
            >
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-slate-900 dark:text-white">
                    {title}
                </span>
                <span className="block text-xs text-emerald-800 dark:text-emerald-300">
                    {note}
                </span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-slate-400">
                <ChevronRightIcon />
            </span>
        </button>
    )
}

/**
 * Two social-proof tiles.
 *
 * **Both numbers are invented.** "12,000+ Active Mistris" is a count of accounts
 * that does not exist — this repository has four account types and no users at
 * all — and "₹38,500 Avg. Monthly" is an income figure for a marketplace with no
 * jobs, no bookings and no payments. The image fills in the design are
 * photographs of people who do not exist and are not reproduced here; the
 * gradient stands in for them.
 *
 * This is the claim on this screen I would cut before any of the others. A
 * number printed next to a photograph of a person is read as a fact about a real
 * community, and a person deciding whether to take up this work may plan their
 * income around it.
 */
function SocialProof() {
    return (
        <ul className="grid grid-cols-2 gap-2">
            {[
                { figure: '12,000+', label: 'Active Mistris', from: '#065f46', to: '#34d399' },
                { figure: '₹38,500', label: 'Avg. Monthly', from: '#134e4a', to: '#5eead4' },
            ].map((stat) => (
                <li
                    key={stat.label}
                    className="flex flex-col justify-end gap-1 rounded-xl bg-gradient-to-br p-4 text-white"
                    style={{ backgroundImage: `linear-gradient(135deg, ${stat.from}, ${stat.to})` }}
                >
                    <span className="text-lg font-bold leading-tight tracking-tight">
                        {stat.figure}
                    </span>
                    <span className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.44px] opacity-90">
                        {stat.label}
                    </span>
                </li>
            ))}
        </ul>
    )
}

/**
 * The three benefits.
 *
 * **None of these is supported by this code.** Daily instant payouts describe a
 * payment system; ₹5,00,000 of accidental cover describes an insurance product;
 * a zero-commission first month describes a pricing policy. There is no payment
 * integration, no insurer, no commission field and no earnings ledger in this
 * repository. See {@link UNSUPPORTED_WORKER_CLAIMS}.
 */
function BenefitsGrid() {
    return (
        <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900/70 dark:ring-slate-700/60">
            <h2 className="text-sm font-bold text-emerald-950 dark:text-emerald-300">
                FixMate Pro Mistri Benefits
            </h2>

            <ul className="flex flex-col gap-4">
                {[
                    {
                        icon: <RupeeIcon />,
                        title: 'Daily Instant Payouts',
                        note: 'Instant UPI & IMPS bank transfers right after job sign-off',
                    },
                    {
                        icon: <ShieldIcon />,
                        title: '₹5,00,000 Accidental Cover',
                        note: 'Zero-cost insurance for active technicians on transit',
                    },
                    {
                        icon: <GiftIcon />,
                        title: '0% Commission in Month 1',
                        note: 'Keep 100% of your earnings for the first 30 days',
                    },
                ].map((benefit) => (
                    <li key={benefit.title} className="flex items-start gap-3">
                        <span
                            aria-hidden="true"
                            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                        >
                            {benefit.icon}
                        </span>
                        <span className="min-w-0">
                            <span className="block text-xs font-semibold text-slate-900 dark:text-white">
                                {benefit.title}
                            </span>
                            <span className="block text-xs leading-4 text-slate-600 dark:text-slate-400">
                                {benefit.note}
                            </span>
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    )
}

/* -- Icons. Decorative throughout: every one sits beside text that already says
   what it is, so announcing them would repeat the label. -- */

const svg = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
} as const

function BackIcon() {
    return (
        <svg {...svg} aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
        </svg>
    )
}

function ChevronRightIcon() {
    return (
        <svg {...svg} width={16} height={16} aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
        </svg>
    )
}

function ChevronUpIcon() {
    return (
        <svg {...svg} width={16} height={16} aria-hidden="true">
            <path d="M15 18l-6-6-6 6" />
        </svg>
    )
}

function ArrowIcon() {
    return (
        <svg {...svg} width={16} height={16} aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
    )
}

function KeyIcon() {
    return (
        <svg {...svg} width={15} height={8} aria-hidden="true">
            <circle cx="6" cy="4" r="3" />
            <path d="M9 4h11M17 4v3M20 4v2" />
        </svg>
    )
}

function InfoIcon() {
    return (
        <svg {...svg} width={16} height={16} aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 16v-5M12 8h.01" />
        </svg>
    )
}

function ToolIcon() {
    return (
        <svg {...svg} width={26} height={26} aria-hidden="true">
            <path d="M14.7 6.3a4 4 0 01-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 015.4-5.4l-2.6 2.6-2-2 2.6-2.6z" />
        </svg>
    )
}

function BadgeIcon() {
    return (
        <svg width={13} height={12} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 1l3 2.3 3.7-.3 1 3.6 3 2-1.6 3.5 1.6 3.5-3 2-1 3.6-3.7-.3L12 23l-3-2.3-3.7.3-1-3.6-3-2L3 12.9 1.4 9.4l3-2 1-3.6 3.7.3L12 1zm-1 6a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
    )
}

function IdCardIcon() {
    return (
        <svg {...svg} width={17} height={17} aria-hidden="true">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <circle cx="8.5" cy="11" r="2" />
            <path d="M5 16c.6-1.5 1.9-2 3.5-2s2.9.5 3.5 2M15 10h4M15 14h4" />
        </svg>
    )
}

function SimIcon() {
    return (
        <svg {...svg} width={17} height={17} aria-hidden="true">
            <rect x="6" y="2" width="12" height="20" rx="2" />
            <path d="M10 18h4M11 5h2" />
        </svg>
    )
}

function RupeeIcon() {
    return (
        <svg {...svg} width={16} height={16} aria-hidden="true">
            <path d="M7 4h10M7 9h10M15 4c0 4-2.5 5-5 5l6 11" />
        </svg>
    )
}

function ShieldIcon() {
    return (
        <svg {...svg} width={16} height={16} aria-hidden="true">
            <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
        </svg>
    )
}

function GiftIcon() {
    return (
        <svg {...svg} width={16} height={16} aria-hidden="true">
            <rect x="3" y="9" width="18" height="12" rx="2" />
            <path d="M3 13h18M12 9v12" />
            <path d="M12 9S9 9 8 8a2 2 0 014-3c0 2 0 4 0 4zM12 9s3 0 4-1a2 2 0 00-4-3c0 2 0 4 0 4z" />
        </svg>
    )
}

function FlagIcon() {
    return (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect width="24" height="16" rx="2" fill="#01411C" />
            <path d="M0 4h24v2H0zM0 10h24v2H0z" fill="#fff" />
            <path d="M2.5 2.5l1 1.2-1 1.2 1 1.2-1 1.2 1 1.2-1 1.2 1 1.2-1 1.2" stroke="#fff" strokeWidth="0.8" />
        </svg>
    )
}
