'use client'

import { APPLE_PRESS } from '@fixmate/ui'

/**
 * The bottom tab bar the dashboard design draws.
 *
 * Three tabs, not four: the design also draws **Messages**, and this repository
 * has no messaging — no model, no route, no operation, and nowhere a message
 * would be stored. A tab that opens a dead page is a lie about the product, so
 * it is left out until there is something behind it. The design will keep drawing
 * it; this comment is why.
 *
 * Real anchors rather than buttons, because each tab is a **page** in a static
 * export and not an in-place view switch. A static export has no client-side
 * router to change without a navigation, so a button here would have to hold the
 * current route in state — a second source of truth for where the person is,
 * which is exactly what a URL is for.
 *
 * `aria-current="page"` on the active tab is not decoration. The active tab is
 * marked by colour and weight in the design, and colour alone says nothing to
 * anybody who cannot see it.
 *
 * ## The middle tab pointed at the wrong page until there was a list to point at
 *
 * It read **Bookings** and pointed at `/booking-details/`, which is one booking —
 * a plural tab delivering a singular, left in place because the page behind it
 * looked finished. It now points at `/bookings/`, where `has_quote` decides which
 * rows lead to the detail page and which do not.
 *
 * **`/booking-details/` is reachable from exactly one place**, and that is a
 * reduction rather than a mistake. It has no tab of its own because it was never
 * a section; it is a destination the bookings list links to. Adding it back as a
 * fourth tab would put the same screen in two places in the navigation, which is
 * how a person ends up not knowing which one to go to.
 */
export interface TabBarProps {
    /** The path currently being shown, so one tab can be marked as current. */
    currentPath: string
}

const TABS = [
    { href: '/', label: 'Home' },
    { href: '/bookings/', label: 'Bookings' },
    { href: '/account/', label: 'Profile' },
] as const

export function TabBar({ currentPath }: TabBarProps) {
    return (
        <nav
            aria-label="Customer sections"
            className={`sticky bottom-0 z-10 border-t border-[#F1F5F9] bg-white/95 backdrop-blur-xl backdrop-saturate-150 dark:border-[#243350] dark:bg-[#0B1220]/95`}
        >
            <ul className="mx-auto flex w-full max-w-md items-stretch justify-around">
                {TABS.map((tab) => {
                    const current = tab.href === currentPath

                    return (
                        <li key={tab.href} className="min-w-0 flex-1">
                            <a
                                href={tab.href}
                                aria-current={current ? 'page' : undefined}
                                className={[
                                    'flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px]',
                                    current
                                        ? 'font-bold text-[#114B43] dark:text-[#6FFBBE]'
                                        : 'font-medium text-[#94A3B8] hover:bg-slate-900/5 dark:text-[#64748B] dark:hover:bg-white/10',
                                    APPLE_PRESS,
                                ].join(' ')}
                            >
                                <TabIcon label={tab.label} current={current} />
                                {tab.label}
                            </a>
                        </li>
                    )
                })}
            </ul>
        </nav>
    )
}

/**
 * The three tab glyphs.
 *
 * Drawn rather than imported, and `aria-hidden`: the label beside each one
 * already says what the tab is, so an announced icon would repeat it. `current`
 * fills the glyph, which is the design's second signal alongside weight — and it
 * is a second signal rather than the only one, because `aria-current` on the
 * anchor is the one that is actually announced.
 *
 * `label` rather than `name`: the switch is keyed on the visible text, so
 * renaming a tab changes its glyph with it. A separate icon key would let the two
 * drift apart, and a mismatched glyph is worse than no glyph at all.
 */
function TabIcon({
    label,
    current = false,
}: {
    label: string
    current?: boolean
}) {
    const svg = {
        width: 22,
        height: 22,
        viewBox: '0 0 24 24',
        fill: current ? 'currentColor' : 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        'aria-hidden': true,
    }

    if (label === 'Home') {
        return (
            <svg {...svg}>
                <path d="M3 10.5L12 3l9 7.5" />
                <path d="M5 9.5V20h14V9.5" />
            </svg>
        )
    }

    if (label === 'Bookings') {
        return (
            <svg {...svg}>
                <rect x="3" y="5" width="18" height="16" rx="3" />
                <path d="M8 3v4M16 3v4M3 10h18" />
            </svg>
        )
    }

    return (
        <svg {...svg}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
        </svg>
    )
}