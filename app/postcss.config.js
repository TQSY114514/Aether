module.exports = {
  plugins: {
    // Tailwind 4 via PostCSS (not the vite plugin — the vite plugin's content
    // scanner silently drops arbitrary-value classes like text-[11px] and
    // fractional spacing like gap-1.5; the PostCSS pipeline shares the CLI
    // core which generates them correctly).
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
}
