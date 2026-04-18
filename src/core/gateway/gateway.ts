/**
 * Gateway (L3): 外部客户端 ↔ 内部系统 的实时交互门面。
 *
 * 不可消除耦合（显式）：
 * 1. Gateway → Daemon interrupt 回调（反向控制流；回调由 Daemon 注入）
 * 2. Gateway → Stream 只读订阅（不阻塞 writer；backpressure 契约已定）
 * 3. Gateway ↔ Transport 生命周期绑定（同 start/stop 周期）
 * 4. Gateway → Transport 连接视图派生（Map 跟随 onConnect/onDisconnect）
 *
 * 派生状态不持久化：connections、lastInterruptTs 重启后从事件流自然重建。
 */

import type {
  Gateway,
  GatewayInput,
  ClientMessage,
  ServerMessage,
} from './types.js';
import type { Connection } from '../../foundation/transport/index.js';
import type { StreamReader, StreamEvent } from '../../foundation/stream/index.js';
import type { ToolResult, ExecContext } from '../tools/index.js';
import { GATEWAY_INTERRUPT_DEBOUNCE_MS } from '../../constants.js';

export function createGateway(input: GatewayInput): Gateway {
  const { streamFactory, transport, interrupt } = input;
  const isOnlineMode = transport !== undefined;

  const connections = new Map<string, Connection>();
  let streamReader: StreamReader | null = null;
  let lastInterruptTs = 0;
  let started = false;

  const broadcast = (msg: ServerMessage): void => {
    if (!transport) return;
    try {
      transport.broadcast(JSON.stringify(msg));
    } catch (err) {
      console.error('[Gateway] broadcast failed:', err);
    }
  };

  const dropConnection = (connId: string, reason: string): void => {
    if (!connections.has(connId)) return;
    connections.delete(connId);
    broadcast({ type: 'connection_dropped', connectionId: connId, reason });
  };

  const handleClientMessage = (conn: Connection, data: string): void => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      dropConnection(conn.id, 'malformed JSON');
      return;
    }

    const msg = parsed as ClientMessage;
    switch (msg.type) {
      case 'interrupt': {
        const now = Date.now();
        if (now - lastInterruptTs < GATEWAY_INTERRUPT_DEBOUNCE_MS) {
          return;
        }
        lastInterruptTs = now;
        try {
          interrupt('user');
        } catch (err) {
          // interrupt 回调抛错原样抛（契约：调用方负责处理）
          throw err;
        }
        return;
      }
      case 'ask_user_reply': {
        // Step 3: 路由到 askUser 状态机。
        // Step 2: 合法 type 但无 pending session → 静默忽略，不 drop 连接。
        return;
      }
      default:
        dropConnection(conn.id, 'unknown message type');
        return;
    }
  };

  return {
    async start() {
      if (started) throw new Error('Gateway already started');
      started = true;
      if (!isOnlineMode) return;

      transport!.onConnect((c) => {
        connections.set(c.id, c);
      });
      transport!.onDisconnect((c) => {
        connections.delete(c.id);
      });
      transport!.onMessage((c, data) => {
        try {
          handleClientMessage(c, data);
        } catch (err) {
          console.error('[Gateway] handleClientMessage error:', err);
          throw err;
        }
      });

      streamReader = streamFactory((ev: StreamEvent) => {
        broadcast({ type: 'stream', event: ev });
      });
      streamReader.start();
    },

    async stop() {
      if (!started) return;
      started = false;
      if (!isOnlineMode) return;

      // 1. 先停 reader，避免 stop 过程中仍有事件尝试 broadcast
      if (streamReader) {
        const sr = streamReader;
        streamReader = null;
        await sr.stop();
      }

      // 2. 内部 drop 所有连接
      for (const id of [...connections.keys()]) {
        dropConnection(id, 'gateway stopping');
      }

      // 3. 关闭 transport
      await transport!.close();
    },

    async askUser(_question: string, _ctx: ExecContext): Promise<ToolResult> {
      throw new Error('ask_user not implemented in this phase');
    },

    getActiveConnections() {
      return Array.from(connections.values());
    },

    isOnline() {
      return isOnlineMode;
    },
  };
}
