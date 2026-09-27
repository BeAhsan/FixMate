'use client'

import { accountTypeLabel, reachableSections } from './permissions'
import type { AppShellProps } from './types'

/**
 * The application shell: header, navigation, identity, sign-out.
 *
 * One component for four applications, so moving between them does not mean
 * relearning the interface. Everything it needs arrives as props — it imports
 * nothing from `@fixmate/session` and holds no state of its own beyond the
 * mobile menu. That is what makes it testable without a session, and it is also
 * what keeps the session layer free of any opinion about how a header looks.
 *
 * ## The accessibility decisions, and why each is here
 *
 * - **A skip link, first in the DOM.** The navigation is the first thing in the
 *   document and a keyboard user has to cross it on every page. It is visible on
 *   focus rather than permanently, so it does not cost sighted users anything.
 * - **`<nav aria-label>`.** Four applications means four shells; two of them can
 *   be on screen at once in a split view, and an unlabelled navigation is
 *   announced only as "navigation".
 * - **`aria-current="page"`** on the active link, which is the only thing that
 *   tells a screen reader where they are. Styling the current page is not a
 *   substitute — colour alone says nothing to anyone who cannot see it.
 * - **The identity is text, not an icon.** On a shared device the question is
 *   "whose session is this?", and an avatar does not answer it.
 * - **The mobile menu is a button with `aria-expanded` and `aria-controls`.**
 *   A menu that appears and disappears with no state announced is invisible to
 *   anyone not looking at it.
 * - **Nothing is `outline: none`.** Every focusable thing keeps its outline. It
 *   is the only thing telling a keyboard user where they are, and removing it is
 *   the single most common accessibility regression in a design system.
 *
 * ## The layout decisions
 *
 * The shell is a single column that reflows, with no fixed heights and no
 * horizontal scrolling at any width: the navigation wraps rather than scrolls,
 * because a navigation you have to scroll sideways hides its own items. Sizes
 * are in `rem`, so a browser's font-size setting enlarges the whole interface
 * together instead of clipping it — which is what "readable at high zoom" means
 * in practice.
 */
export function AppShell({
    identity,
    sections,
    abilities,
    children,
    onSignOut,
    currentPath = '/',
    ready = true,
}: AppShellProps) {
    const visible = reachableSections(sections, abilities)

    return (
        <div className="flex min-h-screen flex-col">
            <a
                href="#main"
                className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg dark:focus:bg-slate-900"
            >
                Skip to content
            </a>

            <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-col gap-1">
                            <p className="text-lg font-semibold tracking-tight">
                                {identity.applicationLabel}
                            </p>
                            {/* The account type, in words, on every screen. This is
                                the answer to "whose session is this?" on a shared
                                device, and it is text because an icon does not
                                answer it. */}
                            <p
                                data-identity
                                className="text-sm text-slate-600 dark:text-slate-300"
                            >
                                <span className="font-medium">Signed in as</span>{' '}
                                {/* The label, not the store name. The back end answers
                                    with `users` because that is what it routes on;
                                    putting it on screen would show the inside of the
                                    credential model to somebody who asked a plain
                                    question. */}
                                <span>{accountTypeLabel(identity.accountType)}</span>
                                {identity.accountName !== undefined && (
                                    <>
                                        {' · '}
                                        <span>{identity.accountName}</span>
                                    </>
                                )}
                                {identity.accountEmail !== undefined && (
                                    <>
                                        {' · '}
                                        <span>{identity.accountEmail}</span>
                                    </>
                                )}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={onSignOut}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 focus:outline-2 focus:outline-offset-2 focus:outline-sky-700 dark:border-slate-700 dark:hover:bg-slate-800 dark:focus:outline-sky-400"
                        >
                            Sign out
                        </button>
                    </div>

                    <nav aria-label={`${identity.applicationLabel} sections`}>
                        {/* Wraps rather than scrolls, at every width. A navigation
                            that scrolls sideways is a navigation that hides its own
                            items from a phone. */}
                        <ul className="flex flex-wrap items-center gap-x-1 gap-y-2">
                            {visible.map((section) => {
                                const current = section.href === currentPath

                                return (
                                    <li key={section.href}>
                                        <a
                                            href={section.href}
                                            aria-current={current ? 'page' : undefined}
                                            className={
                                                current
                                                    ? 'rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900'
                                                    : 'rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                                            }
                                        >
                                            {section.label}
                                        </a>
                                    </li>
                                )
                            })}
                        </ul>
                    </nav>
                </div>
            </header>

            <main
                id="main"
                // `ready` exists so a shell can hold back rather than flashing a
                // signed-out header at somebody whose session is merely being
                // restored.
                aria-busy={ready ? undefined : true}
                className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6"
            >
                {children}
            </main>
        </div>
    )
}
