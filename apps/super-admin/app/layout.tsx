import { Providers } from './providers'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
    title: 'FixMate Super Admin',
    description: 'The FixMate super administrator application.',
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
        <html lang="en">
            <body className="min-h-screen">
                <Providers>{children}</Providers>
            </body>
        </html>
    )
}
