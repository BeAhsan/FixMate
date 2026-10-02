'use client'

import { AiDiagnosis } from '@fixmate/session'
import { operations } from '@/lib/application'

/**
 * The AI Problem Diagnosis screen, at `/diagnosis/`.
 *
 * Pure delegation, like every other page in this application, and it is worth
 * saying why that is not a limitation. The screen draws its own header, so it
 * cannot live under `app/` — `FrontEndApplicationsTest` fails any `<header`
 * written here, because that is the shape a copied shell takes. It also fetches,
 * and an application does not fetch: it holds the operations bound to its own
 * door and hands them over.
 *
 * **The two loaders are properties, not calls.** `operations.diagnosis` is read
 * as a value rather than invoked, so the screen receives a function it can call
 * when it is ready. Writing `() => operations.diagnosis()` instead would be the
 * same thing here, but it would obscure the reason the screen takes a loader at
 * all: it is what makes the screen renderable with no network, and therefore
 * testable in all three of its states.
 */
export default function DiagnosisPage() {
    return (
        <AiDiagnosis
            loadDiagnosis={() => operations.diagnosis()}
            loadSuggestions={() => operations.diagnosisSuggestions()}
        />
    )
}