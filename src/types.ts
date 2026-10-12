/**
 * 初代ドラゴンスレイヤー踏襲プロジェクトの全型定義
 * 型安全性を徹底し、any型の使用を禁止するための厳密なインターフェース群
 */

export const TILE_SIZE = 32; // 1マスの描画ピクセルサイズ
export const DUNGEON_WIDTH = 96; // 旧48×48比で4倍超の超広大マップ（96×96=9216マス）
export const DUNGEON_HEIGHT = 96; // 旧48×48比で4倍超の超広大マップ
export const CROWNS_REQUIRED_PER_FLOOR = 3; // 各フロアに必要なクラウン（王冠）の数

/** マップを構成するタイルの種類 */
export type TileType =
  | 'FLOOR'       // 通常床（歩行可能）
  | 'WALL'        // 破壊不能な外壁・硬質壁
  | 'BLOCK'       // 岩ブロック（押せない障害物・魔法攻撃で破壊可能）
  | 'HOME'        // （互換）旧拠点
  | 'SPRING'      // 回復の泉：踏むとHP回復し一度使うと消える聖なる泉
  | 'WATER'       // 通行不可能な水路
  | 'GRAVE'       // 墓石（モンスターハウスの不気味な障害物）
  | 'WARP';       // 空間跳躍のワープマス（特定場所またはランダム転移）

/** フィールド上に存在するアイテムの種類 */
export type ItemType =
  | 'CROWN'              // 王冠：3つ集めると即座にドラゴンの無敵結界を解除！
  | 'POWER_STONE'        // パワーストーン：拾った瞬間に攻撃力のみ上昇！
  | 'STAMINA_STONE'      // スタミナストーン：拾った瞬間に最大HP＆現在HPが上昇！
  | 'KEY'                // 宝箱を開ける鍵（ステージ持越し可能）
  | 'TREASURE'           // 財宝（即座に換金）
  | 'CHEST_BRONZE'       // 銅の宝箱（要鍵、ゴールドまたはスクロール）
  | 'CHEST_SILVER'       // 銀の宝箱（大量ゴールドまたは希少スクロール）
  | 'CHEST_GOLD'         // 金の宝箱（莫大ゴールドまたは最強スクロール）
  | 'TORCH'              // たいまつ：200ターンの間、視界が1.5倍に広がる
  | 'WEAPON'             // 武器：攻撃力大幅上昇（耐久度あり・3つまで所持可能・+3〜+30）
  | 'ARMOR'              // 防具：防御力上昇・被ダメ軽減（耐久度あり・3つまで所持可能）
  | 'REVIVE_POTION'      // 黄泉還りの秘薬：コンティニュー用超希少アイテム
  | 'RING'               // 力の指輪：移動・戦闘力向上
  | 'CROSS'              // 聖なる十字架：一定時間無敵化
  | 'POTION'             // 生命の霊薬：即座に最大HPの50%を割合回復
  | 'SPELL_BOOK'         // 魔導書（互換）
  | 'POWER_BRACELET'     // 剛力の腕輪（互換）
  | 'ARTIFACT_BAG'       // 次元の袋：スクロール・アイテム枠拡張
  | 'SCROLL_FIRE_BOLT'   // 火炎弾の巻物
  | 'SCROLL_HEAL_LIGHT'  // 聖光治癒の巻物
  | 'SCROLL_THUNDER_STRIKE' // 迅雷撃の巻物
  | 'SCROLL_THUNDER'     // 迅雷撃の巻物（エイリアス）
  | 'SCROLL_FROST_NOVA'  // 氷結波動の巻物
  | 'SCROLL_METEOR_SWARM' // 天変地異の巻物
  | 'SCROLL_METEOR'      // 天変地異の巻物（エイリアス）
  | 'SCROLL_RETURN_HOME' // 瞬動帰還の巻物
  | 'SCROLL_POWER'       // 剛力の巻物
  | 'SCROLL_RECOVERY'    // 大治癒の巻物
  | 'SCROLL_BLAST'       // 神鳴爆震の巻物
  | 'SCROLL_FREEZE'      // 絶対零度の巻物
  | 'SCROLL_CLAIRVOYANCE'; // 千里眼の巻物

