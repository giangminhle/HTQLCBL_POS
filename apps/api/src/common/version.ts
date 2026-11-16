import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Reads apps/api/package.json; works from both src (ts-jest) and dist (node). */
export const APP_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();
