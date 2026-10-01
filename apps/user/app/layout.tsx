import { Plus_Jakarta_Sans } from 'next/font/google'
import { Providers } from './providers'
import type { ReactNode } from 'react'
import './globals.css'

/**
 * Plus Jakarta Sans, exposed as a CSS variable rather than applied to the page.
 *
 * Only the sign-in surface uses it, and only this application asks for that
 * surface — so the variable is declared here and the one place that wants the
 * face refers to it. Applying it to `<body>` would restyle the dashboard and the
 * shell too, which is a larger change than the one that was asked for.
 *
 * A variable with a `system-ui` fallback in the *consumer* means the other three
 * applications, which never load this font and never render this surface, are
 * unaffected by its absence.
 *
 * `next/font` self-hosts the file: the font is downloaded at build time and
 * served from this origin, so there is no third-party request at run time and no
 * flash of fallback text on first paint.
 */
const jakarta = Plus_Jakarta_Sans({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-jakarta',
    weight: ['400', '500', '600', '700'],
})

export const metadata = {
    title: 'FixMate',
    description: 'The FixMate end user application.',
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
