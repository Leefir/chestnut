import { describe, it, expect, vi } from 'vitest';
import { SkillSystem } from '../../../src/foundation/skill-system/registry.js';
import type { FileSystem, FileEntry } from '../../../src/foundation/fs/types.js';
import type { AuditLog } from '../../../src/foundation/audit/index.js';

function mockFs(files: Record<string, string>, dirs: string[]): FileSystem {
  return {
    exists: vi.fn(async (p: string) => p in files || dirs.includes(p)),
    read: vi.fn(async (p: string) => {
      if (!(p in files)) throw new Error(`mock: ${p} not found`);
      return files[p];
    }),
    list: vi.fn(async (p: string, _opts?: object) => {
      const children = dirs
        .filter(d => d.startsWith(p + '/'))
        .map(d => d.slice(p.length + 1))
        .filter(n => !n.includes('/'));
      return children.map(name => ({
        name,
        path: `${p}/${name}`,
        isDirectory: true,
        isFile: false,
        size: 0,
        mtime: new Date(),
      })) as FileEntry[];
    }),
    writeAtomic: vi.fn(),
    append: vi.fn(),
    delete: vi.fn(),
    move: vi.fn(),
    ensureDir: vi.fn(),
    removeDir: vi.fn(),
    isDirectory: vi.fn(async (p: string) => dirs.includes(p)),
    stat: vi.fn(),
    writeAtomicSync: vi.fn(),
    writeExclusiveSync: vi.fn(),
    readSync: vi.fn(),
    readBytesSync: vi.fn(),
    appendSync: vi.fn(),
    statSync: vi.fn(),
    moveSync: vi.fn(),
    existsSync: vi.fn(),
    ensureDirSync: vi.fn(),
    listSync: vi.fn(),
    deleteSync: vi.fn(),
    resolve: vi.fn((p: string) => p),
  } as unknown as FileSystem;
}

function mockAudit(): AuditLog & { calls: Array<[string, ...string[]]> } {
  const calls: Array<[string, ...string[]]> = [];
  return {
    write: vi.fn((type: string, ...args: string[]) => {
      calls.push([type, ...args]);
    }),
    calls,
  } as unknown as AuditLog & { calls: Array<[string, ...string[]]> };
}

describe('phase 59: skill version semver validation (skillsystem-auditor P4)', () => {
  it('reverse 1: invalid version "latest" → audit VERSION_INVALID + keep original version', async () => {
    const skillsDir = '/skills';
    const skillDir = '/skills/bad-version';
    const fs = mockFs(
      {
        [`${skillDir}/SKILL.md`]: '---\nname: bad-version\nversion: latest\n---\n',
      },
      [skillsDir, skillDir],
    );
    const audit = mockAudit();
    const sys = new SkillSystem(fs, skillsDir, audit);

    const meta = await sys.register(skillDir);

    expect(meta.version).toBe('latest');
    const invalidAudit = audit.calls.find(c => c[0] === 'skill_version_invalid');
    expect(invalidAudit).toBeDefined();
    expect(invalidAudit!.slice(1)).toEqual(
      expect.arrayContaining([
        'name=bad-version',
        'version=latest',
        'expected=X.Y.Z (semver prefix)',
        `skillDir=${skillDir}`,
      ]),
    );
  });

  it('reverse 2: valid semver prefix "1.2.3-beta" → no VERSION_INVALID audit', async () => {
    const skillsDir = '/skills';
    const skillDir = '/skills/good-version';
    const fs = mockFs(
      {
        [`${skillDir}/SKILL.md`]: '---\nname: good-version\nversion: 1.2.3-beta\n---\n',
      },
      [skillsDir, skillDir],
    );
    const audit = mockAudit();
    const sys = new SkillSystem(fs, skillsDir, audit);

    const meta = await sys.register(skillDir);

    expect(meta.version).toBe('1.2.3-beta');
    expect(audit.calls.find(c => c[0] === 'skill_version_invalid')).toBeUndefined();
  });

  it('reverse 3: missing version field → no VERSION_INVALID audit + fallback 0.0.0', async () => {
    const skillsDir = '/skills';
    const skillDir = '/skills/no-version';
    const fs = mockFs(
      {
        [`${skillDir}/SKILL.md`]: '---\nname: no-version\n---\n',
      },
      [skillsDir, skillDir],
    );
    const audit = mockAudit();
    const sys = new SkillSystem(fs, skillsDir, audit);

    const meta = await sys.register(skillDir);

    expect(meta.version).toBe('0.0.0');
    expect(audit.calls.find(c => c[0] === 'skill_version_invalid')).toBeUndefined();
  });
});
