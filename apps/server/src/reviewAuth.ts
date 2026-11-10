import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

// HTTPS終端はCloud Run。資格情報はサーバー環境だけに置く。
export function reviewAuth(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  const username = env.REVIEW_USERNAME;
  const password = env.REVIEW_PASSWORD;
  if (!username && !password && env.K_SERVICE !== 'atono-matsuri' && env.REVIEW_AUTH_REQUIRED !== 'true') {
    return (_req, _res, next) => next();
  }
  if (!username || !password || username.includes(':') || password.length < 16) {
    throw new Error('審査用認証にはREVIEW_USERNAMEと16文字以上のREVIEW_PASSWORDが必要です。');
  }
  const hash = (value: string) => createHash('sha256').update(value).digest();
  const expected = hash(`${username}:${password}`);
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(req.get('authorization') ?? '');
    const decoded = match ? Buffer.from(match[1]!, 'base64').toString('utf8') : '';
    if (match && timingSafeEqual(hash(decoded), expected)) { next(); return; }
    res.set('WWW-Authenticate', 'Basic realm="atono-matsuri review", charset="UTF-8"');
    res.status(401).type('text').send('審査用ID・パスワードを入力してください。');
  };
}