/** 魔法の種類（スクロールと連動） */
export type SpellId =
  | 'FIRE_BOLT'
  | 'HEAL_LIGHT'
  | 'THUNDER_STRIKE'
  | 'FROST_NOVA'
  | 'METEOR_SWARM'
  | 'RETURN_HOME';

/** 魔法のマスター情報定義 */
export interface SpellDefinition {
  id: SpellId;
  name: string;
  description: string;
  mpCost: number; // 表示用または互換用（MP廃止環境では0）
  requiredLevel: number;
  icon: string;
  iconImg: string;
  keyShortcut: string;
}

/** スクロールの種類（宝箱から獲得してストック・使用する秘術の巻物） */
export type ScrollType =
  | 'SCROLL_FIRE_BOLT'
  | 'SCROLL_HEAL_LIGHT'
  | 'SCROLL_THUNDER_STRIKE'
  | 'SCROLL_THUNDER'
  | 'SCROLL_FROST_NOVA'
  | 'SCROLL_METEOR_SWARM'
  | 'SCROLL_METEOR'
  | 'SCROLL_RETURN_HOME'
  | 'SCROLL_POWER'
  | 'SCROLL_RECOVERY'
  | 'SCROLL_BLAST'
  | 'SCROLL_FREEZE'
  | 'SCROLL_CLAIRVOYANCE';

/** スクロールの定義 */
export interface ScrollDefinition {
  type: ScrollType;
  name: string;
  description: string;
  icon: string;
  iconImg?: string;
}

/** 魔法陣（魔物召喚ポータル） */
export interface MonsterPortal {
  id: string;
  x: number;
  y: number;
  quota: number; // 停止までに必要な討伐数（初期: 6体、王冠3個時: 12体）
  defeatedCount: number; // 現在の討伐数
  isActive: boolean; // 現在活性化しているか（敵を召喚中か）
  dormantTurns: number; // 沈黙後の経過ターン数
  maxDormantTurns: number; // 再活性化までの休眠ターン数（50ターン）
  spawnCooldown: number; // 次の召喚までのターン数
}

/** 主神からの加護（我が家でのみ購入可能・永続引き継ぎメタプログレッション） */
export type BlessingId =
  | 'BLESSING_ATK'       // 武神の剛腕（初期攻撃力強化）
  | 'BLESSING_HP'        // 生命樹の祝福（初期最大HP強化）
  | 'BLESSING_DEF'       // 金剛の神盾（初期防御力強化）
  | 'BLESSING_GOLD'      // 金運の神託（ゴールド獲得量UP）
  | 'BLESSING_SCROLL';   // 秘術伝承（各フロア開始時にランダム魔法巻物を追加獲得）

/** 加護情報 */
export interface BlessingInfo {
  id: BlessingId;
  name: string;
  description: string;
  icon: string;
  currentRank: number;
  maxRank: number;
  baseCost: number;
  costMultiplier: number;
}

/** モンスターの種類（10大系統） */
export type MonsterType =
  | 'SLIME'     // ゲル状原生生物系
  | 'GOBLIN'    // ゴブリン・蛮族系
  | 'SKELETON'  // スケルトン・アンデッド系
  | 'GHOST'     // 壁抜け霊体系
  | 'BEAST'     // 凶暴な野獣・魔獣系
  | 'INSECT'    // 巨大節足・昆虫系
  | 'REPTILE'   // リザードマン・竜人系
  | 'DEMON'     // 冥府の悪魔・魔神系
  | 'GOLEM'     // 岩石・金属の魔導巨兵系
  | 'WIZARD';   // 遠距離魔導・邪教徒系

/** 聖なる碑石（HOME）の個別チャージ状態 */
export interface HomeStoneState {
  id: string;
  x: number;
  y: number;
  chargeTurns: number; // 蓄積チャージ（0〜10）。1ターンにつき10%回復、10ターンで100%全快
}

/** 2次元座標 */
export interface Position {
  x: number;
  y: number;
}

/** 速度・向き */
export interface Direction {
  dx: number;
  dy: number;
}

/** 空間転移ワープマス定義 */
export interface WarpTile {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  isRandom?: boolean; // ランダム空間跳躍フラグ
  pairId?: string;    // ペアワープ識別子（相互接続・詰み防止用）
  name?: string;
}

