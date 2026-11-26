// @ts-nocheck - this test reads the source files with Node's fs and path; the app's tsconfig has no Node types (Jest runs it on Node).
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Metro bundles require() only with a fixed string: require(name) passes
 * Jest and the type check, then breaks the app bundle ("Invalid call ...
 * require(name)"). Keep every require in the app's code literal.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

it('uses require() only with a fixed string', () => {
  const root = join(__dirname, '..');
  const bad: string[] = [];
  for (const file of [...files(join(root, 'src')), ...files(join(root, 'app'))]) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // Skip comments; look at real calls.
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        if (/\brequire\(\s*[^'"`\s)]/.test(code)) bad.push(`${file.slice(root.length + 1)}:${i + 1}: ${line.trim()}`);
      });
  }
  expect(bad).toEqual([]);
});
