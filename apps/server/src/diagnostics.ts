import { GenerationFailedError } from './services/geminiService.ts';

// エラー全文・入力・モデル出力・認証情報は記録せず、固定の分類だけを返す。
export function generationDiagnostic(error: unknown) {
  const value = typeof error === 'object' && error !== null
    ? error as { status?: unknown; code?: unknown; message?: unknown }
    : {};
  const status = [value.status, value.code].find(
    (item): item is number => typeof item === 'number' && Number.isInteger(item) && item >= 400 && item <= 599,
  );
  const message = typeof value.message === 'string' ? value.message : '';
  const category = error instanceof GenerationFailedError ? 'invalid_generation'
    : status === 401 ? 'authentication'
    : status === 403 ? 'permission_or_api_disabled'
    : status === 404 ? 'model_or_resource_not_found'
    : status === 429 ? 'quota_or_capacity'
    : status === 400 ? 'invalid_model_request'
    : /timeout|timed out|abort/i.test(message) ? 'timeout'
    : status !== undefined && status >= 500 ? 'upstream_unavailable'
    : 'unknown';
  return { category, ...(status !== undefined ? { upstreamStatus: status } : {}) };
}

export function logGenerationFailure(operation: 'generate' | 'regenerate', error: unknown) {
  console.error(JSON.stringify({ severity: 'ERROR', event: 'generation_failed', operation, ...generationDiagnostic(error) }));
}