/** 武器・防具の装備アイテムデータモデル */
export interface EquipmentItem {
  id: string;
  name: string;
  type: 'WEAPON' | 'ARMOR';
  bonus: number; // 武器: 攻撃力+% (+10〜+50%の10%刻み), 防具: 防御力+2〜+20
  durability: number; // 現在耐久度
  maxDurability: number; // 最大耐久度 (10〜100)
  icon: string; // 絵文字アイコン
  description: string;
}

/** 武器カタログ（ユーザー要求：攻撃力アップ値は+3刻みで+30まで、高い武器は超でにくく設定） */
export const WEAPON_CATALOG: Omit<EquipmentItem, 'id' | 'durability'>[] = [
  { name: '骨片のナイフ (+3)', type: 'WEAPON', bonus: 3, maxDurability: 15, icon: '🗡️', description: '研ぎ澄まされた骨片の小刀。攻撃力+3。' },
  { name: '錆びたショートソード (+6)', type: 'WEAPON', bonus: 6, maxDurability: 15, icon: '⚔️', description: '迷宮で拾った手頃な直剣。攻撃力+6。' },
  { name: 'スケルトンブレード (+9)', type: 'WEAPON', bonus: 9, maxDurability: 20, icon: '🗡️', description: '魔獣の骨格から削り出された骨剣。攻撃力+9。' },
  { name: '漆黒の魔剣 (+12)', type: 'WEAPON', bonus: 12, maxDurability: 20, icon: '⚔️', description: '闇の魔力が宿る漆黒の直剣。攻撃力+12。' },
  { name: '怨嗟の戦斧 (+15)', type: 'WEAPON', bonus: 15, maxDurability: 25, icon: '🪓', description: '怨霊が憑依した重力斧。攻撃力+15。' },
  { name: '業火の大剣 (+18)', type: 'WEAPON', bonus: 18, maxDurability: 25, icon: '🔥', description: '炎を纏う灼熱の大剣。攻撃力+18。' },
  { name: '覇王の骨槍 (+21)', type: 'WEAPON', bonus: 21, maxDurability: 25, icon: '🔱', description: '巨獣の脊椎から削り出された禍々しき長槍。攻撃力+21。' },
  { name: '竜殺しの剛剣 (+24)', type: 'WEAPON', bonus: 24, maxDurability: 30, icon: '🐉', description: 'ドラゴンの装甲をも両断する大剛剣。攻撃力+24。' },
  { name: '冥府の魔鎌 (+27)', type: 'WEAPON', bonus: 27, maxDurability: 30, icon: '☠️', description: '魂魄を刈り取る冥府の魔鎌。攻撃力+27。' },
  { name: '神滅の断罪剣 (+30)', type: 'WEAPON', bonus: 30, maxDurability: 30, icon: '👑', description: '神をも滅ぼす迷宮究極の断罪剣。攻撃力+30。' },
];

/** 防具カタログ（防御力+2〜+20、被ダメ軽減） */
export const ARMOR_CATALOG: Omit<EquipmentItem, 'id' | 'durability'>[] = [
  { name: 'レザーアーマー', type: 'ARMOR', bonus: 2, maxDurability: 15, icon: '🥋', description: '獣革を幾重にも重ねた動きやすい軽防具。' },
  { name: 'ブロンズメイル', type: 'ARMOR', bonus: 4, maxDurability: 15, icon: '🛡️', description: '青銅の環を細かく編み込んだ鎖帷子。' },
  { name: 'アイアンプレート', type: 'ARMOR', bonus: 6, maxDurability: 20, icon: '🛡️', description: '頑丈な鉄板で急所を保護する強固な甲冑。' },
  { name: 'ミスリルチェスト', type: 'ARMOR', bonus: 8, maxDurability: 20, icon: '✨', description: '驚くほど軽くダイヤモンドより硬い秘銀の鎧。' },
  { name: '竜鱗の甲冑', type: 'ARMOR', bonus: 10, maxDurability: 25, icon: '🐉', description: 'ドラゴンの剛鱗で仕立てられた熱線をも弾く重装甲冑。' },
  { name: '聖騎士の白銀鎧', type: 'ARMOR', bonus: 12, maxDurability: 25, icon: '🛡️', description: '邪悪な呪詛と物理衝撃を中和する聖騎士の鎧。' },
  { name: 'アテナの神聖鎧', type: 'ARMOR', bonus: 15, maxDurability: 30, icon: '⚜️', description: '戦神の祝福が宿り、敵の打撃を大幅に減衰させる。' },
  { name: '神域のイージスアーマー', type: 'ARMOR', bonus: 20, maxDurability: 30, icon: '👑', description: 'あらゆる攻撃を無力化する神域の最高峰防具。' },
];

