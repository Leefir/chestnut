/**
 * Custom ESLint rule: no-hardcoded-inbox-path
 *
 * 应然：caller 必经 messaging module helper（notifyClaw / writeInboxAsync / makeInboxPath）、
 * 不直 path.join(...inbox...pending) 构造 raw string 绕过 typed encap。
 *
 * scope: src/ 全（除 allow-list）
 * allow-list: messaging owner + assembly + cli + daemon (read/delete) + watchdog-utils (countMd read-only)
 *
 * phase 315 cluster B close 第 1 rule（替代 phase 1334 grep ratchet 第 2 invariant）
 */

const ALLOW_LIST = [
  'foundation/messaging/',  // codec owner
  'assembly/',              // 装配端
  'cli/',                   // CLI 入口
  'daemon/',                // read/delete 路径
  'watchdog-utils',         // countMd read-only
];

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'caller 不直 path.join(...inbox/pending...) 构造 raw inbox path，必经 messaging helper',
      category: 'Best Practices',
    },
    schema: [],
    messages: {
      hardcodedInboxPath: 'Hardcoded path.join with "inbox/pending" detected. Use messaging helper (notifyClaw / writeInboxAsync / makeInboxPath).',
    },
  },

  create(context) {
    const filename = context.filename;
    if (ALLOW_LIST.some(p => filename.includes(p))) return {};

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.object.type !== 'Identifier' ||
          callee.object.name !== 'path' ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'join'
        ) return;

        // path.join(...) 的 arguments 含字符串 literal 'inbox' + 'pending' 子串组合
        const args = node.arguments;
        const literalValues = args
          .filter(a => a.type === 'Literal' && typeof a.value === 'string')
          .map(a => a.value);

        const hasInbox = literalValues.some(v => v.includes('inbox'));
        const hasPending = literalValues.some(v => v.includes('pending'));

        if (hasInbox && hasPending) {
          context.report({ node, messageId: 'hardcodedInboxPath' });
        }
      },
    };
  },
};
