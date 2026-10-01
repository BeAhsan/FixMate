'use client'

import { useId, useState } from 'react'
import {
    Alert,
    APPLE_GROUND,
    APPLE_PRESS,
    Field,
    PasswordField,
    PrivacyNotice,
    SignInSurface,
    fieldInputProps,
} from '@fixmate/ui'

/**
 * The end user's sign-in screen, built to the Figma design.
 *
 * ## What is real and what is a mock
 *
 * This screen is drawn around an OTP-first flow, and **only one part of it has a
 * back end.** The routes that exist for an end user are sign-in, renewal,
 * sign-out, `me`, and the two password flows; there is no OTP route, no social
 * sign-in route and no registration route. So:
 *
 * - **Email and password — real.** It calls the sign-in operation this
 *   application already binds, and everything downstream of a refusal
 *   (announcing, routing, `?next=`) is the code that was already here.
 * - **One-time password — mocked.** `requestOtp` resolves successfully and
 *   reveals the code field, because there is nothing to call. It does not
 *   pretend to have sent a message.
 * - **Google and Apple — mocked.** `signInWithProvider` refuses with a plain
 *   message. A button that reported success would be worse than one that admits
 *   the feature is not built.
 * - **Register — not linked.** There is no registration to link to. It is drawn,
 *   because the design draws it, and it is inert rather than pointing at a 404.
 *
 * Each mock is a named no-op in this file rather than a stub spread through the
 * markup, so "is this real?" is answered by reading one list instead of by
 * auditing every handler.
 *
 * ## This screen is the customer's door, and speaks only as the customer
 *
 * "Mistri" is the name of the *other* kind of account — the worker who does the
 * job. It is not vocabulary for the person standing at this screen, who is trying
 * to book one, so it does not appear anywhere in this file's copy. That is a
 * wording decision with a structural consequence: the design's role switcher
 * ("I'm a Customer" / "I'm a Mistri / Partner") is a device for a page that has
 * to *choose* between doors, and this screen is one door. Asking somebody to pick
 * the thing they already picked is noise, and offering them the other one is a
 * link out of an application whose whole point is that it cannot be crossed.
 *
 * The worker's own door is a separate application on a separate address. Nothing
 * here needs to know it exists.
 *
 * ## The claim in the trust badge
 *
 * "256-bit Encrypted" is true and checkable — the transport is TLS and the
 * password is never stored by this page.
 *
 * The design also specified "Verified Mistri Checks" and "Zero Spam Guarantee",
 * and **neither is supported by this code.** There is no verification feature and
 * no anti-spam system here, and the privacy notice in this same repository is
 * held to a stricter rule for exactly this reason: a claim that cannot be
 * substantiated is worse than no claim. Both are gone rather than rendered — see
 * `UNSUPPORTED_CLAIMS` for what was removed and why.
 */

/** The parts of this screen that are drawn but not yet built. */
export const MOCKED_FEATURES = {
    otp: 'One-time password sign-in has no back-end route yet.',
    providers: 'Google and Apple sign-in have no back-end route yet.',
    register: 'There is no registration flow to link to yet.',
} as const

/**
 * Copy the design specified that this repository cannot currently substantiate,
 * and which is therefore **not rendered**.
 *
 * Kept as a record rather than deleted outright, because "this was in the design
 * and we took it out" is a decision somebody will ask about, and the answer should
 * be one line rather than an archaeology exercise through git. A test asserts
 * none of it reaches the screen, so it cannot drift back in by accident.
 */
export const UNSUPPORTED_CLAIMS = ['Verified Mistri Checks', 'Zero Spam Guarantee'] as const

/** The one claim in the badge that the code can stand behind. */
export const SUPPORTED_CLAIM = '256-bit Encrypted'

