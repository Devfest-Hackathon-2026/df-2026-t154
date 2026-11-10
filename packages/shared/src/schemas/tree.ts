import { z } from 'zod';

// プロトタイプ用の契約。本体との合流時に担当者と調整する。
export const InputSchema = z.object({ regret: z.string().trim().min(1).max(1000) });
export const ChoiceSchema = z.object({ id: z.string().min(1), label: z.string().min(1) });
export const NodeSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  title: z.string().min(1),
  description: z.string().min(1),
  cause: z.string().min(1),
  choices: z.array(ChoiceSchema).max(10),
  selectedChoiceId: z.string().min(1).nullable(),
});
export const TreeSchema = z.object({
  rootId: z.string().min(1),
  nodes: z.array(NodeSchema).min(1).max(100),
  closingMessage: z.string().min(1),
}).superRefine((tree, context) => {
  const fail = (message: string) => context.addIssue({ code: 'custom', message });
  const nodes = new Map(tree.nodes.map((node) => [node.id, node]));
  if (nodes.size !== tree.nodes.length) fail('ノードIDが重複しています。');
  if (nodes.get(tree.rootId)?.parentId !== null) fail('ルートが不正です。');
  for (const node of tree.nodes) {
    if (node.id !== tree.rootId && (!node.parentId || !nodes.has(node.parentId))) fail('親への参照が不正です。');
    if (new Set(node.choices.map((choice) => choice.id)).size !== node.choices.length) fail('選択肢IDが重複しています。');
    if (node.selectedChoiceId !== null && !node.choices.some((choice) => choice.id === node.selectedChoiceId)) fail('選択済みの選択肢が存在しません。');
  }
  const reached = new Set<string>();
  const queue = [tree.rootId];
  while (queue.length) {
    const id = queue.shift()!;
    if (reached.has(id)) { fail('循環があります。'); break; }
    reached.add(id);
    for (const node of tree.nodes) if (node.parentId === id) queue.push(node.id);
  }
  if (reached.size !== nodes.size) fail('到達できないノードがあります。');
});

export const SessionSchema = z.object({
  source: z.enum(['mock', 'gemini']),
  input: InputSchema,
  tree: TreeSchema,
});
export const GenerateRequestSchema = z.object({
  input: InputSchema,
  scenario: z.enum(['success', 'rejected', 'failure']).default('success'),
});
export const RegenerateRequestSchema = z.object({
  session: SessionSchema,
  nodeId: z.string().min(1),
  choiceId: z.string().min(1),
  scenario: z.enum(['success', 'failure']).default('success'),
});
export const SavedSessionSchema = z.object({
  schemaVersion: z.literal(1),
  savedAt: z.iso.datetime(),
  session: SessionSchema,
});
export const ApiErrorSchema = z.object({ error: z.object({
  code: z.enum(['invalid_input', 'topic_rejected', 'generation_failed']),
  message: z.string(),
}) });

export type RegretInput = z.infer<typeof InputSchema>;
export type StoryNode = z.infer<typeof NodeSchema>;
export type StoryTree = z.infer<typeof TreeSchema>;
export type StorySession = z.infer<typeof SessionSchema>;
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type RegenerateRequest = z.infer<typeof RegenerateRequestSchema>;

export function replaceDescendants(tree: StoryTree, nodeId: string, choiceId: string, replacement: StoryNode[], closingMessage: string): StoryTree {
  TreeSchema.parse(tree);
  const anchor = tree.nodes.find((node) => node.id === nodeId);
  if (!anchor?.choices.some((choice) => choice.id === choiceId)) throw new Error('対象ノードまたは選択肢がありません。');
  const removed = new Set<string>();
  const queue = [nodeId];
  while (queue.length) {
    const parentId = queue.shift()!;
    for (const node of tree.nodes) {
      if (node.parentId === parentId) { removed.add(node.id); queue.push(node.id); }
    }
  }
  const kept = tree.nodes.filter((node) => !removed.has(node.id));
  const replacementIds = new Set(replacement.map((node) => node.id));
  if (!replacement.length || replacementIds.size !== replacement.length) throw new Error('置換ノードが不正です。');
  if (replacement.some((node) => kept.some((old) => old.id === node.id))) throw new Error('保持するノードとIDが衝突します。');
  if (replacement.some((node) => node.parentId !== nodeId && !replacementIds.has(node.parentId ?? ''))) throw new Error('対象外のノードへ接続しています。');
  return TreeSchema.parse({
    ...tree,
    closingMessage,
    nodes: [...kept.map((node) => node.id === nodeId ? { ...node, selectedChoiceId: choiceId } : node), ...replacement],
  });
}

