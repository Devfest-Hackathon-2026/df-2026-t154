import { useEffect, useRef, useState } from 'react';
import type { HistoryEntry } from '@atono/shared';
import { historyId } from '../history';

type Props = {
  history: HistoryEntry[];
  busy: boolean;
  importing: boolean;
  onImport: () => void;
  onOpenHistory: (id: string) => void;
  onDeleteHistory: (id: string) => void;
};

const dateFormat = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric', month: 'numeric', day: 'numeric',
  hour: '2-digit', minute: '2-digit',
});

export function SidebarMenu(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  // ファイル選択をキャンセルしたときはメニューを保ち、読み込み開始時に閉じる。
  useEffect(() => {
    if (props.importing) dialog.current?.close();
  }, [props.importing]);

  function close() { dialog.current?.close(); }

  return <>
    <button type="button" className="menu-button" aria-label="メニューを開く"
      aria-haspopup="dialog" aria-expanded={open} aria-controls="sidebar-menu"
      onClick={() => { dialog.current?.showModal(); setOpen(true); }}>
      <svg className="hamburger" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M2 4H18 M2 10H18 M2 16H18" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </button>
    <dialog id="sidebar-menu" className="sidebar-menu" ref={dialog}
      aria-labelledby="menu-title" onClose={() => setOpen(false)}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) close();
      }}>
      <div className="menu-heading">
        <h2 id="menu-title">メニュー</h2>
        <button type="button" className="menu-close" aria-label="メニューを閉じる" autoFocus onClick={close}>×</button>
      </div>
      <div className="menu-content">
        <button type="button" className="import-button" disabled={props.busy} onClick={props.onImport}>
          ファイルから復元 <span aria-hidden="true">↑</span>
        </button>
        <section className="history-section" aria-labelledby="history-title">
          <h3 id="history-title">過去の世界線</h3>
          {props.history.length === 0 ? <p className="history-empty">まだ世界線がありません</p> :
            <ul className="history-list">
              {props.history.map((entry) => {
                const id = historyId(entry.archive);
                const regret = entry.archive.worldlines[0]!.session.input.regret;
                return <li key={id} className="history-item">
                  <button type="button" className="history-open" disabled={props.busy}
                    title={regret} onClick={() => { close(); props.onOpenHistory(id); }}>
                    <span className="history-regret">{regret}</span>
                    <small>{dateFormat.format(new Date(entry.savedAt))}・世界線{entry.archive.worldlines.length}本</small>
                  </button>
                  <button type="button" className="history-delete" disabled={props.busy}
                    aria-label={`「${regret}」を履歴から削除`} onClick={() => {
                      if (!window.confirm(`「${regret}」を履歴から削除しますか？`)) return;
                      props.onDeleteHistory(id);
                      // 削除したボタンにフォーカスを残さない。
                      dialog.current?.querySelector<HTMLButtonElement>('.menu-close')?.focus();
                    }}><span aria-hidden="true">×</span></button>
                </li>;
              })}
            </ul>}
        </section>
      </div>
    </dialog>
  </>;
}
