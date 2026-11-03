import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/parser.ts';
import { check } from '../src/checks.ts';
import type { ReadFile } from '../src/checks.ts';
import { formatText } from '../src/layout.ts';

const fxDir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const readFile = (p: string) => { try { return readFileSync(p, 'utf8'); } catch { return undefined; } };
// DEF_TABLES_EXTRA: path-separated directories of real tables, checked like the fixtures (not recursed)
const extra = (process.env.DEF_TABLES_EXTRA ?? '').split(delimiter).filter(Boolean)
  .flatMap(d => readdirSync(d).filter(f => f.endsWith('.def')).map(f => resolve(d, f)));
const files = [...(readdirSync(fxDir, { recursive: true }) as string[]).filter(f => f.endsWith('.def')).map(f => resolve(fxDir, f)), ...extra];

for (const p of files) {
  test(`${basename(p)}: parses cleanly, zero diagnostics (includes read from disk), format is idempotent`, () => {
    const text = readFile(p)!;
    const doc = parse(text);
    assert.equal(doc.rows.length, [...text.matchAll(/^[A-Za-z_]\w*\s*\(/gm)].length);
    assert.deepEqual(check(doc, { filePath: p, readFile }), [], p);
    const once = formatText(text);
    assert.equal(formatText(once), once);
  });
}

test('linker-style .def: no rows, no diagnostics', () => {
  const doc = parse(readFile(resolve(fxDir, 'exports.def'))!);
  assert.equal(doc.rows.length, 0);
  assert.deepEqual(check(doc), []);
});

const msgs = (t: string, o = {}) => check(parse(t), o).map(d => `${d.severity}: ${d.message}`);

test('duplicate id (numeric compare) is an error, duplicate name a warning, per macro', () => {
  assert.deepEqual(msgs('A(0x10, X)\nA(16, Y)'), ['error: Duplicate id 16: also defined at line 1']);
  assert.deepEqual(msgs('A(1, X)\nA(2, X)'), ['warning: Duplicate name X: also defined at line 1']);
  assert.deepEqual(msgs('A(1, X)\nB(1, X)'), []);
});

test('non-numeric first argument is an owner: no id check, names unique per owner', () => {
  assert.deepEqual(msgs('O(LEVEL, 0, DEBUG)\nO(LEVEL, 1, INFO)\nO(MODE, 0, DEBUG)\nO(MODE, 1, INFO)'), []);
  assert.deepEqual(msgs('O(LEVEL, 0, DEBUG)\nO(LEVEL, 1, DEBUG)'), ['warning: Duplicate name DEBUG: also defined at line 1']);
});

test('argument count: the minority of a macro is flagged', () => {
  assert.deepEqual(msgs('A(1, X)\nA(2, Y)\nA(3, Z, 1)\nB(1)'), ['warning: A usually has 2 arguments, found 3']);
});

test('syntax errors', () => {
  assert.deepEqual(msgs('A(1, "x\nA(2'), ['error: Unterminated string', 'error: Unterminated row: missing ")" (a row must be on one line)']);
});

test('duplicates across one include level; relative resolution; unreadable include', () => {
  const seen: string[] = [];
  const rf: ReadFile = p => { seen.push(p); return p === resolve('/a/ext/p.def') ? 'A(1, SYS_BOOT)\n#include "deeper.def"\n' : undefined; };
  const t = '#include "../ext/p.def"\nA(2, SYS_BOOT)\nA(1, Z)';
  assert.deepEqual(msgs(t, { filePath: resolve('/a/tab/t.def'), readFile: rf }),
    ['warning: Duplicate name SYS_BOOT: also defined at p.def line 1', 'error: Duplicate id 1: also defined at p.def line 1']);
  assert.deepEqual(seen, [resolve('/a/ext/p.def')]); // one level only
  assert.deepEqual(msgs('#include "gone.def"', { filePath: resolve('/a/t.def'), readFile: () => undefined }), ['warning: Cannot read include "gone.def"']);
  assert.deepEqual(msgs('#include "gone.def"'), []);
});
