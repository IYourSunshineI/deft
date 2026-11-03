import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionReminder } from '../src/version.ts';
import { schema } from './schema.ts';

const t = (v: number, rows: string, guard = false) =>
  (guard ? '#ifndef X_VERSION\n' : '') + `#define X_VERSION ${v}\n` + (guard ? '#endif\n' : '') + rows;
const R = 'LOG_GROUP_DEF(1, A)\nLOG_DEF(0x0101, X, "a")\n';
const w = (a: string, b: string) => versionReminder(a, b, schema);

test('rows changed, same version -> warning on the define', () => {
  const d = w(t(3, R), t(3, R + 'LOG_DEF(0x0102, Y, "b")\n'))!;
  assert.equal(d.severity, 'warning');
  assert.equal(d.line, 0);
  assert.match(d.message, /X_VERSION is still 3/);
});
test('version bumped -> none', () => assert.equal(w(t(3, R), t(4, R + 'LOG_DEF(0x0102, Y, "b")\n')), undefined));
test('only whitespace/comments changed -> none', () =>
  assert.equal(w(t(3, R), t(3, 'LOG_GROUP_DEF( 1,   A ) // c\n/* x */ LOG_DEF(0x0101,  X,  "a")\n')), undefined));
test('no version define -> none', () => assert.equal(w(R, R + 'LOG_DEF(0x0102, Y, "b")\n'), undefined));
test('version inside #ifndef guard', () => {
  const d = w(t(1, R, true), t(1, R.replace('"a"', '"b"'), true))!;
  assert.equal(d.line, 1);
  assert.equal(w(t(1, R, true), t(2, R.replace('"a"', '"b"'), true)), undefined);
});