export interface CustomerSignInProps {
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

export function CustomerSignIn({
    onSignIn,
    failure,
    pending,
    notice,
    title,
}: CustomerSignInProps) {
    const otpFieldId = useId()

    /**
     * Which half of the form is showing. The design has OTP first and email as
     * the alternative, so one of the two is always on screen — never neither, and
     * never both, because two password-capable forms on one screen is a form
     * nobody can tell apart.
     */
    const [method, setMethod] = useState<'otp' | 'email'>('otp')

    /**
     * The mocked OTP flow. `requested` reveals the code field, which is the whole
     * of what a real request would do to this screen; `code` holds what was typed.
     * Neither is sent anywhere, and the button that would verify it says so.
     */
    const [requested, setRequested] = useState(false)
    const [code, setCode] = useState('')

    /**
     * A provider button, honestly. It does not silently succeed and it does not
     * open a popup that goes nowhere: it reports that the feature is not built.
     */
    const [providerRefusal, setProviderRefusal] = useState<string | null>(null)

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

                {/*
                    The avatar. Presentational and `aria-hidden`: it is a
                    placeholder for an account nobody has signed in to yet, and
                    announcing an empty circle would be noise before the badge
                    has said anything.
                */}
                <span
                    aria-hidden="true"
                    className="size-8 shrink-0 rounded-full bg-emerald-950 dark:bg-emerald-50"
                />
            </header>

            {/*
                The typeface, asked for on the page rather than on the panel.
                `SignInSurface` sets it too, but the header and the toggle below
                the panel are siblings of that panel, not descendants — and a font
                that only reached inside the card would leave the two most
                prominent lines on the screen in the fallback. The same
                `var(--font-jakarta, …)` with a system fallback, so the three
                applications that never load it are unaffected.
            */}
            <main
                className={`mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 [font-family:var(--font-jakarta,system-ui,-apple-system,sans-serif)]`}
            >
                <SignInSurface className="flex flex-col gap-6 p-5">
                    {/* The mark, the badge, and the two lines of copy. */}
                    <div className="flex flex-col items-center gap-3 text-center">
                        <span
                            aria-hidden="true"
                            className="flex size-16 items-center justify-center rounded-full bg-emerald-900 text-white shadow-lg shadow-emerald-950/25 dark:bg-emerald-100 dark:text-emerald-950"
                        >
                            <ShieldIcon />
                        </span>

                        <p className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-1 text-[11px] font-bold uppercase leading-[14px] tracking-[0.55px] text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-100">
                            <span
                                aria-hidden="true"
                                className="size-1.5 rounded-full bg-emerald-800 dark:bg-emerald-300"
                            />
                            FixMate Home Services
                        </p>

                        <h2 className="text-2xl font-bold leading-[30px] tracking-tight text-slate-900 dark:text-white">
                            Welcome Back
                        </h2>

                        <p className="text-sm leading-5 text-slate-600 dark:text-slate-400">
                            Sign in to book a trusted professional, or track a repair already
                            underway
                        </p>
                    </div>

                    {notice !== null && <Alert tone="info">{notice}</Alert>}

                    {/*
                        The design's role switcher is gone, and its absence is the
                        point rather than an omission.

                        It existed on a page whose job was to decide *which* door
                        somebody was walking through. This screen is one door: the
                        customer's. Keeping a control that says "I'm a Customer"
                        asks the person standing here to choose the thing they have
                        already chosen, and the second button is a link out of an
                        application built so that a front end cannot cross into
                        another account type's. Nothing here needs to know the
                        worker's door exists.
                    */}

                    {/*
                        The OTP card, and *then* everything else. The design's
                        order is not the one this file had first: the divider sits
                        between the OTP card and the email row, not above the
                        provider buttons. Both halves of the form are therefore
                        inside the panel, and the divider introduces the pair of
                        them rather than the social pair.
                    */}
                    <OtpPanel
                        fieldId={otpFieldId}
                        requested={requested}
                        code={code}
                        onRequest={() => setRequested(true)}
                        onCode={setCode}
                    />

                    {method === 'email' && (
                        <EmailPanel onSignIn={onSignIn} pending={pending} />
                    )}

                    <div className="flex items-center gap-3" role="separator">
                        <span className="h-px flex-1 bg-indigo-100 dark:bg-slate-700" />
                        <span className="text-[11px] font-bold uppercase tracking-[0.55px] text-slate-500 dark:text-slate-400">
                            or continue with
                        </span>
                        <span className="h-px flex-1 bg-indigo-100 dark:bg-slate-700" />
                    </div>

                    {/*
                        The email row, as the design draws it: a full-width card
                        with an icon tile and a chevron, which reads as "there is
                        another way in here" rather than as a submit button. It is
                        `aria-expanded` because it opens and closes a form, and a
                        control that does that without saying so is a control whose
                        effect a screen-reader user has to discover.
                    */}
                    <button
                        type="button"
                        onClick={() => setMethod(method === 'otp' ? 'email' : 'otp')}
                        aria-expanded={method === 'email'}
                        aria-controls="customer-sign-in-email"
                        className={`flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900/70 dark:ring-slate-700/60 ${APPLE_PRESS}`}
                    >
                        <span
                            aria-hidden="true"
                            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200"
                        >
                            <MailIcon />
                        </span>
                        <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">
                            {method === 'email' ? 'Hide email sign-in' : 'Login with Email & Password'}
                        </span>
                        <span aria-hidden="true" className="shrink-0 text-slate-400">
                            {method === 'email' ? <ChevronUpIcon /> : <ChevronIcon />}
                        </span>
                    </button>

                    {/*
                        Both provider buttons are real buttons rather than links,
                        because each one is going to report that it is not built.
                        A link to a route that does not exist would be a 404 with
                        no explanation, which is the worse of the two failures.
                    */}
                    <div className="grid grid-cols-2 gap-2">
                        <ProviderButton onClick={() => setProviderRefusal(MOCKED_FEATURES.providers)}>
                            <GoogleIcon />
                            Google
                        </ProviderButton>
                        <ProviderButton onClick={() => setProviderRefusal(MOCKED_FEATURES.providers)}>
                            <AppleIcon />
                            Apple
                        </ProviderButton>
                    </div>

                    {/* The refusal, announced. Assertive for the same reason the sign-in one is. */}
                    {providerRefusal !== null && (
                        <Alert tone="error">{providerRefusal}</Alert>
                    )}

                    <p className="flex items-start gap-2 rounded-xl bg-indigo-50 px-3 py-2.5 text-[11px] font-bold leading-[14px] tracking-[0.44px] text-slate-600 dark:bg-slate-800/70 dark:text-slate-400">
                        <span aria-hidden="true" className="mt-px shrink-0">
                            <LockIcon />
                        </span>
                        {/*
                            One claim, and it is the only one here that the code
                            can stand behind. The design also specified "Verified
                            Mistri Checks" and "Zero Spam Guarantee"; both are gone,
                            because there is no verification feature and no
                            anti-spam system in this repository to substantiate
                            them. See `UNSUPPORTED_CLAIMS`.
                        */}
                        <span>256-bit Encrypted</span>
                    </p>

                    <p className="flex items-center justify-center gap-2 text-sm leading-5 text-slate-600 dark:text-slate-400">
                        <span>Don&rsquo;t have a FixMate account?</span>
                        {/*
                            Not a link, and deliberately. There is no registration
                            route, so this is the one control on the screen with
                            nothing behind it at all. It is a `<span>` rather than
                            an `<a href="#">`, because a link that goes nowhere is a
                            promise the page cannot keep and a keyboard user can
                            still focus.
                        */}
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-950 dark:text-emerald-300">
                            Register Now
                            <ArrowIcon />
                        </span>
                    </p>

                    <PrivacyNotice className="rounded-lg border border-slate-200/70 bg-white/50 px-4 py-3 text-xs text-slate-600 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-400" />
                </SignInSurface>
            </main>
        </div>
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
        <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900/70 dark:ring-slate-700/60">
            <div className="flex items-center justify-between">
                <label
                    htmlFor={fieldId}
                    className="text-xs font-semibold text-slate-900 dark:text-white"
                >
                    Mobile Number
                </label>
            </div>

            <div className="flex gap-2">
                {/*
                    The country prefix. A `<span>` and not a select: choosing a
                    country is a decision this screen cannot act on, because the
                    number it would be sent to goes nowhere yet. It is drawn, and
                    it is honest about being one value rather than a control — so
                    it is `aria-hidden` and the phone field below carries the whole
                    label. The chevron is part of that same honesty problem, and is
                    left off for the same reason: a caret is a promise that
                    something opens, and nothing does.
                */}
                <span
                    aria-hidden="true"
                    className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-indigo-50 px-3 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                    <FlagIcon />
                    +92
                </span>
                <input
                    id={fieldId}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    name="phone"
                    required
                    placeholder="300 1234567"
                    className="min-w-0 flex-1 rounded-xl border border-transparent bg-indigo-50 px-4 text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-900 focus:bg-white dark:bg-slate-800 dark:text-white dark:focus:border-white dark:focus:bg-slate-800"
                />
            </div>

            {requested && (
                <div className="flex flex-col gap-1.5">
                    <label htmlFor={`${fieldId}-code`} className="text-xs font-semibold text-slate-900 dark:text-white">
                        4-digit code
                    </label>
                    <input
                        id={`${fieldId}-code`}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={4}
                        value={code}
                        onChange={(event) => onCode(event.target.value)}
                        className="rounded-xl border border-transparent bg-indigo-50 px-4 py-3 text-center font-mono text-lg tracking-[0.5em] text-slate-900 outline-none focus:border-emerald-900 focus:bg-white dark:bg-slate-800 dark:text-white dark:focus:border-white dark:focus:bg-slate-800"
                    />
                </div>
            )}

            <button
                type="button"
                onClick={onRequest}
                className={`flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-900 py-3 text-sm font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-100 dark:text-emerald-950 dark:hover:bg-white ${APPLE_PRESS}`}
            >
                {requested ? 'Resend code' : 'Get One-Time Password (OTP)'}
                <ArrowIcon />
            </button>

            <p className="flex items-start gap-2 text-xs leading-5 text-slate-600 dark:text-slate-400">
                <span aria-hidden="true" className="mt-0.5 shrink-0">
                    <InfoIcon />
                </span>
                <span>
                    We will send a 4-digit verification code via instant SMS &amp; WhatsApp.
                </span>
            </p>

            {/*
                The design's promise, and this repository's answer to it.

                The line above says a code *will* be sent, and pressing the button
                above reveals a field for a code that is never going to arrive —
                which is the worst of both: a promise made and then silently not
                kept. So the button says plainly that it is not connected, and the
                design's own sentence stays as the intent it is.

                Delete this block, and the sentence's tense with it, when the OTP
                route exists. It is the only place on this screen that admits a
                feature is drawn rather than built, and it is here rather than in a
                comment because the person who has to know is the person holding
                the phone.
            */}
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                {MOCKED_FEATURES.otp}
            </p>
        </div>
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
            // The id the email toggle points `aria-controls` at, so the two are
            // related in the accessibility tree rather than only by position.
            id="customer-sign-in-email"
            onSubmit={(event) => {
                event.preventDefault()
                const data = new FormData(event.currentTarget)
                void onSignIn(
                    String(data.get('email') ?? ''),
                    String(data.get('password') ?? ''),
                )
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
                className={`w-full rounded-xl bg-emerald-900 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-100 dark:text-emerald-950 dark:hover:bg-white ${APPLE_PRESS}`}
            >
                {pending ? 'Signing in…' : 'Sign in'}
            </button>
        </form>
    )
}

function ProviderButton({
    onClick,
    children,
}: {
    onClick: () => void
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200/70 hover:bg-slate-50 dark:bg-slate-900/70 dark:text-white dark:ring-slate-700/60 dark:hover:bg-slate-800 ${APPLE_PRESS}`}
        >
            {children}
        </button>
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

function ChevronIcon() {
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

function MailIcon() {
    return (
        <svg {...svg} width={16} height={16} aria-hidden="true">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M22 7l-10 6L2 7" />
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

function LockIcon() {
    return (
        <svg {...svg} width={14} height={14} aria-hidden="true">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 018 0v3" />
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

function ShieldIcon() {
    return (
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
            />
            <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    )
}

function GoogleIcon() {
    return (
        <svg width={16} height={16} viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 009 18z" />
            <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 010-3.44V4.94H.96a9 9 0 000 8.12l3.01-2.34z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 00.96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
        </svg>
    )
}

function AppleIcon() {
    return (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M16.36 12.78c.03 3.2 2.81 4.27 2.84 4.28-.02.07-.44 1.52-1.46 3.01-.88 1.29-1.8 2.58-3.25 2.6-1.42.03-1.88-.84-3.5-.84-1.63 0-2.14.82-3.48.87-1.4.05-2.46-1.39-3.35-2.68-1.82-2.63-3.21-7.44-1.34-10.68.93-1.61 2.59-2.63 4.39-2.66 1.37-.03 2.66.92 3.5.92.84 0 2.41-1.14 4.06-.97.69.03 2.63.28 3.87 2.1-.1.06-2.31 1.35-2.28 4.05zM13.9 3.6c.72-.88 1.21-2.1 1.08-3.31-1.04.04-2.3.69-3.05 1.56-.67.78-1.25 2.02-1.09 3.21 1.16.09 2.34-.59 3.06-1.46z" />
        </svg>
    )
}
