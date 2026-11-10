import { randomUUID } from 'node:crypto';
import { TreeSchema, replaceDescendants } from '@atono/shared';
import type { RegretInput, RegenerateRequest, StoryTree } from '@atono/shared';

// API層から切り離した生成の入口。Gemini担当の関数はここから接続する。
export interface TreeGenerator {
  readonly source?: 'mock' | 'gemini';
  generate(input: RegretInput): Promise<StoryTree>;
  regenerate(request: RegenerateRequest): Promise<StoryTree>;
}

export const mockGenerator: TreeGenerator = {
  async generate(_input) {
    return TreeSchema.parse({
      rootId: 'root',
      nodes: [
        { id: 'root', parentId: null, title: '別の店を選んだ世界線', description: 'いつもと違うランチの店へ向かった、という固定の物語です。', cause: '選ばなかった方を試すサンプルです。', choices: [{ id: 'wait', label: '行列に並ぶ' }, { id: 'walk', label: '別の店を探す' }], selectedChoiceId: 'wait' },
        { id: 'event', parentId: 'root', title: '並んだ直後に売り切れ', description: 'ようやく先頭になったところで、店員さんが売り切れの札を出しました。', cause: '人気メニューの行列に並び、最後の一食を目前で逃しました。', choices: [{ id: 'bread', label: 'パンを買って帰る' }, { id: 'home', label: '家で食べる' }], selectedChoiceId: 'bread' },
        { id: 'ending', parentId: 'event', title: 'パンを狙う鳩との攻防', description: '買ったパンを守っていたら、昼休みがすっかり終わってしまいました。', cause: '外でパンを食べようとしたところ、鳩が集まってきました。', choices: [], selectedChoiceId: null },
      ],
      closingMessage: 'これは固定データの例です。今日は今日の選択で、少し肩の力を抜いてもよさそうです。',
    });
  },
  async regenerate({ session, nodeId, choiceId }) {
    const node = session.tree.nodes.find((item) => item.id === nodeId);
    const choice = node?.choices.find((item) => item.id === choiceId);
    if (!choice) throw new Error('選択肢がありません。');
    const eventId = randomUUID();
    const endingId = randomUUID();
    return replaceDescendants(session.tree, nodeId, choiceId, [
      { id: eventId, parentId: nodeId, title: `「${choice.label}」を選んだ先`, description: '近道をしたつもりが、臨時休業の店ばかりに出会いました。', cause: `「${choice.label}」を選んで移動した先で、予定が外れました。`, choices: [{ id: 'retry', label: 'もう少し探す' }, { id: 'stop', label: 'いったん帰る' }], selectedChoiceId: 'retry' },
      { id: endingId, parentId: eventId, title: '結局、いつもの場所へ', description: 'ぐるっと歩いて元の場所へ戻ったところで、休憩終了の時間になりました。', cause: '次の店を探すうちに、時間を使い切ってしまいました。', choices: [], selectedChoiceId: null },
    ], '選び直しても、ちょっとおかしな道のりでした。これは固定データによる操作確認です。');
  },
};
