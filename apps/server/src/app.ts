import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { GenerateRequestSchema, RegenerateRequestSchema, SessionSchema } from '@atono/shared';
import { mockGenerator } from './generation.ts';
import { TopicRejectedError } from './services/geminiService.ts';
import type { TreeGenerator } from './generation.ts';
import { logGenerationFailure } from './diagnostics.ts';
import { reviewAuth } from './reviewAuth.ts';

export function createApp(generator: TreeGenerator = mockGenerator) {
  const app = express();
  app.disable('x-powered-by');
  app.use(reviewAuth());
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '128kb' }));
  app.get(['/health', '/api/health'], (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok' });
  });
  const reject = (res: express.Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });

  app.post('/api/generate', async (req, res) => {
    const parsed = GenerateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reject(res, 400, 'invalid_input', '入力は1〜1000文字で指定してください。'); return; }
    const { input, scenario } = parsed.data;
    if (scenario === 'rejected') { reject(res, 422, 'topic_rejected', '拒否表示のテストです。実際の話題判定は行っていません。'); return; }
    if (scenario === 'failure') { reject(res, 503, 'generation_failed', '生成失敗のテストです。もう一度試せます。'); return; }
    try {
      res.json(SessionSchema.parse({ source: generator.source ?? 'mock', input, tree: await generator.generate(input) }));
    } catch (error) {
      if (error instanceof TopicRejectedError) reject(res, 422, 'topic_rejected', error.message);
      else {
        logGenerationFailure('generate', error);
        reject(res, 502, 'generation_failed', '結果を作成できませんでした。');
      }
    }
  });
  app.post('/api/regenerate', async (req, res) => {
    const parsed = RegenerateRequestSchema.safeParse(req.body);
    if (!parsed.success) { reject(res, 400, 'invalid_input', '選び直しのデータが不正です。'); return; }
    const data = parsed.data;
    if (data.session.source !== (generator.source ?? 'mock')) { reject(res, 400, 'invalid_input', '生成元が現在のモードと異なります。新しく生成してください。'); return; }
    const node = data.session.tree.nodes.find((item) => item.id === data.nodeId);
    if (!node?.choices.some((choice) => choice.id === data.choiceId)) { reject(res, 400, 'invalid_input', '対象の選択肢がありません。'); return; }
    if (data.scenario === 'failure') { reject(res, 503, 'generation_failed', '選び直し失敗のテストです。元の木はそのまま残ります。'); return; }
    try {
      res.json(SessionSchema.parse({ ...data.session, tree: await generator.regenerate(data) }));
    } catch (error) {
      logGenerationFailure('regenerate', error);
      reject(res, 502, 'generation_failed', '選び直しの結果を作成できませんでした。');
    }
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: { code: 'not_found', message: 'APIがありません。' } }); });
  const webDist = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  if (existsSync(webDist)) app.use(express.static(webDist));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = typeof error === 'object' && error !== null && 'status' in error && (error.status === 400 || error.status === 413) ? error.status : 500;
    reject(res, status, status === 500 ? 'generation_failed' : 'invalid_input', status === 500 ? '処理に失敗しました。' : 'リクエストの形式またはサイズが不正です。');
  });
  return app;
}
