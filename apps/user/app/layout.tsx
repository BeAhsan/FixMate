import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
    title: 'FixMate',
    description: 'The FixMate end user application.',
};

/**
 * The root layout. `<html>` and `<body>` are rendered here rather than in a
 * page, because a static export has exactly one HTML document per route and
 * Next.js requires both elements to be present in the layout that wraps them.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body className="min-h-screen">{children}</body>
        </html>
    );
}
