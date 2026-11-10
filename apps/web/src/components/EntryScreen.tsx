import type { FormEvent } from 'react';

const examples = [
  'チャーハンに卵を入れ忘れたこと',
  'あの日、二次会に行かなかったこと',
  '気になっていたサークルに入らなかったこと',
];

type Props = {
  regret: string;
  busy: boolean;
  importing?: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

export function EntryScreen(props: Props) {
  return <main className="entry-page" id="main"><div className="entry-screen">
    <form className="entry-form" onSubmit={props.onSubmit} aria-busy={props.busy}>
      <h1><label htmlFor="regret">後悔している選択は？</label></h1>
      <div className="input-row">
        <input id="regret" value={props.regret} onChange={(event) => props.onChange(event.target.value)}
          placeholder="選択を入力してください" required maxLength={1000} autoComplete="off" disabled={props.busy} />
        <button className="primary" type="submit" disabled={props.busy}>{props.importing ? '読込中' : props.busy ? '生成中' : '生成'}</button>
      </div>
      <div className="examples" aria-label="後悔の入力例">
        <span>例：</span>
        {examples.map((example) => <button type="button" key={example} disabled={props.busy}
          onClick={() => { props.onChange(example); document.getElementById('regret')?.focus(); }}>{example}</button>)}
      </div>
      {props.busy && !props.importing && <div className="generating" role="status">
        <span className="loading-line" aria-hidden="true" />
        <p>別の世界線をたどっています<span className="loading-dots" aria-hidden="true">…</span></p>
        <small>入力の確認と物語の生成に、少し時間がかかります。</small>
        <button type="button" className="text-button" onClick={props.onCancel}>生成を中断して入力を変える</button>
      </div>}
    </form>
  </div></main>;
}
