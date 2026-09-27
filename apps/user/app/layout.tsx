import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SessionProvider } from './session-provider';
import './globals.css';

export const metadata: Metadata = {
    title: 'FixMate',
    description: 'The FixMate end user application.',
};

/**
 * The root layout. `<html>` and `<body>` are rendered here rather than in a
 * page, because a static export has exactly one HTML document per route and
 * Next.js requires both elements to be present in the layout that wraps them.
 *
 * The session provider is here rather than in a page for the reason its own
 * docblock gives: the access token is in memory, so every page has to restore it
 * on arrival, and the one place that cannot be forgotten is the layout that
 * wraps all of them.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body className="min-h-screen">
                <SessionProvider>{children}</SessionProvider>
            </body>
        </html>
    );
}
