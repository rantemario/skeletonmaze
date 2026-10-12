/**
 * 迷宮を徘徊する100種のモンスター大図鑑マスタデータ
 * 10大系統 × 10階級（Tier 1〜10）により、浅層から深層まで多彩な脅威を演出
 * 【重要規則】形と色が違う敵は100種類すべて完全に異なる固有レベル（Lv.1〜Lv.100）を持ち、同じレベルの敵は存在しない。
 */

import type { MonsterType } from '../types';

export interface MonsterSpecies {
  id: string;
  name: string;
  type: MonsterType;
  category: string;
  color: string;
  subColor: string;
  symbol: string;
  baseHp: number;
  baseAtk: number;
  speed: number;
  tier: number; // 1（序盤B1F〜）から10（深層B10F〜）
  level: number; // 敵の完全固有レベル（Lv.1〜Lv.100、重複皆無）
  isGhost?: boolean;
  isRanged?: boolean;
}

/** 100種類のモンスターカタログ（全100体それぞれが固有のLv.1〜Lv.100を保持） */
export const MONSTER_CATALOG: MonsterSpecies[] = [
  // ----------------------------------------------------
  // 1. スライム族（アイテムを拾って持ち逃げする徘徊ゲル・逃走生態）
  // ----------------------------------------------------
  { id: 'm_slime_01', name: 'グリーンスライム', type: 'SLIME', category: 'スライム族', color: '#2ecc71', subColor: '#27ae60', symbol: '🟢', baseHp: 8, baseAtk: 1, speed: 0.8, tier: 1, level: 1 },
  { id: 'm_slime_02', name: 'ブルースライム', type: 'SLIME', category: 'スライム族', color: '#3498db', subColor: '#2980b9', symbol: '🔵', baseHp: 25, baseAtk: 8, speed: 0.8, tier: 1, level: 11 },
  { id: 'm_slime_03', name: 'イエロージェル', type: 'SLIME', category: 'スライム族', color: '#f1c40f', subColor: '#f39c12', symbol: '🟡', baseHp: 35, baseAtk: 11, speed: 0.75, tier: 2, level: 21 },
  { id: 'm_slime_04', name: 'ポイズンブロブ', type: 'SLIME', category: 'スライム族', color: '#9b59b6', subColor: '#8e44ad', symbol: '🟣', baseHp: 48, baseAtk: 14, speed: 0.75, tier: 3, level: 31 },
  { id: 'm_slime_05', name: 'アシッドスライム', type: 'SLIME', category: 'スライム族', color: '#1abc9c', subColor: '#16a085', symbol: '🧪', baseHp: 65, baseAtk: 18, speed: 0.7, tier: 4, level: 41 },
  { id: 'm_slime_06', name: 'マグマスライム', type: 'SLIME', category: 'スライム族', color: '#e67e22', subColor: '#d35400', symbol: '🔥', baseHp: 85, baseAtk: 23, speed: 0.7, tier: 5, level: 51 },
  { id: 'm_slime_07', name: 'フロストウーズ', type: 'SLIME', category: 'スライム族', color: '#74b9ff', subColor: '#0984e3', symbol: '❄️', baseHp: 110, baseAtk: 28, speed: 0.65, tier: 6, level: 61 },
  { id: 'm_slime_08', name: 'シャドウムチン', type: 'SLIME', category: 'スライム族', color: '#636e72', subColor: '#2d3436', symbol: '⚫', baseHp: 140, baseAtk: 34, speed: 0.65, tier: 7, level: 71 },
  { id: 'm_slime_09', name: 'メタルスライム', type: 'SLIME', category: 'スライム族', color: '#dfe6e9', subColor: '#b2bec3', symbol: '🔘', baseHp: 180, baseAtk: 40, speed: 0.6, tier: 8, level: 81 },
  { id: 'm_slime_10', name: 'キングスライム', type: 'SLIME', category: 'スライム族', color: '#00cec9', subColor: '#fdcb6e', symbol: '👑', baseHp: 240, baseAtk: 48, speed: 0.6, tier: 9, level: 91 },

  // ----------------------------------------------------
  // 2. ゴブリン・蛮族（集団で包囲する俊敏な亜人戦士・追尾接近）
  // ----------------------------------------------------
  { id: 'm_goblin_01', name: 'ゴブリン斥候', type: 'GOBLIN', category: 'ゴブリン族', color: '#78e08f', subColor: '#38ada9', symbol: '👺', baseHp: 10, baseAtk: 2, speed: 0.7, tier: 1, level: 2 },
  { id: 'm_goblin_02', name: 'ゴブリン歩兵', type: 'GOBLIN', category: 'ゴブリン族', color: '#6a89cc', subColor: '#4a69bd', symbol: '🗡️', baseHp: 32, baseAtk: 11, speed: 0.7, tier: 2, level: 12 },
  { id: 'm_goblin_03', name: 'ゴブリン投石兵', type: 'GOBLIN', category: 'ゴブリン族', color: '#e58e26', subColor: '#b71540', symbol: '🪨', baseHp: 40, baseAtk: 14, speed: 0.68, tier: 2, level: 22 },
  { id: 'm_goblin_04', name: 'ホブゴブリン', type: 'GOBLIN', category: 'ゴブリン族', color: '#b8e994', subColor: '#78e08f', symbol: '🧌', baseHp: 56, baseAtk: 18, speed: 0.65, tier: 3, level: 32 },
  { id: 'm_goblin_05', name: 'オーク戦士', type: 'GOBLIN', category: 'ゴブリン族', color: '#82ccdd', subColor: '#60a3bc', symbol: '🪓', baseHp: 75, baseAtk: 23, speed: 0.65, tier: 4, level: 42 },
  { id: 'm_goblin_06', name: 'オーク重装兵', type: 'GOBLIN', category: 'ゴブリン族', color: '#079992', subColor: '#0a3d62', symbol: '🛡️', baseHp: 100, baseAtk: 28, speed: 0.6, tier: 5, level: 52 },
  { id: 'm_goblin_07', name: 'オーク狂戦士', type: 'GOBLIN', category: 'ゴブリン族', color: '#eb2f06', subColor: '#b71540', symbol: '🩸', baseHp: 130, baseAtk: 35, speed: 0.58, tier: 6, level: 62 },
  { id: 'm_goblin_08', name: 'トロール門番', type: 'GOBLIN', category: 'ゴブリン族', color: '#4a69bd', subColor: '#1e3799', symbol: '👹', baseHp: 170, baseAtk: 42, speed: 0.55, tier: 7, level: 72 },
  { id: 'm_goblin_09', name: 'ウォーロード', type: 'GOBLIN', category: 'ゴブリン族', color: '#fa983a', subColor: '#e55039', symbol: '⚔️', baseHp: 220, baseAtk: 50, speed: 0.52, tier: 8, level: 82 },
  { id: 'm_goblin_10', name: '冥府のオーガキング', type: 'GOBLIN', category: 'ゴブリン族', color: '#c0392b', subColor: '#2c3e50', symbol: '👑', baseHp: 300, baseAtk: 60, speed: 0.5, tier: 9, level: 92 },

  // ----------------------------------------------------
  // 3. スケルトン・アンデッド（骨と腐肉の不死戦士・強固な盾受け）
  // ----------------------------------------------------
  { id: 'm_skel_01', name: '朽ちたスケルトン', type: 'SKELETON', category: '骸骨族', color: '#ecf0f1', subColor: '#bdc3c7', symbol: '💀', baseHp: 12, baseAtk: 2, speed: 0.75, tier: 1, level: 3 },
  { id: 'm_skel_02', name: 'スケルトン剣士', type: 'SKELETON', category: '骸骨族', color: '#f5f6fa', subColor: '#dcdde1', symbol: '🗡️', baseHp: 42, baseAtk: 14, speed: 0.72, tier: 2, level: 13 },
  { id: 'm_skel_03', name: 'ゾンビ徘徊者', type: 'SKELETON', category: '骸骨族', color: '#7f8c8d', subColor: '#34495e', symbol: '🧟', baseHp: 60, baseAtk: 16, speed: 0.8, tier: 3, level: 23 },
  { id: 'm_skel_04', name: '鎧のスケルトン', type: 'SKELETON', category: '骸骨族', color: '#95a5a6', subColor: '#7f8c8d', symbol: '🛡️', baseHp: 80, baseAtk: 22, speed: 0.7, tier: 4, level: 33 },
  { id: 'm_skel_05', name: 'グール喰らい', type: 'SKELETON', category: '骸骨族', color: '#a4b0be', subColor: '#57606f', symbol: '🦷', baseHp: 105, baseAtk: 27, speed: 0.68, tier: 5, level: 43 },
  { id: 'm_skel_06', name: 'ワイト騎士', type: 'SKELETON', category: '骸骨族', color: '#747d8c', subColor: '#2f3542', symbol: '⚔️', baseHp: 135, baseAtk: 33, speed: 0.65, tier: 6, level: 53 },
  { id: 'm_skel_07', name: 'マミー封印兵', type: 'SKELETON', category: '骸骨族', color: '#eccc68', subColor: '#ffa502', symbol: '🩹', baseHp: 175, baseAtk: 39, speed: 0.65, tier: 7, level: 63 },
  { id: 'm_skel_08', name: 'デスナイト', type: 'SKELETON', category: '骸骨族', color: '#2f3542', subColor: '#ff4757', symbol: '🐎', baseHp: 225, baseAtk: 46, speed: 0.6, tier: 8, level: 73 },
  { id: 'm_skel_09', name: '骸骨大元帥', type: 'SKELETON', category: '骸骨族', color: '#ced6e0', subColor: '#5352ed', symbol: '☠️', baseHp: 285, baseAtk: 54, speed: 0.58, tier: 9, level: 83 },
  { id: 'm_skel_10', name: '不死王ノーライフキング', type: 'SKELETON', category: '骸骨族', color: '#3742fa', subColor: '#ff4757', symbol: '👑', baseHp: 380, baseAtk: 65, speed: 0.55, tier: 10, level: 93 },

  // ----------------------------------------------------
  // 4. 霊体・ゴースト（壁やすり抜けの怪異霊・壁無視追尾）
  // ----------------------------------------------------
  { id: 'm_ghost_01', name: '迷い子のポルターガイスト', type: 'GHOST', category: '霊体族', color: '#a55eea', subColor: '#8854d0', symbol: '👻', baseHp: 10, baseAtk: 3, speed: 0.8, tier: 1, level: 4, isGhost: true },
  { id: 'm_ghost_02', name: 'シャドウファントム', type: 'GHOST', category: '霊体族', color: '#778ca3', subColor: '#4b6584', symbol: '👤', baseHp: 26, baseAtk: 16, speed: 0.78, tier: 2, level: 14, isGhost: true },
  { id: 'm_ghost_03', name: 'ウィルオウィスプ', type: 'GHOST', category: '霊体族', color: '#45aaf2', subColor: '#2d98da', symbol: '🔥', baseHp: 38, baseAtk: 20, speed: 0.75, tier: 3, level: 24, isGhost: true },
  { id: 'm_ghost_04', name: '嘆きのバンシー', type: 'GHOST', category: '霊体族', color: '#2bcbba', subColor: '#0fb9b1', symbol: '🗣️', baseHp: 52, baseAtk: 25, speed: 0.72, tier: 4, level: 34, isGhost: true },
  { id: 'm_ghost_05', name: '怨霊レイス', type: 'GHOST', category: '霊体族', color: '#3867d6', subColor: '#4b7bec', symbol: '🌫️', baseHp: 70, baseAtk: 30, speed: 0.7, tier: 5, level: 44, isGhost: true },
  { id: 'm_ghost_06', name: 'スペクター死霊', type: 'GHOST', category: '霊体族', color: '#eb3b5a', subColor: '#fc5c65', symbol: '👁️', baseHp: 92, baseAtk: 36, speed: 0.68, tier: 6, level: 54, isGhost: true },
  { id: 'm_ghost_07', name: 'ナイトストーカー', type: 'GHOST', category: '霊体族', color: '#2d98da', subColor: '#20bf6b', symbol: '🌑', baseHp: 120, baseAtk: 42, speed: 0.65, tier: 7, level: 64, isGhost: true },
  { id: 'm_ghost_08', name: '呪詛のドッペルゲンガー', type: 'GHOST', category: '霊体族', color: '#a55eea', subColor: '#fed330', symbol: '🎭', baseHp: 160, baseAtk: 48, speed: 0.62, tier: 8, level: 74, isGhost: true },
  { id: 'm_ghost_09', name: '奈落のソウルリーパー', type: 'GHOST', category: '霊体族', color: '#20bf6b', subColor: '#0fb9b1', symbol: '镰', baseHp: 210, baseAtk: 56, speed: 0.6, tier: 9, level: 84, isGhost: true },
  { id: 'm_ghost_10', name: '深淵の冥霊王ハデス', type: 'GHOST', category: '霊体族', color: '#4b6584', subColor: '#eb3b5a', symbol: '👑', baseHp: 280, baseAtk: 66, speed: 0.58, tier: 10, level: 94, isGhost: true },

  // ----------------------------------------------------
  // 5. 獣・魔獣（素早い連続接近と直線突進）
  // ----------------------------------------------------
  { id: 'm_beast_01', name: 'ダンジョンラット', type: 'BEAST', category: '野獣族', color: '#a4b0be', subColor: '#747d8c', symbol: '🐀', baseHp: 11, baseAtk: 3, speed: 0.6, tier: 1, level: 5 },
  { id: 'm_beast_02', name: '狂犬ダイアウルフ', type: 'BEAST', category: '野獣族', color: '#747d8c', subColor: '#2f3542', symbol: '🐺', baseHp: 28, baseAtk: 12, speed: 0.6, tier: 2, level: 15 },
  { id: 'm_beast_03', name: '猛毒トカゲ', type: 'BEAST', category: '野獣族', color: '#2ed573', subColor: '#26af61', symbol: '🦎', baseHp: 44, baseAtk: 16, speed: 0.62, tier: 3, level: 25 },
  { id: 'm_beast_04', name: 'サーベルキャット', type: 'BEAST', category: '野獣族', color: '#ffa502', subColor: '#ff7f50', symbol: '🐆', baseHp: 62, baseAtk: 21, speed: 0.58, tier: 4, level: 35 },
  { id: 'm_beast_05', name: 'ヘルハウンド', type: 'BEAST', category: '野獣族', color: '#ff4757', subColor: '#e04050', symbol: '🐕‍🦺', baseHp: 85, baseAtk: 26, speed: 0.55, tier: 5, level: 45 },
  { id: 'm_beast_06', name: 'グリフォン幼体', type: 'BEAST', category: '野獣族', color: '#eccc68', subColor: '#ffa502', symbol: '🦅', baseHp: 115, baseAtk: 32, speed: 0.55, tier: 6, level: 55 },
  { id: 'm_beast_07', name: '双頭のオルトロス', type: 'BEAST', category: '野獣族', color: '#5352ed', subColor: '#3742fa', symbol: '🐕', baseHp: 150, baseAtk: 38, speed: 0.52, tier: 7, level: 65 },
  { id: 'm_beast_08', name: 'キメラ合成獣', type: 'BEAST', category: '野獣族', color: '#ff6348', subColor: '#1e90ff', symbol: '🦁', baseHp: 195, baseAtk: 45, speed: 0.5, tier: 8, level: 75 },
  { id: 'm_beast_09', name: 'マンティコア', type: 'BEAST', category: '野獣族', color: '#9b59b6', subColor: '#e74c3c', symbol: '🦂', baseHp: 250, baseAtk: 53, speed: 0.48, tier: 9, level: 85 },
  { id: 'm_beast_10', name: '巨獣ベヒモス', type: 'BEAST', category: '野獣族', color: '#2f3542', subColor: '#ffa502', symbol: '🦣', baseHp: 350, baseAtk: 64, speed: 0.45, tier: 10, level: 95 },

  // ----------------------------------------------------
  // 6. 昆虫・節足族（毒針と強靭な外骨格・状態毒付与）
  // ----------------------------------------------------
  { id: 'm_bug_01', name: '洞窟クモ', type: 'INSECT', category: '節足虫族', color: '#747d8c', subColor: '#2f3542', symbol: '🕷️', baseHp: 13, baseAtk: 3, speed: 0.65, tier: 1, level: 6 },
  { id: 'm_bug_02', name: 'キラービー', type: 'INSECT', category: '節足虫族', color: '#f1c40f', subColor: '#e67e22', symbol: '🐝', baseHp: 22, baseAtk: 13, speed: 0.55, tier: 2, level: 16 },
  { id: 'm_bug_03', name: 'ジャイアントビートル', type: 'INSECT', category: '節足虫族', color: '#34495e', subColor: '#2c3e50', symbol: '🪲', baseHp: 48, baseAtk: 15, speed: 0.75, tier: 3, level: 26 },
  { id: 'm_bug_04', name: 'アシッドスコーピオン', type: 'INSECT', category: '節足虫族', color: '#27ae60', subColor: '#2ecc71', symbol: '🦂', baseHp: 65, baseAtk: 20, speed: 0.68, tier: 4, level: 36 },
  { id: 'm_bug_05', name: 'マンティスアサシン', type: 'INSECT', category: '節足虫族', color: '#2ed573', subColor: '#1e90ff', symbol: '🦗', baseHp: 85, baseAtk: 27, speed: 0.6, tier: 5, level: 46 },
  { id: 'm_bug_06', name: 'クリムゾンセンチピード', type: 'INSECT', category: '節足虫族', color: '#ff4757', subColor: '#c0392b', symbol: '🐛', baseHp: 110, baseAtk: 33, speed: 0.6, tier: 6, level: 56 },
  { id: 'm_bug_07', name: 'シャドウモス', type: 'INSECT', category: '節足虫族', color: '#8e44ad', subColor: '#9b59b6', symbol: '🦋', baseHp: 140, baseAtk: 38, speed: 0.58, tier: 7, level: 66 },
  { id: 'm_bug_08', name: 'メタルスカラベ', type: 'INSECT', category: '節足虫族', color: '#f39c12', subColor: '#d35400', symbol: '🪳', baseHp: 190, baseAtk: 44, speed: 0.62, tier: 8, level: 76 },
  { id: 'm_bug_09', name: 'クモの母アラクネ', type: 'INSECT', category: '節足虫族', color: '#57606f', subColor: '#ff4757', symbol: '🕷️', baseHp: 245, baseAtk: 52, speed: 0.55, tier: 9, level: 86 },
  { id: 'm_bug_10', name: '帝王クイーンアント', type: 'INSECT', category: '節足虫族', color: '#e74c3c', subColor: '#f1c40f', symbol: '🐜', baseHp: 320, baseAtk: 62, speed: 0.52, tier: 10, level: 96 },

  // ----------------------------------------------------
  // 7. リザード・竜人族（鱗鎧と槍斧の戦闘狂・HP半分で激昂バーサーク）
  // ----------------------------------------------------
  { id: 'm_rep_01', name: 'コボルド戦士', type: 'REPTILE', category: '竜人族', color: '#e67e22', subColor: '#d35400', symbol: '🦎', baseHp: 14, baseAtk: 4, speed: 0.72, tier: 1, level: 7 },
  { id: 'm_rep_02', name: 'リザードマン軽装兵', type: 'REPTILE', category: '竜人族', color: '#16a085', subColor: '#1abc9c', symbol: '🗡️', baseHp: 38, baseAtk: 13, speed: 0.7, tier: 2, level: 17 },
  { id: 'm_rep_03', name: 'サハギン水棲兵', type: 'REPTILE', category: '竜人族', color: '#2980b9', subColor: '#3498db', symbol: '🐟', baseHp: 52, baseAtk: 17, speed: 0.68, tier: 3, level: 27 },
  { id: 'm_rep_04', name: 'リザードガード', type: 'REPTILE', category: '竜人族', color: '#27ae60', subColor: '#2ecc71', symbol: '🛡️', baseHp: 72, baseAtk: 22, speed: 0.65, tier: 4, level: 37 },
  { id: 'm_rep_05', name: '竜血のグラディエーター', type: 'REPTILE', category: '竜人族', color: '#c0392b', subColor: '#e74c3c', symbol: '🪓', baseHp: 96, baseAtk: 28, speed: 0.62, tier: 5, level: 47 },
  { id: 'm_rep_06', name: '石化のバジリスク', type: 'REPTILE', category: '竜人族', color: '#7f8c8d', subColor: '#95a5a6', symbol: '🐍', baseHp: 125, baseAtk: 34, speed: 0.6, tier: 6, level: 57 },
  { id: 'm_rep_07', name: 'ワイバーン哨戒兵', type: 'REPTILE', category: '竜人族', color: '#8e44ad', subColor: '#9b59b6', symbol: '🐉', baseHp: 160, baseAtk: 41, speed: 0.58, tier: 7, level: 67 },
  { id: 'm_rep_08', name: '多頭蛇ヒドラ', type: 'REPTILE', category: '竜人族', color: '#16a085', subColor: '#27ae60', symbol: '🐲', baseHp: 215, baseAtk: 49, speed: 0.55, tier: 8, level: 77 },
  { id: 'm_rep_09', name: 'ドラゴニュート近衛長', type: 'REPTILE', category: '竜人族', color: '#d35400', subColor: '#f39c12', symbol: '⚔️', baseHp: 275, baseAtk: 58, speed: 0.52, tier: 9, level: 87 },
  { id: 'm_rep_10', name: '竜王親衛隊長ファヴニル', type: 'REPTILE', category: '竜人族', color: '#ff3838', subColor: '#ffd700', symbol: '👑', baseHp: 370, baseAtk: 68, speed: 0.5, tier: 10, level: 97 },

  // ----------------------------------------------------
  // 8. 悪魔・魔神族（冥府の暗黒弾と瞬動テレポート）
  // ----------------------------------------------------
  { id: 'm_dem_01', name: 'いたずらインプ', type: 'DEMON', category: '悪魔族', color: '#e74c3c', subColor: '#c0392b', symbol: '👿', baseHp: 12, baseAtk: 4, speed: 0.65, tier: 1, level: 8 },
  { id: 'm_dem_02', name: 'ガーゴイル石像鬼', type: 'DEMON', category: '悪魔族', color: '#95a5a6', subColor: '#7f8c8d', symbol: '🗿', baseHp: 36, baseAtk: 15, speed: 0.72, tier: 2, level: 18 },
  { id: 'm_dem_03', name: 'レッサーデーモン', type: 'DEMON', category: '悪魔族', color: '#8e44ad', subColor: '#2c3e50', symbol: '🦇', baseHp: 55, baseAtk: 20, speed: 0.65, tier: 3, level: 28 },
  { id: 'm_dem_04', name: '誘惑のサキュバス', type: 'DEMON', category: '悪魔族', color: '#fd79a8', subColor: '#e84393', symbol: '💃', baseHp: 75, baseAtk: 25, speed: 0.62, tier: 4, level: 38 },
  { id: 'm_dem_05', name: '獄卒グレイブディガー', type: 'DEMON', category: '悪魔族', color: '#d63031', subColor: '#2d3436', symbol: '🪓', baseHp: 105, baseAtk: 31, speed: 0.6, tier: 5, level: 48 },
  { id: 'm_dem_06', name: 'ピットフィーンド', type: 'DEMON', category: '悪魔族', color: '#e17055', subColor: '#d63031', symbol: '👹', baseHp: 140, baseAtk: 38, speed: 0.58, tier: 6, level: 58 },
  { id: 'm_dem_07', name: '漆黒のベリアル', type: 'DEMON', category: '悪魔族', color: '#2d3436', subColor: '#6c5ce7', symbol: '🔱', baseHp: 185, baseAtk: 46, speed: 0.55, tier: 7, level: 68 },
  { id: 'm_dem_08', name: '灼熱のアスタロト', type: 'DEMON', category: '悪魔族', color: '#ff7675', subColor: '#d63031', symbol: '🔥', baseHp: 240, baseAtk: 55, speed: 0.52, tier: 8, level: 78 },
  { id: 'm_dem_09', name: '冥王ベルゼブブ', type: 'DEMON', category: '悪魔族', color: '#6c5ce7', subColor: '#00cec9', symbol: '🪰', baseHp: 310, baseAtk: 65, speed: 0.5, tier: 9, level: 88 },
  { id: 'm_dem_10', name: '破壊神ルシファー', type: 'DEMON', category: '悪魔族', color: '#ff0055', subColor: '#2f3542', symbol: '👑', baseHp: 420, baseAtk: 78, speed: 0.48, tier: 10, level: 98 },

  // ----------------------------------------------------
  // 9. ゴーレム・魔導巨兵（圧倒的超装甲・怪力粉砕）
  // ----------------------------------------------------
  { id: 'm_gol_01', name: 'マッドゴーレム', type: 'GOLEM', category: '巨兵族', color: '#cd853f', subColor: '#8b4513', symbol: '🧱', baseHp: 18, baseAtk: 4, speed: 0.85, tier: 1, level: 9 },
  { id: 'm_gol_02', name: 'ウッドゴーレム', type: 'GOLEM', category: '巨兵族', color: '#8b5a2b', subColor: '#5c3a1e', symbol: '🪵', baseHp: 50, baseAtk: 14, speed: 0.82, tier: 2, level: 19 },
  { id: 'm_gol_03', name: 'ストーンゴーレム', type: 'GOLEM', category: '巨兵族', color: '#95a5a6', subColor: '#7f8c8d', symbol: '🪨', baseHp: 75, baseAtk: 19, speed: 0.8, tier: 3, level: 29 },
  { id: 'm_gol_04', name: 'アイアンゴーレム', type: 'GOLEM', category: '巨兵族', color: '#747d8c', subColor: '#57606f', symbol: '⚙️', baseHp: 110, baseAtk: 25, speed: 0.78, tier: 4, level: 39 },
  { id: 'm_gol_05', name: 'ブロンズオートマタ', type: 'GOLEM', category: '巨兵族', color: '#e67e22', subColor: '#d35400', symbol: '🥉', baseHp: 150, baseAtk: 32, speed: 0.75, tier: 5, level: 49 },
  { id: 'm_gol_06', name: 'クリスタルゴーレム', type: 'GOLEM', category: '巨兵族', color: '#00d2d3', subColor: '#54a0ff', symbol: '💎', baseHp: 200, baseAtk: 39, speed: 0.72, tier: 6, level: 59 },
  { id: 'm_gol_07', name: 'マグマフォージゴーレム', type: 'GOLEM', category: '巨兵族', color: '#ee5253', subColor: '#ff9f43', symbol: '🌋', baseHp: 260, baseAtk: 47, speed: 0.7, tier: 7, level: 69 },
  { id: 'm_gol_08', name: 'ミスリルギガント', type: 'GOLEM', category: '巨兵族', color: '#c8d6e5', subColor: '#8395a7', symbol: '🛡️', baseHp: 330, baseAtk: 56, speed: 0.68, tier: 8, level: 79 },
  { id: 'm_gol_09', name: 'アダマンコロッサス', type: 'GOLEM', category: '巨兵族', color: '#576574', subColor: '#222f3e', symbol: '🗿', baseHp: 420, baseAtk: 67, speed: 0.65, tier: 9, level: 89 },
  { id: 'm_gol_10', name: '古代神機ティターン', type: 'GOLEM', category: '巨兵族', color: '#ffd700', subColor: '#ff4757', symbol: '👑', baseHp: 550, baseAtk: 80, speed: 0.62, tier: 10, level: 99 },

  // ----------------------------------------------------
  // 10. 魔導士・邪教徒（遠距離魔導弾・逃げ撃ちアウトレンジ）
  // ----------------------------------------------------
  { id: 'm_wiz_01', name: '見習いカルト術士', type: 'WIZARD', category: '魔導士族', color: '#3498db', subColor: '#2980b9', symbol: '🔮', baseHp: 14, baseAtk: 5, speed: 0.8, tier: 1, level: 10, isRanged: true },
  { id: 'm_wiz_02', name: '火炎術のパイロマンサー', type: 'WIZARD', category: '魔導士族', color: '#e74c3c', subColor: '#c0392b', symbol: '🔥', baseHp: 28, baseAtk: 16, speed: 0.78, tier: 2, level: 20, isRanged: true },
  { id: 'm_wiz_03', name: '氷結魔導士', type: 'WIZARD', category: '魔導士族', color: '#74b9ff', subColor: '#0984e3', symbol: '❄️', baseHp: 40, baseAtk: 21, speed: 0.75, tier: 3, level: 30, isRanged: true },
  { id: 'm_wiz_04', name: '雷光のソーサラー', type: 'WIZARD', category: '魔導士族', color: '#f1c40f', subColor: '#f39c12', symbol: '⚡', baseHp: 56, baseAtk: 27, speed: 0.72, tier: 4, level: 40, isRanged: true },
  { id: 'm_wiz_05', name: '死霊術師ネクロマンサー', type: 'WIZARD', category: '魔導士族', color: '#2ecc71', subColor: '#27ae60', symbol: '💀', baseHp: 75, baseAtk: 33, speed: 0.7, tier: 5, level: 50, isRanged: true },
  { id: 'm_wiz_06', name: '黒魔道士', type: 'WIZARD', category: '魔導士族', color: '#8e44ad', subColor: '#2c3e50', symbol: '🧙‍♂️', baseHp: 100, baseAtk: 40, speed: 0.68, tier: 6, level: 60, isRanged: true },
  { id: 'm_wiz_07', name: 'カルト大司教', type: 'WIZARD', category: '魔導士族', color: '#9b59b6', subColor: '#e74c3c', symbol: '📿', baseHp: 135, baseAtk: 48, speed: 0.65, tier: 7, level: 70, isRanged: true },
  { id: 'm_wiz_08', name: '深淵のアルケミスト', type: 'WIZARD', category: '魔導士族', color: '#00d2d3', subColor: '#10ac84', symbol: '🧪', baseHp: 180, baseAtk: 57, speed: 0.62, tier: 8, level: 80, isRanged: true },
  { id: 'm_wiz_09', name: '禁呪の大魔導リッチ', type: 'WIZARD', category: '魔導士族', color: '#5f27cd', subColor: '#341f97', symbol: '📜', baseHp: 240, baseAtk: 67, speed: 0.6, tier: 9, level: 90, isRanged: true },
  { id: 'm_wiz_10', name: '邪神の大預言者', type: 'WIZARD', category: '魔導士族', color: '#ff3838', subColor: '#2f3542', symbol: '👑', baseHp: 330, baseAtk: 80, speed: 0.58, tier: 10, level: 100, isRanged: true },
];
