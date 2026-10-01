'use client'

import type { ReactNode } from 'react'

/**
 * The floating surface the sign-in screen sits on, in the Apple idiom.
 *
 * This is **a surface, not a screen.** It renders no form, holds no state and
 * knows nothing about a session: the sign-in markup, the fields and the button
 * all stay in `SignInForm`, which is shared by the four applications. What lives
 * here is the set of classes that make a container read as material — translucency,
 * a bright top edge where light catches it, a shadow heavy enough to lift it off
 * the ground, and the reduced-transparency and increased-contrast answers.
 *
 * It is opt-in per application, through `signInSurface: 'apple'` on the
 * application definition. The other three doors keep the flat, opaque screen they
 * have today, which is why nothing here is a default.
 *
 * Three rules from the material guidance, each load-bearing:
 *
 * 1. **Never stack a light translucent surface on another.** Legibility collapses
 *    the moment you do, so the page behind this is an opaque ground and only this
 *    one layer is translucent.
 * 2. **A bigger surface reads as a thicker one** — a deeper shadow than a small
 *    chip would get, because a small blur on a large panel looks like a rendering
 *    artefact rather than depth.
 * 3. **Vibrancy over a blurred background** means higher contrast and a little
 *    extra tracking on the text, not a flat grey. Flat grey over a blurred ground
 *    is exactly the case that stops being readable.
 */
export interface SignInSurfaceProps {
    children: ReactNode
    className?: string
}

/**
 * The page ground behind the surface.
 *
 * Exported on its own because the surface is not the whole screen: a screen that
 * wants this treatment needs the ground too, and a screen that does not must not
 * acquire one by accident.
 */
export const APPLE_GROUND =
    'bg-slate-100 dark:bg-slate-950 selection:bg-indigo-200 dark:selection:bg-indigo-500/40'

/**
 * The panel itself.
 *
 * `backdrop-blur-2xl` with a `saturate-150` on top, because translucency over a
 * flat colour is just a flat colour — the saturation bump is what makes the
 * ground *show through* as material rather than as a tinted rectangle.
 *
 * The `ring-inset` on the top edge is the bright hairline that reads as light
 * catching a surface. It is one pixel and it is most of the effect.
 *
 * The `prefers-reduced-transparency` and `prefers-contrast` answers are
 * `@media` rules in the same class list via Tailwind's `supports-` and
 * arbitrary-variant syntax. Reducing transparency means going near-opaque
 * rather than removing the blur: a panel with no background at all over a busy
 * ground is less legible than the translucent one, not more.
 */
export const APPLE_SURFACE = [
    // The typeface, as a variable with the platform face behind it.
    //
    // The material guidance says to prefer the system font and override only with
    // a reason; the reason here is a design that specifies Plus Jakarta Sans. It
    // is written as `var(--font-jakarta, system-ui, …)` rather than the bare
    // family name because this package is shared: the other three applications
    // never load that variable, and a bare name would render in a fallback
    // nobody chose.
    '[font-family:var(--font-jakarta,system-ui,-apple-system,sans-serif)]',
    'rounded-3xl border border-white/60 bg-white/70 shadow-xl shadow-slate-900/10',
    'backdrop-blur-2xl backdrop-saturate-150',
    'dark:border-white/10 dark:bg-slate-900/70 dark:shadow-black/40',
    // Reduced transparency: near-opaque, blur dropped. Legibility is the point,
    // and "no background" is not the same answer as "less see-through".
    '[@media(prefers-reduced-transparency:reduce)]:bg-white/95',
    '[@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none',
    'dark:[@media(prefers-reduced-transparency:reduce)]:bg-slate-900/95',
    // More contrast: a defined border and an opaque ground, because the hairline
    // and the translucency are both carrying meaning that contrast mode needs
    // stated outright.
    '[@media(prefers-contrast:more)]:border-slate-900',
    '[@media(prefers-contrast:more)]:bg-white',
    'dark:[@media(prefers-contrast:more)]:border-slate-100',
    'dark:[@media(prefers-contrast:more)]:bg-slate-950',
].join(' ')

/**
 * A press that answers on pointer-down.
 *
 * The material guidance is explicit that feedback waits for `click` and that the
 * result feels dead; `:active` fires on press, and the scale is small enough
 * (0.98) to read as a press rather than a bounce. Deliberately **not** a spring:
 * springs are for things that carry momentum, and a button press does not.
 *
 * `motion-reduce` drops the movement and keeps the tint, because reduced motion
 * means no *vestibular* feedback — not no feedback at all. A button that gives
 * nothing back is a button that feels broken.
 */
export const APPLE_PRESS =
    'transition-[transform,background-color] duration-150 ease-out active:scale-[0.98] motion-reduce:transform-none'

export function SignInSurface({ children, className }: SignInSurfaceProps) {
    return <div className={[APPLE_SURFACE, className].filter(Boolean).join(' ')}>{children}</div>
}
