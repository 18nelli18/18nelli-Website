#!/usr/bin/env node
// =====================================================================
//  archive-links.mjs — 18nelli
//
//  Archive les liens et ressources EXTERNES cités par le site (les
//  articles du blog surtout), pour qu'ils restent consultables le jour où
//  l'original disparaît : page supprimée, domaine expiré, vidéo retirée…
//
//  Pour chaque lien externe trouvé dans les .html du site, il :
//   1. vérifie régulièrement qu'il répond encore ;
//   2. demande une copie PUBLIQUE à l'Internet Archive (Wayback Machine),
//      ou reprend une copie récente qui existe déjà ;
//   3. garde une copie PRIVÉE sur le disque : HTML brut + texte de la page,
//      PDF/fichier tel quel, source du dépôt GitHub, fiche + miniature d'une
//      vidéo YouTube (et la vidéo elle-même si yt-dlp est installé) ;
//   4. publie data/link-archive.json : les liens MORTS y figurent avec leur
//      copie Wayback, et blog/article.js y redirige le lecteur.
//
//  Il écrit aussi un rapport lisible hors-ligne (index.html) dans le dossier
//  d'archive. Rien n'est jamais supprimé de ce dossier.
//
//  Usage :
//    node tools/archive-links.mjs --scan        liste les liens trouvés (aucun réseau)
//    node tools/archive-links.mjs --dry-run     montre ce qui serait fait, n'écrit rien
//    node tools/archive-links.mjs               archive pour de vrai
//
//  Options :
//    --root <dossier>       site à scanner              (défaut : le dépôt)
//    --archive-dir <dossier> copies privées + rapport   (défaut : ../18nelli-link-archive)
//    --public-json <fichier> fichier lu par le site     (défaut : <root>/data/link-archive.json)
//    --only <texte>         ne traiter que les liens contenant ce texte
//    --max-saves <n>        demandes de capture à l'Internet Archive par passage (défaut : 20)
//    --max-size <Mo>        taille max d'une page / d'un fichier / d'un dépôt   (défaut : 100)
//    --max-video <Mo>       taille max d'une vidéo                              (défaut : 800)
//    --no-wayback           ne pas contacter l'Internet Archive
//    --no-local             pas de copie locale
//    --no-video             ne pas télécharger les vidéos (même avec yt-dlp)
//    --force                refaire même ce qui est déjà archivé
//    --report               régénère seulement le rapport et le JSON public
//    --mark <url> <dead|alive|auto>   force l'état d'un lien (page qui répond 200
//                           alors que le produit a disparu, par exemple)
//    --yt-dlp <chemin>      binaire yt-dlp (défaut : celui du PATH)
//
//  DOSSIER D'ARCHIVE : il contient des reproductions de sites tiers, il ne
//  doit JAMAIS être servi par le site. Le script refuse donc un dossier situé
//  dans --root.
//
//  Zéro dépendance : Node >= 18 (fetch natif).
// =====================================================================

import { createHash } from 'node:crypto';
import { createWriteStream, readdirSync, readFileSync, realpathSync, promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

// --- Config ----------------------------------------------------------
const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Surchargeables pour les tests (même principe que NOTION_API_BASE).
const WAYBACK = (process.env.WAYBACK_BASE || 'https://web.archive.org').replace(/\/+$/, '');
const OEMBED = (process.env.OEMBED_BASE || 'https://www.youtube.com/oembed').replace(/\/+$/, '');
// Tests uniquement : accepte 127.0.0.1 & co (normalement ignorés) et ne
// temporise plus, pour qu'une batterie de tests ne dure pas des heures.
const TEST_MODE = process.env.ARCHIVE_TEST === '1';

const UA = 'Mozilla/5.0 (compatible; 18nelli-link-archiver/1.0; +https://18nelli.fr)';
const HEADERS = {
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'fr,en;q=0.8',
};

const DAY = 24 * 3600e3;
// Un lien n'est déclaré mort qu'après 3 constats « disparu » espacés d'au
// moins ~1 jour : une panne passagère ne doit jamais le faire remplacer.
const DEAD_AFTER = 3;
const RECHECK_MS = 20 * 3600e3;
// Une copie Wayback plus récente que ça (en jours) est reprise telle quelle.
const FRESH_DAYS = 90;
// Délais avant de réessayer ce qui a échoué (1er échec, 2e, 3e…).
const RETRY_DAYS = [1, 3, 7, 14, 30];

let OPT = null; // rempli par main()

// --- Journal ---------------------------------------------------------
const TTY = process.stdout.isTTY;
const C = TTY
  ? { ok: '\x1b[0;32m', warn: '\x1b[0;33m', err: '\x1b[0;31m', dim: '\x1b[2m', rst: '\x1b[0m' }
  : { ok: '', warn: '', err: '', dim: '', rst: '' };
const info = (m) => console.log(`${C.ok}==>${C.rst} ${m}`);
const line = (m) => console.log(`    ${m}`);
const warn = (m) => console.log(`${C.warn}/!\\${C.rst} ${m}`);
const error = (m) => console.error(`${C.err}X${C.rst} ${m}`);
const die = (m) => { error(m); process.exit(1); };
// Pause de politesse envers les sites (supprimée en mode test).
const sleep = (ms) => new Promise((r) => setTimeout(r, TEST_MODE ? 0 : ms));

// --- Utilitaires -----------------------------------------------------
const iso = (t = Date.now()) => new Date(t).toISOString();
const short = (s, n = 96) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const due = (t, now) => !t || now >= Date.parse(t);
const backoff = (attempts, now) => iso(now + RETRY_DAYS[Math.min(attempts, RETRY_DAYS.length) - 1] * DAY);

function fmtBytes(n) {
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const txt = v < 10 && i > 0 ? String(Number(v.toFixed(1))) : String(Math.round(v));
  return `${txt.replace('.', ',')} ${units[i]}`;
}

// « 2026-09-29… » ou « 20260929120000 » -> « 29/09/2026 »
function frDate(s) {
  const m = String(s || '').match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '?';
}
const waybackDate = (ts) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
const waybackAgeDays = (ts, now) => (now - Date.parse(`${waybackDate(ts)}T00:00:00Z`)) / DAY;

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch { return m; }
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

// N tâches en parallèle au plus.
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

// Une seule requête à la fois par site, espacées : on n'assomme personne.
const hostQueue = new Map();
function perHost(host, fn, gapMs = 800) {
  const run = (hostQueue.get(host) || Promise.resolve()).then(fn);
  hostQueue.set(host, run.catch(() => {}).then(() => sleep(gapMs)));
  return run;
}

async function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

// =====================================================================
//  1. SCAN : quels liens externes le site contient-il ?
// =====================================================================
const SKIP_DIRS = new Set(['node_modules', '_sources', 'vendor']);

function listHtml(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) listHtml(full, out); }
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

