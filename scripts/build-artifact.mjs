// Bundles the same app into one self-contained page that runs as a Claude artifact.
// Usage: node scripts/build-artifact.mjs [output.html] [--standalone]
// --standalone writes a complete web page (doctype, head, body) for static hosts such as GitHub Pages.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const standalone = args.includes('--standalone');
const outArg = args.find((a) => !a.startsWith('--'));
const out = resolve(outArg ?? resolve(root, 'artifact/dist/orvane-scout.html'));

const result = await build({
  entryPoints: [resolve(root, 'artifact/entry.tsx')],
  bundle: true, minify: true, write: false, format: 'iife', target: 'es2020', platform: 'browser',
  jsx: 'automatic', legalComments: 'none', logLevel: 'error',
  alias: { '@': root },
  define: { 'process.env.NODE_ENV': '"production"' },
});
const js = result.outputFiles[0].text;
if (/<\/script/i.test(js)) throw new Error('The bundle contains a closing script tag and cannot be inlined safely.');

const css = readFileSync(resolve(root, 'app/globals.css'), 'utf8');
// An artifact fills its frame and looks after its own side gutters.
const frame = `
:root { color-scheme: light; }
html, body, #root { height: 100%; }
.app { height: 100%; }
.header, .bar, .main { padding-left: max(1.5rem, env(safe-area-inset-left, 0px)); padding-right: max(1.5rem, env(safe-area-inset-right, 0px)); }
@media (max-width: 560px) {
  .header, .bar, .main { padding-left: max(1rem, env(safe-area-inset-left, 0px)); padding-right: max(1rem, env(safe-area-inset-right, 0px)); }
}
`;

const html = `<title>Orvane Scout</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400..700&family=Urbanist:wght@400..700&display=swap" rel="stylesheet">
<style>
${css}
${frame}</style>
<div id="root"></div>
<script>
${js}
</script>
`;
// A static host serves the file as it is, so it needs the document skeleton the artifact viewer would add.
const page = standalone
  ? `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f5f5f5">
<meta name="description" content="Scout, an AI sourcing agent inside Orvane, a concept B2B marketplace. All data is simulated.">
<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(readFileSync(resolve(root, 'app/icon.svg'))).toString('base64')}">
<style>html, body { margin: 0; }</style>
</head>
<body>
${html}</body>
</html>
`
  : html;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`Wrote ${out} (${Math.round(page.length / 1024)} KB)`);
