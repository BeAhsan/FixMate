import type { NextConfig } from 'next';

/**
 * The end user's application is a static export.
 *
 * `output: 'export'` is what makes the image in this directory possible: there
 * is no Node process at runtime, so `next build` writes a directory of HTML,
 * CSS and JavaScript that nginx can serve directly. Nothing in the running
 * container can execute application code, which is the property the four
 * front-end images are built around.
 *
 * `trailingSlash` is set so the export writes `index.html` inside a directory
 * per route (`out/dashboard/index.html`) rather than `out/dashboard.html`.
 * That is what lets the nginx config answer `/dashboard` with
 * `try_files $uri $uri/ $uri/index.html` using one rule for every route, so a
 * new page needs no change to the server configuration.
 */
const nextConfig: NextConfig = {
    output: 'export',
    trailingSlash: true,
};

export default nextConfig;
