'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * A button, and a link that looks like one.
 *
 * Both are here because "a link that looks like a button" is a real and common
 * mistake with a real cost: it navigates, so it cannot be opened in a new tab,
 * middle-clicked, or triggered from the keyboard the way a button can be. The
 * two primitives exist so a decision has to be made deliberately.
 */

type Variant = 'primary' | 'secondary'

const VARIANTS: Record<Variant, string> = {
    primary:
        'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white',
    secondary:
        'border border-slate-300 text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800',
}

/**
 * `outline` rather than `outline-none`, on every interactive element.
 *
 * This is the single most common accessibility regression in a design system and
 * it is invisible in a screenshot: the outline is the only thing telling a
 * keyboard user where they are, and removing it makes the interface unusable
 * rather than merely less pretty.
 */
const FOCUS =
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 dark:focus-visible:outline-sky-400'

const BASE =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant
    children: ReactNode
}

export function Button({ variant = 'primary', className, children, ...rest }: ButtonProps) {
    return (
        <button
            {...rest}
            className={[BASE, VARIANTS[variant], FOCUS, className].filter(Boolean).join(' ')}
        >
            {children}
        </button>
    )
}
