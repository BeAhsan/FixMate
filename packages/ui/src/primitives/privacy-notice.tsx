'use client'

/**
 * The privacy notice shown on the sign-in screen. Story 22.
 *
 * **The wording is a product decision and this is a placeholder for it.** It is
 * written to be accurate about what the code demonstrably does, because the one
 * thing worse than no privacy notice is a privacy notice that is not true.
 *
 * What is claimed, and where each claim is verifiable:
 *
 *   * An email address and a password are sent to the sign-in endpoint. True, and
 *     the four routes are `routes/api.php` with nothing else on them.
 *   * Nothing is written to browser storage except a renewal token. True, and the
 *     reason the access token is never persisted is the whole design of
 *     `packages/session`; `noteActivity` and this component change nothing there.
 *   * Failed sign-ins are throttled per account type. True, and the throttle is on
 *     the route.
 *
 * What is deliberately **not** claimed: how long anything is kept, who can see an
 * account, what a super administrator may do, and what happens to the address
 * afterwards. The first is not modelled anywhere, the second is the account
 * directory from ticket 25, and the third is out of scope in the specification.
 * Every one of those is a real part of a privacy notice and every one would be a
 * claim this repository cannot currently support.
 *
 * It sits after the form rather than before it, on the reasoning that a notice
 * above the fold competes with the thing the person came to do. It is still on
 * the same screen and still read before anyone can act on the account.
 *
 * Kept as a component rather than inlined into `SignInForm` so the wording is one
 * string in one place. Four applications share this screen, and four copies of a
 * paragraph that has to stay accurate is four places for it to stop being accurate.
 */
export function PrivacyNotice({ className }: { className?: string }) {
    return (
        <aside
            aria-labelledby="privacy-notice-heading"
            className={[
                'rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <h2 id="privacy-notice-heading" className="font-medium">
                What happens when you sign in
            </h2>
            <p className="mt-1.5">
                Your email address and password are sent to this application&rsquo;s sign-in
                endpoint to check them. Your password is never stored by this page, and no
                copy of it is kept in your browser. The one credential this page does keep
                is a renewal token, so that you stay signed in when you come back &mdash; and
                it is replaced every time it is used. Repeated failed attempts from your
                account type are counted and slowed down.
            </p>
        </aside>
    )
}
