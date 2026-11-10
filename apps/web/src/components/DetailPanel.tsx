import { useEffect, useRef } from 'react';
import type { StoryNode } from '@atono/shared';

type Props = {
  node: StoryNode;
  busy: boolean;
  onClose: () => void;
  onChoose: (choiceId: string) => void;
  existingChoiceIds: string[];
};

export function DetailPanel({ node, busy, onClose, onChoose, existingChoiceIds }: Props) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeButton.current?.focus({ preventScroll: true }); }, [node.id]);
  return <aside className="detail-panel" id="node-detail" role="region" aria-labelledby="detail-title" aria-busy={busy}>
    <div className="panel-top"><span>選択中の出来事</span><button type="button" ref={closeButton} onClick={onClose} aria-label="出来事の詳細を閉じる">×</button></div>
    <h2 id="detail-title">{node.title}</h2>
    {node.choices.length > 0 ? <>
      <h3>別の行動</h3>
      <div className="choice-actions">{node.choices.map((choice) => <button type="button" key={choice.id} disabled={busy || choice.id === node.selectedChoiceId}
        onClick={() => onChoose(choice.id)}>
        <span>{choice.label}</span><small>{choice.id === node.selectedChoiceId ? '選択中' : existingChoiceIds.includes(choice.id) ? 'この世界線を見る →' : '右に展開 →'}</small>
      </button>)}</div>
      <p className="detail-help">選ぶと右に世界線を追加します。これまでの世界線は残ります。</p>
    </> : <p className="detail-help">この世界線の結末です。途中の出来事から、別の行動を選べます。</p>}
    {busy && <p className="regenerating" role="status"><span className="spinner" aria-hidden="true" />右に追加する世界線を生成しています…</p>}
    <details className="event-description" key={node.id}>
      <summary>出来事の詳細</summary>
      <p>{node.description}</p>
      <div className="cause"><span>ここにつながった理由</span><p>{node.cause}</p></div>
    </details>
  </aside>;
}