// Balise ouvrante avec ses attributs (les valeurs entre guillemets peuvent
// contenir « > » : l'URL Falstad fait 2 Ko).
const TAG_RE = /<([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const TEXT_URL_RE = /https?:\/\/[^\s<>"'`\\^{}|]+/g;

// Attributs qui portent une URL -> nature de la ressource.
//  link  = lien cliquable (ou URL écrite dans le texte / un bloc de code)
//  embed = contenu affiché dans la page (iframe, vidéo, image…)
//  asset = dépendance du site (script, feuille de style) : listée, pas archivée
const URL_ATTRS = {
  a: { href: 'link' }, area: { href: 'link' },
  iframe: { src: 'embed' }, embed: { src: 'embed' }, object: { data: 'embed' },
  video: { src: 'embed', poster: 'embed' }, audio: { src: 'embed' }, source: { src: 'embed' },
  track: { src: 'embed' }, img: { src: 'embed' },
  script: { src: 'asset' }, link: { href: 'asset' },
};

// Ponctuation collée à la fin d'une URL écrite dans une phrase.
function trimUrl(u) {
  for (;;) {
    const before = u;
    u = u.replace(/[.,;:!?'"»›…*]+$/u, '');
    if (u.endsWith(')') && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length) u = u.slice(0, -1);
    if (u.endsWith(']') && (u.match(/\[/g) || []).length < (u.match(/\]/g) || []).length) u = u.slice(0, -1);
    if (u === before) return u;
  }
}

/** Toutes les URLs http(s) d'un document : [{ raw, kind, text }]. */
export function extractUrls(html) {
  const out = [];
  const clean = html.replace(/<!--[\s\S]*?-->/g, ' ');

  for (const m of clean.matchAll(TAG_RE)) {
    const tag = m[1].toLowerCase();
    const wanted = URL_ATTRS[tag];
    if (!wanted) continue;
    const attrs = {};
    for (const a of m[2].matchAll(ATTR_RE)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    // <link> : seulement les vraies dépendances (pas preconnect, canonical, icon…).
    if (tag === 'link' && !/\b(stylesheet|preload|modulepreload)\b/i.test(attrs.rel || '')) continue;
    for (const [name, kind] of Object.entries(wanted)) {
      const raw = decodeEntities(attrs[name] || '').trim();
      if (/^https?:\/\//i.test(raw)) out.push({ raw, kind });
      else if (raw.startsWith('//')) out.push({ raw: `https:${raw}`, kind });
    }
  }

  // URLs écrites dans le texte ou dans les blocs de code (« git clone https://… »).
  const text = decodeEntities(
    clean.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(TAG_RE, ' '),
  );
  for (const m of text.matchAll(TEXT_URL_RE)) out.push({ raw: trimUrl(m[0]), kind: 'link', text: true });
  return out;
}

const IGNORED_HOST = /(^|\.)(localhost|local|internal|test|invalid|example|example\.(com|org|net)|w3\.org|schema\.org|purl\.org)$/i;
const PRIVATE_IP = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0$|\[)/;
const PLACEHOLDER = /[<>{}$]|\.\.\.|…|\b[xX]{3,}\b|\bYOUR[_-]/;
// Une URL signée ou à jeton ne doit pas partir chez un tiers.
const SENSITIVE_PARAM = /(token|secret|signature|passw|api[_-]?key|access[_-]?key)|^(auth|sig|key)$/i;

/** URL externe exploitable, ou null (et raison dans `why` si fourni). */
export function parseExternal(raw, siteHost, fromText = false, why = {}) {
  if (fromText && PLACEHOLDER.test(raw)) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (host === siteHost || host === `www.${siteHost}`) return null;
  if (!TEST_MODE && (!host.includes('.') || PRIVATE_IP.test(host) || IGNORED_HOST.test(host))) return null;
  if (u.username || u.password) { why.sensitive = (why.sensitive || 0) + 1; return null; }
  for (const k of u.searchParams.keys()) {
    if (SENSITIVE_PARAM.test(k)) { why.sensitive = (why.sensitive || 0) + 1; return null; }
  }
  return u;
}

/** Identifiant d'une vidéo YouTube (watch, youtu.be, embed, shorts…) ou null. */
export function youtubeId(u) {
  const h = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id = null;
  if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else id = (u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/) || [])[1] || null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid)$/i;

/**
 * Forme sous laquelle on archive une URL : sans fragment ni paramètres de
 * suivi. La copie d'une vidéo YouTube liée avec « &t=803s » n'existe que sous
 * sa forme canonique ; une fiche AliExpress se retrouve par son numéro.
 */
export function canonicalize(raw) {
  const u = new URL(raw);
  u.hash = '';
  const yt = youtubeId(u);
  if (yt) return `https://www.youtube.com/watch?v=${yt}`;
  // « git clone …/depot.git » : la page à archiver est celle du dépôt.
  if (/^(www\.)?github\.com$/i.test(u.hostname)) u.pathname = u.pathname.replace(/^(\/[^/]+\/[^/]+?)\.git(\/|$)/i, '$1$2');
  if (/(^|\.)(aliexpress|alibaba)\.[a-z]+$/i.test(u.hostname)) { u.search = ''; return u.href; }
  // À la main : URLSearchParams ré-encoderait tout le reste de la requête (l'URL Falstad en dépend).
  const pairs = u.search.slice(1).split('&').filter(Boolean);
  const kept = pairs.filter((kv) => {
    let name = kv.split('=')[0];
    try { name = decodeURIComponent(name); } catch { /* nom mal encodé : tel quel */ }
    return !TRACKING_PARAM.test(name);
  });
  if (kept.length !== pairs.length) u.search = kept.length ? `?${kept.join('&')}` : '';
  return u.href;
}

/** Dépôt GitHub visé par une URL (« github.com/proprio/depot/… »), sinon null. */
export function githubRepo(u) {
  if (!/^(www\.)?github\.com$/i.test(u.hostname)) return null;
  const [owner, repo] = u.pathname.split('/').filter(Boolean);
  if (!owner || !repo) return null;
  if (GITHUB_RESERVED.has(owner.toLowerCase())) return null;
  return { owner, repo: repo.replace(/\.git$/i, '') };
}
const GITHUB_RESERVED = new Set([
  'about', 'apps', 'codespaces', 'collections', 'copilot', 'customer-stories', 'enterprise',
  'explore', 'features', 'issues', 'join', 'login', 'marketplace', 'new', 'notifications',
  'orgs', 'organizations', 'pricing', 'pulls', 'readme', 'search', 'security', 'settings',
  'site', 'sponsors', 'topics', 'trending', 'users',
]);

function scanSite(root, siteHost) {
  const found = new Map(); // cible canonique -> { kind, urls, pages }
  const assets = new Map(); // hôte -> nombre
  const why = {};
  const files = listHtml(root);
  for (const file of files) {
    const page = path.relative(root, file).split(path.sep).join('/');
    for (const { raw, kind, text } of extractUrls(readFileSync(file, 'utf8'))) {
      const u = parseExternal(raw, siteHost, !!text, why);
      if (!u) continue;
      if (kind === 'asset') { assets.set(u.hostname, (assets.get(u.hostname) || 0) + 1); continue; }
      u.hash = '';
      const original = u.href;
      const target = canonicalize(original);
      let f = found.get(target);
      if (!f) found.set(target, (f = { kind, urls: new Set(), pages: new Set(), textOnly: true }));
      f.urls.add(original);
      f.pages.add(page);
      f.textOnly = f.textOnly && !!text; // jamais en lien cliquable : sans doute une commande (curl … | sh)
      if (kind === 'link') f.kind = 'link'; // « lien » l'emporte sur « embed »
    }
  }
  return { found, assets, why, pageCount: files.length };
}

// =====================================================================
//  2. ÉTAT : un enregistrement par lien, dans <archive>/index.json
// =====================================================================
const newRecord = (target, kind, now) => ({
  id: createHash('sha1').update(target).digest('hex').slice(0, 12),
  target, kind, urls: [], pages: [],
  firstSeen: iso(now), lastSeen: iso(now), orphan: false,
  manual: null, // 'dead' | 'alive' : prime sur la détection automatique
  check: null, failures: 0, firstFailure: null, lastFailure: null, dead: false, deadSince: null,
  wayback: {}, local: null,
});

async function loadIndex(file) {
  try {
    const idx = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!idx || typeof idx.records !== 'object') throw new Error('format inattendu');
    for (const [target, r] of Object.entries(idx.records)) r.target = target;
    return idx;
  } catch (e) {
    if (e.code === 'ENOENT') return { version: 1, updated: null, records: {} };
    // On n'écrase jamais un index qu'on ne sait pas lire : il porte tout l'historique.
    throw new Error(`Index illisible (${file}) : ${e.message}. Restaure-le ou déplace-le, rien n'a été modifié.`);
  }
}

// Les copies locales tournent en parallèle et sauvent toutes l'index : les écritures
// font la queue (deux écritures simultanées du même fichier temporaire le corrompraient).
let saveChain = Promise.resolve();
function saveIndex(idx) {
  if (OPT.dryRun) return Promise.resolve();
  const write = saveChain.then(async () => {
    idx.updated = iso();
    await writeAtomic(path.join(OPT.archiveDir, 'index.json'), `${JSON.stringify(idx, null, 2)}\n`);
  });
  saveChain = write.catch(() => {}); // l'erreur est remontée à l'appelant, sans bloquer la file
  return write;
}

function mergeFound(idx, found, now) {
  for (const [target, f] of found) {
    const r = (idx.records[target] ||= newRecord(target, f.kind, now));
    r.kind = f.kind;
    r.textOnly = f.textOnly;
    r.urls = [...f.urls].sort();
    r.pages = [...f.pages].sort();
    r.lastSeen = iso(now);
    r.orphan = false;
  }
  // Un lien qui n'est plus sur le site garde son archive, mais n'est plus suivi.
  for (const [target, r] of Object.entries(idx.records)) if (!found.has(target)) r.orphan = true;
}

export const isDead = (r) => r.manual === 'dead' || (r.manual !== 'alive' && !!r.dead);
// Le dernier contrôle a répondu « introuvable » : capturer maintenant, c'est archiver une page d'erreur.
const isFailing = (r) => r.manual !== 'alive' && r.check?.verdict === 'gone';

// =====================================================================
//  3. VIVANT OU MORT ?
// =====================================================================
/**
 * Applique un constat { verdict: alive|gone|unknown, … } à un enregistrement.
 * `unknown` (403 anti-robot, timeout, 5xx…) ne change rien : seul « disparu »
 * (404/410, domaine introuvable) compte, et trois fois de suite.
 * Renvoie 'newly-dead' | 'revived' | null.
 */
export function applyVerdict(r, v, now = Date.now()) {
  r.check = { at: iso(now), verdict: v.verdict, status: v.status ?? null, final: v.final ?? null, error: v.error ?? null };
  if (v.verdict === 'alive') {
    const wasDead = r.dead;
    r.failures = 0; r.firstFailure = r.lastFailure = null; r.dead = false; r.deadSince = null;
    return wasDead ? 'revived' : null;
  }
  if (v.verdict === 'gone') {
    const last = r.lastFailure ? Date.parse(r.lastFailure) : 0;
    if (!r.failures || now - last >= RECHECK_MS) {
      r.failures = (r.failures || 0) + 1;
      r.firstFailure ||= iso(now);
      r.lastFailure = iso(now);
    }
    if (r.failures >= DEAD_AFTER && !r.dead) {
      r.dead = true;
      r.deadSince = r.firstFailure;
      return 'newly-dead';
    }
  }
  return null;
}

async function probe(target) {
  const yt = youtubeId(new URL(target));
  try {
    // La page « watch » répond 200 même pour une vidéo supprimée : on interroge oEmbed.
    const url = yt ? `${OEMBED}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${yt}`)}&format=json` : target;
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    res.body?.cancel().catch(() => {});
    const out = { status: res.status, final: res.url };
    if (res.status >= 200 && res.status < 400) return { ...out, verdict: 'alive' };
    if (res.status === 404 || res.status === 410) return { ...out, verdict: 'gone' };
    return { ...out, verdict: 'unknown' };
  } catch (e) {
    const code = e.cause?.code || e.code || e.name;
    // Domaine introuvable = disparu ; EAI_AGAIN (DNS en panne), timeout, TLS… = on ne sait pas.
    if (code === 'ENOTFOUND') return { verdict: 'gone', error: 'domaine introuvable (DNS)' };
    return { verdict: 'unknown', error: String(code || e.message) };
  }
}

async function phaseLiveness(records, now) {
  const todo = records.filter((r) => !r.orphan && (OPT.force || !r.check || now - Date.parse(r.check.at) >= RECHECK_MS));
  info(`Vérification des liens (${todo.length}/${records.length} à contrôler)…`);
  const results = new Map();
  await pool(todo, 6, async (r) => {
    results.set(r, await perHost(new URL(r.target).hostname, () => probe(r.target)));
  });

  // Garde-fou : si une grande part des liens « disparaît » d'un coup, c'est
  // le réseau d'ici qui est malade, pas le web. On n'en tire aucune conclusion.
  const gone = [...results.values()].filter((v) => v.verdict === 'gone').length;
  const suspect = results.size >= 8 && gone / results.size > 0.4;
  if (suspect) warn(`${gone}/${results.size} liens semblent disparus d'un coup : réseau suspect, ces constats sont ignorés.`);

  for (const [r, v0] of results) {
    const v = suspect && v0.verdict === 'gone' ? { ...v0, verdict: 'unknown', error: 'réseau suspect' } : v0;
    const event = applyVerdict(r, v, now);
    const tag = v.verdict === 'alive' ? '✅' : v.verdict === 'gone' ? '❌' : '❓';
    const detail = v.status ? `HTTP ${v.status}` : v.error;
    const extra = v.verdict === 'gone' && !r.dead ? ` (constat ${r.failures}/${DEAD_AFTER})` : '';
    if (v.verdict !== 'alive' || OPT.verbose) line(`${tag} ${detail}${extra}  ${short(r.target)}`);
    if (event === 'newly-dead') warn(`💀 LIEN MORT : ${r.target}  (utilisé dans : ${r.pages.join(', ')})`);
    if (event === 'revived') info(`Lien de nouveau en ligne : ${r.target}`);
  }
  const alive = [...results.values()].filter((v) => v.verdict === 'alive').length;
  line(`${alive} en ligne sur ${results.size} contrôlés.`);
  await saveIndex(OPT.idx);
}

// =====================================================================
//  4. INTERNET ARCHIVE (Wayback Machine)
// =====================================================================
class Temporary extends Error {} // l'Internet Archive n'est pas joignable : réessayer plus tard
class RateLimited extends Error {}

/**
 * Dernière bonne capture connue d'une URL : { timestamp, code, original, url } ou null.
 * Lance Temporary si l'Internet Archive ne répond pas correctement : elle
 * renvoie parfois une page HTML « Temporarily Offline » avec un statut 200,
 * qu'il ne faut SURTOUT pas prendre pour « aucune copie ».
 */
export async function cdxLatest(target) {
  const q = new URLSearchParams({ url: target, output: 'json', fl: 'timestamp,statuscode,original', limit: '-25' });
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${WAYBACK}/cdx/search/cdx?${q}`, { headers: HEADERS, signal: AbortSignal.timeout(45_000) });
      const body = (await res.text()).trim();
      if (!res.ok) throw new Temporary(`CDX : HTTP ${res.status}`);
      if (body === '') return null; // « aucune capture » (réponse vide, c'est le format de l'API)
      let rows;
      try { rows = JSON.parse(body); } catch { throw new Temporary('CDX : réponse inattendue (Internet Archive hors ligne ?)'); }
      if (!Array.isArray(rows)) throw new Temporary('CDX : réponse inattendue');
      const caps = rows.slice(1).map(([timestamp, code, original]) => ({ timestamp, code: String(code), original }));
      const pick = (re) => caps.filter((c) => re.test(c.code)).pop();
      // Une vraie page (2xx) vaut mieux qu'une redirection (3xx) ; les erreurs ne comptent pas.
      const best = pick(/^2\d\d$/) || pick(/^3\d\d$/);
      return best ? { ...best, url: `${WAYBACK}/web/${best.timestamp}/${best.original}` } : null;
    } catch (e) {
      lastErr = e instanceof Temporary ? e : new Temporary(`CDX : ${e.cause?.code || e.message}`);
      if (attempt < 2) await sleep(10_000);
    }
  }
  throw lastErr;
}

/** Demande une capture (« Save Page Now ») ; renvoie l'horodatage de la copie. */
export async function waybackSave(target) {
  let res;
  try {
    res = await fetch(`${WAYBACK}/save/${target}`, { headers: HEADERS, redirect: 'manual', signal: AbortSignal.timeout(180_000) });
  } catch (e) {
    throw new Error(`Save Page Now : ${e.cause?.code || e.message}`);
  }
  res.body?.cancel().catch(() => {});
  if (res.status === 429) throw new RateLimited('Save Page Now : trop de demandes (429)');
  const where = res.headers.get('location') || res.headers.get('content-location') || '';
  const m = where.match(/\/web\/(\d{14})[^/]*\//);
  if (m && (res.status === 200 || (res.status >= 300 && res.status < 400))) {
    const replay = new URL(where, WAYBACK).href;
    // La capture d'une page en erreur (403, 404…) est un piège : on rejoue la copie pour vérifier.
    let status = 0;
    try {
      const chk = await fetch(replay, { headers: HEADERS, redirect: 'manual', signal: AbortSignal.timeout(60_000) });
      chk.body?.cancel().catch(() => {});
      status = chk.status;
    } catch { /* vérification impossible : on garde le bénéfice du doute */ }
    if (status >= 400) throw new Error(`la copie rejoue un HTTP ${status} (page en erreur au moment de la capture)`);
    return { timestamp: m[1], url: replay };
  }
  throw new Error(`Save Page Now : HTTP ${res.status}`);
}

/** Retourne un court texte décrivant ce qui a été fait (ou serait fait en dry-run). */
async function ensureWayback(r, st, now) {
  const w = (r.wayback ||= {});
  const dead = isDead(r);

  // a) Existe-t-il déjà une copie ?
  if ((!w.url || OPT.force) && (OPT.force || due(w.lookupNext, now))) {
    st.calls++;
    const snap = await cdxLatest(r.target); // Temporary remonte à l'appelant
    w.lookedAt = iso(now);
    if (snap) {
      const keepOwn = w.own && w.timestamp && snap.timestamp <= w.timestamp;
      if (!keepOwn) Object.assign(w, { url: snap.url, timestamp: snap.timestamp, code: snap.code, own: false });
      w.lookupNext = null;
    } else if (!w.url) {
      w.lookupNext = iso(now + 7 * DAY);
    }
  }

  // b) Faut-il en demander une nouvelle ?
  //    Oui si le lien vit et qu'on n'a aucune copie, ou seulement une vieille copie d'un tiers.
  const stale = !w.url || waybackAgeDays(w.timestamp, now) > FRESH_DAYS;
  const wantSave = !dead && !isFailing(r) && (OPT.force || (!w.own && stale));
  if (wantSave && (OPT.force || due(w.nextTry, now))) {
    if (OPT.dryRun) return `à demander${w.url ? ` (copie existante du ${frDate(w.timestamp)}, trop ancienne)` : ''}`;
    if (st.saves <= 0) return w.url ? `copie du ${frDate(w.timestamp)} (renouvellement reporté : quota du passage atteint)` : 'reporté : quota du passage atteint';
    if (st.iaBlocked) return w.url ? `copie du ${frDate(w.timestamp)}` : 'reporté : Internet Archive indisponible';
    st.saves--;
    st.calls++;
    try {
      const snap = await waybackSave(r.target);
      Object.assign(w, { url: snap.url, timestamp: snap.timestamp, code: 200, own: true, savedAt: iso(now), attempts: 0, nextTry: null, error: null });
      st.limited = 0;
      st.saved++;
      await sleep(5000);
      return `capture demandée ✔ (${frDate(w.timestamp)})`;
    } catch (e) {
      if (e instanceof RateLimited && ++st.limited >= 2) {
        st.iaBlocked = true;
        warn('Internet Archive limite le débit : plus aucune demande de capture pendant ce passage.');
      }
      w.attempts = (w.attempts || 0) + 1;
      w.error = e.message;
      w.nextTry = e instanceof RateLimited ? iso(now + DAY) : backoff(w.attempts, now);
      return `${w.url ? `copie du ${frDate(w.timestamp)} conservée` : 'aucune copie'} — capture ratée : ${e.message}`;
    }
  }

  if (!w.url) return dead ? 'aucune copie connue' : `aucune copie${w.nextTry ? ` (nouvel essai le ${frDate(w.nextTry)})` : ''}`;
  return `${w.own ? 'capturée' : 'copie existante'} du ${frDate(w.timestamp)}`;
}

async function phaseWayback(records, now) {
  const todo = records.filter((r) => !r.orphan);
  info(`Internet Archive (${OPT.dryRun ? 'simulation' : `jusqu'à ${OPT.maxSaves} demandes de capture`})…`);
  const st = { saves: OPT.maxSaves, saved: 0, calls: 0, iaBlocked: false, iaFails: 0, limited: 0 };
  for (const r of todo) {
    if (st.iaFails >= 3) break;
    const before = st.calls;
    let msg;
    try {
      msg = await ensureWayback(r, st, now);
      st.iaFails = 0;
    } catch (e) {
      if (e instanceof Temporary) {
        if (++st.iaFails >= 3) {
          warn('Internet Archive ne répond pas (3 échecs de suite) : on reprendra au prochain passage.');
          break;
        }
        msg = `injoignable pour l'instant (${e.message})`;
      } else {
        msg = `erreur inattendue : ${e.message}`; // un lien ne doit pas bloquer les autres
      }
    }
    // En régime établi, 54 lignes « déjà archivé » chaque nuit noieraient l'important.
    const routine = !OPT.dryRun && st.calls === before && /^(capturée|copie existante) du /.test(msg);
    if (!routine) line(`🏛  ${msg}  ${C.dim}${short(r.target, 80)}${C.rst}`);
    if (st.calls !== before) {
      await saveIndex(OPT.idx);
      await sleep(1200);
    }
  }
  if (!OPT.dryRun) line(`${st.saved} nouvelle(s) capture(s) demandée(s).`);
}

// =====================================================================
//  5. COPIES LOCALES (privées)
// =====================================================================
function run(cmd, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve({ stdout, stderr });
    });
  });
}

