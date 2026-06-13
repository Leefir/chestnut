/**
 * Custom ESLint rule: no-direct-fs-writeatomic-to-inbox
 *
 * 应然：caller 必经 InboxWriter.write() / InboxWriter.writeSync()、
 * 不直 fs.writeAtomic(path 含 'inbox') 绕过 typed encap。
 *
 * scope: 5 scan dir (cron / watchdog / memory / contract / runtime)
 * allow-list: messaging owner
 *
 * phase 315 cluster B close 第 2 rule（替代 phase 1333 grep ratchet）
 */

const SCAN_DIRS = ['cron/', 'watchdog/', 'memory/', 'contract/', 'runtime/'];
const ALLOW_LIST = ['foundation/messaging/'];

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'caller 必经 InboxWriter.write() / writeSync()、不直 fs.writeAtomic 写 inbox path',
      category: 'Best Practices',
    },
    schema: [],
    messages: {
      directInboxWrite: 'Direct fs.writeAtomic to inbox path detected. Use InboxWriter.write() / writeSync() via notifyClaw helper.',
    },
  },

  create(context) {
    const filename = context.filename;

    // scope: 仅 5 scan dir 内 enforce
    if (!SCAN_DIRS.some(d => filename.includes(d))) return {};

    // allow-list (messaging owner)
    if (ALLOW_LIST.some(p => filename.includes(p))) return {};

    return {
      CallExpression(node) {
        const callee = node.callee;
        // `fs.writeAtomic(...)` AST
        if (
          callee.type !== 'MemberExpression' ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'writeAtomic'
        ) return;

        // arguments[0] 是 path string、含 'inbox' literal
        const args = node.arguments;
        if (args.length === 0) return;

        const pathArg = args[0];
        if (pathArg.type === 'Literal' && typeof pathArg.value === 'string' && pathArg.value.includes('inbox')) {
          context.report({ node, messageId: 'directInboxWrite' });
        }
        // TemplateLiteral 含 'inbox' 子串
        if (pathArg.type === 'TemplateLiteral') {
          const raw = pathArg.quasis.map(q => q.value.raw).join('');
          if (raw.includes('inbox')) {
            context.report({ node, messageId: 'directInboxWrite' });
          }
        }
      },
    };
  },
};