/** 拾って運べるアイテム */
export interface FieldItem {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  value: number; // 強化値やコイン量
  equipmentData?: EquipmentItem; // 武器・防具の場合の個別ステータス
}

/** プレイヤーの保持する状態（スケルトン主人公） */
export interface PlayerState {
  x: number; // グリッドX座標
  y: number; // グリッドY座標
  renderX: number; // スムーズ描画用補間X
  renderY: number; // スムーズ描画用補間Y
  direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  isMoving: boolean;
  
  // 基本ステータス
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attackPower: number; // パワーストーンをHOMEに運ぶことで上昇
  defensePower: number;
  coins: number;
  gold: number; // 蓄積ゴールド（永続引き継ぎ）
  score: number;

  // レベルと経験値システム
  level: number;
  exp: number;
  nextExp: number;

  // 攻撃力・HPストーンの経験値蓄積システム（ユーザー要求：複数個で段階的に上昇）
  atkExp: number;
  nextAtkExp: number;
  hpExp: number;
  nextHpExp: number;

  // 装備スロットシステム（ユーザー要求：武器3枠、防具3枠、耐久度管理）
  equippedWeapon: EquipmentItem | null; // 装備中武器（1番左の装備枠）
  weaponStock: EquipmentItem[]; // 予備武器スタック（最大2個、合計3個まで所持可能）
  equippedArmor: EquipmentItem | null; // 装備中防具（1番左の装備枠）
  armorStock: EquipmentItem[]; // 予備防具スタック（最大2個、合計3個まで所持可能）

  // たいまつ効果タイマー（ユーザー要求：50ターンの間視界1.5倍）
  torchTimer: number;

  // コンティニュー用（ユーザー要求：アイテム制、ステージ毎に1回無料）
  revivePotionsCount: number; // 所持コンティニューアイテム（黄泉還りの秘薬）
  floorFreeReviveUsed: boolean; // 各ステージ1回無料コンティニュー使用済みフラグ

  // 魔法システム（画面下部スロットに並ぶ）
  unlockedSpells: SpellId[];
  selectedSpellId: SpellId;

  // 所持スクロール（一般荷物とは別枠、最大3本ストック）
  heldScrolls: ScrollType[];
  
  // 所持アイテム運搬スロット（初期3個、アーティファクトで最大10個まで拡張）
  carriedItems: FieldItem[];
  carryCapacity: number; // 現在の運搬枠上限（初期3、最大10）
  keysCount: number;
  hasRing: boolean;
  hasSpellBook: boolean;
  canPushBlocks: boolean; // 剛力の腕輪獲得でブロック押し可能
  
  // クラウン進行度
  crownsDelivered: number; // HOMEに届いたクラウンの数（3つでドラゴン討伐可能）
  
  // シールド・バフ
  shieldCharges: number; // 無敵シールドの残り回数（2〜5回ランダム獲得、被ダメ完全ブロックで1消費）
  spellStock: Record<SpellId, number>; // 魔法ごとの所持回数ストック
  spellPurchaseCounts?: Record<SpellId, number>; // 魔法ごとの累計購入回数（インフレ価格計算用）
  invincibleTimer: number; // （互換）一時的無敵タイマー
  atkBuffTimer: number; // 剛力の巻物の残りターン数
  freezeAllTimer: number; // 敵全体凍結の残りターン数
  homeRegenCooldown: number; // HOMEでの回復タイマー
  attackCooldown: number;
  spellCooldown: number;
}

