import { describe, it, expect, afterEach } from 'vitest';
import { promises as nativeFs } from 'node:fs';
import * as path from 'node:path';
import { createTempDir, cleanupTempDir } from '../utils/temp.js';
import { createDirContext } from '../../src/cli/cli-factories.js';
import { createStreamReader, STREAM_FILE, type StreamEvent, type StreamReader } from '../../src/foundation/stream/index.js';
import { makeAudit } from '../helpers/audit.js';
import { AUDIT_EVENTS } from '../../src/foundation/audit/events.js';

const TIMEOUT_MS = 10000;

function waitFor(condition: () => boolean, timeoutMs = TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      try { if (condition()) { resolve(); return; } } catch {}
      if (Date.now() - start > timeoutMs) { reject(new Error('waitFor timed out')); return; }
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe('chat-viewport 订阅 motion stream（phase161 回归）', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length) {
      try { await cleanups.pop()!(); } catch {}
    }
  });

  it('agent dir 下的 stream.jsonl 事件能触达 handleEvent', async () => {
    const agentDir = await createTempDir('phase161-agent-');
    cleanups.push(() => cleanupTempDir(agentDir));

    // 预创建空 stream.jsonl
    const streamPath = path.join(agentDir, STREAM_FILE);
    await nativeFs.writeFile(streamPath, '');

    const received: StreamEvent[] = [];
    // 模拟 chat-viewport L64 + L471 修复后的订阅形态
    const { fs } = createDirContext(agentDir);
    const reader: StreamReader = createStreamReader(
      fs,
      STREAM_FILE,
      (ev) => received.push(ev),
      makeAudit().audit,
    );
    cleanups.push(() => reader.stop());
    reader.start();

    // chokidar 启动期
    await new Promise(r => setTimeout(r, 300));

    // 模拟 agent 写事件
    await nativeFs.appendFile(
      streamPath,
      JSON.stringify({ ts: Date.now(), type: 'text_delta', delta: 'hi' }) + '\n',
    );

    await waitFor(() => received.length >= 1);
    expect(received[0].type).toBe('text_delta');
  });

  it('baseDir 指向不含 stream.jsonl 的目录时，audit 写入 stream_reader_file_missing', async () => {
    const wrongDir = await createTempDir('phase161-wrong-');
    cleanups.push(() => cleanupTempDir(wrongDir));

    const { fs } = createDirContext(wrongDir);
    const { audit, events } = makeAudit();
    const reader = createStreamReader(fs, STREAM_FILE, () => {}, audit);
    cleanups.push(() => reader.stop());

    reader.start();
    // start() 内的 existsSync 探测是同步的（Step 1 §7.b 论证），无需 waitFor

    expect(events.some(e => e[0] === AUDIT_EVENTS.STREAM_READER_FILE_MISSING)).toBe(true);
  });
});
