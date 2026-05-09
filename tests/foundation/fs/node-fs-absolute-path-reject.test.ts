import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { NodeFileSystem } from '../../../src/foundation/fs/node-fs.js';
import { PermissionError } from '../../../src/types/errors.js';

describe('NodeFileSystem — absolute path reject (P0.1 phase 611)', () => {
  const fs = new NodeFileSystem({ baseDir: os.tmpdir() });

  it('throws PermissionError for absolute POSIX path /etc/passwd', async () => {
    await expect(fs.read('/etc/passwd')).rejects.toThrow(PermissionError);
  });

  it('throws PermissionError for absolute path even when file does not exist', async () => {
    // Path #1 实证 attack vector：read + 不存在文件 + 绝对路径 → 修前 fall through silent
    await expect(fs.read('/nonexistent/sensitive')).rejects.toThrow(PermissionError);
  });

  it('throws PermissionError for write with absolute path', async () => {
    await expect(fs.writeAtomic('/tmp/escape', 'data')).rejects.toThrow(PermissionError);
  });

  it('does not affect legitimate relative paths', async () => {
    // baseDir = os.tmpdir() / relative path 'sub/file' 应 0 throw
    // (file 不存在 → read 抛 FileNotFoundError 非 PermissionError)
    const { FileNotFoundError } = await import('../../../src/types/errors.js');
    await expect(fs.read('sub/file')).rejects.toThrow(FileNotFoundError);
  });
});