/** モンスターエンティティ（100種超の個別パラメータを保持） */
export interface MonsterEntity {
  id: string;
  type: MonsterType;
  catalogId: string;
  name: string; // 和名（例: 「紅蓮のスライム」「深淵の暗黒騎士」等）
  color: string; // 固有メインカラー
  subColor: string; // 固有サブカラー
  x: number;
  y: number;
  renderX: number;
  renderY: number;
  direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  hp: number;
  maxHp: number;
  attackPower: number;
  defensePower: number;
  speed: number;
  moveTimer: number;
  carriedItem: FieldItem | null; // アイテムを持ち逃げする生態
  level: number; // 敵の現在レベル（ターン・討伐数で進行）
  isGhost?: boolean; // 壁すり抜け特性
  isRanged?: boolean; // 遠距離魔法攻撃特性
  rangedCooldown?: number; // 遠距離攻撃クールタイム（連続攻撃防止用）
  isPreemptive?: boolean; // 先制攻撃特性（接触時に先に攻撃してくる凶悪敵、頭上ATK赤色表示）
  isAdventurer?: boolean; // 冒険者一行（侵入者中ボス）特性
}

export type BossType = 'DRAGON' | 'SPIDER' | 'ANT' | 'LIZARD' | 'GOLEM';

/** ボスモンスター（2×2マスを占有する各フロアの守護巨獣） */
export interface DragonBoss {
  x: number; // 左上のグリッド座標
  y: number;
  renderX: number;
  renderY: number;
  size: 2; // 2×2マス
  hp: number;
  maxHp: number;
  attackPower: number;
  angerLevel: number;
  breathCooldown: number;
  isAwake: boolean;
  roamTimer: number;
  bossType: BossType;
  name: string;
  themeColor: string;
  subColor: string;
  eyeColor: string;
  specialSkillName: string;
}

/** 飛翔体（炎や魔法弾） */
export interface Projectile {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  damage: number;
  fromPlayer: boolean;
  lifetime: number;
  color: string;
  size: number;
}

/** 視覚演出用パーティクル */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
  text?: string;
}

/** 冒険者パーティ（中ボス侵略者）の役割 */
export type AdventurerRole = 'HERO' | 'WARRIOR' | 'MAGE' | 'CLERIC';

/** 冒険者エンティティ（1000ターンごとに侵略してくる中ボスパーティ、500ターン生存で撤退） */
export interface AdventurerEntity extends MonsterEntity {
  isAdventurer: true;
  role: AdventurerRole;
  turnsRemaining: number; // 残り滞在ターン数（初期500、0で迷宮から退却）
  initialTurns: number;
}

/** 世界樹の迷宮のFOE（Field On Enemy）のような罠的徘徊巨大エネミー */
export interface FoeEntity {
  id: string;
  name: string;
  x: number;
  y: number;
  renderX: number;
  renderY: number;
  size: 2; // 2×2マスの巨躯
  color: string;
  subColor: string;
  eyeColor: string;
  hp: number;
  maxHp: number;
  attackPower: number; // 倒せない超絶攻撃力
  defensePower: number;
  remainingTurns: number; // 消滅までのターン数
  maxTurns: number;
  roamCooldown: number;
}

/** フロア全体のダンジョン情報 */
export interface DungeonFloor {
  floorNumber: number;
  width: number;
  height: number;
  tiles: TileType[][]; // [y][x]
  homePos: Position; // 主たる帰還地点
  homeStones: HomeStoneState[]; // 複数配置された聖なる碑石の個別状態
  items: FieldItem[];
  monsters: MonsterEntity[];
  dragon: DragonBoss;
  exploredTiles: boolean[][]; // 探索済みの霧（Fog of War）
  portals: MonsterPortal[]; // 敵を召喚する魔法陣群
  warps: WarpTile[]; // ワープマス群
  adventurers: AdventurerEntity[]; // 襲来中の冒険者一行
  foe: FoeEntity | null; // 徘徊中の巨大FOEエネミー
  entryPlayerSnapshot?: PlayerState; // ステージ突入時のプレイヤーステータス（ステージ最初からやり直し時の完全復元用）
}

/** ゲーム全体の進行ステータス */
export type GameStatus =
  | 'TITLE'          // タイトル画面
  | 'PLAYING'        // 探索中
  | 'FLOOR_CLEARED'  // ドラゴン討伐・フロアクリア画面
  | 'ALL_CLEARED'    // 全10ステージ完全制覇・エンディング画面
  | 'GAME_OVER'      // 敗北
  | 'PAUSED';        // 一時停止

