/**
 * phase 1400 — `validateSession` 委托 `validateSessionData` 行为等价 reverse test
 *
 * 报告项：M-02 `validateSession` 与 `validateSessionData` 重复代码（违 DRY）
 * fix：private `validateSession(data)` → `return validateSessionData(data, this.audit, this.clawId)`
 *
 * 覆盖 5 路：
 * (i) 完整 valid input
 * (ii) version invalid（> 2 / < 1 / 非整数）→ fallback 2 + INVARIANT_FAILED audit
 * (iii) messages 含 invalid entry → filter + INVARIANT_FAILED audit
 * (iv) data.clawId undefined + this.clawId 给值 → fallback 走 this.clawId
 * (v) data.clawId 给值 + this.clawId undefined → data.clawId 不被 fallback 覆盖
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DialogStore,
  validateSessionData,
} from '../../../src/foundation/dialog-store/store.js';
import { NodeFileSystem } from '../../../src/foundation/fs/node-fs.js';
import { makeAudit } from '../../helpers/audit.js';
import { createTempDir, cleanupTempDir } from '../../utils/temp.js';
import { DIALOG_AUDIT_EVENTS } from '../../../src/foundation/dialog-store/audit-events.js';
import type { SessionData } from '../../../src/foundation/dialog-store/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const filename = 'current.json';

type AuditEventTuple = [string, ...(string | number)[]];

async function loadViaStore(
  tempDir: string,
  raw: unknown,
  clawId: string | undefined,
): Promise<{ session: SessionData; auditWrites: AuditEventTuple[] }> {
  const nodeFs = new NodeFileSystem({ baseDir: tempDir });
  const audit = makeAudit();
  await fs.writeFile(path.join(tempDir, filename), JSON.stringify(raw), 'utf-8');
  const store = new DialogStore(nodeFs, '', audit.audit, filename, clawId);
  const { session } = await store.load();
  return { session, auditWrites: audit.events };
}

function eventName(e: AuditEventTuple): string {
  return e[0];
}
function eventPayload(e: AuditEventTuple): (string | number)[] {
  return e.slice(1) as (string | number)[];
}

describe('phase 1400 — validateSession delegates to validateSessionData (M-02 DRY fix)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('(i) 完整 valid input — load 与 validateSessionData 直接调用结果同 shape', async () => {
    const raw: SessionData = {
      version: 2,
      clawId: 'c1',
      createdAt: '2026-05-29T00:00:00Z',
      updatedAt: '2026-05-29T00:00:00Z',
      systemPrompt: 'sp',
      messages: [{ role: 'user', content: 'hi' }],
      toolsForLLM: [],
    };
    const { session } = await loadViaStore(tempDir, raw, 'c1');
    const direct = validateSessionData(structuredClone(raw), undefined, 'c1');
    expect(session.version).toBe(2);
    expect(session.clawId).toBe('c1');
    expect(session.systemPrompt).toBe('sp');
    expect(session.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(session.toolsForLLM).toEqual([]);
    expect(session.messages).toEqual(direct.messages);
    expect(session.systemPrompt).toEqual(direct.systemPrompt);
    expect(session.toolsForLLM).toEqual(direct.toolsForLLM);
    expect(session.clawId).toEqual(direct.clawId);
  });

  it('(ii) version invalid (=999, detect 拦截 → corrupted 路径) — load fallback cold start', async () => {
    const raw = {
      version: 999,
      clawId: 'c1',
      createdAt: '2026-05-29T00:00:00Z',
      updatedAt: '2026-05-29T00:00:00Z',
      systemPrompt: '',
      messages: [],
      toolsForLLM: [],
    };
    const { session, auditWrites } = await loadViaStore(tempDir, raw, 'c1');
    expect(session.version).toBe(2);
    expect(session.messages).toEqual([]);
    // detectAndMigrateVersion 在 validateSession 前拦截 version>SESSION_CURRENT_VERSION
    expect(auditWrites.some((e) => eventName(e) === DIALOG_AUDIT_EVENTS.VERSION_UNKNOWN)).toBe(true);
  });

  it('(ii-b) version invalid (=0 < 1) — validateSessionData 直接路径 fallback 2 + INVARIANT_FAILED', () => {
    const audit = makeAudit();
    const raw = {
      version: 0,
      clawId: 'c1',
      createdAt: '2026-05-29T00:00:00Z',
      updatedAt: '2026-05-29T00:00:00Z',
      systemPrompt: '',
      messages: [],
      toolsForLLM: [],
    } as unknown as SessionData;
    const out = validateSessionData(raw, audit.audit, undefined);
    expect(out.version).toBe(2);
    const invariantEvents = audit.events.filter((e) => eventName(e) === DIALOG_AUDIT_EVENTS.INVARIANT_FAILED);
    expect(invariantEvents.length).toBeGreaterThanOrEqual(1);
    expect(
      invariantEvents.some((e) => eventPayload(e).some((p) => String(p).includes('field=version'))),
    ).toBe(true);
  });

  it('(iii) messages 含 invalid entry → filter + INVARIANT_FAILED', async () => {
    const raw = {
      version: 2,
      clawId: 'c1',
      createdAt: '2026-05-29T00:00:00Z',
      updatedAt: '2026-05-29T00:00:00Z',
      systemPrompt: '',
      messages: [
        { role: 'user', content: 'ok' },
        null,
        'not-an-object',
        { role: 'assistant', content: 'also-ok' },
      ],
      toolsForLLM: [],
    };
    const { session, auditWrites } = await loadViaStore(tempDir, raw, 'c1');
    expect(session.messages.length).toBe(2);
    expect((session.messages[0] as { role: string }).role).toBe('user');
    expect((session.messages[1] as { role: string }).role).toBe('assistant');
    const invariantEvents = auditWrites.filter((e) => eventName(e) === DIALOG_AUDIT_EVENTS.INVARIANT_FAILED);
    expect(invariantEvents.length).toBeGreaterThanOrEqual(2);
    expect(
      invariantEvents.some((e) => eventPayload(e).some((p) => String(p).includes('field=messages.entry'))),
    ).toBe(true);
  });

  it('(iv) data.clawId undefined + this.clawId 给值 → fallback 走 this.clawId', async () => {
    const raw = {
      version: 2,
      // clawId 故意省略
      createdAt: '2026-05-29T00:00:00Z',
      updatedAt: '2026-05-29T00:00:00Z',
      systemPrompt: '',
      messages: [],
      toolsForLLM: [],
    };
    const { session } = await loadViaStore(tempDir, raw, 'ctor-claw');
    expect(session.clawId).toBe('ctor-claw');
  });

  it('(v) data.clawId 给值 → 不被 fallback 覆盖（even if this.clawId 不同）', async () => {
    const raw = {
      version: 2,
      clawId: 'data-claw',
      createdAt: '2026-05-29T00:00:00Z',
      updatedAt: '2026-05-29T00:00:00Z',
      systemPrompt: '',
      messages: [],
      toolsForLLM: [],
    };
    const { session } = await loadViaStore(tempDir, raw, 'ctor-claw');
    expect(session.clawId).toBe('data-claw');
  });

  it('(vi) 双 path 等价 — store.load() 输出与 validateSessionData(data, audit, this.clawId) 直接输出对照同 shape', async () => {
    const raw = {
      version: 2,
      clawId: 'c1',
      createdAt: '2026-05-29T00:00:00Z',
      updatedAt: '2026-05-29T00:00:00Z',
      systemPrompt: 'sys',
      messages: [
        { role: 'user', content: 'hi' },
        null,
        { role: 'assistant', content: 'hello' },
      ],
      toolsForLLM: [],
    };
    const { session } = await loadViaStore(tempDir, raw, 'c1');
    const audit2 = makeAudit();
    const direct = validateSessionData(structuredClone(raw) as SessionData, audit2.audit, 'c1');
    expect(session.version).toEqual(direct.version);
    expect(session.clawId).toEqual(direct.clawId);
    expect(session.systemPrompt).toEqual(direct.systemPrompt);
    expect(session.messages.length).toEqual(direct.messages.length);
    expect(session.toolsForLLM).toEqual(direct.toolsForLLM);
  });
});
