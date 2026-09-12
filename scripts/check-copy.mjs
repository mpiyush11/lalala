/**
 * Copy linter.
 *
 * Three guarantees, checked against SOURCE rather than a rendered page, so a
 * regression fails before it ever reaches a browser:
 *
 *   1. No banned vocabulary in the copy dictionary.
 *   2. No banned vocabulary hard-coded anywhere in owner UI source.
 *   3. No owner component hard-codes user-facing prose.
 *
 * Source is read as text rather than imported: Node cannot load `.ts` without a
 * loader, and reading the literals is the stricter check anyway — it catches a
 * banned word inside a template that a particular set of arguments would never
 * produce.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const COPY_FILE = 'src/lib/copy/owner.ts';

const checks = [];
const failures = [];

function check(name, pass, detail = '') {
  checks.push({ name, pass });
  if (!pass) failures.push({ detail, name });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

const copySource = readFileSync(COPY_FILE, 'utf8');

// --- Parse BANNED_WORDS out of the dictionary itself -----------------------
const bannedBlock = copySource.match(/export const BANNED_WORDS = \[([\s\S]*?)\] as const;/);
if (!bannedBlock) {
  console.error(`Could not find BANNED_WORDS in ${COPY_FILE}`);
  process.exit(1);
}
const BANNED = [...bannedBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

// --- 1. Dictionary strings are clean ---------------------------------------
// Strip the BANNED_WORDS declaration AND all comments first: the declaration
// necessarily contains the words, and a comment explaining why a word is
// banned is not a string the operator can read.
const dictBody = copySource
  .replace(bannedBlock[0], '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const dictStrings = [...dictBody.matchAll(/['"`]([^'"`\n]{2,})['"`]/g)].map((m) => m[1]);

const dictOffenders = [];
for (const value of dictStrings) {
  for (const word of BANNED) {
    if (value.includes(word)) dictOffenders.push(`"${word}" in "${value.slice(0, 40)}"`);
  }
}
check(
  `copy dictionary is free of ${BANNED.length} banned words`,
  dictOffenders.length === 0,
  dictOffenders.slice(0, 5).join(', ') || `${dictStrings.length} strings scanned`,
);

// --- Collect owner UI source ------------------------------------------------
function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (entry.endsWith('.tsx')) files.push(full);
  }
  return files;
}

const OWNER_FILES = walk('src/app/owner').concat(
  ['owner-sidebar.tsx', 'owner-bottom-nav.tsx', 'action-pill.tsx'].map((f) =>
    join('src/components', f),
  ),
);

// --- 2. No banned vocabulary anywhere in owner UI source -------------------
// Comments are excluded: an explanatory note about *why* a word is banned is
// not a string the operator can read.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const sourceOffenders = [];
for (const file of OWNER_FILES) {
  const body = stripComments(readFileSync(file, 'utf8'));
  for (const word of BANNED) {
    if (body.includes(word)) sourceOffenders.push(`${file.replace('src/', '')}: "${word}"`);
  }
}
check(
  'owner UI source is free of banned words',
  sourceOffenders.length === 0,
  sourceOffenders.slice(0, 6).join(' | ') || `${OWNER_FILES.length} files scanned`,
);

// --- 3. No hard-coded prose in owner components ----------------------------
// A JSX text node with two or more words of real prose should have come from
// the dictionary. Entities, punctuation and single words (icons, units) pass.
const JSX_TEXT = />\s*([A-Z][A-Za-z][^<>{}\n]*\s+[a-z][^<>{}\n]*?)\s*</g;

const hardCoded = [];
for (const file of OWNER_FILES) {
  const body = stripComments(readFileSync(file, 'utf8'));
  for (const match of body.matchAll(JSX_TEXT)) {
    const text = match[1].trim();
    if (/^[\s·—–|&;#]+$/.test(text)) continue;
    if (text.startsWith('&')) continue;
    hardCoded.push(`${file.replace('src/', '')}: "${text.slice(0, 40)}"`);
  }
}
check(
  'no hard-coded prose in owner components',
  hardCoded.length === 0,
  hardCoded.slice(0, 8).join(' | ') || `${OWNER_FILES.length} files scanned`,
);

// --- 4. Monochrome palette guard -------------------------------------------
// Colour is information, not decoration. The cockpit is zinc plus exactly one
// emerald accent for money-in, and a muted amber reserved for "something needs
// your attention". Anything else is visual noise that a future edit would
// quietly reintroduce, so it fails here instead.
const ALLOWED_HUES = ['zinc', 'emerald', 'amber', 'black', 'white', 'transparent', 'current', 'inherit'];
const CLASS_COLOUR = /\b(?:bg|text|border|ring|divide|from|to|via|decoration|outline|shadow)-([a-z]+)-\d{2,3}\b/g;
const LEGACY_TOKENS = /\b(?:bg|text|border|ring|divide)-(?:accent|success|danger|surface|canvas)\b/g;

const palette = [];
for (const file of OWNER_FILES) {
  const body = stripComments(readFileSync(file, 'utf8'));
  for (const match of body.matchAll(CLASS_COLOUR)) {
    if (!ALLOWED_HUES.includes(match[1])) {
      palette.push(`${file.replace('src/', '')}: ${match[0]}`);
    }
  }
  for (const match of body.matchAll(LEGACY_TOKENS)) {
    palette.push(`${file.replace('src/', '')}: ${match[0]}`);
  }
}
check(
  'owner UI uses only the monochrome + single-accent palette',
  palette.length === 0,
  [...new Set(palette)].slice(0, 8).join(' | ') || 'zinc / emerald / amber only',
);

console.log(`\n=== copy lint: ${checks.length - failures.length}/${checks.length} PASSED ===`);
if (failures.length) process.exit(1);
