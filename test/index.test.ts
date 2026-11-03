import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.ts';
import { findUses, lookupName, nameIndex, refsToRow, resolveRef } from '../src/index.ts';
import { schema } from './schema.ts';

const files = [
  { uri: 'a', doc: parse('LOG_GROUP_DEF(1, Net)\nLOG_DEF(0x0101, LinkUp, "up")\n', schema) },
  { uri: 'b', doc: parse('CONFIG_GROUP_DEF(2, Core, "Core")\nCONFIG_U32(1, Timeout, 2, 30, 1, 600, "T")\nLOG_DEF(0x0102, Timeout, "dup")\n', schema) },
];
const idx = nameIndex(files);

test('lookupName: exact, prefixed, unknown', () => {
  assert.deepEqual(lookupName(idx, 'LinkUp'), [{ uri: 'a', line: 1, start: 16, end: 22 }]);
  assert.equal(lookupName(idx, 'EVT_ID_LinkUp')[0].uri, 'a');
  assert.equal(lookupName(idx, 'Timeout').length, 2);
  assert.deepEqual(lookupName(idx, 'LinkDown'), []);
  assert.deepEqual(lookupName(idx, 'printf'), []);
  assert.deepEqual(lookupName(idx, 'MyLinkUp'), []);
});

test('findUses: whole word, optional prefix', () => {
  const u = findUses('LOG(INFO, LinkUp);\nx = EVT_ID_LinkUp; LinkUpX; aLinkUp;', 'LinkUp');
  assert.deepEqual(u.map(x => [x.line, x.start]), [[0, 10], [1, 4]]);
});

test('resolveRef / refsToRow follow ref columns', () => {
  const row = files[1].doc.rows[1];
  const grp = resolveRef(files, row, row.args[2]);
  assert.deepEqual(grp.map(g => [g.uri, g.line]), [['b', 0]]);
  assert.deepEqual(refsToRow(files, files[1].doc.rows[0]).map(g => [g.uri, g.line]), [['b', 1]]);
  assert.deepEqual(resolveRef(files, row, row.args[1]), []);
});
