'use client'

import { SessionProvider } from '@/lib/application'
import type { ReactNode } from 'react'

/**
 * The client boundary the server layout renders.
 *
 * This file exists because of one constraint in Next.js, and it is worth stating
 * because the failure it prevents is a confusing one.
 *
 * `app/layout.tsx` must be a server component - it is where `metadata` is
 * exported, and a client component cannot export it. But `lib/application` calls
 * `createApplication()` at module scope, and `createApplication` lives in a
 * client module. So a server layout that imported it directly would be asking
 * Next.js to *call* a client function during a server render, which it refuses:
 *
 *     Attempted to call createApplication() from the server but
 *     createApplication is on the client.
 *
 * The fix is this file. The server layout imports a *component* from the client
 * graph, which is exactly what is allowed; it never imports the module that does
 * the calling. One thin file, and the build stops failing at a message that does
 * not mention the layout at all.
 */
export function Providers({ children }: { children: ReactNode }) {
    return <SessionProvider>{children}</SessionProvider>
}
