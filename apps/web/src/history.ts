import { HISTORY_LIMIT, HistoryEntrySchema, SavedHistorySchema } from '@atono/shared';
import type { HistoryEntry, WorldlineArchive } from '@atono/shared';

/** 過去の結果の一覧。現在の結果（storage.tsのSTORAGE_KEY）とは別キーに保存する。 */
export const HISTORY_KEY = 'atono-matsuri.history.v1';

/** 1回の生成で始まった結果を表すID。最初の世界線のIDは、世界線の追加・レビュー・ファイル復元でも変わらない。 */
export function historyId(archive: WorldlineArchive): string {
  return archive.worldlines[0]!.id;
}

/** 保存済みの履歴を新しい順で返す。壊れた項目は飛ばし、全体が読めない場合は空にする。 */
export function readHistory(storage: Pick<Storage, 'getItem'>): HistoryEntry[] {
  try {
    const text = storage.getItem(HISTORY_KEY);
    if (text === null) return [];
    const saved = SavedHistorySchema.safeParse(JSON.parse(text));
    if (!saved.success) return [];
    const seen = new Set<string>();
    return saved.data.entries
      .map((entry) => HistoryEntrySchema.safeParse(entry))
      .flatMap((result) => result.success ? [result.data] : [])
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .filter((entry) => { const id = historyId(entry.archive); if (seen.has(id)) return false; seen.add(id); return true; })
      .slice(0, HISTORY_LIMIT);
  } catch { return []; }
}

function writeHistory(storage: Pick<Storage, 'setItem'>, entries: HistoryEntry[]) {
  if (entries.length === 0) {
    storage.setItem(HISTORY_KEY, JSON.stringify(SavedHistorySchema.parse({ schemaVersion: 1, entries: [] })));
    return;
  }
  // 容量を超えた場合は古いものから減らして、最新の1件は必ず残す。
  for (let count = entries.length; count >= 1; count--) {
    try {
      storage.setItem(HISTORY_KEY, JSON.stringify(SavedHistorySchema.parse({ schemaVersion: 1, entries: entries.slice(0, count) })));
      return;
    } catch (error) {
      if (count === 1) throw error;
    }
  }
}

/** 結果を履歴の先頭に保存する。同じ結果（同じhistoryId）は置き換え、上限を超えた古いものは消す。 */
export function upsertHistory(storage: Pick<Storage, 'getItem' | 'setItem'>, archive: WorldlineArchive, now = new Date()): HistoryEntry[] {
  const entry = HistoryEntrySchema.parse({ savedAt: now.toISOString(), archive });
  const id = historyId(archive);
  const entries = [entry, ...readHistory(storage).filter((item) => historyId(item.archive) !== id)].slice(0, HISTORY_LIMIT);
  writeHistory(storage, entries);
  return entries;
}

/** 指定した結果を履歴から削除する。現在の結果（STORAGE_KEY）には触れない。 */
export function removeHistory(storage: Pick<Storage, 'getItem' | 'setItem'>, id: string): HistoryEntry[] {
  const entries = readHistory(storage).filter((item) => historyId(item.archive) !== id);
  writeHistory(storage, entries);
  return entries;
}
