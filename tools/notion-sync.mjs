#!/usr/bin/env node
// =====================================================================
//  notion-sync.mjs — 18nelli
//  Synchronise la page Notion « Blog » vers blog/_sources/ : chaque
//  sous-page devient un .md + son dossier d'images, au MÊME format que
//  l'export Notion « Markdown & CSV ». Il ne reste qu'à lancer
//  tools/blog-gen.sh. La GitHub Action .github/workflows/blog-sync.yml
//  enchaîne tout automatiquement (synchro, génération, commit, déploiement).
//
//  Usage :
//    NOTION_TOKEN=ntn_xxx NOTION_BLOG_PAGE_ID=<id ou URL de la page Blog> \
//      node tools/notion-sync.mjs [--force] [--allow-empty]
//
//  Règles :
//   - page glissée dans Blog       -> article créé
//   - page modifiée dans Notion     -> article reconverti (last_edited_time)
//   - page retirée de Blog          -> son .md et ses images sont supprimés,
//                                      blog-gen.sh retire ensuite l'article
//   - BLOG EST LA SEULE RÉFÉRENCE : tout ce qui, dans _sources/, ne vient
//     pas d'une page de Blog est supprimé (export manuel, fichier égaré…).
//   - un .md déjà présent avec le même ID de page (ancien export manuel)
//     est ADOPTÉ tel quel, sans réécriture : l'article garde sa date. Il
//     sera reconverti à sa prochaine modification dans Notion.
//   - --force       : reconvertit toutes les pages, adoptées comprises.
//   - --allow-empty : autorise à tout dépublier si Blog est vide (garde-fou
//                     contre une intégration déconnectée par erreur).
//
//  IMAGES : les URL de fichiers Notion expirent au bout d'une heure, elles
//  sont donc téléchargées dans blog/_sources/<Titre>/.
//
//  ÉTAT : blog/_sources/.notion-sync.json (versionné) retient, pour chaque
//  page, sa date de modification Notion et les fichiers qu'elle possède.
//
//  Zéro dépendance : Node >= 18 (fetch natif).
// =====================================================================

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Config ----------------------------------------------------------
const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(TOOLS_DIR, '..');
const SRC_DIR = path.join(SITE_DIR, 'blog', '_sources');
const STATE_FILE = path.join(SRC_DIR, '.notion-sync.json');

const TOKEN = process.env.NOTION_TOKEN;
const API_BASE = (process.env.NOTION_API_BASE || 'https://api.notion.com/v1').replace(/\/+$/, '');
const NOTION_VERSION = '2022-06-28';
// Au-delà, GitHub refuse le fichier (limite dure à 100 Mo).
const MAX_FILE_BYTES = 95 * 1024 * 1024;

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force') || argv.includes('-f');
const ALLOW_EMPTY = argv.includes('--allow-empty');
// ---------------------------------------------------------------------

const GH = !!process.env.GITHUB_ACTIONS;
const C = { ok: '\x1b[0;32m', warn: '\x1b[0;33m', err: '\x1b[0;31m', rst: '\x1b[0m' };
const info = (m) => console.log(`${C.ok}==>${C.rst} ${m}`);
const warn = (m) => console.log(GH ? `::warning::${m}` : `${C.warn}/!\\${C.rst} ${m}`);
const error = (m) => console.error(GH ? `::error::${m}` : `${C.err}X${C.rst} ${m}`);
const die = (m) => { error(m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- API Notion ------------------------------------------------------
class NotionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function notion(endpoint, params = {}) {
  const url = new URL(API_BASE + endpoint);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': NOTION_VERSION },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      if (attempt < 5) { await sleep(1000 * attempt); continue; }
      throw new NotionError(0, `${endpoint} : ${e.message}`);
    }
    if (res.ok) return res.json();
    // 429 = limite de débit Notion (3 req/s en moyenne) : on attend et on réessaie.
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const after = Number(res.headers.get('retry-after'));
      await sleep((after > 0 ? after : 2 * attempt) * 1000);
      continue;
    }
    let msg = await res.text().catch(() => '');
    try { msg = JSON.parse(msg).message || msg; } catch { /* réponse non JSON */ }
    throw new NotionError(res.status, `${endpoint} -> HTTP ${res.status} : ${msg}`);
  }
}

