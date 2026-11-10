import { useId, useState } from 'react';
import type { StorySession } from '@atono/shared';
import { storyPath } from '../story';

type Props = { session: StorySession; selectedId: string | null };

export function StoryPanel({ session, selectedId }: Props) {
  const path = storyPath(session.tree, selectedId);
  const title = path[0]?.title ?? '';
  // スマホでは本文を数行だけ見せ、ボタンで全文を開閉する。PCでは常に全文（ボタンはCSSで非表示）。
  const [expanded, setExpanded] = useState(false);
  const textId = useId();
  return <aside className={`story-panel ${expanded ? 'is-expanded' : ''}`} aria-label="選ばなかったストーリー">
    <h2>選ばなかったストーリー</h2>
    <h3 className="story-title" title={title}>{title}</h3>
    <div className="story-text" id={textId}>{path.map((node) => <p key={node.id} className={node.id === selectedId ? 'current-paragraph' : undefined}>{node.description}</p>)}</div>
    <button type="button" className="story-toggle" aria-expanded={expanded} aria-controls={textId} onClick={() => setExpanded((value) => !value)}>
      {expanded ? '閉じる' : 'ストーリーを全文読む'} <span aria-hidden="true">{expanded ? '▲' : '▼'}</span>
    </button>
    {session.source === 'mock' && <p className="source-badge" role="note">固定データのサンプル</p>}
  </aside>;
}
