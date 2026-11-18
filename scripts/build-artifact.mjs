// Bundles the same app into one self-contained page that runs as a Claude artifact.
// Usage: node scripts/build-artifact.mjs [output.html]
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? resolve(root, 'artifact/dist/orvane-scout.html'));

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
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Wrote ${out} (${Math.round(html.length / 1024)} KB)`);