async function listChildren(blockId) {
  const out = [];
  let cursor;
  do {
    const r = await notion(`/blocks/${blockId}/children`, { page_size: 100, start_cursor: cursor });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

// Récupère récursivement tous les blocs d'une page (enfants dans b.children).
async function fetchTree(blockId) {
  const blocks = await listChildren(blockId);
  for (const b of blocks) {
    if (b.type === 'child_page' || b.type === 'child_database') continue;
    const syncedFrom = b.type === 'synced_block' && b.synced_block?.synced_from?.block_id;
    if (syncedFrom) {
      try {
        b.children = await fetchTree(syncedFrom);
      } catch (e) {
        if (e.status !== 404) throw e;
        warn(`Bloc synchronisé inaccessible à l'intégration (${syncedFrom}) : ignoré.`);
      }
    } else if (b.has_children) {
      b.children = await fetchTree(b.id);
    }
  }
  return blocks;
}

// --- Noms de fichiers ------------------------------------------------
const key = (s) => s.normalize('NFC').toLowerCase();
const plain = (rts = []) => rts.map((t) => t.plain_text).join('');

function sanitizeName(s, max) {
  let out = s.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  if (out.length > max) out = out.slice(0, max);
  return out.replace(/[. ]+$/, '');
}

// Même encodage que url_encode_path() de blog-gen.sh : seuls [A-Za-z0-9._~-]
// restent tels quels, tout le reste passe en %XX (octets UTF-8).
function urlEncodePath(s) {
  let out = '';
  for (const b of Buffer.from(s, 'utf8')) {
    const ch = String.fromCharCode(b);
    out += /[A-Za-z0-9._~-]/.test(ch) ? ch : `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

// Protège une URL externe dans la syntaxe markdown [..](..).
const safeUrl = (u) => u.replace(/[\s()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

function fileNameFromUrl(u) {
  try {
    const last = new URL(u).pathname.split('/').pop() || '';
    return decodeURIComponent(last);
  } catch {
    return '';
  }
}

// Déclare un fichier Notion à télécharger dans le dossier de la page et
// renvoie son nom local + le chemin à écrire dans le markdown.
function addFile(ctx, url, preferredName) {
  let name = sanitizeName(preferredName || fileNameFromUrl(url), 120) || 'fichier';
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  // Doublons (« image.png » est le nom de toutes les images collées) :
  // image.png, image 1.png, image 2.png… comme l'export Notion.
  for (let n = 1; ctx.used.has(key(name)); n++) name = `${stem} ${n}${ext}`;
  ctx.used.add(key(name));
  ctx.downloads.push({ url, name });
  return { name, href: `${urlEncodePath(ctx.dir)}/${urlEncodePath(name)}` };
}

// --- Texte riche -> markdown -----------------------------------------
// Caractères qui déclencheraient une mise en forme pandoc s'ils n'étaient
// pas échappés (Notion a déjà interprété le markdown tapé dans l'éditeur).
const MD_SPECIAL = /[\\`*_[\]<~^$|]/g;

// Les URL nues sont laissées intactes pour que pandoc les rende cliquables.
function escapeText(s) {
  return s
    .split(/(https?:\/\/[^\s<>"]+)/)
    .map((part, i) => (i % 2 ? part : part.replace(MD_SPECIAL, '\\$&')))
    .join('');
}

function codeSpan(s) {
  const longest = (s.match(/`+/g) || []).reduce((m, r) => Math.max(m, r.length), 0);
  const fence = '`'.repeat(longest + 1);
  const pad = longest ? ' ' : '';
  return fence + pad + s + pad + fence;
}

const styleKey = (s) => `${s.b}${s.i}${s.s}`;

function renderSegment(seg) {
  let s;
  if (seg.eq != null) s = `$${seg.eq}$`;
  else if (seg.c) s = codeSpan(seg.text.replace(/\n/g, ' '));
  else s = escapeText(seg.text);
  if (seg.href && seg.eq == null) s = `[${s}](${safeUrl(seg.href)})`;
  return s;
}

function wrapStyle(inner, st) {
  const open = (st.s ? '~~' : '') + (st.b ? '**' : '') + (st.i ? '*' : '');
  if (!open) return inner;
  // Les espaces restent HORS des marqueurs, sinon pandoc ignore le gras.
  const [, lead, core, trail] = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!core) return inner;
  return lead + open + core + [...open].reverse().join('') + trail;
}

function richText(rts = []) {
  // 1) fusionne les morceaux contigus de même style : Notion découpe
  //    souvent une phrase en plusieurs segments identiques.
  const segs = [];
  for (const rt of rts) {
    const a = rt.annotations || {};
    const seg = {
      text: rt.type === 'equation' ? null : rt.plain_text || '',
      eq: rt.type === 'equation' ? rt.equation.expression : null,
      href: rt.href || null,
      b: !!a.bold, i: !!a.italic, s: !!a.strikethrough, c: !!a.code,
    };
    const prev = segs[segs.length - 1];
    if (prev && prev.eq == null && seg.eq == null && prev.href === seg.href
        && styleKey(prev) === styleKey(seg) && prev.c === seg.c) {
      prev.text += seg.text;
    } else {
      segs.push(seg);
    }
  }
  // 2) gras / italique / barré posés sur des groupes entiers, pour éviter
  //    les « **a****b** » que pandoc interprète mal.
  let out = '';
  for (let k = 0; k < segs.length;) {
    let inner = '';
    let j = k;
    while (j < segs.length && styleKey(segs[j]) === styleKey(segs[k])) inner += renderSegment(segs[j++]);
    out += wrapStyle(inner, segs[k]);
    k = j;
  }
  return out;
}

// Un « # », « - », « 1. », « a) »… en début de ligne serait pris pour un
// titre ou une liste : on l'échappe.
const escapeLineStart = (l) => l
  .replace(/^([#>+=(-])/, '\\$1')
  .replace(/^(\d+|[A-Za-z]|[ivxlcdmIVXLCDM]+)([.)])(?=\s|$)/, '$1\\$2');

// Texte d'un bloc : les retours à la ligne Notion (Maj+Entrée) deviennent
// des sauts de ligne markdown (deux espaces en fin de ligne).
function inline(rts) {
  const lines = richText(rts).split('\n').map((l) => escapeLineStart(l.replace(/^[ \t]+/, '')));
  return lines
    .map((l, i) => (i < lines.length - 1 && l.trim() && lines[i + 1].trim()
      ? l.replace(/\s*$/, '  ')
      : l.replace(/\s+$/, '')))
    .join('\n');
}

const indentLines = (s, pad) => s.split('\n').map((l) => (l ? pad + l : l)).join('\n');
const quoteLines = (s) => s.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');

// --- Blocs -> markdown -----------------------------------------------
const CODE_LANGS = {
  'plain text': '', 'c++': 'cpp', 'c#': 'csharp', 'f#': 'fsharp', 'objective-c': 'objectivec',
  'vb.net': 'vbnet', 'visual basic': 'vbnet', 'java/c/c++/c#': 'java', docker: 'dockerfile',
  markup: 'html', webassembly: 'wasm',
};
const codeLang = (l = '') => {
  const k = l.toLowerCase();
  return k in CODE_LANGS ? CODE_LANGS[k] : k.replace(/[^a-z0-9_+-]/g, '');
};

const LIST_TYPES = new Set(['bulleted_list_item', 'numbered_list_item', 'to_do', 'toggle']);
const listFamily = (t) => (t === 'numbered_list_item' ? 'ol' : 'ul');
const SILENT_TYPES = new Set(['table_of_contents', 'breadcrumb', 'link_to_page', 'template', 'unsupported']);

function renderBlocks(blocks = [], ctx) {
  const parts = [];
  let num = 0;
  for (const b of blocks) {
    num = b.type === 'numbered_list_item' ? num + 1 : 0;
    const r = renderBlock(b, ctx, num);
    if (r && r.text) parts.push(r);
  }
  // Comme l'export Notion : blocs séparés par une ligne vide, sauf les
  // éléments consécutifs d'une même liste (liste « serrée »).
  let out = '';
  parts.forEach((p, i) => {
    if (i) {
      const prev = parts[i - 1];
      const tight = prev.list && p.list && prev.list === p.list && !prev.loose;
      out += tight ? '\n' : '\n\n';
    }
    out += p.text;
  });
  return out;
}

function renderBlock(b, ctx, num) {
  const d = b[b.type] || {};
  const kids = () => (b.children?.length ? renderBlocks(b.children, ctx) : '');
  const join = (...xs) => xs.filter(Boolean).join('\n\n');

  switch (b.type) {
    case 'paragraph':
      return { text: join(inline(d.rich_text), kids()) };

    case 'heading_1': case 'heading_2': case 'heading_3': case 'heading_4': {
      const t = inline(d.rich_text).replace(/ *\n/g, ' ');
      const level = Number(b.type.slice(-1));
      return { text: join(t && `${'#'.repeat(level)} ${t}`, kids()) };
    }

    case 'bulleted_list_item': case 'numbered_list_item': case 'to_do': case 'toggle': {
      const marker = b.type === 'numbered_list_item' ? `${num}. ` : '- ';
      let t = inline(d.rich_text);
      if (b.type === 'to_do') t = `[${d.checked ? 'x' : ' '}]  ${t}`;
      let text = marker + indentLines(t, '    ').replace(/^ +/, '');
      let loose = false;
      if (b.children?.length) {
        const nestedListOnly = b.children.every((c) => LIST_TYPES.has(c.type));
        loose = !nestedListOnly;
        text += (nestedListOnly ? '\n' : '\n\n') + indentLines(kids(), '    ');
      }
      return { text, list: listFamily(b.type), loose };
    }

    case 'quote':
      return { text: quoteLines(join(inline(d.rich_text), kids())) };

    case 'callout': {
      const icon = d.icon?.type === 'emoji' ? `${d.icon.emoji} ` : '';
      return { text: quoteLines(join(icon + inline(d.rich_text), kids())) };
    }

    case 'code': {
      const code = plain(d.rich_text);
      // Un bloc qui contient lui-même ``` doit être clôturé autrement.
      const fence = /^\s*```/m.test(code) ? '~~~~' : '```';
      return { text: `${fence}${codeLang(d.language)}\n${code}\n${fence}` };
    }

    case 'equation':
      return { text: `$$\n${d.expression}\n$$` };

    case 'divider':
      return { text: '---' };

    case 'image': {
      const caption = plain(d.caption).replace(/[[\]\n]/g, ' ').trim();
      if (d.type === 'external') {
        const alt = caption || fileNameFromUrl(d.external.url) || 'image';
        return { text: `![${alt.replace(/[[\]]/g, '')}](${safeUrl(d.external.url)})` };
      }
      const url = d[d.type]?.url;
      if (!url) return null;
      const f = addFile(ctx, url);
      return { text: `![${caption || f.name.replace(/[[\]]/g, '')}](${f.href})` };
    }

    case 'video': case 'file': case 'pdf': case 'audio': {
      const caption = plain(d.caption).trim();
      if (d.type === 'external') {
        const u = d.external.url;
        return { text: `[${escapeText(caption || u)}](${safeUrl(u)})` };
      }
      const url = d[d.type]?.url;
      if (!url) return null;
      const f = addFile(ctx, url, d.name);
      return { text: `[${escapeText(caption || f.name)}](${f.href})` };
    }

    // Seuls sur leur ligne, comme dans l'export : blog-gen.sh transforme
    // ainsi les liens Falstad en circuit intégré.
    case 'bookmark': case 'embed': case 'link_preview':
      return d.url ? { text: `[${d.url}](${safeUrl(d.url)})` } : null;

    case 'table': {
      const cell = (rts) => richText(rts).replace(/\n/g, '<br>');
      const rows = (b.children || []).filter((r) => r.type === 'table_row').map((r) => r.table_row.cells.map(cell));
      if (!rows.length) return null;
      const width = Math.max(...rows.map((r) => r.length));
      const line = (cells) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
      return { text: [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n') };
    }

    // Conteneurs sans rendu propre : on aplatit leur contenu.
    case 'column_list': case 'column': case 'synced_block':
      return { text: kids() };

    case 'child_page':
      warn(`Sous-page « ${d.title} » ignorée : seules les sous-pages directes de Blog sont publiées.`);
      return null;

    case 'child_database':
      warn(`Base de données « ${d.title} » ignorée (non exportable).`);
      return null;

    default:
      if (!SILENT_TYPES.has(b.type)) warn(`Bloc Notion « ${b.type} » non géré : ignoré.`);
      return null;
  }
}

// --- Écriture sur disque ---------------------------------------------
async function download(url, dest) {
  for (let attempt = 1; ; attempt++) {
    try {
      // Pas d'en-tête Authorization : ce sont des URL S3 déjà signées.
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_FILE_BYTES) {
        throw new Error(`${path.basename(dest)} fait ${Math.round(buf.length / 1048576)} Mo : trop gros pour GitHub (100 Mo max)`);
      }
      await fs.writeFile(dest, buf);
      return;
    } catch (e) {
      if (attempt >= 3 || /trop gros/.test(e.message)) throw new Error(`téléchargement de ${path.basename(dest)} : ${e.message}`);
      await sleep(2000 * attempt);
    }
  }
}

const isPlainName = (n) => typeof n === 'string' && n && n === path.basename(n) && n !== '.' && n !== '..';

async function removeEntry(name) {
  if (isPlainName(name)) await fs.rm(path.join(SRC_DIR, name), { recursive: true, force: true });
}

async function writePage({ md, downloads, names, old }) {
  // 1) téléchargements dans un dossier temporaire : si l'un échoue,
  //    l'ancienne version de l'article reste intacte.
  let tmp = null;
  if (downloads.length) {
    tmp = await fs.mkdtemp(path.join(SRC_DIR, '.notion-tmp-'));
    try {
      for (const d of downloads) await download(d.url, path.join(tmp, d.name));
    } catch (e) {
      await fs.rm(tmp, { recursive: true, force: true });
      throw e;
    }
  }
  // 2) remplace le dossier d'images et retire les anciens noms si le titre a changé
  if (old?.dir) await removeEntry(old.dir);
  await removeEntry(names.dir);
  if (tmp) await fs.rename(tmp, path.join(SRC_DIR, names.dir));
  if (old?.md && old.md !== names.md) await removeEntry(old.md);
  // 3) .md réécrit seulement s'il a changé : sinon blog-gen.sh le
  //    régénérerait pour rien et changerait sa date.
  const mdPath = path.join(SRC_DIR, names.md);
  const prev = await fs.readFile(mdPath, 'utf8').catch(() => null);
  if (prev !== md) await fs.writeFile(mdPath, md);
}

// Nom de base « <Titre> » unique parmi ce qui existe déjà dans _sources/
// (autres pages, exports manuels) : sinon deux articles se partageraient
// un dossier d'images, ou un slug.
async function chooseBase(id, title, own) {
  const wanted = sanitizeName(title, 100) || 'Sans titre';
  const ownKeys = new Set(own.filter(Boolean).map(key));
  const taken = new Set();
  for (const ent of await fs.readdir(SRC_DIR, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    if (ent.isDirectory()) {
      if (!ownKeys.has(key(ent.name))) taken.add(key(ent.name));
    } else if (ent.name.endsWith('.md') && !ent.name.endsWith(` ${id}.md`)) {
      taken.add(key(ent.name.replace(/ [0-9a-f]{32}\.md$/, '').replace(/\.md$/, '')));
    }
  }
  // Garde l'orthographe exacte déjà sur disque si le titre n'a pas changé.
  const kept = own.find((n) => n && key(n) === key(wanted));
  let base = kept || wanted;
  for (let n = 2; taken.has(key(base)); n++) base = `${wanted} ${n}`;
  return base;
}

// --- État --------------------------------------------------------------
async function loadState() {
  try {
    const s = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
    return { pages: s.pages || {} };
  } catch (e) {
    if (e.code === 'ENOENT') return { pages: {} };
    throw new Error(`état illisible (${STATE_FILE}) : ${e.message}`);
  }
}

async function saveState(state) {
  const pages = Object.fromEntries(Object.keys(state.pages).sort().map((k) => [k, state.pages[k]]));
  const json = {
    _info: 'Généré par tools/notion-sync.mjs : ne pas éditer à la main.',
    pages,
  };
  await fs.writeFile(STATE_FILE, `${JSON.stringify(json, null, 2)}\n`);
}

function parseId(s) {
  const m = String(s || '').trim().replace(/-/g, '').match(/([0-9a-f]{32})(?:[?#].*)?$/i);
  return m ? m[1].toLowerCase() : null;
}

function pageTitle(page) {
  const prop = Object.values(page.properties || {}).find((p) => p.type === 'title');
  return plain(prop?.title).trim();
}

// --- Main --------------------------------------------------------------
async function main() {
  if (!TOKEN) die('NOTION_TOKEN manquant (token de l\'intégration Notion).');
  const blogId = parseId(process.env.NOTION_BLOG_PAGE_ID);
  if (!blogId) die('NOTION_BLOG_PAGE_ID manquant ou invalide (ID ou URL de la page Blog).');
  if (!existsSync(SRC_DIR)) die(`Dossier des sources introuvable : ${SRC_DIR}`);

  const state = await loadState();

  let children;
  try {
    children = await listChildren(blogId);
  } catch (e) {
    if (e.status === 401) die('Token Notion refusé : vérifie le secret NOTION_TOKEN.');
    if (e.status === 404) die('Page Blog introuvable : vérifie son ID et que l\'intégration y est connectée (••• → Connexions).');
    throw e;
  }
  for (const b of children) {
    if (b.type === 'child_database') warn(`Base de données « ${b.child_database.title} » dans Blog : ignorée.`);
    if (b.type === 'link_to_page') {
      warn('Lien vers une page dans Blog : ignoré. Pour la publier, déplace la page elle-même dans Blog (••• → Déplacer vers).');
    }
  }
  const pages = children.filter((b) => b.type === 'child_page');
  info(`${pages.length} page(s) dans Blog`);

  const published = (await fs.readdir(SRC_DIR)).filter((f) => f.endsWith('.md')).length;
  if (!pages.length && published && !ALLOW_EMPTY) {
    die(`Blog est vide alors que ${published} article(s) sont publiés : par sécurité rien n'est supprimé. `
      + 'Relance avec --allow-empty si c\'est voulu.');
  }

  // 1) pages retirées de Blog -> dépubliées (avant tout, pour libérer leurs noms)
  const present = new Set(pages.map((p) => p.id.replace(/-/g, '')));
  for (const [id, e] of Object.entries(state.pages)) {
    if (present.has(id)) continue;
    await removeEntry(e.md);
    if (e.dir) await removeEntry(e.dir);
    delete state.pages[id];
    await saveState(state);
    info(`Article dépublié (retiré de Blog) : ${e.title}`);
  }

  // 2) pages nouvelles ou modifiées -> converties
  let converted = 0;
  let failures = 0;
  for (const blk of pages) {
    const id = blk.id.replace(/-/g, '');
    try {
      const page = await notion(`/pages/${blk.id}`);
      const title = pageTitle(page) || blk.child_page?.title || 'Sans titre';
      const lastEdited = page.last_edited_time;
      const prev = state.pages[id];

      // Ancien export manuel de cette même page déjà présent dans _sources/ ?
      let adopted = null;
      if (!prev) {
        const md = (await fs.readdir(SRC_DIR)).find((f) => f.endsWith(` ${id}.md`));
        if (md) {
          const base = md.slice(0, -` ${id}.md`.length);
          adopted = { title, lastEdited, md, dir: existsSync(path.join(SRC_DIR, base)) ? base : null };
        }
      }
      if (adopted && !FORCE) {
        state.pages[id] = adopted;
        await saveState(state);
        info(`Export existant adopté tel quel : ${adopted.md}`);
        continue;
      }

      const old = prev || adopted;
      const upToDate = prev && prev.lastEdited === lastEdited
        && existsSync(path.join(SRC_DIR, prev.md))
        && (!prev.dir || existsSync(path.join(SRC_DIR, prev.dir)));
      if (upToDate && !FORCE) continue;

      const oldBase = old?.md.slice(0, -` ${id}.md`.length);
      const base = await chooseBase(id, title, [oldBase, old?.dir]);
      const names = { md: `${base} ${id}.md`, dir: base };

      const ctx = { dir: base, downloads: [], used: new Set() };
      const body = renderBlocks(await fetchTree(blk.id), ctx);
      const md = `# ${title}\n\n${body}\n`;

      await writePage({ md, downloads: ctx.downloads, names, old });
      state.pages[id] = { title, lastEdited, md: names.md, dir: ctx.downloads.length ? names.dir : null };
      await saveState(state);
      converted++;
      info(`Article synchronisé : ${names.md}${ctx.downloads.length ? ` (+${ctx.downloads.length} fichier(s))` : ''}`);
    } catch (e) {
      failures++;
      error(`Échec pour la page ${id} : ${e.message}`);
    }
  }

  // 3) Blog est la seule référence : tout le reste de _sources/ est retiré.
  //    Un .md dont la page EST dans Blog reste, même si sa conversion vient
  //    d'échouer : on ne supprime jamais un article qu'on n'a pas pu remplacer.
  const keep = new Set();
  for (const e of Object.values(state.pages)) {
    keep.add(key(e.md));
    if (e.dir) keep.add(key(e.dir));
  }
  const entries = await fs.readdir(SRC_DIR);
  for (const name of entries) {
    const m = name.match(/^(.*) ([0-9a-f]{32})\.md$/);
    if (m && present.has(m[2])) keep.add(key(name)).add(key(m[1]));
  }
  for (const name of entries) {
    if (name.startsWith('.') || keep.has(key(name))) continue;
    await removeEntry(name);
    info(`Retiré (absent de Blog) : ${name}`);
  }

  if (!converted && !failures) info('Tout est déjà à jour.');
  else info(`${converted} article(s) converti(s)${failures ? `, ${failures} échec(s)` : ''}.`);
  if (failures) process.exit(2);
}

main().catch((e) => die(e.message));
