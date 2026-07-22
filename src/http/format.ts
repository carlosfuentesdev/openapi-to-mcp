import type { ToolCallResult } from './client.js';

export type FormatMode = 'markdown' | 'json';

/**
 * Da forma a la respuesta HTTP para que ocupe poco y sea legible dentro de la
 * ventana de contexto de un LLM.
 *
 * - `json`: un objeto compacto con estado y cuerpo, en JSON indentado.
 * - `markdown`: una línea de estado y el cuerpo en un bloque de código.
 */
export function formatResult(result: ToolCallResult, mode: FormatMode = 'markdown'): string {
  if (mode === 'json') {
    return JSON.stringify({ status: result.status, ok: result.ok, body: result.body }, null, 2);
  }

  const bodyText =
    typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2);
  const lang = typeof result.body === 'string' ? '' : 'json';

  return [
    `HTTP ${result.status} ${result.ok ? '(OK)' : '(error)'} — ${result.request.method} ${result.request.url}`,
    '',
    '```' + lang,
    bodyText,
    '```',
  ].join('\n');
}
