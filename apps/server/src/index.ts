import { createApp } from './app.ts';
import { createGeminiGenerator, vertexJsonModel } from './services/geminiService.ts';

const mode = process.env.GENERATION_MODE ?? 'mock';
if (mode !== 'mock' && mode !== 'gemini') throw new Error('GENERATION_MODEはmockまたはgeminiです。');
const app = createApp(mode === 'gemini' ? createGeminiGenerator(vertexJsonModel()) : undefined);

const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORTには1〜65535の整数を指定してください。');
}

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Server: http://localhost:${port} (${mode})`);
});
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
