import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { parse } from '../src/parser.ts';
import { check } from '../src/checks.ts';
import type { ReadFile } from '../src/checks.ts';
import { locate, outline } from '../src/navigate.ts';
import { schema, fx, fxDir, defsIn, readFile, extraFiles } from './schema.ts';

const msgs = (t: string, o = {}) => check(parse(t, schema), o).map(d => d.message);
const one = (t: string, re: RegExp, o = {}) => {
  const m = msgs(t, o);
  assert.equal(m.filter(x => re.test(x)).length, 1, `${re} in ${JSON.stringify(m)}`);
};
const G = 'LOG_GROUP_DEF(1, A)\n';

test('fixtures (and DEF_TABLES_EXTRA): zero diagnostics, includes resolved from disk', () => {
  for (const p of [...defsIn(fxDir), ...extraFiles()]) {
    const doc = parse(readFile(p)!, schema);
    assert.deepEqual(doc.errors, [], p);
    assert.deepEqual(check(doc, { filePath: p, readFile }), [], p);
  }
});

test('duplicate id / name in a file', () => {
  one(G + 'LOG_DEF(0x0101, X, "a")\nLOG_DEF(257, Y, "b")', /Duplicate id/);
  one(G + 'LOG_DEF(0x0101, X, "a")\nLOG_DEF(0x0102, X, "b")', /Duplicate name/);
  assert.deepEqual(msgs(G + 'LOG_DEF(0x0101, X, "a")\nLOG_DEF(0x0102, Y, "b")'), []);
});

test('field and rule ids are separate namespaces', () => {
  const t = 'CONFIG_GROUP_DEF(1, G, "g")\nCONFIG_BOOL(0x1001, F, 1, 1, "l")\nCONFIG_RULE(0x1001, R, "l")';
  assert.deepEqual(msgs(t), []);
});

test('duplicates across one include level; fake readFile; relative resolution', () => {
  const inc = 'LOG_GROUP_DEF(0, SYS)\nLOG_DEF(0x0001, SYS_BOOT, "x")\n';
  const seen: string[] = [];
  const readFile: ReadFile = p => { seen.push(p); return p === resolve('/a/ext/p.def') ? inc : undefined; };
  const t = '#include "../ext/p.def"\nLOG_GROUP_DEF(0, OTHER)\nLOG_DEF(0x0101, SYS_BOOT, "y")\nLOG_DEF(0x0001, Z, "z")';
  const m = check(parse(t, schema), { filePath: resolve('/a/b/x.def'), readFile }).map(d => d.message);
  assert.deepEqual(seen, [resolve('/a/ext/p.def')]);
  assert.equal(m.length, 3);
  assert.ok(m.every(x => /Duplicate/.test(x) && /p\.def line/.test(x)));
});

test('unreadable include: warning, reference errors suppressed', () => {
  const d = check(parse('#include "n.def"\nCONFIG_BOOL(0x1001, F, 9, 1, "l")', schema), { filePath: resolve('/a/x.def'), readFile: () => undefined });
  assert.deepEqual(d.map(x => x.severity), ['warning']);
});

test('unknown group id', () => {
  one('CONFIG_GROUP_DEF(1, G, "g")\nCONFIG_BOOL(0x1001, F, 2, 1, "l")', /Unknown group id 2/);
  assert.deepEqual(msgs('CONFIG_GROUP_DEF(1, G, "g")\nCONFIG_BOOL(0x1001, F, 1, 1, "l")'), []);
});

test('CONFIG_OPTION for unknown enum', () => {
  const e = 'CONFIG_GROUP_DEF(1, G, "g")\nCONFIG_ENUM(0x1, E, 1, A, "l")\n';
  one(e + 'CONFIG_OPTION(NOPE, 0, A, "a")', /Unknown enum NOPE/);
  assert.deepEqual(msgs(e + 'CONFIG_OPTION(E, 0, A, "a")'), []);
});

test('format placeholders', () => {
  one(G + 'LOG_DEF(0x0101, X, "a {4}")', /\{4\} out of range/);
  assert.deepEqual(msgs(G + 'LOG_DEF(0x0101, X, "{0} {3:X4} {{9}} {1,-5:N2}")'), []);
  one(G + 'LOG_DEF(0x0101, X, "a { b")', /'\{'/);
  one(G + 'LOG_DEF(0x0101, X, "a } b")', /'\}'/);
  assert.deepEqual(msgs(G + 'LOG_DEF(0x0101, X, "{{{0}}}")'), []);
});

test('column type, range, arity, parse errors', () => {
  one(G + 'LOG_DEF(0xFFFF, X, "a")', /Value must be in/);
  one(G + 'LOG_DEF(0x0000, X, "a")', /Value must be in/);
  one(G + 'LOG_DEF(0x0101, 1X, "a")', /identifier/);
  one(G + 'LOG_DEF(0x0101, X)', /expects 3 or 5 arguments, found 2/);
  one('LOG_GROUP_DEF(0x1, A)', /decimal/);
  one(G + 'LOG_DEF(0x0101, BAD, U32, X, "a")', /Expected one of/);
  one('LOG_DEF(1, A, "x', /Unterminated string/);
});

test('locate: row, column, placeholder', () => {
  const t = 'LOG_DEF(0x0101, X, "a {0:X4} b")';
  const doc = parse(t, schema);
  assert.equal(locate(doc, 0, 2)?.arg, undefined);
  assert.equal(locate(doc, 0, 10)?.column, 'code');
  const l = locate(doc, 0, t.indexOf('{0') + 1)!;
  assert.equal(l.column, 'text');
  assert.equal(l.placeholder?.index, 0);
  assert.equal(t.slice(l.placeholder!.start, l.placeholder!.end), '{0:X4}');
  assert.equal(locate(doc, 0, t.indexOf(' b'))!.placeholder, undefined);
  assert.equal(locate(doc, 5, 0), undefined);
});

test('outline: groups, high byte, enum options', () => {
  const log = outline(parse(fx('config/tables/log_events.def'), schema));
  assert.deepEqual(log.map(n => n.label), ['SENSOR', 'LINK']);
  assert.equal(log[1].children.length, 3);
  const cfg = outline(parse(fx('lib/config/tables/base_config_fields.def'), schema));
  assert.deepEqual(cfg.map(n => n.label), ['UNIT', 'TRACE']);
  assert.deepEqual(cfg[1].children.map(n => n.label), ['LOG_LEVEL']);
  assert.equal(cfg[1].children[0].children.length, 3);
  assert.equal(outline(parse(fx('config/tables/channels.def'), schema)).length, 3);
});
