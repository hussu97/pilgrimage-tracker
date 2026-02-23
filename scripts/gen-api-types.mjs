/**
 * Generate TypeScript types from the FastAPI OpenAPI schema.
 *
 * Usage:
 *   1. Start the server: cd soulstep-catalog-api && uvicorn app.main:app --port 3000
 *   2. Run from repo root: npm run gen:types
 *
 * The generated file is written to apps/soulstep-customer-web/src/lib/types/api-generated.d.ts
 * and apps/soulstep-customer-mobile/src/lib/types/api-generated.d.ts
 *
 * These generated types reflect the backend schema exactly. You can import
 * them alongside the hand-written types in lib/types/ as a cross-check or
 * gradually replace manual type definitions.
 *
 * Re-run whenever the backend API schema changes.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3000/openapi.json';
const TARGETS = [
  path.join(rootDir, 'apps', 'soulstep-customer-web', 'src', 'lib', 'types', 'api-generated.d.ts'),
  path.join(rootDir, 'apps', 'soulstep-customer-mobile', 'src', 'lib', 'types', 'api-generated.d.ts'),
];

const otsBin = path.join(rootDir, 'node_modules', '.bin', 'openapi-typescript');

for (const target of TARGETS) {
  const dir = path.dirname(target);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  console.log(`Generating types → ${path.relative(rootDir, target)}`);
  try {
    execSync(`${otsBin} "${API_URL}" --output "${target}"`, {
      stdio: 'inherit',
      cwd: rootDir,
    });
    console.log('  ✔ Done');
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
    console.error(
      '  Make sure the server is running on http://127.0.0.1:3000 before running this script.',
    );
    process.exit(1);
  }
}

console.log('\nTypes generated successfully. Import from "@/lib/types/api-generated".');