class TooBig extends Error {
  constructor(bytes, max) { super(`plus de ${fmtBytes(max)} (limite --max-size)`); this.bytes = bytes; }
}

/** Écrit le corps d'une réponse sur disque en plafonnant la taille. */
async function saveBody(res, file, maxBytes) {
  const declared = Number(res.headers.get('content-length'));
  if (declared > maxBytes) { res.body?.cancel().catch(() => {}); throw new TooBig(declared, maxBytes); }
  if (!res.body) throw new Error('réponse vide');
  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      if (bytes > maxBytes) return cb(new TooBig(bytes, maxBytes));
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  const tmp = `${file}.part`;
  try {
    await pipeline(Readable.fromWeb(res.body), meter, createWriteStream(tmp));
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
  return { bytes, sha256: hash.digest('hex') };
}

const MIME_EXT = {
  'application/pdf': 'pdf', 'text/plain': 'txt', 'application/zip': 'zip', 'application/json': 'json',
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'text/css': 'css', 'text/javascript': 'js', 'application/javascript': 'js', 'text/csv': 'csv',
};

function fileNameFor(res, type) {
  const cd = res.headers.get('content-disposition') || '';
  let name = (cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i) || [])[1];
  if (name) { try { name = decodeURIComponent(name.trim()); } catch { name = name.trim(); } }
  if (!name) {
    let last = new URL(res.url).pathname.split('/').pop() || '';
    try { last = decodeURIComponent(last); } catch { /* % mal formé : tel quel */ }
    if (/\.[A-Za-z0-9]{1,8}$/.test(last)) name = last;
  }
  if (!name) name = `${new URL(res.url).hostname}.${MIME_EXT[type] || 'bin'}`; // ex. alx.sh.txt
  // Pas de sous-dossier, pas de caractère douteux, et jamais un nom réservé à nos fichiers.
  name = name.replace(/[\u0000-\u001f/\\:*?"<>|]/g, '_').replace(/^\.+/, '').slice(-100) || 'fichier.bin';
  return ['page.html', 'text.txt', 'meta.json'].includes(name) ? `orig-${name}` : name;
}

/** HTML -> texte lisible (pour retrouver le contenu même si la mise en page est perdue). */
export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|hr)\b[^>]*>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer|pre|table|ul|ol|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeBytes(buf, contentType) {
  const declared = (contentType.match(/charset=["']?([\w-]+)/i) || [])[1]
    || (buf.subarray(0, 4096).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  try { return new TextDecoder(declared || 'utf-8').decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

/** Page ou fichier quelconque -> dir. Renvoie { thin } (thin = presque pas de texte : page dynamique). */
async function capturePage(target, dir, notes) {
  const res = await fetch(target, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(180_000) });
  if (!res.ok) { res.body?.cancel().catch(() => {}); throw new Error(`HTTP ${res.status}`); }
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const isHtml = type === 'text/html' || type === 'application/xhtml+xml';
  const name = isHtml ? 'page.html' : fileNameFor(res, type);
  const { bytes, sha256 } = await saveBody(res, path.join(dir, name), OPT.maxMB * 1024 * 1024);
  const meta = { url: target, finalUrl: res.url, status: res.status, contentType: type || null, file: name, bytes, sha256, fetchedAt: iso() };
  let thin = false;
  if (isHtml) {
    const raw = await fs.readFile(path.join(dir, name));
    const html = decodeBytes(raw.subarray(0, 8 * 1024 * 1024), res.headers.get('content-type') || '');
    const text = htmlToText(html);
    meta.title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim() || null;
    await fs.writeFile(path.join(dir, 'text.txt'), `${text}\n`);
    // Une vraie page a un titre et du texte ; sinon c'est le squelette d'une appli JavaScript.
    thin = text.length < 400 || !meta.title;
    if (thin) notes.push('page dynamique : contenu absent du HTML brut (voir la copie Internet Archive)');
  }
  await fs.writeFile(path.join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  return { thin, sha256 };
}

/**
 * Certains sites répondent autre chose à curl qu'à un navigateur (alx.sh :
 * le script d'installation d'Asahi). Pour une URL citée dans une commande,
 * on garde aussi la réponse que curl recevrait, si elle diffère.
 */
async function captureCurlView(target, dir, notes, browserSha) {
  const res = await fetch(target, { headers: { 'user-agent': 'curl/8.7.1', accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!res.ok || type === 'text/html' || type === 'application/xhtml+xml') { res.body?.cancel().catch(() => {}); return; }
  const tmp = path.join(dir, 'vue-curl.part');
  const { sha256 } = await saveBody(res, tmp, OPT.maxMB * 1024 * 1024);
  if (sha256 === browserSha) { await fs.rm(tmp, { force: true }); return; }
  await fs.rename(tmp, path.join(dir, `vue-curl-${fileNameFor(res, type)}`));
  notes.push('réponse renvoyée à curl conservée (script d\'installation ?)');
}

async function captureGithub({ owner, repo }, dir) {
  const res = await fetch(`https://codeload.github.com/${owner}/${repo}/zip/HEAD`, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(600_000) });
  if (!res.ok) { res.body?.cancel().catch(() => {}); throw new Error(`HTTP ${res.status}`); }
  await saveBody(res, path.join(dir, 'repo.zip'), OPT.maxMB * 1024 * 1024);
}

const NO_YTDLP = 'vidéo non téléchargée : yt-dlp n\'est pas installé';
let ytDlpOk = null;
async function hasYtDlp() {
  if (ytDlpOk === null) ytDlpOk = await run(OPT.ytDlp, ['--version'], 15_000).then(() => true, () => false);
  return ytDlpOk;
}

async function captureYoutube(id, dir, notes) {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  const res = await fetch(`${OEMBED}?url=${encodeURIComponent(watch)}&format=json`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`fiche YouTube introuvable (HTTP ${res.status}) : vidéo retirée, privée ou intégration interdite`);
  const meta = await res.json();
  await fs.writeFile(path.join(dir, 'meta.json'), `${JSON.stringify({ url: watch, fetchedAt: iso(), ...meta }, null, 2)}\n`);
  if (meta.thumbnail_url) {
    try {
      const t = await fetch(meta.thumbnail_url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (!t.ok) throw new Error(`HTTP ${t.status}`);
      await saveBody(t, path.join(dir, 'miniature.jpg'), 20 * 1024 * 1024);
    } catch (e) {
      notes.push(`miniature non récupérée : ${e.message}`);
    }
  }
  if (!OPT.video) return;
  if (!(await hasYtDlp())) { notes.push(NO_YTDLP); return; }
  try {
    await run(OPT.ytDlp, [
      '--no-playlist', '--no-progress', '--no-warnings',
      '-f', 'bv*[height<=720]+ba/b[height<=720]/b',
      '--merge-output-format', 'mp4',
      '--max-filesize', `${OPT.maxVideoMB}M`,
      '--write-info-json', '--write-subs', '--sub-langs', 'fr.*,en.*',
      '-o', path.join(dir.replace(/%/g, '%%'), 'video.%(ext)s'), // %% : yt-dlp lit le chemin comme un modèle
      watch,
    ], 45 * 60_000);
  } catch (e) {
    const detail = String(e.stderr || e.message).trim().split('\n').pop();
    notes.push(`vidéo non téléchargée : ${short(detail, 160)}`);
  }
}

async function listFiles(dir) {
  const out = [];
  for (const name of (await fs.readdir(dir)).sort()) {
    const st = await fs.stat(path.join(dir, name));
    if (st.isFile()) out.push({ name, bytes: st.size });
  }
  return out;
}

async function captureLocal(r, redo = false) {
  const u = new URL(r.target);
  // Reprise d'une copie incomplète (vidéo manquante) : on complète le même dossier.
  const relDir = redo ? r.local.dir : path.posix.join('copies', r.id, iso().slice(0, 10));
  const dir = path.join(OPT.archiveDir, ...relDir.split('/'));
  await fs.mkdir(dir, { recursive: true });
  const notes = [];
  const errors = [];
  let pageThin = false;
  let hasRepo = false;

  const yt = youtubeId(u);
  const gh = yt ? null : githubRepo(u);
  const jobs = [];
  if (yt) jobs.push(['YouTube', () => captureYoutube(yt, dir, notes)]);
  else {
    if (gh) jobs.push(['dépôt GitHub', async () => { await captureGithub(gh, dir); hasRepo = true; }]);
    jobs.push(['page', async () => {
      const page = await capturePage(r.target, dir, notes);
      pageThin = page.thin;
      if (r.textOnly) await captureCurlView(r.target, dir, notes, page.sha256).catch((e) => notes.push(`vue curl non récupérée : ${e.message}`));
    }]);
  }
  for (const [label, job] of jobs) {
    try { await job(); } catch (e) { errors.push(`${label} : ${e.message}`); }
  }
  const files = await listFiles(dir);
  if (!files.length) {
    if (!redo) await fs.rm(dir, { recursive: true, force: true });
    throw new Error(errors.join(' ; ') || 'rien de récupéré');
  }
  // Une page « pauvre » ne pose pas de souci si on a le code source du dépôt.
  return { dir: relDir, at: redo ? r.local.at : iso(), files, thin: pageThin && !hasRepo, notes: [...notes.filter((n) => !(hasRepo && n.startsWith('page dynamique'))), ...errors] };
}

async function phaseLocal(records, now) {
  const todo = [];
  const redo = new Set();
  for (const r of records) {
    if (r.orphan || isDead(r) || isFailing(r)) continue;
    if (OPT.force || !r.local?.files?.length) {
      if (OPT.force || due(r.local?.nextTry, now)) todo.push(r);
    } else if (OPT.video && r.local.notes?.includes(NO_YTDLP) && youtubeId(new URL(r.target)) && due(r.local.nextTry, now) && await hasYtDlp()) {
      todo.push(r); // yt-dlp a été installé depuis : on récupère enfin la vidéo
      redo.add(r);
    }
  }
  info(`Copies locales (${OPT.dryRun ? 'simulation' : `${todo.length} à faire`})…`);
  if (OPT.dryRun) { line(`${todo.length} copie(s) seraient faites.`); return; }
  let ok = 0;
  await pool(todo, 3, async (r) => {
    const host = new URL(r.target).hostname;
    try {
      const res = await perHost(host, () => captureLocal(r, redo.has(r)), 1500);
      r.local = { ...res, attempts: 0, nextTry: null, error: null };
      ok++;
      const size = res.files.reduce((s, f) => s + f.bytes, 0);
      line(`💾 ${fmtBytes(size)} (${res.files.map((f) => f.name).join(', ')})${res.thin ? ' ⚠ pauvre' : ''}  ${C.dim}${short(r.target, 70)}${C.rst}`);
    } catch (e) {
      const attempts = (r.local?.attempts || 0) + 1;
      r.local = { ...(r.local || {}), files: r.local?.files || [], attempts, error: e.message, nextTry: backoff(attempts, now) };
      line(`⚠️  copie impossible : ${short(e.message, 90)}  ${C.dim}${short(r.target, 70)}${C.rst}`);
    }
    await saveIndex(OPT.idx);
  });
  line(`${ok}/${todo.length} copie(s) faite(s).`);
}

// =====================================================================
//  6. SORTIES : JSON public, rapport, mode d'emploi
// =====================================================================
/** Ce que lit le site : uniquement les liens MORTS pour lesquels on a une copie. */
export function buildPublic(idx, now = Date.now()) {
  const dead = {};
  for (const r of Object.values(idx.records)) {
    if (r.orphan || !isDead(r) || !r.wayback?.url) continue;
    const entry = { archive: r.wayback.url, date: waybackDate(r.wayback.timestamp) };
    for (const u of r.urls) dead[u] = entry;
  }
  return { updated: iso(now), dead: Object.fromEntries(Object.entries(dead).sort(([a], [b]) => a.localeCompare(b))) };
}

function stateOf(r) {
  if (r.manual === 'dead') return { rank: 0, cls: 'dead', text: '💀 mort (marqué à la main)' };
  if (r.manual === 'alive') return { rank: 3, cls: 'ok', text: '✅ en ligne (marqué à la main)' };
  if (r.dead) return { rank: 0, cls: 'dead', text: `💀 mort depuis le ${frDate(r.deadSince)}` };
  if (r.failures > 0) return { rank: 1, cls: 'warn', text: `⚠️ ne répond plus (${r.failures}/${DEAD_AFTER})` };
  if (!r.check) return { rank: 2, cls: 'unk', text: '… pas encore vérifié' };
  if (r.check.verdict === 'alive') return { rank: 3, cls: 'ok', text: '✅ en ligne' };
  return { rank: 2, cls: 'unk', text: `❓ non vérifiable${r.check.status ? ` (HTTP ${r.check.status})` : r.check.error ? ` (${esc(r.check.error)})` : ''}` };
}

const REPORT_CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--dim:#666;--line:#ccc;--dead:#b00020;--warn:#a05a00;--ok:#1b7a2b}
@media (prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--dim:#999;--line:#333;--dead:#ff6b6b;--warn:#ffb454;--ok:#5fd07a}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;margin:0;padding:1.5rem}
h1{margin:0 0 .25rem}p.sub{color:var(--dim);margin:0 0 1rem}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid var(--line);padding:.45rem .6rem;text-align:left;vertical-align:top}
th{position:sticky;top:0;background:var(--bg)}td.url{word-break:break-all;max-width:34rem}
.dead{color:var(--dead);font-weight:600}.warn{color:var(--warn)}.ok{color:var(--ok)}.dim{color:var(--dim);font-size:.9em}
a{color:inherit}ul{margin:0;padding-left:1rem}
`;

function buildReport(idx) {
  const rows = Object.entries(idx.records)
    .map(([target, r]) => ({ target, r, s: stateOf(r) }))
    .sort((a, b) => a.s.rank - b.s.rank || a.target.localeCompare(b.target));
  const count = (f) => rows.filter(f).length;
  const cell = ({ target, r, s }) => {
    const w = r.wayback || {};
    const ia = w.url
      ? `<a href="${esc(w.url)}">copie du ${frDate(w.timestamp)}</a>${w.own ? '' : ' <span class="dim">(faite par un tiers)</span>'}`
      : `<span class="dim">aucune${w.error ? ` — ${esc(w.error)}` : ''}</span>`;
    const files = (r.local?.files || []).map((f) => `<li><a href="${esc(`${r.local.dir}/`.split('/').map(encodeURIComponent).join('/'))}${encodeURIComponent(f.name)}">${esc(f.name)}</a> <span class="dim">${fmtBytes(f.bytes)}</span></li>`).join('');
    const local = files
      ? `<ul>${files}</ul>${r.local.thin ? '<span class="warn">⚠ copie pauvre</span> ' : ''}<span class="dim">${esc((r.local.notes || []).join(' · '))}</span>`
      : `<span class="dim">${r.local?.error ? esc(r.local.error) : isDead(r) ? 'impossible (lien mort)' : 'pas encore'}</span>`;
    const pages = r.pages.map((p) => esc(p)).join('<br>');
    return `<tr><td class="${s.cls}">${s.text}</td><td class="url"><a href="${esc(target)}">${esc(target)}</a>${r.orphan ? '<br><span class="dim">(n\'est plus sur le site)</span>' : ''}</td><td class="dim">${pages}</td><td>${ia}</td><td>${local}</td></tr>`;
  };
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Archive des liens — 18nelli</title><style>${REPORT_CSS}</style></head><body>
<h1>Archive des liens externes</h1>
<p class="sub">Mis à jour le ${frDate(idx.updated)} · ${rows.length} liens · ${count((x) => isDead(x.r))} morts · ${count((x) => x.r.wayback?.url)} avec copie Internet Archive · ${count((x) => x.r.local?.files?.length)} avec copie locale</p>
<table><thead><tr><th>État</th><th>Lien</th><th>Utilisé dans</th><th>Internet Archive</th><th>Copie locale (privée)</th></tr></thead><tbody>
${rows.map(cell).join('\n')}
</tbody></table></body></html>
`;
}

const LISEZMOI = `Archive des liens externes de 18nelli.fr
=========================================

Ce dossier est produit par tools/archive-links.mjs (dépôt 18nelli18/18nelli-Website).
Il garde une copie des pages, fichiers et vidéos vers lesquels le site pointe,
au cas où ils disparaîtraient.

  index.html   Le rapport : à ouvrir dans un navigateur (fonctionne hors-ligne).
  index.json   L'état complet, un enregistrement par lien.
  copies/      Les copies : copies/<id>/<date>/…  (l'<id> figure dans index.json)
                 page.html  le HTML de la page tel que reçu
                 text.txt   son texte, lisible sans mise en page
                 meta.json  détails du téléchargement (URL finale, date, SHA-256)
                 repo.zip   le code source d'un dépôt GitHub
                 video.*    une vidéo YouTube (si yt-dlp était installé)
                 <autre>    un PDF ou tout autre fichier, tel quel

Ces copies sont PRIVÉES : ce sont des reproductions de sites tiers, ne les
mets pas en ligne. L'Internet Archive fournit, elle, la copie publique
(colonne « Internet Archive » du rapport).

Pour lire une page, ouvre plutôt text.txt : page.html est le HTML brut du site
d'origine, l'ouvrir dans un navigateur exécute ses scripts.

Rien n'est supprimé automatiquement de ce dossier.
`;

async function writeOutputs(idx) {
  if (OPT.dryRun) return;
  await fs.mkdir(path.dirname(OPT.publicJson), { recursive: true });
  await writeAtomic(OPT.publicJson, `${JSON.stringify(buildPublic(idx), null, 2)}\n`);
  await writeAtomic(path.join(OPT.archiveDir, 'index.html'), buildReport(idx));
  const readme = path.join(OPT.archiveDir, 'LISEZMOI.txt');
  await fs.writeFile(readme, LISEZMOI, { flag: 'wx' }).catch(() => {});
}

// =====================================================================
//  7. PROGRAMME
// =====================================================================
async function withLock(fn) {
  const lock = path.join(OPT.archiveDir, '.lock');
  try {
    await fs.writeFile(lock, String(process.pid), { flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const pid = Number(await fs.readFile(lock, 'utf8').catch(() => 0));
    let running = false;
    try { process.kill(pid, 0); running = pid > 0; } catch (err) { running = err.code === 'EPERM'; }
    // Après un redémarrage, ce PID peut appartenir à un tout autre programme.
    if (running) running = await run('ps', ['-p', String(pid), '-o', 'command='], 5000).then((o) => /archive-links/.test(o.stdout), () => true);
    if (running) die(`Un autre passage est déjà en cours (PID ${pid}).`);
    await fs.writeFile(lock, String(process.pid)); // verrou périmé (passage interrompu)
  }
  process.on('SIGINT', () => process.exit(130));
  try { return await fn(); } finally { await fs.rm(lock, { force: true }); }
}

function parseArgs(argv) {
  const o = {
    scan: false, dryRun: false, reportOnly: false, force: false, wayback: true, local: true, video: true,
    maxSaves: 20, maxMB: 100, maxVideoMB: 800, only: null, root: SITE_DIR, archiveDir: null, publicJson: null,
    siteHost: '18nelli.fr', ytDlp: 'yt-dlp', mark: null, allowInside: false, verbose: false, help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v == null || v.startsWith('--')) die(`${a} attend une valeur (voir --help).`);
      return v;
    };
    const num = () => { const n = Number(val()); if (!(n >= 0)) die(`${a} attend un nombre.`); return n; };
    switch (a) {
      case '--scan': o.scan = true; break;
      case '--dry-run': o.dryRun = true; break;
      case '--report': o.reportOnly = true; break;
      case '--force': o.force = true; break;
      case '--verbose': o.verbose = true; break;
      case '--no-wayback': o.wayback = false; break;
      case '--no-local': o.local = false; break;
      case '--no-video': o.video = false; break;
      case '--allow-archive-in-root': o.allowInside = true; break;
      case '--max-saves': o.maxSaves = num(); break;
      case '--max-size': o.maxMB = num(); break;
      case '--max-video': o.maxVideoMB = num(); break;
      case '--only': o.only = val(); break;
      case '--root': o.root = path.resolve(val()); break;
      case '--archive-dir': o.archiveDir = path.resolve(val()); break;
      case '--public-json': o.publicJson = path.resolve(val()); break;
      case '--site-host': o.siteHost = val().toLowerCase(); break;
      case '--yt-dlp': o.ytDlp = val(); break;
      case '--mark': o.mark = { url: val(), state: val() }; break;
      case '-h': case '--help': o.help = true; break;
      default: die(`Option inconnue : ${a} (voir --help).`);
    }
  }
  o.archiveDir ||= path.resolve(o.root, '..', '18nelli-link-archive');
  o.publicJson ||= path.join(o.root, 'data', 'link-archive.json');
  return o;
}

function printScan({ found, assets, why, pageCount }) {
  const byHost = new Map();
  for (const [target, f] of found) {
    const h = new URL(target).hostname.replace(/^www\./, '');
    if (!byHost.has(h)) byHost.set(h, []);
    byHost.get(h).push([target, f]);
  }
  info(`${found.size} liens externes distincts dans ${pageCount} pages HTML :`);
  for (const [host, list] of [...byHost].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`\n  ${host}  (${list.length})`);
    for (const [target, f] of list.sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`    ${f.kind === 'embed' ? '[intégré] ' : ''}${short(target, 110)}  <- ${[...f.pages].join(', ')}`);
    }
  }
  console.log('');
  if (assets.size) line(`Dépendances externes du site, non archivées : ${[...assets].map(([h, n]) => `${h} (${n})`).join(', ')}.`);
  if (why.sensitive) line(`${why.sensitive} URL(s) ignorée(s) : identifiants ou jeton dans l'adresse (on ne les envoie à personne).`);
}

function summary(idx) {
  const rs = Object.values(idx.records).filter((r) => !r.orphan);
  const n = (f) => rs.filter(f).length;
  info('Bilan');
  line(`${rs.length} liens : ${n((r) => stateOf(r).cls === 'ok')} en ligne, ${n(isDead)} mort(s), ${n((r) => stateOf(r).cls === 'warn')} douteux, ${n((r) => stateOf(r).cls === 'unk')} non vérifiables.`);
  line(`Internet Archive : ${n((r) => r.wayback?.url)} avec copie, ${n((r) => !r.wayback?.url)} sans.`);
  line(`Copies locales : ${n((r) => r.local?.files?.length)} faites (dont ${n((r) => r.local?.thin)} pauvres), ${n((r) => !r.local?.files?.length && !isDead(r))} à faire ou en échec.`);
  const lost = rs.filter((r) => isDead(r) && !r.wayback?.url && !r.local?.files?.length);
  for (const r of lost) warn(`Lien mort SANS aucune copie : ${r.target}  (utilisé dans : ${r.pages.join(', ')})`);
}

async function main() {
  OPT = parseArgs(process.argv.slice(2));
  if (OPT.help) {
    const head = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1);
    console.log(head.slice(0, head.findIndex((l) => !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }

  const rel = path.relative(OPT.root, OPT.archiveDir);
  if (!OPT.allowInside && (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)))) {
    die(`Le dossier d'archive (${OPT.archiveDir}) est DANS le site (${OPT.root}) : ses copies seraient publiées avec lui.\nChoisis un dossier en dehors avec --archive-dir.`);
  }
  const now = Date.now();
  if (!OPT.dryRun && !OPT.scan) await fs.mkdir(OPT.archiveDir, { recursive: true, mode: 0o700 });
  info(`Archivage des liens — ${iso(now).slice(0, 16).replace('T', ' ')} UTC${OPT.dryRun ? ' (simulation : aucune capture demandée, rien n\'est écrit)' : ''}`);

  // Modes qui n'ont pas besoin de parcourir le site.
  if (OPT.reportOnly || OPT.mark) {
    const idx = await loadIndex(path.join(OPT.archiveDir, 'index.json'));
    OPT.idx = idx;
    if (OPT.mark) {
      if (!['dead', 'alive', 'auto'].includes(OPT.mark.state)) die('--mark attend dead, alive ou auto.');
      let target;
      try { target = canonicalize(OPT.mark.url); } catch { die(`Adresse invalide : ${OPT.mark.url}`); }
      const r = idx.records[target];
      if (!r) die(`Lien inconnu de l'index : ${target}\n(lance d'abord un passage, ou vérifie l'adresse avec --scan)`);
      r.manual = OPT.mark.state === 'auto' ? null : OPT.mark.state;
      info(`${target} -> ${OPT.mark.state}`);
    }
    await withLock(async () => { await saveIndex(idx); await writeOutputs(idx); });
    info('Rapport et JSON public régénérés.');
    return;
  }

  const scan = scanSite(OPT.root, OPT.siteHost);
  if (OPT.scan) { printScan(scan); return; }
  if (!scan.pageCount) die(`Aucun .html trouvé dans ${OPT.root}`);
  if (!scan.found.size) { info('Aucun lien externe sur le site.'); return; }

  const exec = async () => {
    const idx = await loadIndex(path.join(OPT.archiveDir, 'index.json'));
    OPT.idx = idx;
    mergeFound(idx, scan.found, now);
    info(`${scan.found.size} liens externes dans ${scan.pageCount} pages.`);
    const records = Object.values(idx.records).filter((r) => !OPT.only || r.urls.some((u) => u.includes(OPT.only)) || r.target.includes(OPT.only));
    if (OPT.only) line(`--only « ${OPT.only} » : ${records.length} lien(s) concerné(s).`);

    await saveIndex(idx);
    await phaseLiveness(records, now);
    if (OPT.wayback) await phaseWayback(records, now);
    if (OPT.local) await phaseLocal(records, now);
    await saveIndex(idx);
    await writeOutputs(idx);
    summary(idx);
    if (!OPT.dryRun) info(`Rapport : ${path.join(OPT.archiveDir, 'index.html')}`);
  };

  if (OPT.dryRun) await exec();
  else await withLock(exec);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) main().catch((e) => die(e.stack || e.message));
