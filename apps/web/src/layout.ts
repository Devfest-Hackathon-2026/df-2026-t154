import type { StoryNode, StoryTree } from '@atono/shared';

/** 初期表示するのはBから結末までの一経路だけ。未選択の兄弟枝は表示しない。 */
export function visibleStoryPath(tree: StoryTree): StoryNode[] {
  const path: StoryNode[] = [];
  let current = tree.nodes.find((node) => node.id === tree.rootId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    path.push(current);
    visited.add(current.id);
    const parentId = current.id;
    current = tree.nodes.find((node) => node.parentId === parentId);
  }
  return path;
}

import type { WorldlineArchive } from '@atono/shared';

export function layoutWorldlines(archive: WorldlineArchive) {
  const rows = new Map<string, number>();
  const columns = archive.worldlines.map((worldline, index) => {
    let path = visibleStoryPath(worldline.session.tree);
    let startRow = 1;
    let originRow: number | null = null;
    if (worldline.origin) {
      const origin = worldline.origin;
      const anchorIndex = path.findIndex((node) => node.id === origin.nodeId);
      originRow = rows.get(JSON.stringify([origin.worldlineId, origin.nodeId])) ?? null;
      if (anchorIndex < 0 || originRow === null) throw new Error('分岐元が表示経路にありません。');
      path = path.slice(anchorIndex + 1);
      startRow = originRow + 2;
    }
    const nodes = path.map((node, position) => {
      const row = startRow + position * 2;
      rows.set(JSON.stringify([worldline.id, node.id]), row);
      return { node, row };
    });
    return { worldline, index, nodes, originRow };
  });
  return columns;
}

export function nodeButtonId(worldlineId: string, nodeId: string) {
  return `story-button-${encodeURIComponent(JSON.stringify([worldlineId, nodeId]))}`;
}