/** サウンド効果の種類 */
export type SoundEffectType =
  | 'STEP'
  | 'PUSH_BLOCK'
  | 'PICKUP_ITEM'
  | 'DELIVER_HOME'
  | 'POWER_UP'
  | 'PLAYER_ATTACK'
  | 'PLAYER_HIT'
  | 'MONSTER_DEFEAT'
  | 'DOOR_UNLOCK'
  | 'SPELL_CAST'
  | 'DRAGON_ROAR'
  | 'DRAGON_BREATH'
  | 'CROSS_ACTIVATE'
  | 'GAME_OVER'
  | 'VICTORY';

/** 全魔法のマスターデータリスト（スクロールと連動） */
export const SPELL_CATALOG: SpellDefinition[] = [
  {
    id: 'FIRE_BOLT',
    name: '火炎弾',
    description: '前方に直線的に飛ぶ火球を放ち、敵を焼き払い岩ブロックを破壊する（威力: 攻撃力×1.5）',
    mpCost: 0,
    requiredLevel: 1,
    icon: '🔥',
    iconImg: './icons/fire_bolt.svg',
    keyShortcut: '1',
  },
  {
    id: 'HEAL_LIGHT',
    name: '聖光治癒',
    description: '聖なる光で傷を癒し、HPを最大値の50%割合回復する',
    mpCost: 0,
    requiredLevel: 2,
    icon: '✨',
    iconImg: './icons/heal_light.svg',
    keyShortcut: '2',
  },
  {
    id: 'THUNDER_STRIKE',
    name: '迅雷撃',
    description: '前方の敵を貫通し岩ブロックを粉砕する激しい電撃（威力: 攻撃力×2.0）',
    mpCost: 0,
    requiredLevel: 3,
    icon: '⚡',
    iconImg: './icons/thunder_strike.svg',
    keyShortcut: '3',
  },
  {
    id: 'FROST_NOVA',
    name: '氷結波動',
    description: '周囲全方向の敵を凍結させ、ダメージを与え2ターン行動不能にする',
    mpCost: 0,
    requiredLevel: 4,
    icon: '❄️',
    iconImg: './icons/frost_nova.svg',
    keyShortcut: '4',
  },
  {
    id: 'METEOR_SWARM',
    name: '天変地異',
    description: '視界内のすべての敵とブロックに巨大な隕石群を降らせ壊滅的打撃を与える',
    mpCost: 0,
    requiredLevel: 5,
    icon: '☄️',
    iconImg: './icons/meteor_swarm.svg',
    keyShortcut: '5',
  },
  {
    id: 'RETURN_HOME',
    name: '空間跳躍',
    description: '迷宮内の安全な床へランダムに瞬間移動する（囲まれた時の緊急離脱）',
    mpCost: 0,
    requiredLevel: 6,
    icon: '🌀',
    iconImg: './icons/return_home.svg',
    keyShortcut: '6',
  },
];

