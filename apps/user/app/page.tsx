'use client'

import { CustomerDashboard } from '@fixmate/session'

/**
 * The end user's landing screen.
 *
 * Wrapped in the export marker so the packaging check can identify this image's
 * index.html. The marker is a real attribute rather than a comment, because a
 * comment would not survive minification and its absence would be
 * indistinguishable from a build that silently stopped rendering.
 */
export default function HomePage() {
    return (
        <div data-export-marker="user-app">
            <CustomerDashboard />
        </div>
    )
}