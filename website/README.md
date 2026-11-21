# Aether Interactive Showcase Website

Static showcase page and mocked in-browser interactive workbench demo (`index.html` + `demo.html`).

## Prerequisites

Because `website/` reuses UI components and stores directly from `app/src/` (and links `@tailwindcss/vite` / Lucide / React dependencies resolved from `app/node_modules`), install the desktop app dependencies **before** installing or building `website/`:

```bash
cd app
npm ci
cd ../website
npm ci
npm run build
```

## Development

```bash
cd website
npm run dev
```
