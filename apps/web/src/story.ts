import type { StoryNode, StoryTree, WorldlineArchive } from '@atono/shared';

import { visibleStoryPath } from './layout.ts';
import { SavedSessionSchema, SavedWorldlinesSchema, WorldlineArchiveSchema } from '@atono/shared';
import { initialArchive } from './worldlines.ts';

export function archiveJson(archive: WorldlineArchive): string {
  const data = SavedWorldlinesSchema.parse({
    schemaVersion: 2,
    savedAt: new Date().toISOString(),
    archive,
  });
  return JSON.stringify(data, null, 2);
}

export function parseArchiveJson(text: string): WorldlineArchive {
  const message = 'ファイルを復元できませんでした。あとのまつりで保存したファイルを選んでください。';
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error(message); }
  // バージョン付きファイルは、そのバージョンの契約でのみ検証する。
  // 将来のバージョンや壊れたラッパーを直接形式として読み替えない。
  if (typeof value === 'object' && value !== null && 'schemaVersion' in value) {
    const current = SavedWorldlinesSchema.safeParse(value);
    if (current.success) return current.data.archive;
    const previous = SavedSessionSchema.safeParse(value);
    if (previous.success) return initialArchive(previous.data.session);
  } else {
    const direct = WorldlineArchiveSchema.safeParse(value);
    if (direct.success) return direct.data;
  }
  throw new Error(message);
}

export function storyPath(tree: StoryTree, _selectedId?: string | null): StoryNode[] {
  return visibleStoryPath(tree);
}
