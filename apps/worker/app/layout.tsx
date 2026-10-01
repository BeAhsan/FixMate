import { Plus_Jakarta_Sans } from 'next/font/google'
import { Providers } from './providers'
import type { ReactNode } from 'react'
import './globals.css'

/**
 * Plus Jakarta Sans, exposed as a CSS variable rather than applied to the page.
 *
 * The same arrangement as the end user's application, and for the same reasons:
 * only this application's sign-in screen uses the face, the variable is declared
 * here and referred to by the one place that wants it, and the
 * `var(--font-jakarta, system-ui, …)` fallback in the consumer means the two
 * applications that never load it are unaffected.
 *
 * `next/font` self-hosts the file, so there is no third-party request at run time
 * and no flash of fallback text on first paint.
 */
const jakarta = Plus_Jakarta_Sans({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-jakarta',
    weight: ['400', '500', '600', '700'],
})

export const metadata = {
    title: 'FixMate',
    description: 'The FixMate worker application.',
}

/**
 * The root layout: a server component, because `metadata` can only be exported
 * from one.
 *
 * `Providers` is the client boundary, and it has to be a separate file - see its
 * docblock for the Next.js constraint that forces it. The session restore lives
 * in there rather than here for the same reason: the access token is in memory,
 * so every page has to restore it on arrival, and the one place that cannot be
 * forgotten is the layout wrapping all of them.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className={jakarta.variable}>
            <body className="min-h-screen">
                <Providers>{children}</Providers>
            </body>
        </html>
    )
}
