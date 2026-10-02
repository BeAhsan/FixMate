'use client'

import { MatchingResults } from '@fixmate/session'
import { operations } from '@/lib/application'

/**
 * The search-and-match results, at `/matching-results/`.
 *
 * Pure delegation, like every other page in this application: the screen draws its
 * own header and fetches, and an application does neither. It hands over the
 * loader and the screen decides when to call it.
 *
 * **The loader is a property, not a call.** `operations.matching` is read as a
 * value rather than invoked here, so the screen receives a function it calls when
 * it is ready. Calling it in this file would start a request during render, and
 * the screen's loading state — the one a person sees first — would never appear.
 */
export default function MatchingResultsPage() {
    return <MatchingResults loadMatching={() => operations.matching()} />
}