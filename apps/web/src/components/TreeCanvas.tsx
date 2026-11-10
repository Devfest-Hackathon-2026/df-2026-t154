import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { StoryNode, WorldlineArchive } from '@atono/shared';
import { layoutWorldlines, nodeButtonId } from '../layout';
import { DetailPanel } from './DetailPanel';
import { BRANCH_SKELETON_COUNT, SkeletonNode, skeletonDelay } from './PendingResult';
import { useChartZoom, ZOOM_MAX, ZOOM_MIN } from '../useChartZoom';
import { useScrollHandoff } from '../useScrollHandoff';

/** 生成中の世界線。分岐元の右に、選んだ行動と空の枠を伸ばして示す。 */
export type PendingBranch = { worldlineId: string; nodeId: string; label: string };
type Props = {
  archive: WorldlineArchive;
  pending?: PendingBranch | null;
  selectedId: string | null;
  busy: boolean;
  /** nodeIdがnullなら経路の切り替えだけを行い、行動パネルは開かない。 */
  onSelect: (worldlineId: string, nodeId: string | null) => void;
  onChoose: (choiceId: string) => void;
  onClose: () => void;
};
type Line = { from: string; to: string; direction: 'down' | 'right' };
type Connection = { d: string; onPath: boolean; pending?: number | undefined };

