import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatText } from '../src/layout.ts';

test('format: rows without header are aligned among themselves, args and comment text kept', () => {
  const messy = [
    '// head',
    'U32 (0x1,N,2,  30,"a, b")  //  note',
    'BOOL(0x1002 ,LONGER_NAME,   2,"x") // n2',
    'IPV4( 0x3, X, 2, (1, 2, 3, 4),"y")',
    '',
    'GROUP(1,   Net)',
  ].join('\r\n');
  const want = [
    '// head',
    'U32 (0x1,    N,           2, 30, "a, b") //  note',
    'BOOL(0x1002, LONGER_NAME, 2, "x")        // n2',
    'IPV4(0x3,    X,           2, (1, 2, 3, 4), "y")',
    '',
    'GROUP(1, Net)',
  ].join('\r\n');
  assert.equal(formatText(messy).replace(/ +/g, ' '), want.replace(/ +/g, ' '));
  const got = formatText(messy);
  assert.ok(got.includes('\r\n') && !/[^\r]\n/.test(got));
  assert.equal(got.split('\r\n')[1].indexOf('//'), got.split('\r\n')[2].indexOf('//'));
});

test('format: the header comment is the grid; hand-aligned rows with blank columns stay put', () => {
  const t = [
    '/*  id   name        min  label */',
    'A(1,  X,   5,   "l")',
    'B(  2,   LONG_NAME,   9,    "m")',
    'C  (3,   Y,' + " ".repeat(15) + '"no min")', // fewer args, but each already sits under a word: kept
    'D (4,    Z,  "off the grid")', // fewer args, off the grid: aligned with its neighbours instead
  ].join('\n');
  assert.equal(formatText(t), [
    '/*  id   name        min  label */',
    'A  (1,   X,          5,   "l")',
    'B  (2,   LONG_NAME,  9,   "m")',
    'C  (3,   Y,' + " ".repeat(15) + '"no min")',
    'D(4, Z, "off the grid")',
  ].join('\n'));
});

test('format: parse-error rows, comments and directives are untouched', () => {
  const t = '#define  X  1\n/*   c   */\nA(1,   "unterminated\nB(1,   Net) junk\nB(2,   Net)\n';
  assert.equal(formatText(t), '#define  X  1\n/*   c   */\nA(1,   "unterminated\nB(1, Net) junk\nB(2, Net)\n');
});
