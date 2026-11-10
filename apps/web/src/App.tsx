import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, FormEvent } from 'react';
import { InputSchema } from '@atono/shared';
import type { HistoryEntry, StoryReview, StorySession, WorldlineArchive, WorldlineOrigin } from '@atono/shared';
import { generateStory, regenerateStory } from './api';
import { STORAGE_KEY, loadFromBrowser, persistArchive } from './storage';
import { historyId, readHistory, removeHistory, upsertHistory } from './history';
import { archiveJson, parseArchiveJson } from './story';
import { EntryScreen } from './components/EntryScreen';
import { SidebarMenu } from './components/SidebarMenu';
import { StoryPanel } from './components/StoryPanel';
import { PendingResult } from './components/PendingResult';
import type { PendingBranch } from './components/TreeCanvas';
import { emptyReview, ReviewPanel } from './components/ReviewPanel';
import { nodeButtonId } from './layout';
import { initialArchive, appendWorldline, findWorldline, updateWorldlineReview } from './worldlines';

const TreeCanvas = lazy(() => import('./components/TreeCanvas').then((module) => ({ default: module.TreeCanvas })));
// 初回生成の待ち時間に木の画面を先に読み込んでおく。
const preloadTreeCanvas = () => { void import('./components/TreeCanvas'); };

type Notice = { text: string; kind: 'status' | 'error' };

