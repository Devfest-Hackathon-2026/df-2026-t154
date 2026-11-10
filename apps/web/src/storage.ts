import { SavedSessionSchema, SavedWorldlinesSchema } from '@atono/shared';
import type { StorySession, WorldlineArchive } from '@atono/shared';
import { initialArchive } from './worldlines.ts';

// キーを維持し、schemaVersion 1は1本の世界線として読み込む。
export const STORAGE_KEY = 'atono-matsuri.prototype.v1';
const empty = (message = '') => ({ session: null, archive: null, message });

export function restoreSession(storage: Pick<Storage, 'getItem'>) {
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (text === null) return empty();
    const value: unknown = JSON.parse(text);
    const current = SavedWorldlinesSchema.safeParse(value);
    if (current.success) {
      const archive = current.data.archive;
      const session = archive.worldlines.find((worldline) => worldline.id === archive.activeWorldlineId)!.session;
      return { session, archive, message: '保存した世界線を復元しました。' };
    }
    const previous = SavedSessionSchema.safeParse(value);
    if (previous.success) return { session: previous.data.session, archive: initialArchive(previous.data.session), message: '前回の結果を復元しました。' };
    return empty('保存データが旧形式または不正なため、復元しませんでした。');
  } catch { return empty('保存データを読み込めませんでした。新しく試せます。'); }
}

export function persistSession(storage: Pick<Storage, 'setItem'>, session: StorySession) {
  const data = SavedSessionSchema.parse({ schemaVersion: 1, savedAt: new Date().toISOString(), session });
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function persistArchive(storage: Pick<Storage, 'setItem'>, archive: WorldlineArchive) {
  const data = SavedWorldlinesSchema.parse({ schemaVersion: 2, savedAt: new Date().toISOString(), archive });
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadFromBrowser() {
  try { return restoreSession(window.localStorage); }
  catch { return empty('この環境では保存を使えませんが、操作はできます。'); }
}