/** 全スクロールのマスターデータリスト（宝箱から獲得可能な秘術の巻物全11種） */
export const SCROLL_CATALOG: Record<ScrollType, ScrollDefinition> = {
  SCROLL_FIRE_BOLT: {
    type: 'SCROLL_FIRE_BOLT',
    name: '火炎弾の巻物',
    description: '前方に貫通火球を放ち、敵を焼き払い岩ブロックを破壊する（攻撃力×1.5）',
    icon: '📜🔥',
    iconImg: './icons/fire_bolt.svg',
  },
  SCROLL_HEAL_LIGHT: {
    type: 'SCROLL_HEAL_LIGHT',
    name: '聖光治癒の巻物',
    description: '聖なる光でHPを最大値の50%割合回復する',
    icon: '📜✨',
    iconImg: './icons/heal_light.svg',
  },
  SCROLL_THUNDER: {
    type: 'SCROLL_THUNDER',
    name: '迅雷撃の巻物',
    description: '前方を貫通し岩ブロックを粉砕する迅雷（攻撃力×2.0）',
    icon: '📜⚡',
    iconImg: './icons/thunder_strike.svg',
  },
  SCROLL_THUNDER_STRIKE: {
    type: 'SCROLL_THUNDER_STRIKE',
    name: '迅雷撃の巻物',
    description: '前方を貫通し岩ブロックを粉砕する迅雷（攻撃力×2.5）',
    icon: '📜⚡',
    iconImg: './icons/thunder_strike.svg',
  },
  SCROLL_FROST_NOVA: {
    type: 'SCROLL_FROST_NOVA',
    name: '氷結波動の巻物',
    description: '周囲の敵を凍結させ、ダメージを与え2ターン行動不能にする',
    icon: '📜❄️',
    iconImg: './icons/frost_nova.svg',
  },
  SCROLL_METEOR: {
    type: 'SCROLL_METEOR',
    name: '天変地異の巻物',
    description: '視界内の全敵に巨大隕石群を降らせ壊滅的打撃を与える',
    icon: '📜☄️',
    iconImg: './icons/meteor_swarm.svg',
  },
  SCROLL_METEOR_SWARM: {
    type: 'SCROLL_METEOR_SWARM',
    name: '天変地異の巻物',
    description: '視界内の全敵に巨大隕石群を降らせ壊滅的打撃を与える',
    icon: '📜☄️',
    iconImg: './icons/meteor_swarm.svg',
  },
  SCROLL_RETURN_HOME: {
    type: 'SCROLL_RETURN_HOME',
    name: '空間跳躍の巻物',
    description: '迷宮内の安全な床へランダムに瞬間移動する',
    icon: '📜🌀',
    iconImg: './icons/return_home.svg',
  },
  SCROLL_POWER: {
    type: 'SCROLL_POWER',
    name: '剛力の巻物',
    description: '15ターンの間、攻撃力が2倍（+100%）に跳ね上がる',
    icon: '📜💪',
  },
  SCROLL_RECOVERY: {
    type: 'SCROLL_RECOVERY',
    name: '大治癒の巻物',
    description: '即座にHPが100%全快する',
    icon: '📜💖',
  },
  SCROLL_BLAST: {
    type: 'SCROLL_BLAST',
    name: '神鳴爆震の巻物',
    description: '自身から5マス以内の全敵・岩ブロックへ攻撃力の125%で超広範囲爆撃',
    icon: '📜💥',
  },
  SCROLL_FREEZE: {
    type: 'SCROLL_FREEZE',
    name: '絶対零度の巻物',
    description: '画面内のすべての敵を5ターンの間完全に凍結停止させる',
    icon: '📜❄️',
  },
  SCROLL_CLAIRVOYANCE: {
    type: 'SCROLL_CLAIRVOYANCE',
    name: '千里眼の巻物',
    description: 'フロア全域の全マップ・全アイテム・全魔物の位置を一瞬で全開示する',
    icon: '📜👁️',
  },
};

/** 主神からの加護マスターデータリスト（我が家でのみゴールドで購入可能・永続引き継ぎ） */
export const BLESSING_CATALOG: BlessingInfo[] = [
  {
    id: 'BLESSING_ATK',
    name: '武神の剛腕',
    description: '冒険開始時の基本攻撃力を +5 強化する',
    icon: '⚔️',
    currentRank: 0,
    maxRank: 10,
    baseCost: 200,
    costMultiplier: 1.6,
  },
  {
    id: 'BLESSING_HP',
    name: '生命樹の祝福',
    description: '冒険開始時の最大HPを +10 強化する',
    icon: '❤️',
    currentRank: 0,
    maxRank: 10,
    baseCost: 200,
    costMultiplier: 1.5,
  },
  {
    id: 'BLESSING_DEF',
    name: '金剛の神盾',
    description: '冒険開始時の基本防御力を +2 強化する',
    icon: '🛡️',
    currentRank: 0,
    maxRank: 10,
    baseCost: 200,
    costMultiplier: 1.6,
  },
  {
    id: 'BLESSING_GOLD',
    name: '金運の神託',
    description: '宝箱や敵から得られるゴールドが +20% 増加する',
    icon: '💰',
    currentRank: 0,
    maxRank: 5,
    baseCost: 300,
    costMultiplier: 2.0,
  },
  {
    id: 'BLESSING_SCROLL',
    name: '秘術伝承',
    description: '各フロア進入時にランダムな魔法の巻物を +1 個授かる',
    icon: '📜',
    currentRank: 0,
    maxRank: 5,
    baseCost: 400,
    costMultiplier: 1.8,
  },
];

/** 10ターン前やり直し用スナップショット（状態巻き戻しデータ） */
export interface GameStateSnapshot {
  turnCount: number;
  player: PlayerState;
  floor: DungeonFloor;
  globalHomeCharge: number;
}