export function TreeCanvas({ archive, pending = null, selectedId, busy, onSelect, onChoose, onClose }: Props) {
  const scroll = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const { zoom, zoomIn, zoomOut, reset } = useChartZoom(scroll, grid);
  useScrollHandoff(scroll);
  const startNode = useRef<HTMLDivElement>(null);
  const [startPosition, setStartPosition] = useState<{ left: number; top: number } | null>(null);
  const columns = useMemo(() => layoutWorldlines(archive), [archive]);
  // 入力文をそのまま表示する。実際の行動を推測・要約しない。
  const actualRegret = archive.worldlines[0]?.session.input.regret ?? '';
  const nodeKey = (worldlineId: string, nodeId: string) => `node:${JSON.stringify([worldlineId, nodeId])}`;
  const downKey = (worldlineId: string, nodeId: string) => `down:${JSON.stringify([worldlineId, nodeId])}`;
  const branchKey = (worldlineId: string) => `branch:${worldlineId}`;
  // 現在の世界線の結末から分岐元をさかのぼり、Bまでの経路に含まれるポートを集める。
  const pathKeys = new Set<string>();
  {
    const visited = new Set<string>();
    let worldline = archive.worldlines.find((item) => item.id === archive.activeWorldlineId);
    let untilNodeId: string | undefined;
    while (worldline && !visited.has(worldline.id)) {
      visited.add(worldline.id);
      const id = worldline.id;
      const nodes = columns.find((column) => column.worldline.id === id)?.nodes ?? [];
      const last = untilNodeId === undefined ? nodes.length - 1 : nodes.findIndex(({ node }) => node.id === untilNodeId);
      if (last < 0) break;
      nodes.slice(0, last + 1).forEach(({ node }, position) => {
        pathKeys.add(nodeKey(id, node.id));
        if (position < last) pathKeys.add(downKey(id, node.id));
      });
      const origin = worldline.origin;
      if (!origin) break;
      pathKeys.add(branchKey(id));
      untilNodeId = origin.nodeId;
      worldline = archive.worldlines.find((item) => item.id === origin.worldlineId);
    }
  }
  // 生成中の列は既存の列の右に置き、分岐元と同じ行から伸ばす。
  const pendingIndex = columns.length;
  const pendingRow = pending ? columns.find((column) => column.worldline.id === pending.worldlineId)?.nodes.find(({ node }) => node.id === pending.nodeId)?.row ?? null : null;
  const pendingKey = (position: number) => `pending:${position}`;
  const lines: Line[] = [];
  if (pending && pendingRow !== null) {
    lines.push({ from: nodeKey(pending.worldlineId, pending.nodeId), to: pendingKey(-1), direction: 'right' });
    for (let position = 0; position < BRANCH_SKELETON_COUNT; position++) lines.push({ from: pendingKey(position - 1), to: pendingKey(position), direction: 'down' });
  }
  for (const column of columns) {
    const { worldline, nodes } = column;
    if (worldline.origin && nodes[0]) {
      lines.push({ from: nodeKey(worldline.origin.worldlineId, worldline.origin.nodeId), to: branchKey(worldline.id), direction: 'right' });
      lines.push({ from: branchKey(worldline.id), to: nodeKey(worldline.id, nodes[0].node.id), direction: 'down' });
    }
    nodes.forEach(({ node }, index) => {
      const next = nodes[index + 1];
      if (!next) return;
      lines.push({ from: nodeKey(worldline.id, node.id), to: downKey(worldline.id, node.id), direction: 'down' });
      lines.push({ from: downKey(worldline.id, node.id), to: nodeKey(worldline.id, next.node.id), direction: 'down' });
    });
  }

  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    const draw = () => {
      // CSSのzoom中は画面上の座標が倍率分ずれるので、グリッド内の等倍座標へ戻して線を引く。
      const raw = element.getBoundingClientRect();
      const scale = element.offsetWidth ? raw.width / element.offsetWidth : 1;
      const local = (rect: DOMRect) => new DOMRect((rect.x - raw.x) / scale, (rect.y - raw.y) / scale, rect.width / scale, rect.height / scale);
      const base = { left: 0, top: 0 };
      const ports = new Map<string, DOMRect>();
      element.querySelectorAll<HTMLElement>('[data-port]').forEach((item) => ports.set(item.dataset.port!, local(item.getBoundingClientRect())));
      const paths: Connection[] = [];
      for (const line of lines) {
        const from = ports.get(line.from), to = ports.get(line.to);
        if (!from || !to) continue;
        const onPath = pathKeys.has(line.from) && pathKeys.has(line.to);
        // 生成中の線は、行き先の枠と同時に現れるよう同じ遅れを付ける。
        const isPending = line.to.startsWith('pending:') ? Number(line.to.slice('pending:'.length)) + 1 : undefined;
        if (line.direction === 'right') {
          const x1 = from.right - base.left, y1 = from.y + from.height / 2 - base.top;
          const x2 = to.left - base.left, y2 = to.y + to.height / 2 - base.top;
          const obstacles = [...ports.entries()].filter(([key, rect]) => key !== line.from && key !== line.to
            && rect.left >= from.right && rect.right <= to.left && rect.top < from.y + from.height / 2 && rect.bottom > from.y + from.height / 2).map(([, rect]) => rect);
          if (obstacles.length) {
            const lane = Math.min(from.top, to.top, ...obstacles.map((rect) => rect.top)) - base.top - 12;
            paths.push({ d: `M ${x1} ${y1} H ${x1 + 12} V ${lane} H ${x2 - 12} V ${y2} H ${x2}`, onPath, pending: isPending });
          } else {
            paths.push({ d: `M ${x1} ${y1} H ${x2 - 20} V ${y2} H ${x2}`, onPath, pending: isPending });
          }
        } else {
          const x1 = from.x + from.width / 2 - base.left, y1 = from.bottom - base.top;
          const x2 = to.x + to.width / 2 - base.left, y2 = to.top - base.top;
          paths.push({ d: `M ${x1} ${y1} V ${(y1 + y2) / 2} H ${x2} V ${y2}`, onPath, pending: isPending });
        }
      }
      const actual = ports.get('actual'), now = ports.get('now');
      const root = columns[0]?.nodes[0];
      const other = root ? ports.get(nodeKey(columns[0]!.worldline.id, root.node.id)) : undefined;
      if (actual && now && other) {
        const ax = actual.x + actual.width / 2 - base.left, bx = other.x + other.width / 2 - base.left;
        const top = Math.min(actual.top, other.top) - base.top - 24;
        // 分かれ道の起点からBまでは、どの世界線でも現在の経路の始まりになる。
        const mx = (ax + bx) / 2;
        paths.push({ d: `M ${ax} ${actual.top - base.top} V ${top} H ${mx}`, onPath: false });
        paths.push({ d: `M ${mx} ${top - 18} V ${top} H ${bx} V ${other.top - base.top}`, onPath: true });
        // 開始ノードは起点の縦線の真上に置く。
        const start = startNode.current;
        if (start) setStartPosition({ left: mx - start.offsetWidth / 2, top: Math.max(0, top - 18 - start.offsetHeight) });
        paths.push({ d: `M ${ax} ${actual.bottom - base.top} V ${now.top - base.top}`, onPath: false });
      }
      setConnections(paths);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [archive, selectedId, zoom, pending, pendingRow]);

  // 行動パネルは、パネル・ボタン・入力欄以外の何もないところをクリックすると閉じる。
  useEffect(() => {
    if (!selectedId) return;
    const closeOnBlankClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.inline-actions, button, a, input, textarea, select, label, summary, [role="button"]')) return;
      onClose();
    };
    document.addEventListener('click', closeOnBlankClick);
    return () => document.removeEventListener('click', closeOnBlankClick);
  }, [selectedId, onClose]);
  // 視点は、新しい世界線が追加されたときだけその分岐へ移す。行動パネルの開閉や経路の切り替えでは動かさない。
  const worldlineCount = useRef(archive.worldlines.length);
  useEffect(() => {
    const added = archive.worldlines.length > worldlineCount.current;
    worldlineCount.current = archive.worldlines.length;
    if (!added) return;
    const action = grid.current?.querySelector<HTMLElement>(`[data-branch-worldline="${CSS.escape(archive.activeWorldlineId)}"]`);
    if (action) action.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [archive.worldlines.length, archive.activeWorldlineId]);
  // 生成中の列が出たら、フローチャートの枠の中だけを動かしてその列を見せる（ページ全体はスクロールしない）。
  useEffect(() => {
    const target = grid.current?.querySelector<HTMLElement>('.pending-branch');
    const frame = scroll.current;
    if (!pending || !target || !frame) return;
    const item = target.getBoundingClientRect(), view = frame.getBoundingClientRect(), margin = 24;
    if (item.right > view.right - margin) frame.scrollLeft += item.right - view.right + margin;
    else if (item.left < view.left + margin) frame.scrollLeft -= view.left + margin - item.left;
    if (item.bottom > view.bottom - margin) frame.scrollTop += item.bottom - view.bottom + margin;
    else if (item.top < view.top + margin) frame.scrollTop -= view.top + margin - item.top;
  }, [pending]);
  const firstWorldlineId = archive.worldlines[0]?.id;
  useLayoutEffect(() => {
    const element = scroll.current;
    if (element) element.scrollLeft = Math.max(0, (element.scrollWidth - element.clientWidth) / 2);
  }, [firstWorldlineId]);

  // 行動パネルは列の上に重ねて表示するので、開いても列幅は変えない。
  const tracks = [...columns, ...(pending && pendingRow !== null ? [null] : [])].flatMap(() => ['188px', '252px']).join(' ');
  const drawNode = (node: StoryNode, worldlineId: string, columnIndex: number, row: number, first: boolean, ending: boolean) => {
    const active = worldlineId === archive.activeWorldlineId && selectedId === node.id;
    const condition = !first && node.choices.length > 0;
    return <div key={node.id} className={`route-step node-entry ${active ? 'is-open' : ''}`} data-worldline={worldlineId} data-visible-node={node.id}
      style={{ gridColumn: `${3 + columnIndex * 2} / span 2`, gridRow: row }}>
      <div className={`chart-node ${condition ? 'condition' : ''} ${ending ? 'ending' : ''} ${active ? 'is-selected' : ''} ${pathKeys.has(nodeKey(worldlineId, node.id)) ? 'on-path' : ''}`} data-port={nodeKey(worldlineId, node.id)}>
        <button type="button" className="node-body" id={nodeButtonId(worldlineId, node.id)} data-story-node={node.id}
          aria-pressed={active} aria-controls={active ? 'node-detail' : undefined} title={node.title} onClick={() => onSelect(worldlineId, node.id)}>
          {condition && <svg viewBox="0 0 188 132" preserveAspectRatio="none" aria-hidden="true"><polygon points="94,1 187,66 94,131 1,66" /></svg>}
          <span className="node-copy"><small>{first ? 'B　選ばなかった選択' : ending ? 'この世界線の結末' : active ? '選択中' : '条件'}</small><span>{node.title}</span></span>
        </button>
      </div>
      {node.choices.length > 0 && <button type="button" className="branch-button" aria-expanded={active} aria-label={`${node.title}の別の選択肢を開く`}
        onClick={() => active ? onClose() : onSelect(worldlineId, node.id)}>別の選択肢 <span aria-hidden="true">→</span></button>}
      {active && <div className="inline-actions"><DetailPanel node={node} busy={busy} onClose={onClose} onChoose={onChoose}
        existingChoiceIds={archive.worldlines.filter((item) => item.origin?.worldlineId === worldlineId && item.origin.nodeId === node.id).map((item) => item.origin!.choiceId)} /></div>}
    </div>;
  };

  return <section className="tree-canvas" aria-label="世界線のフローチャート">
    <div className="chart-scroll" ref={scroll} tabIndex={0} aria-label="フローチャート。縦横にスクロールできます">
      <div className="worldline-grid" ref={grid} style={{ gridTemplateColumns: `160px 52px ${tracks}`, zoom }}>
        <svg className="chart-connections" aria-hidden="true">{connections.map((path, index) => <path key={index} d={path.d} className={path.pending !== undefined ? 'pending' : path.onPath ? 'on-path' : undefined}
          style={path.pending !== undefined ? { animationDelay: skeletonDelay(path.pending) } : undefined} />)}</svg>
        <div className="static-node start-node" ref={startNode}
          style={startPosition ? { left: startPosition.left, top: startPosition.top } : { visibility: 'hidden' }}><small>はじまり</small><span>あの日の分かれ道</span></div>
        <div className="static-node actual" data-port="actual" style={{ gridColumn: 1, gridRow: 1 }}><small>A　実際の選択</small><span className="actual-regret" title={actualRegret}>{actualRegret}</span></div>
        <div className="static-node now" data-port="now" style={{ gridColumn: 1, gridRow: 3 }}>今のあなた</div>
        {columns.map(({ worldline, index, nodes, originRow }) => <div key={worldline.id} className={`worldline-group ${index === 0 ? 'primary-route' : ''}`} data-worldline-id={worldline.id} role="group" aria-label={`世界線${index + 1}`}>
          {worldline.origin && originRow !== null && <button type="button" className={`current-action branch-start ${pathKeys.has(branchKey(worldline.id)) ? 'on-path' : ''}`} data-branch-worldline={worldline.id} data-port={branchKey(worldline.id)}
            style={{ gridColumn: 3 + index * 2, gridRow: originRow }} onClick={() => onSelect(worldline.id, null)}>
            <small>別の行動・生成済み</small><span>{worldline.session.tree.nodes.find((node) => node.id === worldline.origin!.nodeId)?.choices.find((choice) => choice.id === worldline.origin!.choiceId)?.label}</span><span aria-hidden="true">↓</span>
          </button>}
          {nodes.map(({ node, row }, position) => {
            const choice = node.choices.find((item) => item.id === node.selectedChoiceId);
            return <div key={node.id} className="worldline-step">
              {drawNode(node, worldline.id, index, row, index === 0 && position === 0, position === nodes.length - 1)}
              {position < nodes.length - 1 && choice && <button type="button" className={`current-action down-action ${pathKeys.has(downKey(worldline.id, node.id)) ? 'on-path' : ''}`} data-port={downKey(worldline.id, node.id)}
                style={{ gridColumn: 3 + index * 2, gridRow: row + 1 }} onClick={() => onSelect(worldline.id, null)}>
                <small>直下の行動</small><span>{choice.label}</span><span aria-hidden="true">↓</span>
              </button>}
            </div>;
          })}
        </div>)}
        {pending && pendingRow !== null && <div className="worldline-group pending-group" aria-hidden="true">
          <div className="current-action pending-branch" data-port={pendingKey(-1)} style={{ gridColumn: 3 + pendingIndex * 2, gridRow: pendingRow }}>
            <small>別の行動・生成中</small><span>{pending.label}</span>
          </div>
          {Array.from({ length: BRANCH_SKELETON_COUNT }, (_, position) => <SkeletonNode key={position} index={position + 1} column={3 + pendingIndex * 2} row={pendingRow + 2 + position * 2} port={pendingKey(position)} />)}
        </div>}
      </div>
    </div>
    <div className="chart-navigation">
      <div className="chart-tools">
        <div className="zoom-controls" role="group" aria-label="フローチャートの拡大縮小">
          <button type="button" onClick={zoomOut} disabled={zoom <= ZOOM_MIN} aria-label="縮小">−</button>
          <button type="button" className="zoom-reset" onClick={reset} aria-label={`表示倍率${Math.round(zoom * 100)}%。押すと100%に戻す`}>{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} aria-label="拡大">＋</button>
        </div>
      </div>
    </div>
  </section>;
}