// 生成済みの世界線は変更せず、分岐元と生成時のスナップショットを保存する。
// 画面上の列・行・座標はここには含めない。
export const WorldlineOriginSchema = z.object({
  worldlineId: z.string().min(1),
  nodeId: z.string().min(1),
  choiceId: z.string().min(1),
});
export const REVIEW_REACTIONS = [
  'あっちにも面倒はあると思えた',
  'それでも選んでおくべきだった',
  'この展開はピンとこない',
] as const;
export const StoryReviewSchema = z.object({
  reaction: z.enum(REVIEW_REACTIONS).nullable(),
  lingering: z.string().max(1000),
  action: z.string().max(1000),
});
export type StoryReview = z.infer<typeof StoryReviewSchema>;

export const WorldlineSchema = z.object({
  id: z.string().min(1),
  origin: WorldlineOriginSchema.nullable(),
  session: SessionSchema,
  // 旧version 2の保存には存在しない。未記入として復元する。
  review: StoryReviewSchema.optional(),
});
export const WorldlineArchiveSchema = z.object({
  worldlines: z.array(WorldlineSchema).min(1).max(100),
  activeWorldlineId: z.string().min(1),
}).superRefine((archive, context) => {
  const fail = (message: string) => context.addIssue({ code: 'custom', message });
  const previous = new Map<string, z.infer<typeof WorldlineSchema>>();
  const origins = new Set<string>();
  for (const [index, worldline] of archive.worldlines.entries()) {
    if (previous.has(worldline.id)) fail('世界線IDが重複しています。');
    if (index === 0 && worldline.origin !== null) fail('最初の世界線に分岐元は指定できません。');
    if (index > 0 && worldline.origin === null) fail('追加の世界線には分岐元が必要です。');
    if (worldline.origin) {
      const origin = worldline.origin;
      const originKey = JSON.stringify([origin.worldlineId, origin.nodeId, origin.choiceId]);
      if (origins.has(originKey)) fail('同じ行動の世界線が重複しています。');
      origins.add(originKey);
      const parent = previous.get(origin.worldlineId);
      const anchor = parent?.session.tree.nodes.find((node) => node.id === origin.nodeId);
      const childAnchor = worldline.session.tree.nodes.find((node) => node.id === origin.nodeId);
      if (!parent || !anchor?.choices.some((choice) => choice.id === origin.choiceId)) fail('世界線の分岐元が不正です。');
      if (!worldline.session.tree.nodes.some((node) => node.parentId === origin.nodeId)) fail('分岐先の出来事がありません。');
      if (childAnchor?.selectedChoiceId !== origin.choiceId) fail('世界線と選択した行動が一致しません。');
      if (parent && (parent.session.input.regret !== worldline.session.input.regret || parent.session.source !== worldline.session.source)) fail('異なる入力の世界線が混在しています。');
      if (parent) {
        const visible = new Set<string>();
        let node = parent.session.tree.nodes.find((item) => item.id === parent.session.tree.rootId);
        let afterOrigin = parent.origin === null;
        while (node) {
          if (afterOrigin) visible.add(node.id);
          if (node.id === parent.origin?.nodeId) afterOrigin = true;
          const id = node.id;
          node = parent.session.tree.nodes.find((item) => item.parentId === id);
        }
        if (!visible.has(origin.nodeId)) fail('表示されている出来事から分岐してください。');
      }
      if (parent?.origin) {
        let current = anchor;
        const ancestors = new Set<string>();
        while (current?.parentId) {
          ancestors.add(current.parentId);
          current = parent.session.tree.nodes.find((node) => node.id === current?.parentId);
        }
        if (!ancestors.has(parent.origin.nodeId)) fail('この世界線で生成した出来事から分岐してください。');
      }
    }
    previous.set(worldline.id, worldline);
  }
  if (!previous.has(archive.activeWorldlineId)) fail('表示中の世界線が存在しません。');
});
export const SavedWorldlinesSchema = z.object({
  schemaVersion: z.literal(2),
  savedAt: z.iso.datetime(),
  archive: WorldlineArchiveSchema,
});
// 過去の結果の履歴（ブラウザ内のみ）。既存のSavedWorldlinesSchemaとは別キーに保存し、既存形式は変えない。
// 1件ずつ検証して壊れた項目だけを飛ばせるよう、一覧の器ではentriesの中身を検証しない。
export const HISTORY_LIMIT = 20;
export const HistoryEntrySchema = z.object({
  savedAt: z.iso.datetime(),
  archive: WorldlineArchiveSchema,
});
export const SavedHistorySchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(z.unknown()),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type Worldline = z.infer<typeof WorldlineSchema>;
export type WorldlineOrigin = z.infer<typeof WorldlineOriginSchema>;
export type WorldlineArchive = z.infer<typeof WorldlineArchiveSchema>;
