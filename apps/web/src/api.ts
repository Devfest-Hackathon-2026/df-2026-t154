import { ApiErrorSchema, SessionSchema } from '@atono/shared';
import type { GenerateRequest, RegenerateRequest, StorySession } from '@atono/shared';

async function post(path: string, data: unknown, signal: AbortSignal): Promise<StorySession> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error.message : 'サーバーで処理に失敗しました。');
  }
  const result = SessionSchema.safeParse(body);
  if (!result.success) throw new Error('応答のデータ形式が不正です。');
  return result.data;
}

export const generateStory = (data: GenerateRequest, signal: AbortSignal) => post('/api/generate', data, signal);
export const regenerateStory = (data: RegenerateRequest, signal: AbortSignal) => post('/api/regenerate', data, signal);
