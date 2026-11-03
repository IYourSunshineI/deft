import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename } from 'node:path';
import { parse } from '../src/parser.ts';
import { schema, fxDir, defsIn, readFile, extraFiles } from './schema.ts';

const files = defsIn(fxDir);

test('fixtures present', () => assert.equal(files.length, 6));

for (const f of [...files, ...extraFiles()]) {
  test(`fixture ${basename(f)}: row counts, columns, no errors`, () => {
    const text = readFile(f)!;
    const doc = parse(text, schema);
    assert.deepEqual(doc.errors, []);
    const grep = new Map<string, number>();
    for (const m of text.matchAll(/^([A-Z][A-Z0-9_]*)\s*\(/gm)) grep.set(m[1], (grep.get(m[1]) ?? 0) + 1);
    const got = new Map<string, number>();
    for (const r of doc.rows) {
      got.set(r.macro, (got.get(r.macro) ?? 0) + 1);
      assert.ok(r.spec, `${r.macro} in schema`);
      assert.ok(r.mapped, `${r.macro} line ${r.line + 1} maps to a layout`);
      assert.ok(r.args.every(a => a.column));
    }
    assert.deepEqual(got, grep);
    for (const i of doc.includes) assert.match(i.path, /\.def$/);
  });
}

test('args: ranges, strings with commas/parens/escapes, tuples', () => {
  const t = 'CONFIG_IPV4  (0x1002, N, 16, (192, 168, 90, 5), "a, b) \\" c")  // tail';
  const { rows, errors } = parse(t, schema);
  assert.deepEqual(errors, []);
  const r = rows[0];
  assert.equal(r.macro, 'CONFIG_IPV4');
  assert.deepEqual(r.args.map(a => a.text), ['0x1002', 'N', '16', '(192, 168, 90, 5)', '"a, b) \\" c"']);
  for (const a of r.args) assert.equal(t.slice(a.start, a.end), a.text);
  assert.deepEqual(r.args.map(a => a.column), ['id', 'name', 'group', 'default', 'label']);
});

test('include and define', () => {
  const t = '#include "../x/y.def"\n#define FOO_VERSION 3 // c\n';
  const d = parse(t, schema);
  assert.equal(d.includes[0].path, '../x/y.def');
  assert.equal(t.slice(d.includes[0].start, d.includes[0].end), '../x/y.def');
  assert.deepEqual([d.defines[0].name, d.defines[0].value, d.defines[0].line], ['FOO_VERSION', '3', 1]);
});

test('unknown macro parsed generically; wrong arity is unmapped', () => {
  const d = parse('MY_MACRO(1, 2)\nLOG_DEF(1, A)', schema);
  assert.equal(d.rows[0].spec, undefined);
  assert.equal(d.rows[0].args.length, 2);
  assert.equal(d.rows[1].mapped, false);
});

test('malformed rows are errors, not exceptions', () => {
  const d = parse('LOG_DEF(1, A, "x\nLOG_DEF(1, A, "x"\nLOG_DEF(1, A, "x") junk\nfoo bar', schema);
  assert.deepEqual(d.errors.map(e => e.line), [0, 1, 2, 3]);
  assert.match(d.errors[0].message, /string/);
  assert.match(d.errors[1].message, /Unterminated row/);
  assert.equal(d.errors[3].warning, true);
  assert.equal(d.rows.length, 1);
});

test('block comments span lines', () => {
  const d = parse('/* a\nLOG_DEF(1,\n*/ LOG_GROUP_DEF(0, SYS) /* x */', schema);
  assert.deepEqual(d.errors, []);
  assert.equal(d.rows.length, 1);
});
