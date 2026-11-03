import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename } from 'node:path';
import { parse } from '../src/parser.ts';
import { formatText } from '../src/layout.ts';
import { legend, semanticTokens } from '../src/semantic.ts';
import { schema, fxDir, defsIn, readFile, extraFiles } from './schema.ts';

for (const f of [...defsIn(fxDir), ...extraFiles()]) {
  test(`format ${basename(f)}: idempotent`, () => {
    const once = formatText(readFile(f)!, schema);
    assert.equal(formatText(once, schema), once);
  });
}

test('format: messy rows get aligned, args and comment text kept', () => {
  const messy = [
    '// head',
    'CONFIG_U32 (0x1,N,2,  30,1,600,"a, b")  //  note',
    'CONFIG_BOOL(0x1002 ,LONGER_NAME,   2,1,"x") // n2',
    'CONFIG_IPV4( 0x3, X, 2, (1, 2, 3, 4),"y")',
    '',
    'LOG_GROUP_DEF(1,   Net)',
  ].join('\r\n');
  const want = [
    '// head',
    'CONFIG_U32 (0x1,    N,           2, 30, 1, 600, "a, b") //  note',
    'CONFIG_BOOL(0x1002, LONGER_NAME, 2, 1,  "x")            // n2',
    'CONFIG_IPV4(0x3,    X,           2, (1, 2, 3, 4), "y")',
    '',
    'LOG_GROUP_DEF(1, Net)',
  ].join('\r\n');
  // "30"/"1" widths: default column is 2 wide, min column 1 wide
  assert.equal(formatText(messy, schema).replace(/ +/g, ' '), want.replace(/ +/g, ' '));
  const got = formatText(messy, schema);
  assert.ok(got.includes('\r\n') && !/[^\r]\n/.test(got));
  assert.equal(got.split('\r\n')[1].indexOf('//'), got.split('\r\n')[2].indexOf('//'));
});

test('format: parse-error rows, comments and directives are untouched', () => {
  const t = '#define  X  1\n/*   c   */\nLOG_DEF(1,   "unterminated\nLOG_GROUP_DEF(1,   Net) junk\nLOG_GROUP_DEF(2,   Net)\n';
  assert.equal(formatText(t, schema), '#define  X  1\n/*   c   */\nLOG_DEF(1,   "unterminated\nLOG_GROUP_DEF(1,   Net) junk\nLOG_GROUP_DEF(2, Net)\n');
});

test('semanticTokens: roles from the schema', () => {
  const doc = parse('LOG_GROUP_DEF(1, Net)\nCONFIG_BOOL(0x1001, A, 1, 0, "x")\nLOG_DEF(0x0101, INFO, NONE, Up, "v {0} {{x}}")\nFOO(1)', schema);
  const t = semanticTokens(doc).map(x => `${x.line}:${x.start}:${x.type}${x.modifiers.map(m => '+' + m).join('')}`);
  assert.deepEqual(t.slice(0, 3), ['0:0:macro', '0:14:number+declaration', '0:17:variable+declaration+readonly']);
  assert.ok(t.includes('1:23:type')); // group reference
  assert.ok(t.includes('2:16:enumMember') && t.includes('2:22:enumMember'));
  assert.ok(t.includes('2:32:string') && t.includes('2:35:parameter'));
  assert.ok(!t.some(x => x.startsWith('3:'))); // unknown macro
  assert.ok(semanticTokens(doc).every(x => legend.types.includes(x.type) && x.modifiers.every(m => legend.modifiers.includes(m))));
});
