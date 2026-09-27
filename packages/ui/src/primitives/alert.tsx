'use client'

import type { ReactNode } from 'react'

/**
 * A message that is announced when it appears.
 *
 * The `tone` decides the role, and the roles are not interchangeable:
 *
 * - `error` is `role="alert"` — assertive, so it interrupts. A refused sign-in is
 *   the one thing on the screen that matters at that moment, and a polite region
 *   would let somebody keep typing before it was read.
 * - `status` and `info` are `role="status"` — polite, announced without
 *   interrupting. A loading message that interrupts is worse than no message.
 *
 * Colour never carries the meaning on its own: every tone has a word in it, so
 * the message is legible without colour vision and in a high-contrast theme.
 */
export type AlertTone = 'error' | 'status' | 'info'

const TONES: Record<AlertTone, string> = {
    error:
        'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
    status:
        'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
    info: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100',
}

export interface AlertProps {
    tone: AlertTone
    children: ReactNode
    className?: string
}

export function Alert({ tone, children, className }: AlertProps) {
    return (
        <div
            role={tone === 'error' ? 'alert' : 'status'}
            className={[
                'rounded-lg border px-4 py-3 text-sm',
                TONES[tone],
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {children}
        </div>
    )
}
