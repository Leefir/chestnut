import type { StreamEvent, StreamLog } from '../../foundation/stream/types.js';
import type { Audit } from '../../foundation/audit/index.js';

export class NoopStreamWriter implements StreamLog {
  write(_event: StreamEvent): void {}
}

export class NoopAuditWriter implements Audit {
  write(_type: string, ..._cols: (string | number)[]): void {}
}
