import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

// 生成中に、まだ中身のないノード枠を上から順に伸ばす。実際の生成内容や進み具合を装わない。
// 枠の数は生成の目安（初回6〜8・部分木4〜6ノード）に合わせ、間隔は待ち時間（約15秒）に合わせる。
export const INITIAL_SKELETON_COUNT = 7;
export const BRANCH_SKELETON_COUNT = 5;
const STEP_SECONDS = 1.8;
export const skeletonDelay = (index: number) => `${index * STEP_SECONDS}s`;

type SkeletonProps = { index: number; column: number; row: number; port?: string };

export function SkeletonNode({ index, column, row, port }: SkeletonProps) {
  const style = { gridColumn: `${column} / span 2`, gridRow: row, '--skeleton-delay': skeletonDelay(index) } as CSSProperties;
  return <div className="skeleton-step" style={style} aria-hidden="true">
    <div className="skeleton-node" data-port={port}><span /><span /></div>
  </div>;
}

type Props = { regret: string; onCancel: () => void };

/** 初回生成中の結果画面。入力文（A）だけは確定しているので先に描き、選ばなかった側は空の枠で示す。 */
export function PendingResult({ regret, onCancel }: Props) {
  // 結果画面と同じく、横にあふれる場合は図の中央を見せる。
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scroll.current;
    if (element) element.scrollLeft = Math.max(0, (element.scrollWidth - element.clientWidth) / 2);
  }, []);
  return <main className="result-screen pending-screen" id="main" aria-busy="true">
    <h1 id="result-title" className="visually-hidden" tabIndex={-1}>選ばなかった世界線（生成中）</h1>
    <button type="button" className="pending-cancel" onClick={onCancel}>生成を中断して入力に戻る</button>
    <p className="operation-status" role="status">別の世界線をたどっています<span className="loading-dots" aria-hidden="true">…</span>　少し時間がかかります。</p>
    <div className="result-layout">
      <aside className="story-panel" aria-label="選ばなかったストーリー（生成中）">
        <h2>選ばなかったストーリー</h2>
        <p className="pending-regret" title={regret}>{regret}</p>
        <div className="skeleton-text" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div>
      </aside>
      <div className="graph-column"><div className="graph-shell">
        <section className="tree-canvas" aria-label="世界線のフローチャート（生成中）">
          <div className="chart-scroll" ref={scroll} tabIndex={0} aria-label="生成中のフローチャート。縦横にスクロールできます">
            <div className="worldline-grid pending-grid" style={{ gridTemplateColumns: '160px 52px 188px 252px' }}>
              <div className="static-node actual" style={{ gridColumn: 1, gridRow: 1 }}><small>A　実際の選択</small><span className="actual-regret" title={regret}>{regret}</span></div>
              <div className="static-node now" style={{ gridColumn: 1, gridRow: 3 }}>今のあなた</div>
              {Array.from({ length: INITIAL_SKELETON_COUNT }, (_, index) => <SkeletonNode key={index} index={index} column={3} row={1 + index * 2} />)}
            </div>
          </div>
        </section>
      </div></div>
    </div>
  </main>;
}
