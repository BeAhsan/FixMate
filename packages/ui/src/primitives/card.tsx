import type { ReactNode } from 'react'

/**
 * A titled panel. The one piece of layout the four dashboards all need.
 *
 * `<section>` with an accessible name rather than a `<div>`, so a screen reader
 * can list the regions on a page and jump between them.
 */
export function Card({
    title,
    children,
    className,
    headingLevel = 2,
}: {
    title?: string
    children: ReactNode
    className?: string
    headingLevel?: 2 | 3
}) {
    const Heading = headingLevel === 2 ? 'h2' : 'h3'

    return (
        <section
            aria-label={title}
            className={[
                'flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {title !== undefined && <Heading className="text-lg font-semibold">{title}</Heading>}
            {children}
        </section>
    )
}

/**
 * An empty state.
 *
 * Distinguishing "nothing here yet" from "this failed to load" is a real
 * distinction and user story 54 is about exactly that: a dashboard showing an
 * empty state has told the person something, and one showing an error has not.
 * They are therefore different components with different wording, not one
 * component with a flag.
 */
export function EmptyState({
    title,
    children,
}: {
    title: string
    children?: ReactNode
}) {
    return (
        <div
            data-empty-state
            className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700"
        >
            <p className="font-medium">{title}</p>
            {children !== undefined && <div className="text-sm text-slate-600 dark:text-slate-400">{children}</div>}
        </div>
    )
}
