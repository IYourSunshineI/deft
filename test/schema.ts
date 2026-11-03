import { readFileSync, readdirSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Schema } from '../src/parser.ts';

export const schema: Schema = JSON.parse(readFileSync(new URL('../src/schema.json', import.meta.url), 'utf8'));
export const fxDir = fileURLToPath(new URL('./fixtures/', import.meta.url));
export const fx = (rel: string) => readFileSync(join(fxDir, rel), 'utf8');
export const readFile = (p: string) => { try { return readFileSync(p, 'utf8'); } catch { return undefined; } };

/** All *.def files below `dir` (absolute paths). */
export const defsIn = (dir: string) =>
  (readdirSync(dir, { recursive: true }) as string[]).filter(f => f.endsWith('.def')).map(f => resolve(dir, f));

/** Directories from DEF_TABLES_EXTRA (path-separated), e.g. real tables checked locally; their *.def are not recursed. */
export const extraFiles = () =>
  (process.env.DEF_TABLES_EXTRA ?? '').split(delimiter).filter(Boolean)
    .flatMap(d => readdirSync(d).filter(f => f.endsWith('.def')).map(f => resolve(d, f)));
