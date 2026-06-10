/**
 * @module L6.CLI.Commands.MessageRenderer.ResultRenderer
 * phase 31 P2.5: result rendering 函数集。
 */

import type { ToolUseBlock, ToolResultBlock } from '../../foundation/llm-provider/types.js';
import { CliError } from '../errors.js';
import { type Step } from './session-parser.js';
import { renderArgs, renderArgsFull, truncateSingleLine } from './arg-renderer.js';

function renderResult(result: ToolResultBlock | undefined): string {
  if (!result) return '→ (pending)';
  const content = result.content;
  if (result.is_error) {
    const lines = content.split('\n');
    if (lines.length > 1) return `→ ERR ${truncateSingleLine(content, 60)} (${lines.length} lines)`;
    return `→ ERR ${truncateSingleLine(content, 60)}`;
  }
  if (content === '' || content.trim() === '') return '→ ok';
  const lines = content.split('\n');
  if (lines.length > 1) return `→ ${truncateSingleLine(content, 60)} (${lines.length} lines)`;
  if (content.length <= 60) return `→ ${content}`;
  return `→ ${truncateSingleLine(content, 60)}`;
}

function slotLetter(idx: number): string {
  // 0 -> 'a', 1 -> 'b', ...
  return String.fromCharCode(97 + idx);
}

function marker(label: string): string {
  return `=== ${label} ===`;
}

function markerWithSize(label: string, chars: number): string {
  return `=== ${label} (${chars}chars) ===`;
}

function renderToolUseSections(tu: ToolUseBlock, result: ToolResultBlock | undefined, slotLabel: string): string[] {
  const sections: string[] = [];
  const callHeader = slotLabel ? `call ${slotLabel}: ${tu.name}` : `call: ${tu.name}`;
  const argsBody = renderArgsFull(tu.input);
  sections.push(argsBody ? `${marker(callHeader)}\n\n${argsBody}` : marker(callHeader));

  const resultLabel = slotLabel ? `result ${slotLabel}` : 'result';
  if (!result) {
    sections.push(marker(`${resultLabel}: (pending)`));
  } else if (result.is_error) {
    sections.push(`${markerWithSize(`${resultLabel}: ERR`, result.content.length)}\n\n${result.content}`);
  } else {
    sections.push(`${markerWithSize(resultLabel, result.content.length)}\n\n${result.content}`);
  }
  return sections;
}

export interface RenderStepsOpts {
  cliPrefix?: string;
  noHint?: boolean;
}

export function renderSteps(steps: Step[], opts: RenderStepsOpts = {}): string {
  const lines: string[] = ['STEP  CALL  RESULT'];

  for (const step of steps) {
    // user input row (仅 turn 起点 step 含)
    if (step.userInput) {
      lines.push(`${step.num}  (user) "${truncateSingleLine(step.userInput.content, 80)}"`);
    }

    // text-only turns
    if (step.toolUses.length === 0 && step.texts.length > 0) {
      const text = step.texts.join(' ');
      lines.push(`${step.num}  (text) "${truncateSingleLine(text, 80)}"`);
      continue;
    }

    // tool_use turns
    const multi = step.toolUses.length > 1;
    step.toolUses.forEach((tu, idx) => {
      const argsStr = renderArgs(tu.name, tu.input);
      const result = renderResult(step.toolResults.get(tu.id));
      const stepLabel = multi ? `${step.num}.${slotLetter(idx)}` : String(step.num);
      lines.push(`${stepLabel}  ${argsStr}  ${result}`);
    });
  }

  if (!opts.noHint && steps.length > 0 && opts.cliPrefix) {
    lines.push('');
    const lastNum = steps[steps.length - 1].num;
    lines.push(`→ chestnut ${opts.cliPrefix} step <n> for full detail (n=1..${lastNum}, or N.<a-z> for tool slot)`);
  }

  return lines.join('\n');
}

export function renderStepFull(step: Step, slotIdx?: number): string {
  if (slotIdx !== undefined) {
    if (slotIdx < 0 || slotIdx >= step.toolUses.length) {
      throw new CliError(`slot ${slotLetter(slotIdx)} out of range (step ${step.num} has ${step.toolUses.length} tool_use)`);
    }
    const tu = step.toolUses[slotIdx];
    const slotLabel = step.toolUses.length > 1 ? `${step.num}.${slotLetter(slotIdx)}` : String(step.num);
    const result = step.toolResults.get(tu.id);
    const sections = [`step ${slotLabel}`, ...renderToolUseSections(tu, result, '')];
    return sections.join('\n\n') + '\n';
  }

  const sections: string[] = [`step ${step.num}`];
  if (step.userInput) {
    sections.push(`${markerWithSize('user input', step.userInput.chars)}\n\n${step.userInput.content}`);
  }
  for (const thinking of step.thinkings) {
    sections.push(`${markerWithSize('thinking', thinking.length)}\n\n${thinking}`);
  }
  for (const text of step.texts) {
    sections.push(`${markerWithSize('text', text.length)}\n\n${text}`);
  }
  const multi = step.toolUses.length > 1;
  step.toolUses.forEach((tu, idx) => {
    const slotLabel = multi ? slotLetter(idx) : '';
    const result = step.toolResults.get(tu.id);
    sections.push(...renderToolUseSections(tu, result, slotLabel));
  });

  return sections.join('\n\n') + '\n';
}
