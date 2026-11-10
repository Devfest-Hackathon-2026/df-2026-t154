import { WorldlineArchiveSchema } from '@atono/shared';
import type { StoryReview, StorySession, WorldlineArchive, WorldlineOrigin } from '@atono/shared';

export function updateWorldlineReview(archive: WorldlineArchive, worldlineId: string, review: StoryReview): WorldlineArchive {
  if (!archive.worldlines.some((worldline) => worldline.id === worldlineId)) {
    throw new Error('レビューする世界線がありません。');
  }
  return WorldlineArchiveSchema.parse({
    ...archive,
    worldlines: archive.worldlines.map((worldline) => worldline.id === worldlineId ? { ...worldline, review } : worldline),
  });
}

/**
 * 世界線のIDを作る。crypto.randomUUIDはHTTPSかlocalhostでしか使えないため、
 * スマホからLAN/Tailscale経由のhttpで開いた場合はgetRandomValuesで同じ形式（UUID v4）を作る。
 */
export function newWorldlineId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function initialArchive(session: StorySession): WorldlineArchive {
  const id = newWorldlineId();
  return WorldlineArchiveSchema.parse({ worldlines: [{ id, origin: null, session }], activeWorldlineId: id });
}

export function findWorldline(archive: WorldlineArchive, origin: WorldlineOrigin) {
  return archive.worldlines.find((worldline) => worldline.origin?.worldlineId === origin.worldlineId
    && worldline.origin.nodeId === origin.nodeId && worldline.origin.choiceId === origin.choiceId);
}

export function appendWorldline(archive: WorldlineArchive, origin: WorldlineOrigin, session: StorySession): WorldlineArchive {
  const existing = findWorldline(archive, origin);
  if (existing) return { ...archive, activeWorldlineId: existing.id };
  const id = newWorldlineId();
  return WorldlineArchiveSchema.parse({
    worldlines: [...archive.worldlines, { id, origin, session }], activeWorldlineId: id,
  });
}
