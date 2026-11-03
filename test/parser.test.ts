import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.ts';
import { colorRanges } from '../src/colors.ts';
import { describe, locate } from '../src/navigate.ts';
import { findUses, lookupName, nameIndex } from '../src/index.ts';

test('args: ranges, strings with commas/parens/escapes, tuples; id and name', () => {
  const t = 'CONFIG_IPV4  (0x1002, N, 16, (192, 168, 90, 5), "a, b) \\" c")  // tail';
  const { rows, errors } = parse(t);
  assert.deepEqual(errors, []);
  const r = rows[0];
  assert.equal(r.macro, 'CONFIG_IPV4');
  assert.deepEqual(r.args.map(a => a.text), ['0x1002', 'N', '16', '(192, 168, 90, 5)', '"a, b) \\" c"']);
  for (const a of r.args) assert.equal(t.slice(a.start, a.end), a.text);
  assert.deepEqual([r.id?.text, r.name?.text], ['0x1002', 'N']);
});

test('id and name: first argument, first identifier after it', () => {
  const [a, b, c, d] = parse('CHANNEL(MOD_A, Screen, 4)\nEVT(0x10, BOOT, "x")\nEVT(1, 2, "x")\nEVT()').rows;
  assert.deepEqual([a.id?.text, a.name?.text], ['MOD_A', 'Screen']);
  assert.deepEqual([b.id?.text, b.name?.text], ['0x10', 'BOOT']);
  assert.deepEqual([c.id?.text, c.name], ['1', undefined]);
  assert.deepEqual([d.id, d.name, d.args], [undefined, undefined, []]);
});

test('name: header word "name" decides, else the first identifier after the id', () => {
  const [a, b, c] = parse(['/* id Level data Name text */', 'EVT(0x1, INFO, U16, BootDone, "t")', 'EVT(2, 3, 4, 5, "t")',
    '/* id other */', 'EVT(3, INFO, X)'].join('\n')).rows;
  assert.equal(a.name?.text, 'BootDone');
  assert.equal(b.name, undefined); // the header column is not an identifier and nothing else is one
  assert.equal(c.name?.text, 'INFO');
});

test('prose comments are never headers', () => {
  assert.equal(parse('/* Group id 7 is reserved. */\nA(1, B)').rows[0].header, undefined);
  assert.equal(parse('/* id name */\nA(1, B)').rows[0].header?.length, 2);
});

test('include; other lines are ignored, never reported', () => {
  const d = parse('#include "../x/y.def"\n#define FOO 3\nLIBRARY demo\nEXPORTS\n  Foo @1\nfoo bar\nROW(1) junk\n');
  assert.equal(d.includes[0].path, '../x/y.def');
  assert.deepEqual(d.errors, []);
  assert.deepEqual(d.rows.map(r => r.macro), ['ROW']);
});

test('malformed rows are errors, not exceptions', () => {
  const d = parse('A(1, "x\nA(1, "x"\n');
  assert.deepEqual(d.errors.map(e => e.line), [0, 1]);
  assert.match(d.errors[0].message, /string/);
  assert.match(d.errors[1].message, /Unterminated row/);
  assert.equal(d.rows.length, 0);
});

test('block comments span lines', () => {
  const d = parse('/* a\nA(1,\n*/ B(0, SYS) /* x */');
  assert.deepEqual(d.errors, []);
  assert.deepEqual(d.rows.map(r => r.macro), ['B']);
});

test('header: nearest /* words */ line above, across blanks and rows; hover', () => {
  const d = parse('/* id name */\nA(1, X)\n\nB(2, Y, 3)\n// other\nC(3, Z)');
  assert.deepEqual(d.rows.map(r => r.header?.map(w => w.text)), [['id', 'name'], ['id', 'name'], undefined]);
  assert.equal(describe(locate(d, 1, 5)!), 'argument 2 of `A`: `name`');
  assert.equal(describe(locate(d, 3, 8)!), 'argument 3 of `B`');
  assert.equal(describe(locate(d, 1, 1)!), '`A` (id, name) - 2 arguments');
  assert.equal(describe(locate(d, 5, 1)!), '`C` - 2 arguments');
});

test('colorRanges: roles', () => {
  const t = 'E (0x10, BOOT, 7, (1, 0x2), "a {0} {{x}} b")';
  const got = colorRanges(parse(t)).map(c => `${c.role}:${t.slice(c.start, c.end)}`);
  assert.deepEqual(got, ['macro:E', 'id:0x10', 'name:BOOT', 'number:7', 'number:1', 'number:0x2',
    'string:"a ', 'placeholder:{0}', 'string: {{x}} b"']);
});

test('name index and lookup', () => {
  const idx = nameIndex([{ uri: 'a', doc: parse('E(1, LinkUp, "up")\nE(2, Timeout, "t")\nF(3, Timeout)') }]);
  assert.deepEqual(lookupName(idx, 'LinkUp'), [{ uri: 'a', line: 0, start: 5, end: 11 }]);
  assert.equal(lookupName(idx, 'EVT_ID_LinkUp')[0].uri, 'a');
  assert.equal(lookupName(idx, 'Timeout').length, 2);
  assert.deepEqual(lookupName(idx, 'printf'), []);
  assert.deepEqual(lookupName(idx, 'MyLinkUp'), []);
});

test('findUses: whole word, optional prefix', () => {
  const u = findUses('LOG(INFO, LinkUp);\nx = EVT_ID_LinkUp; LinkUpX; aLinkUp;', 'LinkUp');
  assert.deepEqual(u.map(x => [x.line, x.start]), [[0, 10], [1, 4]]);
});