export function App() {
  const [initial] = useState(loadFromBrowser);
  // 過去の結果の一覧。履歴機能より前に保存された現在の結果も、最初の表示時に履歴へ加える。
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const saved = readHistory(window.localStorage);
      if (!initial.archive || saved.some((entry) => historyId(entry.archive) === historyId(initial.archive!))) return saved;
      return upsertHistory(window.localStorage, initial.archive);
    } catch { return []; }
  });
  const [regret, setRegret] = useState(initial.session?.input.regret ?? '');
  const [archive, setArchive] = useState<WorldlineArchive | null>(initial.archive);
  const worldline = archive?.worldlines.find((item) => item.id === archive.activeWorldlineId);
  const session = worldline?.session ?? null;
  // pendingは初回生成中。結果画面の形で、入力文と空の枠を先に見せる。
  const [screen, setScreen] = useState<'entry' | 'pending' | 'result'>(initial.session ? 'result' : 'entry');
  const previousScreen = useRef(screen);
  const [pendingBranch, setPendingBranch] = useState<PendingBranch | null>(null);
  const resultLayout = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [operation, setOperation] = useState<'generate' | 'regenerate' | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = Boolean(operation) || importing;
  const [notice, setNotice] = useState<Notice | null>(initial.message ? {
    text: initial.message, kind: initial.session ? 'status' : 'error',
  } : null);
  const pending = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const selected = session?.tree.nodes.find((node) => node.id === selectedId);
  // 現在の結果を保存し、同じ内容で履歴も更新する。現在の結果の保存に失敗した場合だけ例外を返す。
  function persist(next: WorldlineArchive) {
    persistArchive(window.localStorage, next);
    try { setHistory(upsertHistory(window.localStorage, next)); } catch { /* 履歴に残せなくても現在の結果は保存済み */ }
  }
  // idがnullのときは世界線（経路）だけを切り替え、行動パネルは開かない。
  const selectNode = useCallback((worldlineId: string, id: string | null) => {
    if (!archive) return;
    const next = { ...archive, activeWorldlineId: worldlineId };
    setArchive(next);
    setSelectedId(id);
    try { persist(next); } catch { /* 表示は継続する */ }
  }, [archive]);

  // チャート直下のリンクまで初期画面に収める。ストーリーの開閉・改行・画面回転にも追従する。
  useLayoutEffect(() => {
    const layout = resultLayout.current;
    if (screen !== 'result' || !layout) return;
    const measure = () => {
      const chart = layout.querySelector('.graph-shell');
      const link = layout.parentElement?.querySelector('.closing-jump');
      if (!chart || !link) return;
      const chartTop = chart.getBoundingClientRect().top + window.scrollY;
      const linkHeight = link.getBoundingClientRect().height;
      setChartHeight(Math.max(160, Math.min(780, window.innerHeight - chartTop - linkHeight - 28)));
    };
    let frame = 0;
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(layout);
    const story = layout.querySelector('.story-panel');
    if (story) observer.observe(story);
    window.addEventListener('resize', scheduleMeasure);
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [screen]);

  // pendingとresultでは見出しのDOMが入れ替わるので、描画完了後にフォーカスする。
  useLayoutEffect(() => {
    if (previousScreen.current !== screen && screen !== 'entry') document.getElementById('result-title')?.focus();
    previousScreen.current = screen;
  }, [screen]);

  useEffect(() => () => { pending.current?.abort(); }, []);
  useEffect(() => {
    if (!notice || notice.kind === 'error') return;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    if (selectedId) requestAnimationFrame(() => document.getElementById(nodeButtonId(archive?.activeWorldlineId ?? '', selectedId))?.focus({ preventScroll: true }));
  }, [selectedId, archive?.activeWorldlineId]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) closeDetail(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [closeDetail]);

  function cancel() {
    ++requestId.current;
    pending.current?.abort();
    pending.current = null;
    setOperation(null);
    setImporting(false);
    setPendingBranch(null);
  }

  function newInput() {
    cancel();
    setSelectedId(null);
    setScreen('entry');
    setNotice(null);
    requestAnimationFrame(() => document.getElementById('regret')?.focus());
  }

  async function run(kind: 'generate' | 'regenerate', task: (signal: AbortSignal) => Promise<StorySession>, origin?: WorldlineOrigin) {
    cancel();
    const controller = new AbortController();
    pending.current = controller;
    const id = ++requestId.current;
    setOperation(kind);
    setNotice(null);
    try {
      const result = await task(AbortSignal.any([controller.signal, AbortSignal.timeout(110_000)]));
      if (id !== requestId.current) return;
      const next = origin && archive ? appendWorldline(archive, origin, result) : initialArchive(result);
      setArchive(next);
      setSelectedId(null);
      setScreen('result');
      try {
        persist(next);
        setNotice({ text: kind === 'generate' ? '別の世界線ができました。このブラウザに保存しました。' : '右に新しい世界線を追加しました。これまでの世界線も保存しています。', kind: 'status' });
      } catch {
        setNotice({ text: '結果は表示できますが、ブラウザへの保存に失敗しました。「保存する」からファイルを保存できます。', kind: 'error' });
      }
    } catch (error) {
      if (id !== requestId.current) return;
      // 初回生成の失敗は入力画面へ戻し、入力を保ったまま再試行できるようにする。
      if (kind === 'generate') {
        setScreen('entry');
        requestAnimationFrame(() => document.getElementById('regret')?.focus());
      }
      const text = error instanceof DOMException && error.name === 'TimeoutError'
        ? '生成に時間がかかっています。時間をおいて、もう一度試してください。'
        : error instanceof TypeError ? '通信できませんでした。接続を確認して、もう一度試してください。'
          : error instanceof Error ? error.message : '処理に失敗しました。もう一度試せます。';
      setNotice({ text, kind: 'error' });
    } finally {
      if (id === requestId.current) { setOperation(null); pending.current = null; setPendingBranch(null); }
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const input = InputSchema.safeParse({ regret });
    if (!input.success) { setNotice({ text: '後悔を1〜1000文字で入力してください。', kind: 'error' }); return; }
    preloadTreeCanvas();
    void run('generate', (signal) => generateStory({ input: input.data, scenario: 'success' }, signal));
    setSelectedId(null);
    setScreen('pending');
  }

  function choose(choiceId: string) {
    if (!archive || !worldline || !session || !selected || busy) return;
    const origin = { worldlineId: worldline.id, nodeId: selected.id, choiceId };
    const existing = findWorldline(archive, origin);
    if (existing) {
      const next = { ...archive, activeWorldlineId: existing.id };
      setArchive(next);
      setSelectedId(null);
      try { persist(next); } catch { /* 表示は継続する */ }
      return;
    }
    if (archive.worldlines.length >= 100) {
      setNotice({ text: '世界線は100本まで保存できます。新しい入力から試してください。', kind: 'error' });
      return;
    }
    const label = selected.choices.find((choice) => choice.id === choiceId)?.label ?? '';
    void run('regenerate', (signal) => regenerateStory({ session, nodeId: selected.id, choiceId, scenario: 'success' }, signal), origin);
    // 行動パネルを閉じ、分岐元の右に生成中の列を伸ばす。
    setPendingBranch({ worldlineId: worldline.id, nodeId: selected.id, label });
    setSelectedId(null);
  }

  function changeReview(review: StoryReview) {
    if (!archive || !worldline || busy) return;
    const next = updateWorldlineReview(archive, worldline.id, review);
    setArchive(next);
    try { persist(next); }
    catch {
      setNotice({ text: '入力内容をブラウザに保存できませんでした。「保存する」からファイルを保存できます。', kind: 'error' });
    }
  }

  function save() {
    if (!archive) return;
    // 自動保存が不可でもファイルとして持ち帰れる。
    try { persist(archive); } catch { /* ダウンロードは続ける */ }
    try {
      const url = URL.createObjectURL(new Blob([archiveJson(archive)], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'あとのまつり.atono.json';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({ text: '世界線と振り返りをファイルに保存しました。', kind: 'status' });
    } catch { setNotice({ text: '保存できませんでした。ブラウザの設定を確認してください。', kind: 'error' }); }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || busy) return;
    const id = ++requestId.current;
    setImporting(true);
    setNotice(null);
    try {
      const next = parseArchiveJson(await file.text());
      if (id !== requestId.current) return;
      const restored = next.worldlines.find((item) => item.id === next.activeWorldlineId)!;
      setArchive(next);
      setRegret(restored.session.input.regret);
      setSelectedId(null);
      setScreen('result');
      try {
        persist(next);
        setNotice({ text: 'ファイルから世界線を復元しました。', kind: 'status' });
      } catch {
        setNotice({ text: '世界線は復元できましたが、このブラウザへの自動保存に失敗しました。', kind: 'error' });
      }
      requestAnimationFrame(() => document.getElementById('result-title')?.focus());
    } catch {
      if (id === requestId.current) setNotice({ text: 'ファイルを復元できませんでした。あとのまつりで保存したファイルを選んでください。', kind: 'error' });
    } finally {
      if (id === requestId.current) setImporting(false);
    }
  }

  function openHistory(id: string) {
    const entry = history.find((item) => historyId(item.archive) === id);
    if (!entry || busy) return;
    const next = entry.archive;
    setArchive(next);
    setRegret(next.worldlines.find((item) => item.id === next.activeWorldlineId)!.session.input.regret);
    setSelectedId(null);
    setScreen('result');
    try {
      persist(next);
      setNotice({ text: '過去の世界線を開きました。', kind: 'status' });
    } catch { setNotice({ text: '過去の世界線を開きましたが、このブラウザへの保存に失敗しました。', kind: 'error' }); }
    requestAnimationFrame(() => document.getElementById('result-title')?.focus());
  }

  function deleteHistory(id: string) {
    try {
      setHistory(removeHistory(window.localStorage, id));
      setNotice({ text: '履歴から削除しました。', kind: 'status' });
    } catch { setNotice({ text: '履歴を削除できませんでした。', kind: 'error' }); }
  }

  function clearSaved() {
    cancel();
    setArchive(null);
    setSelectedId(null);
    setScreen('entry');
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setNotice({ text: '現在の結果を閉じました。', kind: 'status' });
    } catch { setNotice({ text: '画面はリセットしましたが、前回表示した結果の保存を解除できませんでした。', kind: 'error' }); }
    requestAnimationFrame(() => document.getElementById('regret')?.focus());
  }

  return <div className={`app ${screen === 'entry' ? 'entry-view' : 'result-view'}`}>
    <a className="skip-link" href="#main">本文へ移動</a>
    <header className="site-header"><button type="button" className="brand" onClick={newInput}>あとのまつり</button>
      <input type="file" ref={fileInput} hidden accept=".json,application/json" onChange={(event) => { void importFile(event); }} />
      <SidebarMenu history={history} busy={busy} importing={importing}
        onImport={() => fileInput.current?.click()} onOpenHistory={openHistory} onDeleteHistory={deleteHistory} />
    </header>
    {importing && <p className="import-status" role="status">ファイルを読み込んでいます…</p>}
    {screen === 'pending' ? <PendingResult regret={regret} onCancel={newInput} />
      : screen === 'entry' ? <EntryScreen regret={regret} busy={busy} importing={importing}
      onChange={setRegret} onSubmit={submit} onCancel={cancel} />
      : session && <main className="result-screen" id="main" aria-busy={operation === 'regenerate'}>
        <h1 id="result-title" className="visually-hidden" tabIndex={-1}>選ばなかった世界線</h1>
        {operation === 'regenerate' && <p className="visually-hidden" role="status">選んだ行動の世界線を右に追加しています…</p>}
        <div className="result-layout" ref={resultLayout} style={chartHeight === null ? undefined : { '--chart-fit-height': `${chartHeight}px` } as CSSProperties}>
          <StoryPanel session={session} selectedId={selectedId} />
          <div className="graph-column">
            <div className="graph-shell">
              <Suspense fallback={<div className="chart-loading" role="status">世界線を配置しています…</div>}><TreeCanvas archive={archive!} pending={pendingBranch} selectedId={selectedId} busy={busy} onSelect={selectNode} onChoose={choose} onClose={closeDetail} /></Suspense>
            </div>
          </div>
        </div>
        <a className="closing-jump" href="#closing-title" onClick={(event) => {
          event.preventDefault();
          const heading = document.getElementById('closing-title');
          heading?.focus({ preventScroll: true });
          heading?.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
            block: 'start',
          });
        }}>いまのあなたへ・振り返り <span aria-hidden="true">↓</span></a>
        <section className="closing-section" aria-labelledby="closing-title">
          <span className="closing-line" aria-hidden="true" />
          <h2 id="closing-title" tabIndex={-1}>今のあなたへ</h2>
          <p>{session.tree.closingMessage}</p>
          {worldline && <ReviewPanel value={worldline.review ?? emptyReview} onChange={changeReview} disabled={busy} />}
          <div className="end-actions">
            <button type="button" onClick={newInput}>入力画面に戻る</button>
            <button type="button" onClick={save} disabled={busy}>保存する <span aria-hidden="true">↓</span></button>
          </div>
          <button type="button" className="delete-saved" onClick={clearSaved}>現在の結果を閉じる</button>
        </section>
      </main>}
    {notice && <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
      <span>{notice.text}</span><button type="button" aria-label="通知を閉じる" onClick={() => setNotice(null)}>×</button>
    </div>}
  </div>;
}
