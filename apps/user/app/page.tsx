'use client'

import { CustomerDashboard } from '@fixmate/session'
import { operations } from '../lib/application'

/**
 * The end user's landing screen.
 *
 * Wrapped in the export marker so the packaging check can identify this image's
 * index.html. The marker is a real attribute rather than a comment, because a
 * comment would not survive minification and its absence would be
 * indistinguishable from a build that silently stopped rendering.
 *
 * ## This page reads two endpoints, and the second one was nearly forgotten
 *
 * The job card reads `GET /users/tracking` and the categories and the carousel
 * read `GET /users/discovery`. Both loaders are handed over rather than called
 * here, so the screen decides when to fetch — which is also what makes it
 * testable: given functions, all three of its states render without a network at
 * all.
 *
 * **A missing loader is not a build failure, and that is worth stating.** The
 * dashboard's props are optional and default to a rejected promise, precisely so
 * a screen whose failure path was unreachable would be one nobody wrote. The cost
 * is that omitting `loadDiscovery` renders a dashboard with two empty sections
 * and no error anywhere — which is what this page did for a while, and the only
 * thing that caught it was the screen's own test asserting the categories are
 * absent while loading.
 *
 * The two loaders are written the same way rather than one passed bare. Passing
 * `operations.tracking` directly happens to work, because the bound operation
 * already takes no arguments, and a reader comparing the three customer pages
 * should not have to work out which style each one picked.
 */
export default function HomePage() {
    return (
        <div data-export-marker="user-app">
            <CustomerDashboard
                loadTracking={() => operations.tracking()}
                loadDiscovery={() => operations.discovery()}
            />
        </div>
    )
}
