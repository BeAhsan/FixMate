/**
 * Tailwind v4 is configured entirely in CSS - there is no `tailwind.config.js`,
 * and the PostCSS plugin is imported by name rather than required from a path.
 */
const config = {
    plugins: {
        '@tailwindcss/postcss': {},
    },
};

export default config;
