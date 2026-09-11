#!/usr/bin/env node
/**
 * =====================================================================
 *  check-links.mjs — 18nelli
 *
 *  Petit vérificateur de liens *locaux* (aucune dépendance, aucun réseau).
 *
 *  Il parcourt tous les .html du site, extrait chaque href/src/url()
 *  pointant vers un fichier local, et vérifie que la cible existe
 *  réellement sur le disque.
 *
 *  Usage :
 *      node tools/check-links.mjs          # rapport lisible
 *      node tools/check-links.mjs --json   # rapport machine (diff avant/après)
 *
 *  Code de sortie : 0 si aucun lien mort, 1 sinon.
 * =====================================================================
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Dossiers à ne jamais explorer. */
const SKIP_DIRS = new Set(['.git', 'node_modules']);

/** Liste récursivement tous les fichiers .html du site. */
function listHtml(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) listHtml(full, out);
    } else if (entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Extrait toutes les références locales d'un document HTML :
 *   href="…", src="…", et url(…) dans le CSS inline.
 * Les URL absolues, data:, javascript: et ancres sont ignorées.
 */
function extractRefs(html) {
  const refs = new Set();
  const patterns = [
    /(?:href|src)\s*=\s*"([^"]+)"/gi,
    /(?:href|src)\s*=\s*'([^']+)'/gi,
    /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const raw = m[1].trim();
      if (!raw) continue;
      if (/^(https?:|data:|javascript:|mailto:|#|\/\/)/i.test(raw)) continue;
      refs.add(raw.split('#')[0].split('?')[0]);
    }
  }
  return [...refs].filter(Boolean);
}

/** Vérifie qu'une référence relative existe bien depuis le fichier source. */
function resolves(fromFile, ref) {
  const decoded = decodeURIComponent(ref);
  const base = ref.startsWith('/') ? ROOT : dirname(fromFile);
  const target = resolve(base, ref.replace(/^\//, ''));
  const targetDecoded = resolve(base, decoded.replace(/^\//, ''));
  return (
    (existsSync(target) && statSync(target).isFile()) ||
    (existsSync(targetDecoded) && statSync(targetDecoded).isFile())
  );
}

const files = listHtml().sort();
const broken = [];
let checked = 0;

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  for (const ref of extractRefs(html)) {
    checked++;
    if (!resolves(file, ref)) {
      broken.push({ file: relative(ROOT, file), ref });
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ files: files.length, checked, broken }, null, 2));
} else {
  console.log(`${files.length} pages HTML, ${checked} liens locaux vérifiés.`);
  if (broken.length === 0) {
    console.log('Aucun lien mort.');
  } else {
    console.log(`${broken.length} lien(s) mort(s) :`);
    for (const b of broken) console.log(`  ${b.file}  ->  ${b.ref}`);
  }
}

process.exit(broken.length ? 1 : 0);
