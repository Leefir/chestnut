import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

describe('assembly/config-load: uses FileSystem for atomic writes', () => {
  it('contains no inline fs.writeFileSync for atomic write pattern', () => {
    const src = readFileSync('src/assembly/config-load.ts', 'utf-8');
    expect(src).not.toMatch(/fs\.writeFileSync\b/);
  });

  it('contains no Date.now() tmp naming', () => {
    const src = readFileSync('src/assembly/config-load.ts', 'utf-8');
    expect(src).not.toMatch(/\$\{Date\.now\(\)\}/);
  });

  it('uses writeAtomicSync for config writes', () => {
    const configLoadSrc = readFileSync('src/assembly/config-load.ts', 'utf-8');
    const loaderSrc = readFileSync('src/foundation/config/loader.ts', 'utf-8');
    // Phase 10/298: write logic remains in loader.ts; config-load.ts delegates via writeYamlConfig
    expect(configLoadSrc + loaderSrc).toMatch(/writeAtomicSync\(/);
  });
});
