/**
 * Atomic fixture reset runner.
 *
 * `psql` is not installed in this workspace, and `\ir` is a psql meta-command,
 * so this runner inlines the included file and executes the whole thing as a
 * single transaction over the pooler — preserving the all-or-nothing contract
 * that the SQL's post-condition assertions depend on.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SQL_DIR = 'scripts';

function buildSql() {
  const outer = readFileSync(`${SQL_DIR}/reset-fixtures.sql`, 'utf8');
  const inner = readFileSync(`${SQL_DIR}/seed-comprehensive-test-data.sql`, 'utf8');

  // The seed file opens and closes its own transaction. Strip those so the
  // whole reset stays inside ONE transaction and a late assertion failure can
  // still roll back the seed.
  const innerBody = inner
    .replace(/^\s*begin\s*;\s*$/gim, '')
    .replace(/^\s*commit\s*;\s*$/gim, '');

  // Function replacer, not a string: `$$` in a replacement string is an escape
  // sequence and would corrupt every PL/pgSQL dollar-quote in the seed file.
  return outer
    .replace(/^\\set .*$/gim, '')
    .replace(/^\\ir .*$/gim, () => innerBody);
}

const sql = buildSql();

const url =
  process.env.POOLER_URL ??
  process.env.DATABASE_URL ??
  '';

if (!url) {
  console.error('Set POOLER_URL (or DATABASE_URL) before running the fixture reset.');
  process.exit(1);
}

const script = `
import sys, psycopg2
url = sys.argv[1]
sql = sys.stdin.read()
conn = psycopg2.connect(url, connect_timeout=30)
conn.autocommit = False
cur = conn.cursor()
try:
    cur.execute(sql)
    conn.commit()
    for note in conn.notices:
        sys.stdout.write(note)
    print("RESET_OK")
except Exception as exc:
    conn.rollback()
    for note in conn.notices:
        sys.stdout.write(note)
    print("RESET_FAILED:", exc, file=sys.stderr)
    sys.exit(1)
`;

try {
  const out = execFileSync('python3', ['-c', script, url], {
    encoding: 'utf8',
    input: sql,
  });
  process.stdout.write(out);
} catch (error) {
  process.stdout.write(error.stdout ?? '');
  process.stderr.write(error.stderr ?? '');
  process.exit(1);
}
