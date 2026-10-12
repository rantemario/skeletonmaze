/**
 * 初代ドラゴンスレイヤー・オマージュ ゲームエンジン
 * グリッド移動、ブロック押しパズル、アイテム運搬とHOME納品強化、
 * モンスターの生態系AI、2×2巨大ドラゴンの火炎ブレス戦闘を統括。
 */

import {
  TILE_SIZE,
  CROWNS_REQUIRED_PER_FLOOR,
  SPELL_CATALOG,
  BLESSING_CATALOG,
} from './types';
import type {
  DungeonFloor,
  PlayerState,
  MonsterEntity,
  DragonBoss,
  Projectile,
  Particle,
  GameStatus,
  FieldItem,
  MonsterPortal,
  SpellId,
  BlessingId,
  GameStateSnapshot,
  EquipmentItem,
  AdventurerEntity,
} from './types';
import { DungeonGenerator } from './map/dungeonGenerator';
import { SoundManager } from './audio/soundManager';
import { CanvasRenderer } from './renderer/canvasRenderer';
import { SaveManager } from './storage/saveManager';

export class GameEngine {
  public floor: DungeonFloor;
  public player: PlayerState;
  public projectiles: Projectile[] = [];
  public particles: Particle[] = [];
  public status: GameStatus = 'TITLE';

  public soundManager: SoundManager;
  public renderer: CanvasRenderer;

  public turnCount: number = 0;
  public killCount: number = 0;

  // 我が家（碑石）全拠点統一チャージ値（初期10、探索ターン経過で蓄積）
  public globalHomeCharge: number = 10;
  
  // ユーザー要求：ステージに来た時と同じ状況で再開するための突入時スナップショット
  public floorEntryPlayerSnapshot: PlayerState | null = null;
  // コンティニュー確認コールバック (無料枠残り: 1 or 0, 所持秘薬数)
  public onRevivePromptCallback?: (canFreeRevive: number, revivePotions: number) => void;
  // 10ターン前やり直し履歴スナップショット
  public historySnapshots: GameStateSnapshot[] = [];
  // ユーザー要求：全10ステージ制、各ステージの所要ターン数記録
  public floorTurnRecords: number[] = [];

  private messageLog: string[] = [];
  private onMessageCallback?: (msg: string) => void;
  private onStateChangeCallback?: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    miniMapCanvas: HTMLCanvasElement,
    soundManager: SoundManager
  ) {
    this.soundManager = soundManager;
    this.renderer = new CanvasRenderer(canvas, miniMapCanvas);

    // 初期フロア生成
    this.floor = DungeonGenerator.generateFloor(1);
    this.player = this.createInitialPlayerState(this.floor.homePos.x, this.floor.homePos.y);
    this.updateExploredArea(this.player.x, this.player.y);
  }

  /** 現在の敵レベルを取得（ターンの経過とうまいこと比例して徐々に強くなる） */
  public getEnemyLevel(): number {
    // ユーザー要求：敵の強さはターンの経過とうまいこと比例して強くなるようにする
    // ステージ開始直後は Lv.1 からスタート！
    // 40ターン経過するごとに +1 Lv
    const turnIncr = Math.floor(this.turnCount / 40);
    // 10体討伐ごとに +1 Lv
    const killIncr = Math.floor(this.killCount / 10);
    // 階層の基礎寄与は緩やかに（B1F: 0, B2F: +1, B3F: +2）
    const floorBase = Math.floor((this.floor.floorNumber - 1) * 0.8);
    const calculatedLv = Math.max(1, 1 + floorBase + turnIncr + killIncr);

    // 急激なインフレを防ぐフロア上限キャップ
    const maxCapForFloor = this.floor.floorNumber * 4 + 2;
    return Math.min(maxCapForFloor, calculatedLv);
  }

  /** メッセージログ登録 */
  public setMessageCallback(cb: (msg: string) => void): void {
    this.onMessageCallback = cb;
  }

  public setStateChangeCallback(cb: () => void): void {
    this.onStateChangeCallback = cb;
  }

  public setRevivePromptCallback(cb: (canFreeRevive: number, revivePotions: number) => void): void {
    this.onRevivePromptCallback = cb;
  }

  public logMessage(msg: string): void {
    this.messageLog.unshift(msg);
    if (this.messageLog.length > 30) this.messageLog.pop();
    if (this.onMessageCallback) {
      this.onMessageCallback(msg);
    }
  }

  /** 初期プレイヤーステータス生成（スケルトン主人公・主神の加護と蓄積ゴールドを自動反映） */
  private createInitialPlayerState(startX: number, startY: number): PlayerState {
    const save = SaveManager.getInstance();
    const atkBonus = save.getBlessingRank('BLESSING_ATK') * 2;
    const hpBonus = save.getBlessingRank('BLESSING_HP') * 10; // ユーザー要求：生命樹の祝福の上昇値を10に
    const defBonus = save.getBlessingRank('BLESSING_DEF') * 1;
    const scrollBonus = save.getBlessingRank('BLESSING_SCROLL');

    // ユーザー要求：攻撃力は5〜、HPは20程度からスタートにしてレベリングを重視
    const baseMaxHp = 20 + hpBonus;

    return {
      x: startX,
      y: startY,
      renderX: startX,
      renderY: startY,
      direction: 'DOWN',
      isMoving: false,
      hp: baseMaxHp,
      maxHp: baseMaxHp,
      mp: 0,
      maxMp: 0,
      attackPower: 5 + atkBonus,
      defensePower: 0 + defBonus,
      coins: 0,
      gold: save.getGold(),
      score: 0,

      // レベル・経験値（Lv.1から開始、敵を1〜2体倒せばすぐLv.2に成長）
      level: 1,
      exp: 0,
      nextExp: 20,

      // 攻撃力・HPストーンの経験値蓄積（複数個集めて段階的に上昇）
      atkExp: 0,
      nextAtkExp: 3,
      hpExp: 0,
      nextHpExp: 3,

      // 魔法（スクロール獲得で即座に使用可能・所持ストック制）
      unlockedSpells: ['FIRE_BOLT', 'HEAL_LIGHT'],
      selectedSpellId: 'FIRE_BOLT',
      spellStock: {
        FIRE_BOLT: 3 + scrollBonus,
        HEAL_LIGHT: 1 + scrollBonus,
        THUNDER_STRIKE: 0,
        FROST_NOVA: 0,
        METEOR_SWARM: 0,
        RETURN_HOME: 0,
      },
      // 魔法購入回数（インフレ価格用）
      spellPurchaseCounts: {
        FIRE_BOLT: 0,
        HEAL_LIGHT: 0,
        THUNDER_STRIKE: 0,
        FROST_NOVA: 0,
        METEOR_SWARM: 0,
        RETURN_HOME: 0,
      },

      // スクロール専用枠
      heldScrolls: ['SCROLL_FIRE_BOLT'],

      // 所持アイテム運搬スロット
      carriedItems: [],
      carryCapacity: 3,
      keysCount: 0, // 鍵は廃止
      hasRing: false,
      hasSpellBook: true,
      canPushBlocks: false, // ブロック押しは廃止
      crownsDelivered: 0,

      // 装備スロットシステム（ユーザー要求：武器3枠、防具3枠、耐久度管理）
      equippedWeapon: null,
      weaponStock: [],
      equippedArmor: null,
      armorStock: [],

      // たいまつ効果タイマー（50ターン視界1.5倍）
      torchTimer: 0,

      // コンティニュー用（ユーザー要求：アイテム制、ステージ毎に1回無料）
      revivePotionsCount: 0,
      floorFreeReviveUsed: false,

      // シールド・一時バフ
      shieldCharges: 0, // 無敵シールド残回数（十字架で2〜5回付与）
      invincibleTimer: 0,
      atkBuffTimer: 0,
      freezeAllTimer: 0,
      homeRegenCooldown: 0,
      attackCooldown: 0,
      spellCooldown: 0,
    };
  }

  /** ゲームスタート（最初から挑戦：スケルトンとして覚醒） */
  public startGame(): void {
    this.floor = DungeonGenerator.generateFloor(1);
    this.player = this.createInitialPlayerState(this.floor.homePos.x, this.floor.homePos.y);
    this.turnCount = 0;
    this.killCount = 0;
    this.floorTurnRecords = [];
    this.updateExploredArea(this.player.x, this.player.y);
    this.projectiles = [];
    this.particles = [];
    this.status = 'PLAYING';
    
    // ユーザー要求：ステージに来た時と同じ状況で再開するためスナップショットを記録
    this.floorEntryPlayerSnapshot = JSON.parse(JSON.stringify(this.player));

    this.soundManager.startBgm();
    this.logMessage('【目覚めしスケルトン】最底辺の白骨魔物として迷宮の片隅で目覚めた。巨獣を喰らい冒険者を屠り、最強の魔物へと成り上がれ！');
    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** ゲームオーバー時のリトライ（到達していたそのフロアから再開） */
  public retryGame(): void {
    const currentFloorNum = this.floor.floorNumber;
    this.floor = DungeonGenerator.generateFloor(currentFloorNum);
    if (this.floorEntryPlayerSnapshot) {
      this.player = JSON.parse(JSON.stringify(this.floorEntryPlayerSnapshot));
      this.player.x = this.floor.homePos.x;
      this.player.y = this.floor.homePos.y;
      this.player.renderX = this.floor.homePos.x;
      this.player.renderY = this.floor.homePos.y;
      this.player.floorFreeReviveUsed = false;
    } else {
      this.player = this.createInitialPlayerState(this.floor.homePos.x, this.floor.homePos.y);
    }
    this.turnCount = 0;
    this.killCount = 0;
    this.updateExploredArea(this.player.x, this.player.y);
    this.projectiles = [];
    this.particles = [];
    this.status = 'PLAYING';
    this.soundManager.startBgm();
    this.logMessage(`地下 ${currentFloorNum} 階より再起した！最強の魔物たる不滅の闘志で挑め！`);
    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** 次のフロアへ進む（装備・アイテム・秘薬・シールドを持ち越し、フロアを再生成） */
  public nextFloor(): void {
    const nextFloorNum = this.floor.floorNumber + 1;
    this.floor = DungeonGenerator.generateFloor(nextFloorNum);
    
    // 次フロアへ現在のステータス・装備・所持品を安全に引き継ぎ
    this.player.x = this.floor.homePos.x;
    this.player.y = this.floor.homePos.y;
    this.player.renderX = this.floor.homePos.x;
    this.player.renderY = this.floor.homePos.y;
    this.player.crownsDelivered = 0; // 各階王冠進行度はリセット
    this.player.floorFreeReviveUsed = false; // 各ステージ1回無料コンティニュー権利復活
    this.turnCount = 0;
    this.killCount = 0;
    this.updateExploredArea(this.player.x, this.player.y);
    this.projectiles = [];
    this.particles = [];
    this.status = 'PLAYING';

    // ユーザー要求：ステージに来た時と同じ状況で再開するためスナップショットを記録
    this.floorEntryPlayerSnapshot = JSON.parse(JSON.stringify(this.player));

    this.soundManager.startBgm();
    const shieldMsg = this.player.shieldCharges > 0 ? `（神盾: ${this.player.shieldCharges}回 持ち越し）` : '';
    this.logMessage(`地下 ${nextFloorNum} 階へ到達した！幾何学迷宮が広大化し、魔物と冒険者たちの脅威が増大する！${shieldMsg}`);
    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** プレイヤーの向きのみを変更（ユーザー要求：左下矢印は進まず向き変更専用、ターン消化なし） */
  public setPlayerDirection(dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'): void {
    if (this.status !== 'PLAYING') return;
    this.player.direction = dir;
    this.updateExploredArea(this.player.x, this.player.y);
    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** プレイヤーの移動指示 */
  public movePlayer(dx: number, dy: number): void {
    if (this.status !== 'PLAYING') return;

    // 向きの更新
    if (dx > 0) this.player.direction = 'RIGHT';
    else if (dx < 0) this.player.direction = 'LEFT';
    else if (dy > 0) this.player.direction = 'DOWN';
    else if (dy < 0) this.player.direction = 'UP';

    const targetX = this.player.x + dx;
    const targetY = this.player.y + dy;

    // マップ境界チェック（動的フロアサイズ対応）
    if (targetX < 0 || targetX >= this.floor.width || targetY < 0 || targetY >= this.floor.height) {
      return;
    }

    // 1. 敵との遭遇チェック（近接攻撃）
    const targetMonster = this.floor.monsters.find((m) => m.x === targetX && m.y === targetY);
    if (targetMonster) {
      this.playerAttackMonster(targetMonster);
      this.advanceTurn();
      return;
    }

    // 2. ドラゴン（2×2マス）との遭遇チェック
    const d = this.floor.dragon;
    if (
      targetX >= d.x &&
      targetX <= d.x + 1 &&
      targetY >= d.y &&
      targetY <= d.y + 1
    ) {
      this.playerAttackDragon(d);
      this.advanceTurn();
      return;
    }

    const targetTile = this.floor.tiles[targetY][targetX];

    // 3. 移動不能外壁・水路・墓石
    if (targetTile === 'WALL' || targetTile === 'WATER' || targetTile === 'GRAVE') {
      return;
    }

    // 4. 岩ブロック（BLOCK：押せない障害物、当たった時の赤文字も出さない）
    if (targetTile === 'BLOCK') {
      return;
    }

    // 5. 通常の移動
    this.executePlayerStep(targetX, targetY);
  }

  /** プレイヤーの1歩前進とマス上インタラクション */
  private executePlayerStep(newX: number, newY: number): void {
    this.player.x = newX;
    this.player.y = newY;
    this.soundManager.playSfx('STEP');

    // 探索視界の更新
    this.updateExploredArea(newX, newY);

    // ユーザー要求：回復の泉はHP最大時は取れないようにする（一度使うと消える）
    if (this.floor.tiles[newY]?.[newX] === 'SPRING') {
      if (this.player.hp < this.player.maxHp) {
        this.player.hp = this.player.maxHp;
        this.floor.tiles[newY][newX] = 'FLOOR'; // 一度使うと消える（枯れ果てる）
        this.soundManager.playSfx('POWER_UP');
        this.addSparkParticles(newX * TILE_SIZE + 16, newY * TILE_SIZE + 16, '#00ffff');
        this.addTextParticle(newX * TILE_SIZE, newY * TILE_SIZE, 'FOUNTAIN: HP FULL!', '#00ffff');
        this.logMessage('【回復の泉】澄み渡る霊泉の水を飲み干し、HPが全快した！（泉は枯れて消滅した）');
      } else {
        // HP最大時は消費せず温存
        this.logMessage('【回復の泉】HPは満全だ。霊泉の水を温存した。');
      }
    }

    // ユーザー要求：ワープマス（特定場所への移動、またはランダム転移。必ず戻ることができる）
    if (this.floor.tiles[newY]?.[newX] === 'WARP') {
      const warp = this.floor.warps?.find((w) => w.x === newX && w.y === newY);
      if (warp) {
        let destX = warp.targetX;
        let destY = warp.targetY;

        if (warp.isRandom || destX < 0 || destY < 0) {
          // ランダムワープ：孤立部屋以外の安全な通常床へ跳躍
          const safeTiles: { x: number; y: number }[] = [];
          for (let ty = 2; ty < this.floor.height - 2; ty++) {
            for (let tx = 2; tx < this.floor.width - 2; tx++) {
              if (this.floor.tiles[ty][tx] === 'FLOOR' && (tx !== newX || ty !== newY)) {
                safeTiles.push({ x: tx, y: ty });
              }
            }
          }
          if (safeTiles.length > 0) {
            const dest = safeTiles[Math.floor(Math.random() * safeTiles.length)];
            destX = dest.x;
            destY = dest.y;
          }
        }

        if (destX >= 0 && destY >= 0) {
          this.soundManager.playSfx('SPELL_CAST');
          this.addSparkParticles(newX * TILE_SIZE + 16, newY * TILE_SIZE + 16, '#00ffff');
          this.player.x = destX;
          this.player.y = destY;
          this.player.renderX = destX;
          this.player.renderY = destY;
          this.updateExploredArea(destX, destY);
          this.addSparkParticles(destX * TILE_SIZE + 16, destY * TILE_SIZE + 16, '#9b59b6');
          this.addTextParticle(destX * TILE_SIZE, destY * TILE_SIZE, 'WARP!!', '#00ffff');
          const warpName = warp.name || (warp.isRandom ? '混沌のランダム跳躍陣' : '空間転移陣');
          this.logMessage(`【空間転移】${warpName}を踏み、異空間を跳躍した！`);
          newX = destX;
          newY = destY;
        }
      }
    }

    // アイテムの拾得判定（同一マスにある全アイテムを1回で一括取得！）
    const itemsAtPos = this.floor.items.filter((it) => it.x === newX && it.y === newY);
    for (const item of itemsAtPos) {
      const idx = this.floor.items.indexOf(item);
      if (idx !== -1) {
        this.pickupItem(idx);
      }
    }

    // 1歩前進の行動完了によりターン経過
    this.advanceTurn();
  }

  /** パワーストーン・スタミナストーンの確率EXP獲得値（1: 80%, 2: 15%, 3: 5%） */
  private rollStoneGain(): number {
    const r = Math.random();
    if (r < 0.80) return 1; // 80%
    if (r < 0.95) return 2; // 15%
    return 3;               // 5%
  }

  /** スタミナストーンによる最大HP成長上昇率（ユーザー要求: 1: 70%, 2: 20%, 3: 5%, 4: 3%, 5: 2%） */
  private rollMaxHpGain(): number {
    const r = Math.random();
    if (r < 0.70) return 1; // 70%
    if (r < 0.90) return 2; // 20%
    if (r < 0.95) return 3; // 5%
    if (r < 0.98) return 4; // 3%
    return 5;               // 2%
  }

  /** 魔法の所持数ストック獲得（アイコン付き演出・レベル制限なし即時使用可能） */
  public obtainSpellStock(spellId: SpellId, count: number = 1): void {
    const spellDef = SPELL_CATALOG.find((s) => s.id === spellId);
    if (!spellDef) return;

    this.player.spellStock[spellId] = (this.player.spellStock[spellId] || 0) + count;
    if (!this.player.unlockedSpells.includes(spellId)) {
      this.player.unlockedSpells.push(spellId);
    }

    const currentCount = this.player.spellStock[spellId];
    this.soundManager.playSfx('POWER_UP');
    this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#9b59b6');
    this.addTextParticle(
      this.player.x * TILE_SIZE,
      this.player.y * TILE_SIZE,
      `${spellDef.icon} +${count} ${spellDef.name}!`,
      '#a55eea'
    );
    this.logMessage(
      `【秘術獲得】${spellDef.icon}『${spellDef.name}』の巻物を手に入れた！（所持: ${currentCount}回分、レベル不問で即座に使用可能）`
    );
  }

  /** アイテム拾得（同一マスの一括取得から呼び出される） */
  private pickupItem(index: number): void {
    const item = this.floor.items[index];
    if (!item) return;

    switch (item.type) {
      case 'REVIVE_POTION': {
        // ユーザー要求：コンティニュー用アイテム（ごくまれに拾える超希少品）
        this.floor.items.splice(index, 1);
        this.player.revivePotionsCount = (this.player.revivePotionsCount || 0) + 1;
        this.soundManager.playSfx('POWER_UP');
        this.addSparkParticles(item.x * TILE_SIZE + 16, item.y * TILE_SIZE + 16, '#e056fd');
        this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, 'REVIVE POTION +1!', '#e056fd');
        this.logMessage(`【黄泉還りの秘薬】死の淵から蘇る霊薬を手に入れた！（所持秘薬: ${this.player.revivePotionsCount}個）`);
        break;
      }

      case 'KEY':
        // 鍵は廃止されたためゴールドに自動変換
        this.floor.items.splice(index, 1);
        this.player.gold += 50;
        this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, '+50 G (KEY CONV)', '#f1c40f');
        break;

      case 'POTION': {
        // 生命の霊薬は最大HPの50%割合回復
        const healAmount = Math.ceil(this.player.maxHp * 0.5);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmount);
        this.floor.items.splice(index, 1);
        this.soundManager.playSfx('PICKUP_ITEM');
        this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, `+${healAmount} HP (50%)`, '#2ecc71');
        this.logMessage(`【生命の霊薬】霊薬を飲み、最大体力の50%（+${healAmount} HP）が回復した！`);
        break;
      }

      case 'CHEST_BRONZE':
      case 'CHEST_SILVER':
      case 'CHEST_GOLD': {
        // ユーザー要求：鍵の概念をなくし、宝箱は鍵なしで直接開けられる
        this.floor.items.splice(index, 1);
        this.soundManager.playSfx('POWER_UP');
        this.addSparkParticles(item.x * TILE_SIZE + 16, item.y * TILE_SIZE + 16, '#ffd700');

        // 宝箱の中身：魔法スクロールかゴールドか（スクロールは約35%確率）
        const roll = Math.random();
        if (roll < 0.35) {
          // 全6種魔法からランダムに獲得
          const allSpells = SPELL_CATALOG;
          const chosenSpell = allSpells[Math.floor(Math.random() * allSpells.length)];
          this.obtainSpellStock(chosenSpell.id, 1);
        } else {
          // ゴールド獲得
          let baseGold = 100;
          let chestName = '銅の宝箱';
          if (item.type === 'CHEST_SILVER') {
            baseGold = 200;
            chestName = '銀の宝箱';
          } else if (item.type === 'CHEST_GOLD') {
            baseGold = 500;
            chestName = '金の宝箱';
          }

          const save = SaveManager.getInstance();
          const goldBonus = 1 + save.getBlessingRank('BLESSING_GOLD') * 0.2;
          const gainedGold = Math.floor(baseGold * goldBonus);

          save.addGold(gainedGold);
          this.player.gold = save.getGold();
          this.player.score += gainedGold * 5;

          this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, `+${gainedGold} GOLD!`, '#f1c40f');
          this.logMessage(
            `【宝箱解錠】『${chestName}』を開けた！${gainedGold} ゴールドを獲得！（累積所持金: ${this.player.gold} G）`
          );
        }
        break;
      }

      case 'CROWN': {
        // 王冠はその場で効果を発動（家に持って帰らなくてよい）
        this.player.crownsDelivered++;
        this.floor.items.splice(index, 1);
        this.soundManager.playSfx('DELIVER_HOME');
        this.renderer.triggerScreenShake(8);
        this.addSparkParticles(item.x * TILE_SIZE + 16, item.y * TILE_SIZE + 16, '#ffd700');
        this.addTextParticle(
          item.x * TILE_SIZE,
          item.y * TILE_SIZE,
          `CROWN GET! (${this.player.crownsDelivered}/${CROWNS_REQUIRED_PER_FLOOR})`,
          '#ffd700'
        );
        this.logMessage(`【神の王冠】王冠を手に入れた！（${this.player.crownsDelivered}/${CROWNS_REQUIRED_PER_FLOOR}）`);

        if (this.player.crownsDelivered >= CROWNS_REQUIRED_PER_FLOOR) {
          this.logMessage('【神託】3つの王冠が揃った！ドラゴンの無敵結界が完全に崩壊した！');
          this.wakeUpDragon();

          // 魔法陣が再度活発化し、敵が倍の数出現可能に！
          for (const portal of this.floor.portals) {
            portal.isActive = true;
            portal.quota = portal.quota * 2; // ノルマ倍増
            portal.defeatedCount = 0;
            portal.dormantTurns = 0;
          }
          this.logMessage('【禍々しき予兆】王冠の霊気により封印の魔法陣が再活性化！倍の魔物が召喚される！');
        }
        break;
      }

      case 'POWER_STONE': {
        // ユーザー要求：経験式にして1個ですぐ上がるわけではなく、複数集めて段階的に上昇
        this.floor.items.splice(index, 1);
        const expGain = this.rollStoneGain();
        this.player.atkExp = (this.player.atkExp || 0) + expGain;
        this.player.nextAtkExp = this.player.nextAtkExp || 3;
        this.player.score += 150;

        let atkUpCount = 0;
        while (this.player.atkExp >= this.player.nextAtkExp) {
          this.player.atkExp -= this.player.nextAtkExp;
          this.player.attackPower += 1;
          this.player.nextAtkExp = Math.max(3, Math.floor(this.player.nextAtkExp + 1));
          atkUpCount++;
        }

        if (atkUpCount > 0) {
          this.soundManager.playSfx('POWER_UP');
          this.addSparkParticles(item.x * TILE_SIZE + 16, item.y * TILE_SIZE + 16, '#ff4757');
          this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, `⚔️ ATK +${atkUpCount}!`, '#ff4757');
          this.logMessage(`【剛力の覚醒】パワーストーンの力が凝縮した！攻撃力 +${atkUpCount} 上昇！（現在攻撃力: ${this.player.attackPower}）`);
        } else {
          this.soundManager.playSfx('PICKUP_ITEM');
          const critText = expGain === 3 ? ' (CRIT!)' : '';
          this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, `+${expGain} ATK EXP${critText}`, '#ff6b81');
          this.logMessage(`【剛力の石】パワーストーンを吸収した（+${expGain} EXP、次ATK上昇まで: ${this.player.atkExp}/${this.player.nextAtkExp}）`);
        }
        break;
      }

      case 'STAMINA_STONE': {
        // ユーザー要求：経験式にして1個ですぐ上がるわけではなく、複数集めて段階的に上昇
        this.floor.items.splice(index, 1);
        const expGain = this.rollStoneGain();
        this.player.hpExp = (this.player.hpExp || 0) + expGain;
        this.player.nextHpExp = this.player.nextHpExp || 3;
        this.player.score += 150;

        let hpUpAmount = 0;
        while (this.player.hpExp >= this.player.nextHpExp) {
          this.player.hpExp -= this.player.nextHpExp;
          const gainedHp = this.rollMaxHpGain();
          this.player.maxHp += gainedHp;
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + gainedHp);
          this.player.nextHpExp = Math.max(3, Math.floor(this.player.nextHpExp + 1));
          hpUpAmount += gainedHp;
        }

        if (hpUpAmount > 0) {
          this.soundManager.playSfx('POWER_UP');
          this.addSparkParticles(item.x * TILE_SIZE + 16, item.y * TILE_SIZE + 16, '#2ed573');
          this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, `❤️ MAX HP +${hpUpAmount}!`, '#2ed573');
          this.logMessage(`【生命の覚醒】スタミナストーンの力が溢れた！最大HP +${hpUpAmount} 上昇！（現在HP: ${this.player.hp}/${this.player.maxHp}）`);
        } else {
          this.soundManager.playSfx('PICKUP_ITEM');
          const critText = expGain === 3 ? ' (CRIT!)' : '';
          this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, `+${expGain} HP EXP${critText}`, '#7bed9f');
          this.logMessage(`【生命の石】スタミナストーンを吸収した（+${expGain} EXP、次HP上昇まで: ${this.player.hpExp}/${this.player.nextHpExp}）`);
        }
        break;
      }

      case 'TREASURE': {
        // 財宝はその場でゴールド換金！
        this.floor.items.splice(index, 1);
        const coinGain = 100;
        const scoreGain = 1000;
        const save = SaveManager.getInstance();
        save.addGold(coinGain);
        this.player.gold = save.getGold();
        this.player.score += scoreGain;

        this.soundManager.playSfx('POWER_UP');
        this.addSparkParticles(item.x * TILE_SIZE + 16, item.y * TILE_SIZE + 16, '#f1c40f');
        this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, `+${coinGain} G!`, '#f1c40f');
        this.logMessage(`【財宝発見】古代の財宝を発見！+${coinGain} ゴールド、+${scoreGain} スコアを獲得！`);
        break;
      }

      case 'RING':
        this.player.hasRing = true;
        this.player.attackPower += 3;
        this.floor.items.splice(index, 1);
        this.soundManager.playSfx('PICKUP_ITEM');
        this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, 'RING OF POWER!', '#e74c3c');
        this.logMessage('力の指輪を装備した！攻撃力+3。');
        break;

      case 'CROSS': {
        // ユーザー要求：シールドはターン数ではなく、敵のダメージを防ぐ無敵のシールドにする（2〜5回ランダムで取得、加算）
        const addedCharges = Math.floor(Math.random() * 4) + 2; // 2〜5回
        this.player.shieldCharges = (this.player.shieldCharges || 0) + addedCharges;
        this.floor.items.splice(index, 1);
        this.soundManager.playSfx('CROSS_ACTIVATE');
        this.addSparkParticles(item.x * TILE_SIZE + 16, item.y * TILE_SIZE + 16, '#00ffff');
        this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, `🛡️ SHIELD +${addedCharges}!`, '#00ffff');
        this.logMessage(`【聖なる神盾】無敵シールドを +${addedCharges} 回獲得した！（合計: ${this.player.shieldCharges}回、敵の被ダメージを完全ブロック）`);
        break;
      }

      case 'ARTIFACT_BAG': {
        this.floor.items.splice(index, 1);
        this.soundManager.playSfx('POWER_UP');
        if (this.player.carryCapacity < 10) {
          this.player.carryCapacity = Math.min(10, this.player.carryCapacity + 1);
          this.addTextParticle(
            item.x * TILE_SIZE,
            item.y * TILE_SIZE,
            `BAG EXPANDED! (${this.player.carryCapacity}/10)`,
            '#00ffcc'
          );
          this.logMessage(
            `【秘宝獲得】次元の袋を手に入れた！運搬可能枠が拡張された（現在: 最大${this.player.carryCapacity}/10個）！`
          );
        } else {
          this.player.gold += 100;
          this.player.score += 500;
          this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, '+100 G (MAX)', '#f1c40f');
          this.logMessage('【秘宝獲得】次元の袋（上限）を獲得！100ゴールドを得た！');
        }
        break;
      }

      case 'TORCH': {
        this.floor.items.splice(index, 1);
        this.player.torchTimer = (this.player.torchTimer || 0) + 200;
        this.soundManager.playSfx('POWER_UP');
        this.addSparkParticles(item.x * TILE_SIZE + 16, item.y * TILE_SIZE + 16, '#f39c12');
        this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, 'TORCH LIT! (200 TURNS)', '#f39c12');
        this.logMessage(`【たいまつ】たいまつに火を灯した！200ターンの間、視界が1.5倍に広がる！（残り: ${this.player.torchTimer}ターン）`);
        break;
      }

      case 'WEAPON': {
        const weaponData = item.equipmentData || DungeonGenerator.generateRandomWeapon();
        this.floor.items.splice(index, 1);
        this.soundManager.playSfx('POWER_UP');
        this.addSparkParticles(item.x * TILE_SIZE + 16, item.y * TILE_SIZE + 16, '#ff4757');

        // 装備枠が空なら即装備！
        if (!this.player.equippedWeapon) {
          this.player.equippedWeapon = weaponData;
          this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, `⚔️ ${weaponData.name} 装備!`, '#ff4757');
          this.logMessage(`【武器装備】『${weaponData.name}』を装備した！（攻撃力 +${weaponData.bonus}%、耐久度: ${weaponData.durability}/${weaponData.maxDurability}）`);
        } else if (this.player.weaponStock.length < 2) {
          this.player.weaponStock.push(weaponData);
          this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, `⚔️ ${weaponData.name} 獲得!`, '#ffa502');
          this.logMessage(`【武器獲得】『${weaponData.name}』を予備ストックに収めた！（攻撃力 +${weaponData.bonus}%、耐久度: ${weaponData.durability}）`);
        } else {
          // 武器枠が満杯（装備1+予備2=3個）
          this.logMessage(`【武器満杯】武器の所持上限（3個）に達しているため、持ちきれなかった。`);
          this.floor.items.splice(index, 0, item);
          return;
        }
        break;
      }

      case 'ARMOR': {
        const armorData = item.equipmentData || DungeonGenerator.generateRandomArmor();
        this.floor.items.splice(index, 1);
        this.soundManager.playSfx('POWER_UP');
        this.addSparkParticles(item.x * TILE_SIZE + 16, item.y * TILE_SIZE + 16, '#2ed573');

        // 装備枠が空なら即装備！
        if (!this.player.equippedArmor) {
          this.player.equippedArmor = armorData;
          this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, `🛡️ ${armorData.name} 装備!`, '#2ed573');
          this.logMessage(`【防具装備】『${armorData.name}』を装備した！（防御力 +${armorData.bonus}、耐久度: ${armorData.durability}/${armorData.maxDurability}）`);
        } else if (this.player.armorStock.length < 2) {
          this.player.armorStock.push(armorData);
          this.addTextParticle(item.x * TILE_SIZE, item.y * TILE_SIZE, `🛡️ ${armorData.name} 獲得!`, '#2ecc71');
          this.logMessage(`【防具獲得】『${armorData.name}』を予備ストックに収めた！（防御力 +${armorData.bonus}、耐久度: ${armorData.durability}）`);
        } else {
          // 防具枠が満杯（装備1+予備2=3個）
          this.logMessage(`【防具満杯】防具の所持上限（3個）に達しているため、持ちきれなかった。`);
          this.floor.items.splice(index, 0, item);
          return;
        }
        break;
      }

      default: {
        // スクロール系アイテムの直接拾得
        if (item.type.startsWith('SCROLL_')) {
          this.floor.items.splice(index, 1);
          let matchedSpell: SpellId = 'FIRE_BOLT';
          if (item.type.includes('HEAL') || item.type.includes('RECOVERY')) matchedSpell = 'HEAL_LIGHT';
          else if (item.type.includes('THUNDER') || item.type.includes('BLAST')) matchedSpell = 'THUNDER_STRIKE';
          else if (item.type.includes('FROST') || item.type.includes('FREEZE')) matchedSpell = 'FROST_NOVA';
          else if (item.type.includes('METEOR')) matchedSpell = 'METEOR_SWARM';
          else if (item.type.includes('RETURN')) matchedSpell = 'RETURN_HOME';

          this.obtainSpellStock(matchedSpell, 1);
        }
        break;
      }
    }
  }

  /** アイテム和名取得 */
  private getItemName(type: FieldItem['type']): string {
    switch (type) {
      case 'CROWN': return 'クラウン（王冠）';
      case 'POWER_STONE': return 'パワーストーン';
      case 'STAMINA_STONE': return 'スタミナストーン';
      case 'TREASURE': return '財宝';
      case 'CHEST_BRONZE': return '銅の宝箱';
      case 'CHEST_SILVER': return '銀の宝箱';
      case 'CHEST_GOLD': return '金の宝箱';
      case 'KEY': return '鍵';
      case 'RING': return '指輪';
      case 'CROSS': return '十字架';
      case 'POTION': return '生命の霊薬';
      case 'SPELL_BOOK': return '魔導書';
      case 'ARTIFACT_BAG': return '次元の袋';
      case 'POWER_BRACELET': return '剛力の腕輪';
      case 'SCROLL_POWER': return '剛力の巻物';
      case 'SCROLL_RECOVERY': return '大治癒の巻物';
      case 'SCROLL_BLAST': return '神鳴爆震の巻物';
      case 'SCROLL_FREEZE': return '絶対零度の巻物';
      case 'SCROLL_CLAIRVOYANCE': return '千里眼の巻物';
      default: return 'アイテム';
    }
  }

  /** ボス覚醒 */
  private wakeUpDragon(): void {
    if (!this.floor.dragon.isAwake) {
      this.floor.dragon.isAwake = true;
      this.floor.dragon.angerLevel = 1;
      this.soundManager.playSfx('DRAGON_ROAR');
      this.logMessage(`【警戒】地響きと共に${this.floor.dragon.name}が目覚めた！${this.floor.dragon.specialSkillName}に警戒せよ！`);
    }
  }

  /** 実効攻撃力の取得（ユーザー要求：武器の攻撃力アップ値 +3〜+30 を加算） */
  public getEffectiveAttackPower(): number {
    let base = this.player.attackPower;
    if (this.player.equippedWeapon) {
      base += this.player.equippedWeapon.bonus;
    }
    return this.player.atkBuffTimer > 0 ? base * 2 : base;
  }

  /** 実効防御力の取得（装備防具ボーナスを加味） */
  public getEffectiveDefensePower(): number {
    const armorBonus = this.player.equippedArmor ? this.player.equippedArmor.bonus : 0;
    return (this.player.defensePower || 0) + armorBonus;
  }

  /** 武器の装備切り替え（ストックの武器と装備枠を交換） */
  public equipWeapon(stockIndex: number): void {
    if (stockIndex < 0 || stockIndex >= this.player.weaponStock.length) return;
    const targetWeapon = this.player.weaponStock[stockIndex];
    const currentWeapon = this.player.equippedWeapon;

    this.player.equippedWeapon = targetWeapon;
    if (currentWeapon) {
      this.player.weaponStock[stockIndex] = currentWeapon;
    } else {
      this.player.weaponStock.splice(stockIndex, 1);
    }

    this.soundManager.playSfx('PICKUP_ITEM');
    this.logMessage(`【装備変更】武器『${targetWeapon.name}』を装備した！（攻撃力 +${targetWeapon.bonus}%、耐久度: ${targetWeapon.durability}/${targetWeapon.maxDurability}）`);
    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** 防具の装備切り替え（ストックの防具と装備枠を交換） */
  public equipArmor(stockIndex: number): void {
    if (stockIndex < 0 || stockIndex >= this.player.armorStock.length) return;
    const targetArmor = this.player.armorStock[stockIndex];
    const currentArmor = this.player.equippedArmor;

    this.player.equippedArmor = targetArmor;
    if (currentArmor) {
      this.player.armorStock[stockIndex] = currentArmor;
    } else {
      this.player.armorStock.splice(stockIndex, 1);
    }

    this.soundManager.playSfx('PICKUP_ITEM');
    this.logMessage(`【装備変更】防具『${targetArmor.name}』を装備した！（防御力 +${targetArmor.bonus}、耐久度: ${targetArmor.durability}/${targetArmor.maxDurability}）`);
    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** 装備中武器の破棄（ユーザー要求：捨てるコマンド、確認不要） */
  public discardEquippedWeapon(): void {
    const w = this.player.equippedWeapon;
    if (!w) return;
    this.player.equippedWeapon = null;
    this.soundManager.playSfx('PICKUP_ITEM');
    this.logMessage(`【破棄】装備中の武器『${w.name}』を捨てた。`);
    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** 予備ストック武器の破棄 */
  public discardStockWeapon(stockIndex: number): void {
    if (stockIndex < 0 || stockIndex >= this.player.weaponStock.length) return;
    const w = this.player.weaponStock.splice(stockIndex, 1)[0];
    this.soundManager.playSfx('PICKUP_ITEM');
    this.logMessage(`【破棄】予備の武器『${w.name}』を捨てた。`);
    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** 装備中防具の破棄 */
  public discardEquippedArmor(): void {
    const a = this.player.equippedArmor;
    if (!a) return;
    this.player.equippedArmor = null;
    this.soundManager.playSfx('PICKUP_ITEM');
    this.logMessage(`【破棄】装備中の防具『${a.name}』を捨てた。`);
    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** 予備ストック防具の破棄 */
  public discardStockArmor(stockIndex: number): void {
    if (stockIndex < 0 || stockIndex >= this.player.armorStock.length) return;
    const a = this.player.armorStock.splice(stockIndex, 1)[0];
    this.soundManager.playSfx('PICKUP_ITEM');
    this.logMessage(`【破棄】予備の防具『${a.name}』を捨てた。`);
    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** 攻撃時の武器耐久度消費 */
  public consumeWeaponDurability(): void {
    const w = this.player.equippedWeapon;
    if (!w) return;

    w.durability--;
    if (w.durability <= 0) {
      this.soundManager.playSfx('MONSTER_DEFEAT');
      this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, 'WEAPON BROKEN!', '#ff4757');
      this.logMessage(`【破損】激しい打撃により武器『${w.name}』が粉々に壊れた！`);
      if (this.player.weaponStock.length > 0) {
        const nextWpn = this.player.weaponStock.shift()!;
        this.player.equippedWeapon = nextWpn;
        this.logMessage(`【自動換装】予備の『${nextWpn.name}』を装備した！`);
      } else {
        this.player.equippedWeapon = null;
      }
    }
  }

  /** 被ダメージ時の防具耐久度消費 */
  public consumeArmorDurability(): void {
    const a = this.player.equippedArmor;
    if (!a) return;

    a.durability--;
    if (a.durability <= 0) {
      this.soundManager.playSfx('MONSTER_DEFEAT');
      this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, 'ARMOR BROKEN!', '#ff4757');
      this.logMessage(`【破損】激戦の衝撃で防具『${a.name}』が粉々に壊れた！`);
      if (this.player.armorStock.length > 0) {
        const nextArm = this.player.armorStock.shift()!;
        this.player.equippedArmor = nextArm;
        this.logMessage(`【自動換装】予備の『${nextArm.name}』を装備した！`);
      } else {
        this.player.equippedArmor = null;
      }
    }
  }

  /** 主神の祭壇での装備修理（全武器・防具の耐久度を完全修復） */
  public repairEquipment(): boolean {
    const save = SaveManager.getInstance();
    const currentGold = save.getGold();

    // 修理が必要な装備があるか集計
    let damagedCount = 0;
    const allItems: EquipmentItem[] = [];
    if (this.player.equippedWeapon) allItems.push(this.player.equippedWeapon);
    allItems.push(...this.player.weaponStock);
    if (this.player.equippedArmor) allItems.push(this.player.equippedArmor);
    allItems.push(...this.player.armorStock);

    for (const item of allItems) {
      if (item.durability < item.maxDurability) damagedCount++;
    }

    if (damagedCount === 0) {
      this.logMessage('すべての装備は完璧な状態です。修復の必要はありません。');
      return false;
    }

    const cost = 100;
    if (currentGold < cost) {
      this.logMessage(`ゴールドが不足しています！（必要: ${cost} G、所持: ${currentGold} G）`);
      return false;
    }

    save.addGold(-cost);
    this.player.gold = save.getGold();

    for (const item of allItems) {
      item.durability = item.maxDurability;
    }

    this.soundManager.playSfx('POWER_UP');
    this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#00ffff');
    this.logMessage(`【神の鍛冶】100ゴールドを捧げ、すべての武器・防具の耐久度を完全修復した！（残金: ${this.player.gold} G）`);
    if (this.onStateChangeCallback) this.onStateChangeCallback();
    return true;
  }

  /** プレイヤーの通常近接攻撃 */
  public playerAttack(): void {
    if (this.status !== 'PLAYING') return;

    let targetX = this.player.x;
    let targetY = this.player.y;
    if (this.player.direction === 'UP') targetY--;
    else if (this.player.direction === 'DOWN') targetY++;
    else if (this.player.direction === 'LEFT') targetX--;
    else if (this.player.direction === 'RIGHT') targetX++;

    const monster = this.floor.monsters.find((m) => m.x === targetX && m.y === targetY);
    if (monster) {
      this.playerAttackMonster(monster);
      this.advanceTurn();
      return;
    }

    const d = this.floor.dragon;
    if (
      targetX >= d.x &&
      targetX <= d.x + 1 &&
      targetY >= d.y &&
      targetY <= d.y + 1
    ) {
      this.playerAttackDragon(d);
      this.advanceTurn();
      return;
    }

    // 空振り（1ターン経過）
    this.soundManager.playSfx('PLAYER_ATTACK');
    this.advanceTurn();
  }

  /** 魔法の選択 */
  public selectSpell(id: SpellId): void {
    this.player.selectedSpellId = id;
    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** 安全なランダム床座標を取得（空間跳躍用：孤立部屋以外の安全な通常床） */
  public findSafeRandomFloorTile(): { x: number; y: number } {
    const safeTiles: { x: number; y: number }[] = [];
    for (let y = 0; y < this.floor.height; y++) {
      for (let x = 0; x < this.floor.width; x++) {
        if (
          this.floor.tiles[y][x] === 'FLOOR' &&
          !this.floor.monsters.some((m) => m.x === x && m.y === y) &&
          !(this.floor.dragon.x === x && this.floor.dragon.y === y) &&
          !(this.player.x === x && this.player.y === y)
        ) {
          safeTiles.push({ x, y });
        }
      }
    }
    if (safeTiles.length > 0) {
      return safeTiles[Math.floor(Math.random() * safeTiles.length)];
    }
    return { x: this.floor.homePos.x, y: this.floor.homePos.y };
  }

  /** 魔法詠唱（選択中または指定された魔法を発動） */
  public castSpell(spellId?: SpellId): void {
    const targetSpell = spellId || this.player.selectedSpellId || 'FIRE_BOLT';
    this.executeSpell(targetSpell);
  }

  /** 魔法詠唱の実行（レベル制限なし・所持ストック消費制） */
  public executeSpell(spellId: SpellId): boolean {
    if (this.status !== 'PLAYING') return false;

    const currentStock = this.player.spellStock[spellId] || 0;
    const def = SPELL_CATALOG.find((s) => s.id === spellId);
    if (!def) return false;

    if (currentStock <= 0) {
      this.logMessage(`【所持数0】${def.icon}『${def.name}』のストックがありません！宝箱から巻物を入手してください。`);
      return false;
    }

    // ストックを1消費
    this.player.spellStock[spellId]--;
    this.soundManager.playSfx('SPELL_CAST');

    switch (spellId) {
      case 'FIRE_BOLT': {
        let dx = 0;
        let dy = 0;
        if (this.player.direction === 'UP') dy = -1;
        else if (this.player.direction === 'DOWN') dy = 1;
        else if (this.player.direction === 'LEFT') dx = -1;
        else if (this.player.direction === 'RIGHT') dx = 1;

        const dmg = Math.floor(this.getEffectiveAttackPower() * 2.0);
        this.projectiles.push({
          id: `spell_${Date.now()}_${Math.random()}`,
          x: this.player.x * TILE_SIZE + TILE_SIZE / 2,
          y: this.player.y * TILE_SIZE + TILE_SIZE / 2,
          dx,
          dy,
          speed: 320,
          damage: dmg,
          fromPlayer: true,
          lifetime: 2.5,
          color: '#e74c3c',
          size: 9,
        });
        this.logMessage(`【火炎弾詠唱】🔥 紅蓮の火炎弾を放った！（威力: ${dmg}、残り: ${this.player.spellStock[spellId]}回）`);
        break;
      }

      case 'HEAL_LIGHT': {
        const heal = Math.ceil(this.player.maxHp * 0.5);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
        this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#2ecc71');
        this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, `+${heal} HP`, '#2ecc71');
        this.logMessage(`【聖光治癒詠唱】✨ 聖なる光が身体を包みHPが ${heal} 回復！（残り: ${this.player.spellStock[spellId]}回）`);
        break;
      }

      case 'THUNDER_STRIKE': {
        let dx = 0;
        let dy = 0;
        if (this.player.direction === 'UP') dy = -1;
        else if (this.player.direction === 'DOWN') dy = 1;
        else if (this.player.direction === 'LEFT') dx = -1;
        else if (this.player.direction === 'RIGHT') dx = 1;

        const dmg = Math.floor(this.getEffectiveAttackPower() * 2.5);
        let hitCount = 0;
        for (let step = 1; step <= 4; step++) {
          const tx = this.player.x + dx * step;
          const ty = this.player.y + dy * step;
          if (tx < 0 || tx >= this.floor.width || ty < 0 || ty >= this.floor.height) break;
          this.addSparkParticles(tx * TILE_SIZE + 16, ty * TILE_SIZE + 16, '#f1c40f');
          if (this.floor.tiles[ty][tx] === 'BLOCK') {
            this.floor.tiles[ty][tx] = 'FLOOR';
            this.addTextParticle(tx * TILE_SIZE, ty * TILE_SIZE, 'SMASHED!', '#e67e22');
          }
          const m = this.floor.monsters.find((mon) => mon.x === tx && mon.y === ty);
          if (m) {
            m.hp -= dmg;
            hitCount++;
            this.addTextParticle(tx * TILE_SIZE, ty * TILE_SIZE, `-${dmg} THUNDER!`, '#f1c40f');
            if (m.hp <= 0) this.defeatMonster(m);
          }
          const d = this.floor.dragon;
          if (tx >= d.x && tx <= d.x + 1 && ty >= d.y && ty <= d.y + 1) {
            this.playerAttackDragon(d, true, dmg);
          }
        }
        this.logMessage(`【迅雷撃詠唱】⚡ 紫電の閃光が直線を貫いた！（命中: ${hitCount}体、威力: ${dmg}、残り: ${this.player.spellStock[spellId]}回）`);
        break;
      }

      case 'FROST_NOVA': {
        const dmg = Math.floor(this.getEffectiveAttackPower() * 1.8);
        let hitCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const tx = this.player.x + dx;
            const ty = this.player.y + dy;
            if (tx < 0 || tx >= this.floor.width || ty < 0 || ty >= this.floor.height) continue;
            this.addSparkParticles(tx * TILE_SIZE + 16, ty * TILE_SIZE + 16, '#00ffff');
            const m = this.floor.monsters.find((mon) => mon.x === tx && mon.y === ty);
            if (m) {
              m.hp -= dmg;
              hitCount++;
              this.addTextParticle(tx * TILE_SIZE, ty * TILE_SIZE, `-${dmg} FROST!`, '#00ffff');
              if (m.hp <= 0) this.defeatMonster(m);
            }
          }
        }
        const d = this.floor.dragon;
        if (Math.abs(d.x - this.player.x) <= 2 && Math.abs(d.y - this.player.y) <= 2) {
          this.playerAttackDragon(d, true, dmg);
        }
        this.player.freezeAllTimer = Math.max(this.player.freezeAllTimer, 4);
        this.logMessage(`【氷結波動詠唱】❄️ 周囲の敵${hitCount}体を凍結停止にした！（残り: ${this.player.spellStock[spellId]}回）`);
        break;
      }

      case 'METEOR_SWARM': {
        let hitCount = 0;
        for (const m of [...this.floor.monsters]) {
          if (this.floor.exploredTiles[m.y]?.[m.x]) {
            const dmg = 90 + Math.floor(Math.random() * 50);
            m.hp -= dmg;
            hitCount++;
            this.addSparkParticles(m.x * TILE_SIZE + 16, m.y * TILE_SIZE + 16, '#e74c3c');
            this.addTextParticle(m.x * TILE_SIZE, m.y * TILE_SIZE, `-${dmg} METEOR!`, '#e74c3c');
            if (m.hp <= 0) this.defeatMonster(m);
          }
        }
        const d = this.floor.dragon;
        if (this.floor.exploredTiles[d.y]?.[d.x]) {
          const dmg = 90 + Math.floor(Math.random() * 50);
          this.playerAttackDragon(d, true, dmg);
        }
        this.logMessage(`【天変地異詠唱】☄️ 虚空の隕石雨が視界内の敵${hitCount}体を蹂躙した！（残り: ${this.player.spellStock[spellId]}回）`);
        break;
      }

      case 'RETURN_HOME': {
        // ユーザー要求：魔法で帰還が意味ないのでなくす。ランダムワープに変更する
        const safeDest = this.findSafeRandomFloorTile();
        this.player.x = safeDest.x;
        this.player.y = safeDest.y;
        this.player.renderX = safeDest.x;
        this.player.renderY = safeDest.y;
        this.soundManager.playSfx('CROSS_ACTIVATE');
        this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#00ffff');
        this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, 'RANDOM WARP!', '#00ffff');
        this.logMessage(`【空間跳躍詠唱】🌀 空間の狭間を跳躍し、見知らぬフロアへランダム転移した！（残り: ${this.player.spellStock[spellId]}回）`);
        break;
      }
    }

    if (this.onStateChangeCallback) this.onStateChangeCallback();
    this.advanceTurn();
    return true;
  }

  /** プレイヤーへの被ダメージ適用（無敵シールド完全ブロック ＆ 防御力減衰） */
  public applyDamageToPlayer(rawDamage: number, sourceName: string = '敵の攻撃'): void {
    // 1. 無敵シールド判定（回数制・完全ブロック）
    if (this.player.shieldCharges && this.player.shieldCharges > 0) {
      this.player.shieldCharges--;
      this.soundManager.playSfx('CROSS_ACTIVATE');
      this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#00ffff');
      this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, 'SHIELD BLOCKED!', '#00ffff');
      this.logMessage(`【神聖神盾】無敵シールドが${sourceName}を完全ブロック！（残りシールド: ${this.player.shieldCharges}回）`);
      if (this.onStateChangeCallback) this.onStateChangeCallback();
      return;
    }

    // 2. 一時無敵タイマー判定
    if (this.player.invincibleTimer > 0) {
      this.logMessage(`聖なる加護が${sourceName}を弾き返した！`);
      return;
    }

    // 3. 防御力計算：防御1につき被ダメ1減少（防具ボーナス込み）
    const effectiveDef = this.getEffectiveDefensePower();
    const finalDamage = Math.max(1, rawDamage - effectiveDef);
    this.player.hp -= finalDamage;
    this.consumeArmorDurability();
    this.soundManager.playSfx('PLAYER_HIT');

    // ユーザー要求：被ダメ表示は赤ではなく別の色（鮮烈なネオンオレンジ）にし、EXPと重ならないよう右上へ配置
    this.addTextParticle(
      this.player.x * TILE_SIZE + 14,
      this.player.y * TILE_SIZE - 12,
      `-${finalDamage}`,
      '#ff793f'
    );
    this.logMessage(`${sourceName}を受け、${finalDamage}ダメージを負った！（防御減衰: -${effectiveDef}）`);

    if (this.onStateChangeCallback) this.onStateChangeCallback();

    if (this.player.hp <= 0) {
      this.gameOver();
    }
  }

  /** スクロール（巻物）の使用（全11種対応） */
  public useScroll(index: number): void {
    if (index < 0 || index >= this.player.heldScrolls.length) return;
    const scrollType = this.player.heldScrolls.splice(index, 1)[0];
    this.soundManager.playSfx('SPELL_CAST');

    switch (scrollType) {
      case 'SCROLL_FIRE_BOLT': {
        // 単体火炎弾（直線飛翔体・岩ブロックも粉砕！）
        let dx = 0;
        let dy = 0;
        if (this.player.direction === 'UP') dy = -1;
        else if (this.player.direction === 'DOWN') dy = 1;
        else if (this.player.direction === 'LEFT') dx = -1;
        else if (this.player.direction === 'RIGHT') dx = 1;

        const dmg = Math.floor(this.getEffectiveAttackPower() * 2.0);
        this.projectiles.push({
          id: `spell_${Date.now()}_${Math.random()}`,
          x: this.player.x * TILE_SIZE + TILE_SIZE / 2,
          y: this.player.y * TILE_SIZE + TILE_SIZE / 2,
          dx,
          dy,
          speed: 320,
          damage: dmg,
          fromPlayer: true,
          lifetime: 2.5,
          color: '#e74c3c',
          size: 9,
        });
        this.logMessage(`【火炎弾の巻物】轟く紅蓮の火炎弾を放った！（威力: ${dmg}）`);
        break;
      }

      case 'SCROLL_HEAL_LIGHT': {
        // 聖光治癒（HP40%回復）
        const heal = Math.ceil(this.player.maxHp * 0.4);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
        this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#2ecc71');
        this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, `+${heal} HP`, '#2ecc71');
        this.logMessage(`【聖光治癒の巻物】聖なる光が身体を包み、HPが ${heal} 回復した！`);
        break;
      }

      case 'SCROLL_THUNDER_STRIKE': {
        // 迅雷撃（向いている直線3マス貫通攻撃、岩ブロックも粉砕！）
        let dx = 0;
        let dy = 0;
        if (this.player.direction === 'UP') dy = -1;
        else if (this.player.direction === 'DOWN') dy = 1;
        else if (this.player.direction === 'LEFT') dx = -1;
        else if (this.player.direction === 'RIGHT') dx = 1;

        const dmg = Math.floor(this.getEffectiveAttackPower() * 2.5);
        let hitCount = 0;
        for (let step = 1; step <= 3; step++) {
          const tx = this.player.x + dx * step;
          const ty = this.player.y + dy * step;
          if (tx < 0 || tx >= this.floor.width || ty < 0 || ty >= this.floor.height) break;

          this.addSparkParticles(tx * TILE_SIZE + 16, ty * TILE_SIZE + 16, '#f1c40f');

          // 岩ブロック破壊
          if (this.floor.tiles[ty][tx] === 'BLOCK') {
            this.floor.tiles[ty][tx] = 'FLOOR';
            this.addTextParticle(tx * TILE_SIZE, ty * TILE_SIZE, 'SMASHED!', '#e67e22');
            this.logMessage('【落雷粉砕】迅雷の雷撃が岩ブロックを粉々に砕いた！');
          }

          const m = this.floor.monsters.find((mon) => mon.x === tx && mon.y === ty);
          if (m) {
            m.hp -= dmg;
            hitCount++;
            this.addTextParticle(tx * TILE_SIZE, ty * TILE_SIZE, `-${dmg} THUNDER!`, '#f1c40f');
            if (m.hp <= 0) this.defeatMonster(m);
          }
          const d = this.floor.dragon;
          if (tx >= d.x && tx <= d.x + 1 && ty >= d.y && ty <= d.y + 1) {
            this.playerAttackDragon(d, true, dmg);
          }
        }
        this.logMessage(`【迅雷撃の巻物】紫電の閃光が直線を貫いた！（命中: ${hitCount}体、威力: ${dmg}）`);
        break;
      }

      case 'SCROLL_FROST_NOVA': {
        // 氷結波動（周囲全方位の敵にダメージ＋凍結）
        const dmg = Math.floor(this.getEffectiveAttackPower() * 1.8);
        let hitCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const tx = this.player.x + dx;
            const ty = this.player.y + dy;
            if (tx < 0 || tx >= this.floor.width || ty < 0 || ty >= this.floor.height) continue;

            this.addSparkParticles(tx * TILE_SIZE + 16, ty * TILE_SIZE + 16, '#00ffff');
            const m = this.floor.monsters.find((mon) => mon.x === tx && mon.y === ty);
            if (m) {
              m.hp -= dmg;
              hitCount++;
              this.addTextParticle(tx * TILE_SIZE, ty * TILE_SIZE, `-${dmg} FROST!`, '#00ffff');
              if (m.hp <= 0) this.defeatMonster(m);
            }
          }
        }
        const d = this.floor.dragon;
        if (Math.abs(d.x - this.player.x) <= 2 && Math.abs(d.y - this.player.y) <= 2) {
          this.playerAttackDragon(d, true, dmg);
        }
        this.player.freezeAllTimer = Math.max(this.player.freezeAllTimer, 3);
        this.logMessage(`【氷結波動の巻物】周囲の敵${hitCount}体を凍てつかせ、3ターン行動不能にした！`);
        break;
      }

      case 'SCROLL_METEOR_SWARM': {
        // 天変地異（視界内の全敵に隕石雨）
        let hitCount = 0;
        for (const m of [...this.floor.monsters]) {
          if (this.floor.exploredTiles[m.y]?.[m.x]) {
            const dmg = 90 + Math.floor(Math.random() * 50);
            m.hp -= dmg;
            hitCount++;
            this.addSparkParticles(m.x * TILE_SIZE + 16, m.y * TILE_SIZE + 16, '#e74c3c');
            this.addTextParticle(m.x * TILE_SIZE, m.y * TILE_SIZE, `-${dmg} METEOR!`, '#e74c3c');
            if (m.hp <= 0) this.defeatMonster(m);
          }
        }
        const d = this.floor.dragon;
        if (this.floor.exploredTiles[d.y]?.[d.x]) {
          const dmg = 90 + Math.floor(Math.random() * 50);
          this.playerAttackDragon(d, true, dmg);
        }
        this.logMessage(`【天変地異の巻物】虚空より降り注ぐ隕石群が視界内の敵${hitCount}体を蹂躙した！`);
        break;
      }

      case 'SCROLL_RETURN_HOME': {
        // ユーザー要求：空間跳躍の巻物（ランダムワープ）
        const safeDest = this.findSafeRandomFloorTile();
        this.player.x = safeDest.x;
        this.player.y = safeDest.y;
        this.player.renderX = safeDest.x;
        this.player.renderY = safeDest.y;
        this.soundManager.playSfx('CROSS_ACTIVATE');
        this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#00ffff');
        this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, 'RANDOM WARP!', '#00ffff');
        this.logMessage('【空間跳躍の巻物】🌀 空間が裂け、未知の地点へランダム瞬間移動した！');
        break;
      }

      case 'SCROLL_POWER':
        this.player.atkBuffTimer = 15;
        this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, 'ATK x2 (15T)!', '#e74c3c');
        this.logMessage(`【剛力の巻物】力が漲る！15ターンの間、攻撃力が2倍になった！`);
        break;

      case 'SCROLL_RECOVERY':
        this.player.hp = this.player.maxHp;
        this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, 'FULL RECOVERY!', '#2ecc71');
        this.logMessage(`【大治癒の巻物】全身の傷が完全に癒え、体力が全快した！`);
        break;

      case 'SCROLL_BLAST': {
        // 神鳴爆震（自身から5マス以内の全敵に爆撃、さらに周囲5マスの岩ブロックを全て粉砕！）
        const blastDmg = Math.max(1, Math.floor(this.getEffectiveAttackPower() * 1.25));
        let hitCount = 0;
        for (const m of [...this.floor.monsters]) {
          const dist = Math.hypot(m.x - this.player.x, m.y - this.player.y);
          if (dist <= 5.5) {
            m.hp -= blastDmg;
            hitCount++;
            this.addSparkParticles(m.x * TILE_SIZE + 16, m.y * TILE_SIZE + 16, '#ff4757');
            this.addTextParticle(m.x * TILE_SIZE, m.y * TILE_SIZE, `-${blastDmg} BLAST!`, '#ff3838');
            if (m.hp <= 0) this.defeatMonster(m);
          }
        }

        // 周囲5マス以内の岩ブロックも粉砕！
        for (let dy = -5; dy <= 5; dy++) {
          for (let dx = -5; dx <= 5; dx++) {
            const bx = this.player.x + dx;
            const by = this.player.y + dy;
            if (bx >= 0 && bx < this.floor.width && by >= 0 && by < this.floor.height) {
              if (Math.hypot(dx, dy) <= 5.5 && this.floor.tiles[by][bx] === 'BLOCK') {
                this.floor.tiles[by][bx] = 'FLOOR';
                this.addSparkParticles(bx * TILE_SIZE + 16, by * TILE_SIZE + 16, '#e67e22');
              }
            }
          }
        }

        // ドラゴンにも命中判定
        const d = this.floor.dragon;
        const distDragon = Math.hypot(d.x - this.player.x, d.y - this.player.y);
        if (distDragon <= 6.0) {
          this.playerAttackDragon(d, true, blastDmg);
        }
        this.logMessage(
          `【神鳴爆震の巻物】大爆発が炸裂！5マス以内の敵${hitCount}体に攻撃力の125%（${blastDmg}ダメージ）を与え、周囲の岩石を粉砕した！`
        );
        break;
      }

      case 'SCROLL_FREEZE':
        this.player.freezeAllTimer = 5;
        this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, 'ALL FROZEN (5T)!', '#00ffff');
        this.logMessage(`【絶対零度の巻物】極寒の絶対零度が吹き荒れ、フロアの全魔物が5ターン氷結停止した！`);
        break;

      case 'SCROLL_CLAIRVOYANCE':
        for (let y = 0; y < this.floor.height; y++) {
          for (let x = 0; x < this.floor.width; x++) {
            this.floor.exploredTiles[y][x] = true;
          }
        }
        this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, 'MAP REVEALED!', '#ffd700');
        this.logMessage(`【千里眼の巻物】神の視界が宿り、この階層の全マップと全配置が完全に白日の下に晒された！`);
        break;
    }

    if (this.onStateChangeCallback) this.onStateChangeCallback();
    this.advanceTurn();
  }

  /** プレイヤーがモンスターを攻撃 */
  private playerAttackMonster(monster: MonsterEntity): void {
    // ユーザー要求：先制攻撃（isPreemptive）持ちの敵は、プレイヤーの攻撃よりも先に反撃/先制攻撃を仕掛けてくる！
    if (monster.isPreemptive) {
      this.soundManager.playSfx('PLAYER_HIT');
      this.logMessage(`【先制奇襲】敏捷な『${monster.name}』が先手を取り、素早く刃を突き立ててきた！`);
      this.monsterAttackPlayer(monster);
      if (this.player.hp <= 0) return; // プレイヤーが力尽きた場合は攻撃不能
    }

    this.soundManager.playSfx('PLAYER_ATTACK');
    const effectiveAtk = this.getEffectiveAttackPower();
    const damage = Math.max(1, effectiveAtk - monster.defensePower);
    monster.hp -= damage;

    // 武器耐久度を消費（攻撃するたびに減少し0で破損）
    this.consumeWeaponDurability();

    this.addTextParticle(monster.x * TILE_SIZE + 10, monster.y * TILE_SIZE, `-${damage}`, '#e74c3c');
    this.addSparkParticles(monster.x * TILE_SIZE + 16, monster.y * TILE_SIZE + 16, '#f39c12');

    if (monster.hp <= 0) {
      this.defeatMonster(monster);
    }
  }

  /** 経験値獲得とレベルアップ判定 */
  public gainExp(amount: number): void {
    this.player.exp += amount;
    this.player.score += amount * 10;
    // ユーザー要求：被ダメ表示（右上）と重ならないよう、足元左下に配置
    this.addTextParticle(this.player.x * TILE_SIZE - 10, this.player.y * TILE_SIZE + 12, `+${amount} EXP`, '#f1c40f');

    while (this.player.exp >= this.player.nextExp) {
      this.levelUp();
    }
  }

  /** レベルアップ処理（HP/ATK/DEF強化） */
  private levelUp(): void {
    this.player.exp -= this.player.nextExp;
    this.player.level++;
    this.player.nextExp = Math.floor(this.player.nextExp * 1.45 + 25);

    // ステータス上昇（HP+6、攻撃力+1、レベル5の倍数ごとに防御力+1）
    this.player.maxHp += 6;
    this.player.attackPower += 1;
    const defGain = this.player.level % 5 === 0 ? 1 : 0;
    if (defGain > 0) {
      this.player.defensePower += defGain;
    }

    this.soundManager.playSfx('POWER_UP');
    this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#ffd700');
    this.addTextParticle(
      this.player.x * TILE_SIZE,
      this.player.y * TILE_SIZE - 16,
      `LEVEL UP! Lv.${this.player.level}`,
      '#f1c40f'
    );
    const defMsg = defGain > 0 ? `, 🛡️防御力+1` : '';
    this.logMessage(`【栄光】勇者のレベルが上がった！（Lv.${this.player.level}） 最大HP+6, 攻撃力+1${defMsg}！`);

    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** 指定座標の周囲でモンスターを召喚できる空き床マスを検索 */
  private findFreeSpawnTile(centerX: number, centerY: number): { x: number; y: number } | null {
    const candidates: { x: number; y: number }[] = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = centerX + dx;
        const ty = centerY + dy;
        if (tx < 0 || tx >= this.floor.width || ty < 0 || ty >= this.floor.height) continue;
        if (this.floor.tiles[ty][tx] !== 'FLOOR') continue;
        if (this.player.x === tx && this.player.y === ty) continue;
        if (this.floor.monsters.some((m) => m.x === tx && m.y === ty)) continue;
        candidates.push({ x: tx, y: ty });
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /** モンスター撃破 */
  private defeatMonster(monster: MonsterEntity): void {
    this.soundManager.playSfx('MONSTER_DEFEAT');
    this.killCount++;

    const isAdventurer = !!(monster as AdventurerEntity).isAdventurer;

    // ユーザー要求：冒険者撃破時の特別大金星処理
    if (isAdventurer) {
      if (this.floor.adventurers) {
        const advIdx = this.floor.adventurers.indexOf(monster as AdventurerEntity);
        if (advIdx !== -1) this.floor.adventurers.splice(advIdx, 1);
      }
      this.gainExp(120);
      this.player.gold += 300;
      SaveManager.getInstance().setGold(this.player.gold);
      this.addSparkParticles(monster.x * TILE_SIZE + 16, monster.y * TILE_SIZE + 16, '#ffd700');
      this.addTextParticle(monster.x * TILE_SIZE, monster.y * TILE_SIZE, '+300 G & +120 EXP!!', '#ffd700');
      this.logMessage(`【大金星！】人間の討伐隊『${monster.name}』を屠り、その肉片と秘宝を喰らい尽くした！（+120 EXP, +300 G）`);

      // 確定で黄泉還りの秘薬または高級武器をドロップ！
      if (Math.random() < 0.6) {
        this.floor.items.push({
          id: `drop_revive_${Date.now()}`,
          type: 'REVIVE_POTION',
          x: monster.x,
          y: monster.y,
          value: 1,
        });
        this.logMessage(`✨『${monster.name}』が【黄泉還りの秘薬】を落とした！`);
      } else {
        const weapon = DungeonGenerator.generateRandomWeapon();
        this.floor.items.push({
          id: `drop_w_${Date.now()}`,
          type: 'WEAPON',
          x: monster.x,
          y: monster.y,
          value: weapon.bonus,
          equipmentData: weapon,
        });
        this.logMessage(`✨『${monster.name}』が秘宝の武器【${weapon.name}】を落とした！`);
      }
    } else {
      const enemyLv = monster.level ?? this.getEnemyLevel();

      // 経験値獲得（敵レベルと攻撃力に応じた計算）
      const expGain = Math.max(12, enemyLv * 5 + monster.attackPower);
      this.gainExp(expGain);
      this.logMessage(`魔物『${monster.name}』(Lv.${enemyLv}) を討伐した！（+${expGain} EXP）`);
    }

    // 魔法陣（ポータル）の討伐ノルマ反映：最も近い活性中魔法陣のカウントを進める
    let nearestPortal: MonsterPortal | null = null;
    let minDist = 999;
    for (const portal of this.floor.portals) {
      if (portal.isActive) {
        const d = Math.hypot(portal.x - monster.x, portal.y - monster.y);
        if (d < minDist) {
          minDist = d;
          nearestPortal = portal;
        }
      }
    }

    if (nearestPortal) {
      nearestPortal.defeatedCount++;
      if (nearestPortal.defeatedCount >= nearestPortal.quota) {
        nearestPortal.isActive = false;
        nearestPortal.dormantTurns = 0;
        this.addSparkParticles(nearestPortal.x * TILE_SIZE + 16, nearestPortal.y * TILE_SIZE + 16, '#34495e');
        this.addTextParticle(nearestPortal.x * TILE_SIZE, nearestPortal.y * TILE_SIZE, 'PORTAL DORMANT!', '#95a5a6');
        this.logMessage(`【浄化】魔物を${nearestPortal.quota}体討伐し、近隣の魔法陣が沈黙した！一定期間魔物は湧かない。`);
      }
    }

    // モンスターのドロップ：奪われていたアイテムは王冠を含め100%取り戻せる！
    if (monster.carriedItem) {
      monster.carriedItem.x = monster.x;
      monster.carriedItem.y = monster.y;
      this.floor.items.push(monster.carriedItem);
      this.logMessage(`【奪還】奪われていた ${this.getItemName(monster.carriedItem.type)} を取り戻した！`);
      monster.carriedItem = null;
    } else if (!isAdventurer && Math.random() < 0.35) {
      const dropRoll = Math.random();
      if (dropRoll < 0.02) {
        // ユーザー要求：武器ドロップ（ドロップ率はかなり低くあまり獲得できない）
        const weapon = DungeonGenerator.generateRandomWeapon();
        this.floor.items.push({
          id: `drop_w_${Date.now()}_${Math.random()}`,
          type: 'WEAPON',
          x: monster.x,
          y: monster.y,
          value: weapon.bonus,
          equipmentData: weapon,
        });
        this.logMessage(`✨『${monster.name}』が秘宝の武器【${weapon.name}】を落とした！`);
      } else if (dropRoll < 0.04) {
        // ユーザー要求：防具ドロップ（同様に低確率）
        const armor = DungeonGenerator.generateRandomArmor();
        this.floor.items.push({
          id: `drop_a_${Date.now()}_${Math.random()}`,
          type: 'ARMOR',
          x: monster.x,
          y: monster.y,
          value: armor.bonus,
          equipmentData: armor,
        });
        this.logMessage(`✨『${monster.name}』が強固な防具【${armor.name}】を落とした！`);
      } else if (dropRoll < 0.08) {
        // ユーザー要求：たいまつドロップ
        this.floor.items.push({
          id: `drop_t_${Date.now()}_${Math.random()}`,
          type: 'TORCH',
          x: monster.x,
          y: monster.y,
          value: 50,
        });
        this.logMessage(`『${monster.name}』が【たいまつ】を落とした！`);
      } else {
        // 通常ドロップ：パワーストーン・スタミナストーン・ポーション
        const roll = Math.random();
        const dropType: FieldItem['type'] =
          roll < 0.45 ? 'POWER_STONE' : roll < 0.90 ? 'STAMINA_STONE' : 'POTION';

        this.floor.items.push({
          id: `drop_${Date.now()}_${Math.random()}`,
          type: dropType,
          x: monster.x,
          y: monster.y,
          value: 1,
        });
      }
    }

    const index = this.floor.monsters.indexOf(monster);
    if (index !== -1) {
      this.floor.monsters.splice(index, 1);
    }
  }

  /** プレイヤーが聖なる碑石にいるか判定（互換） */
  public isPlayerAtHome(): boolean {
    return true; // ユーザー要求：主神の祭壇はいつでも使えるようにする
  }

  /** 主神からの加護を購入（ユーザー要求：いつでも使用可能・永続引き継ぎ） */
  public purchaseBlessing(id: BlessingId): boolean {
    const save = SaveManager.getInstance();
    const success = save.upgradeBlessing(id);
    if (!success) {
      this.logMessage('ゴールドが不足しているか、既に最高ランクに達しています。');
      return false;
    }

    this.player.gold = save.getGold();
    this.soundManager.playSfx('POWER_UP');
    const info = BLESSING_CATALOG.find((b) => b.id === id);
    this.logMessage(
      `【主神の加護】『${info?.name || id}』を授かった！（現在Rank: ${save.getBlessingRank(id)}、残金: ${this.player.gold} G）`
    );

    // 加護ボーナスを即時現在値にも反映
    if (id === 'BLESSING_ATK') this.player.attackPower += 2;
    if (id === 'BLESSING_HP') {
      this.player.maxHp += 10; // ユーザー要求：生命樹の祝福の上昇値を10に
      this.player.hp += 10;
    }
    if (id === 'BLESSING_DEF') this.player.defensePower += 2;
    if (id === 'BLESSING_SCROLL') {
      const allSpells: SpellId[] = ['FIRE_BOLT', 'HEAL_LIGHT', 'THUNDER_STRIKE', 'FROST_NOVA', 'METEOR_SWARM', 'RETURN_HOME'];
      const chosen = allSpells[Math.floor(Math.random() * allSpells.length)];
      this.obtainSpellStock(chosen, 1);
    }

    if (this.onStateChangeCallback) this.onStateChangeCallback();
    return true;
  }

  /** 魔法の購入価格を取得（ユーザー要求：1個ずつの価格、価格はどんどん上がり、初期価格も高額に設定） */
  public getSpellPurchaseCost(spellId: SpellId): number {
    const baseCosts: Record<SpellId, number> = {
      FIRE_BOLT: 300,      // 火炎弾
      HEAL_LIGHT: 500,     // 聖光治癒
      THUNDER_STRIKE: 450, // 迅雷撃
      FROST_NOVA: 500,     // 氷結波動
      METEOR_SWARM: 800,   // 天変地異
      RETURN_HOME: 400,    // 空間跳躍
    };
    const priceIncrements: Record<SpellId, number> = {
      FIRE_BOLT: 150,
      HEAL_LIGHT: 250,
      THUNDER_STRIKE: 200,
      FROST_NOVA: 250,
      METEOR_SWARM: 400,
      RETURN_HOME: 200,
    };
    const count = this.player.spellPurchaseCounts?.[spellId] || 0;
    return (baseCosts[spellId] || 300) + count * (priceIncrements[spellId] || 150);
  }

  /** 魔法スクロールの購入（ユーザー要求：1個ずつ、インフレ価格で主神の祭壇等で購入） */
  public purchaseSpellStock(spellId: SpellId, stockCount: number = 1, costGold?: number): boolean {
    const finalCost = costGold !== undefined ? costGold : this.getSpellPurchaseCost(spellId);
    const save = SaveManager.getInstance();
    if (save.getGold() < finalCost) {
      this.logMessage(`ゴールドが不足しています！（必要: ${finalCost} G、所持: ${save.getGold()} G）`);
      return false;
    }

    save.addGold(-finalCost);
    this.player.gold = save.getGold();
    this.obtainSpellStock(spellId, stockCount);

    if (!this.player.spellPurchaseCounts) {
      this.player.spellPurchaseCounts = {
        FIRE_BOLT: 0,
        HEAL_LIGHT: 0,
        THUNDER_STRIKE: 0,
        FROST_NOVA: 0,
        METEOR_SWARM: 0,
        RETURN_HOME: 0,
      };
    }
    this.player.spellPurchaseCounts[spellId] = (this.player.spellPurchaseCounts[spellId] || 0) + 1;

    this.soundManager.playSfx('POWER_UP');
    this.logMessage(`【秘術購入】${finalCost}ゴールドを捧げ、魔法のストックを${stockCount}回分購入した！（残金: ${this.player.gold} G、次回価格が上昇）`);

    if (this.onStateChangeCallback) this.onStateChangeCallback();
    return true;
  }

  /** プレイヤーがドラゴンに攻撃（魔法ダメージ半減・近接武器耐久度消費） */
  public playerAttackDragon(
    dragon: DragonBoss,
    isMagic: boolean = false,
    incomingMagicDamage: number = 0
  ): void {
    if (!isMagic) {
      this.soundManager.playSfx('PLAYER_ATTACK');
      // 近接武器耐久度を消費（攻撃ごとに減少し0で破損）
      this.consumeWeaponDurability();
    }
    this.wakeUpDragon();

    // 初代ドラゴンスレイヤーの鉄則＆ユーザー要求：3つのクラウンがないと結界で守られ攻撃が一切効かない
    const hasAllCrowns = this.player.crownsDelivered >= CROWNS_REQUIRED_PER_FLOOR;

    if (!hasAllCrowns) {
      // 結界により完全無効化（ダメージ0、HP減らない）
      this.soundManager.playSfx('PUSH_BLOCK');
      this.addSparkParticles(
        dragon.x * TILE_SIZE + 32,
        dragon.y * TILE_SIZE + 32,
        '#00d2d3'
      );
      this.addTextParticle(
        dragon.x * TILE_SIZE + 20,
        dragon.y * TILE_SIZE + 10,
        'BARRIER! 0 DMG',
        '#00d2d3'
      );
      this.logMessage(`【完全無敵結界】王冠が3つ揃っていないため、${dragon.name}の物理・魔導結界に攻撃が弾かれた！（一切効かない！）`);
      return;
    }

    let damage: number;
    if (isMagic) {
      // ユーザー要求：ドラゴンには魔法のダメは半分にする
      damage = Math.max(1, Math.floor(incomingMagicDamage * 0.5));
    } else {
      // 近接攻撃：有効攻撃力（基本ATK + 武器ボーナス）ベースで計算
      const effectiveAtk = this.getEffectiveAttackPower();
      damage = Math.max(1, effectiveAtk - 3);
    }

    this.addTextParticle(
      dragon.x * TILE_SIZE + 20,
      dragon.y * TILE_SIZE + 10,
      `-${damage}`,
      isMagic ? '#9b59b6' : '#ff0055'
    );
    this.renderer.triggerScreenShake(isMagic ? 4 : 5);

    dragon.hp -= damage;
    this.addSparkParticles(
      dragon.x * TILE_SIZE + 32,
      dragon.y * TILE_SIZE + 32,
      isMagic ? '#9b59b6' : '#e74c3c'
    );

    if (dragon.hp <= 0) {
      this.defeatDragon();
    }
  }

  /** ボス討伐（大勝利／フロア制覇・全10フロア完全クリア） */
  private defeatDragon(): void {
    // ユーザー要求：全10ステージ制、各フロアにかかったターン数を記録
    this.floorTurnRecords.push(this.turnCount);

    this.soundManager.stopBgm();
    this.soundManager.playSfx('VICTORY');

    // 大量の爆発パーティクル
    for (let i = 0; i < 40; i++) {
      this.addSparkParticles(
        this.floor.dragon.x * TILE_SIZE + 32,
        this.floor.dragon.y * TILE_SIZE + 32,
        '#ffd700'
      );
    }

    if (this.floor.floorNumber >= 10) {
      // ユーザー要求：10ステージクリアすると全ステージのターン数と総合ターン数を表示して完全制覇
      this.status = 'ALL_CLEARED';
      this.renderer.triggerScreenShake(30);
      this.player.score += 50000;
      this.logMessage(
        `【前人未到の偉業】地下 10 階の守護巨獣『${this.floor.dragon.name}』を完全討伐！全10ステージを完全制覇した！！！`
      );
    } else {
      this.status = 'FLOOR_CLEARED';
      this.renderer.triggerScreenShake(20);
      this.player.score += 10000;
      this.logMessage(
        `【偉業達成】守護巨獣『${this.floor.dragon.name}』を討伐した！地下 ${this.floor.floorNumber} 階の迷宮を制覇！`
      );
    }

    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** 視界の探索更新（たいまつ有効時は視界1.5倍） */
  private updateExploredArea(px: number, py: number): void {
    // 通常半径5、たいまつ有効時は1.5倍（約8マス）
    const radius = this.player.torchTimer > 0 ? 8 : 5;
    for (let y = Math.max(0, py - radius); y <= Math.min(this.floor.height - 1, py + radius); y++) {
      for (let x = Math.max(0, px - radius); x <= Math.min(this.floor.width - 1, px + radius); x++) {
        const dist = Math.hypot(x - px, y - py);
        if (dist <= radius) {
          this.floor.exploredTiles[y][x] = true;
        }
      }
    }
  }

  /** その場での1ターン待機（足踏みパス） */
  public playerWait(): void {
    if (this.status !== 'PLAYING') return;
    this.soundManager.playSfx('STEP');
    this.logMessage('その場で待機した。');
    this.advanceTurn();
  }

  /** 王冠総数の厳格整合性保証（プレイヤー獲得数 ＋ 床の現存数 ＝ 常に3個を保証、不足時は即時救済配置） */
  public ensureCrownsConsistency(): void {
    // 1. もし魔物が王冠を抱え込んでいたら直ちに床にドロップ解放
    for (const m of this.floor.monsters) {
      if (m.carriedItem && m.carriedItem.type === 'CROWN') {
        const item = m.carriedItem;
        m.carriedItem = null;
        item.x = m.x;
        item.y = m.y;
        this.floor.items.push(item);
        this.logMessage(`【神託】魔物『${m.name}』が抱え込んでいた聖なる王冠を取り落とした！`);
      }
    }

    // 2. プレイヤー所持数 ＋ 床の王冠数の合計チェック
    const floorCrownCount = this.floor.items.filter((it) => it.type === 'CROWN').length;
    const totalCrowns = this.player.crownsDelivered + floorCrownCount;
    const missingCount = CROWNS_REQUIRED_PER_FLOOR - totalCrowns;

    if (missingCount <= 0) return;

    // 不足している王冠をプレイヤー周辺の安全な空き床マスに緊急出現させる
    let addedCount = 0;
    for (let dist = 2; dist < 25 && addedCount < missingCount; dist++) {
      for (let dy = -dist; dy <= dist && addedCount < missingCount; dy++) {
        for (let dx = -dist; dx <= dist && addedCount < missingCount; dx++) {
          const tx = this.player.x + dx;
          const ty = this.player.y + dy;
          if (tx >= 1 && tx < this.floor.width - 1 && ty >= 1 && ty < this.floor.height - 1) {
            if (this.floor.tiles[ty][tx] === 'FLOOR') {
              const hasItem = this.floor.items.some((it) => it.x === tx && it.y === ty);
              const hasMonster = this.floor.monsters.some((m) => m.x === tx && m.y === ty);
              const isPlayer = this.player.x === tx && this.player.y === ty;
              if (!hasItem && !hasMonster && !isPlayer) {
                this.floor.items.push({
                  id: `crown_rescue_${Date.now()}_${addedCount}`,
                  type: 'CROWN',
                  x: tx,
                  y: ty,
                  value: 1,
                });
                this.addSparkParticles(tx * TILE_SIZE + 16, ty * TILE_SIZE + 16, '#ffd700');
                this.addTextParticle(tx * TILE_SIZE, ty * TILE_SIZE, 'CROWN RESCUED!', '#ffd700');
                this.logMessage('【神託の奇跡】失われし聖なる王冠が迷宮の床に顕現した！');
                addedCount++;
              }
            }
          }
        }
      }
    }
  }

  /** プレイヤーの1ターン行動完了後の全体ターン進行 */
  private advanceTurn(): void {
    if (this.status !== 'PLAYING') return;
    this.turnCount++;

    // 王冠の整合性を毎ターン保証（消滅事故を100%防止）
    this.ensureCrownsConsistency();

    // 1. たいまつタイマー減算（50ターンの間、視界1.5倍）
    if (this.player.torchTimer > 0) {
      this.player.torchTimer--;
      if (this.player.torchTimer === 0) {
        this.logMessage('たいまつの火が燃え尽き、視界が通常に戻った。');
      }
    }
    this.updateExploredArea(this.player.x, this.player.y);

    // 2. 十字架無敵タイマー（ターン減算）
    if (this.player.invincibleTimer > 0) {
      this.player.invincibleTimer = Math.max(0, this.player.invincibleTimer - 1);
      if (this.player.invincibleTimer === 0) {
        this.logMessage('聖なる十字架の加護が解けた。');
      }
    }

    // 3. 剛力の巻物バフタイマー（ターン減算）
    if (this.player.atkBuffTimer > 0) {
      this.player.atkBuffTimer = Math.max(0, this.player.atkBuffTimer - 1);
      if (this.player.atkBuffTimer === 0) {
        this.logMessage('剛力の巻物の効果が終了した。攻撃力が元に戻った。');
      }
    }

    // 4. 敵全体凍結状態の判定
    if (this.player.freezeAllTimer > 0) {
      this.player.freezeAllTimer = Math.max(0, this.player.freezeAllTimer - 1);
      this.logMessage(`【絶対零度】すべての魔物が凍結し行動不能！（残り ${this.player.freezeAllTimer} ターン）`);
      if (this.onStateChangeCallback) this.onStateChangeCallback();
      return; // 敵・ドラゴンの行動をスキップ！
    }

    // 5. 魔法陣（ポータル）の更新と敵召喚
    for (const portal of this.floor.portals) {
      if (!portal.isActive) {
        // ユーザー要求：赤い魔法陣が停止すると、王冠を集めるまでは活性化しなくてよい（時間経過での自動復活は撤廃）
        continue;
      } else {
        // 活性中はクールダウン減少、0で魔物召喚
        portal.spawnCooldown--;
        if (portal.spawnCooldown <= 0) {
          portal.spawnCooldown = 8; // 8ターンごとに出現

          // 現在フロアの敵数が多すぎなければ召喚（最大50体上限）
          if (this.floor.monsters.length < 50) {
            // ユーザー要求：赤い魔法陣の真上から敵が出現する
            let spawnX = portal.x;
            let spawnY = portal.y;
            const isBlocked =
              (this.player.x === portal.x && this.player.y === portal.y) ||
              this.floor.monsters.some((m) => m.x === portal.x && m.y === portal.y);

            if (isBlocked) {
              const freeTile = this.findFreeSpawnTile(portal.x, portal.y);
              if (freeTile) {
                spawnX = freeTile.x;
                spawnY = freeTile.y;
              }
            }

            const enemyLv = this.getEnemyLevel();
            const newMonster = DungeonGenerator.generateMonsterAt(spawnX, spawnY, enemyLv, this.turnCount);
            this.floor.monsters.push(newMonster);
            this.addSparkParticles(spawnX * TILE_SIZE + 16, spawnY * TILE_SIZE + 16, '#ff0055');
          }
        }
      }
    }

    // 6. モンスター全体のターン実行
    this.executeMonstersTurn();

    // 7. ドラゴンボスのターン実行
    this.executeDragonTurn();

    // 7.5. ユーザー要求：1000ターンごとの冒険者一行の襲来・退却処理
    this.updateAdventurerParty();

    // 7.8. ユーザー要求：世界樹の迷宮のFOE（徘徊巨大エネミー）の更新処理
    this.updateFoe();

    // 8. 10ターン前やり直し用スナップショットを毎ターン保存
    this.saveTurnSnapshot();

    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** ゲームループの描画・補間更新（毎フレーム） */
  public update(deltaTime: number): void {
    if (this.status !== 'PLAYING') return;

    // プレイヤーのレンダリング位置補間（滑らかな移動演出）
    const lerpSpeed = 16 * deltaTime;
    this.player.renderX += (this.player.x - this.player.renderX) * Math.min(1, lerpSpeed);
    this.player.renderY += (this.player.y - this.player.renderY) * Math.min(1, lerpSpeed);

    // モンスターの描画位置補間
    for (const m of this.floor.monsters) {
      m.renderX += (m.x - m.renderX) * Math.min(1, 14 * deltaTime);
      m.renderY += (m.y - m.renderY) * Math.min(1, 14 * deltaTime);
    }

    // ドラゴンの描画位置補間
    const d = this.floor.dragon;
    d.renderX += (d.x - d.renderX) * Math.min(1, 10 * deltaTime);
    d.renderY += (d.y - d.renderY) * Math.min(1, 10 * deltaTime);

    // FOEの描画位置補間
    if (this.floor.foe) {
      const f = this.floor.foe;
      f.renderX += (f.x - f.renderX) * Math.min(1, 10 * deltaTime);
      f.renderY += (f.y - f.renderY) * Math.min(1, 10 * deltaTime);
    }

    // 飛翔体（弾幕）の更新
    this.updateProjectiles(deltaTime);

    // パーティクルの更新
    this.updateParticles(deltaTime);
  }

  /** モンスター全体の1手行動（系統ごとに差別化された生態AI） */
  private executeMonstersTurn(): void {
    for (const m of this.floor.monsters) {
      // ユーザー要求：遠距離攻撃クールタイムの減算（連続遠距離攻撃防止）
      if (m.rangedCooldown && m.rangedCooldown > 0) {
        m.rangedCooldown--;
      }

      const distToPlayer = Math.hypot(m.x - this.player.x, m.y - this.player.y);

      // 1. 近接攻撃判定（隣接マス）
      if (distToPlayer <= 1.1) {
        this.monsterAttackPlayer(m);
        continue;
      }

      // 2. 系統別特殊行動

      // ◆ WIZARD（魔導士族）および遠距離敵: 射程5以内で直線上に魔法弾（邪悪な魔導弾）
      if (m.type === 'WIZARD' || m.isRanged) {
        if (distToPlayer <= 2) {
          // 近接されそうな場合は後退（逃げ撃ち）
          const escapeDx = Math.sign(m.x - this.player.x);
          const escapeDy = Math.sign(m.y - this.player.y);
          if (this.tryMoveMonster(m, m.x + escapeDx, m.y + escapeDy)) {
            continue;
          }
        } else if (distToPlayer <= 5 && (m.x === this.player.x || m.y === this.player.y)) {
          // ユーザー要求：遠距離攻撃にクールタイムを採用し、連続して遠距離攻撃してこないようにする
          if (!m.rangedCooldown || m.rangedCooldown <= 0) {
            this.monsterCastSpell(m);
            m.rangedCooldown = 3 + Math.floor(Math.random() * 2); // 3〜4ターンのクールタイム
            continue;
          }
        }
      }

      // ◆ DEMON（悪魔族）: 冥府の瞬動テレポート（距離3〜7マス時に15%の確率でプレイヤーの近傍へ跳躍）
      if (m.type === 'DEMON' && distToPlayer >= 3 && distToPlayer <= 7 && Math.random() < 0.15) {
        const offsets = [
          { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
          { dx: 1, dy: 1 }, { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }
        ];
        const validOffset = offsets.find((off) => {
          const tx = this.player.x + off.dx;
          const ty = this.player.y + off.dy;
          return (
            tx >= 0 && tx < this.floor.width && ty >= 0 && ty < this.floor.height &&
            this.floor.tiles[ty][tx] === 'FLOOR' &&
            !this.floor.monsters.some((other) => other.x === tx && other.y === ty)
          );
        });
        if (validOffset) {
          m.x = this.player.x + validOffset.dx;
          m.y = this.player.y + validOffset.dy;
          this.soundManager.playSfx('SPELL_CAST');
          this.addSparkParticles(m.x * TILE_SIZE + 16, m.y * TILE_SIZE + 16, '#ff0055');
          this.addTextParticle(m.x * TILE_SIZE, m.y * TILE_SIZE, 'DARK WARP!', '#ff0055');
          this.logMessage(`【闇の跳躍】${m.name}が空間を歪めて背後にテレポートした！`);
          continue;
        }
      }

      // ◆ BEAST（野獣族）: 同一直線上（距離2〜5マス）で突進咆哮
      if (m.type === 'BEAST' && distToPlayer >= 2 && distToPlayer <= 5) {
        if (m.x === this.player.x || m.y === this.player.y) {
          const rushDx = Math.sign(this.player.x - m.x);
          const rushDy = Math.sign(this.player.y - m.y);
          // 2マス一気に直進ダッシュ
          this.tryMoveMonster(m, m.x + rushDx, m.y + rushDy);
          this.tryMoveMonster(m, m.x + rushDx, m.y + rushDy);
          this.addSparkParticles(m.x * TILE_SIZE + 16, m.y * TILE_SIZE + 16, '#e67e22');
          continue;
        }
      }

      // ◆ SLIME（スライム族）: アイテム持ち去りと逃走生態
      if (m.type === 'SLIME') {
        if (m.carriedItem) {
          // アイテム所持中はプレイヤーと逆方向へ逃げる
          const runDx = Math.sign(m.x - this.player.x);
          const runDy = Math.sign(m.y - this.player.y);
          if (this.tryMoveMonster(m, m.x + runDx, m.y + runDy)) {
            continue;
          }
        } else {
          // 視界内にアイテムがあれば最優先で拾いに行く（※神聖な王冠は絶対に持ち去り対象外）
          const nearbyItem = this.floor.items.find(
            (it) => it.type !== 'CROWN' && Math.hypot(it.x - m.x, it.y - m.y) <= 5
          );
          if (nearbyItem) {
            this.stepMonsterTowards(m, nearbyItem.x, nearbyItem.y);
            if (m.x === nearbyItem.x && m.y === nearbyItem.y) {
              const idx = this.floor.items.indexOf(nearbyItem);
              if (idx !== -1) {
                m.carriedItem = nearbyItem;
                this.floor.items.splice(idx, 1);
                this.soundManager.playSfx('PICKUP_ITEM');
                this.addTextParticle(m.x * TILE_SIZE, m.y * TILE_SIZE, 'STOLEN!', '#ffd700');
                this.logMessage(`【持ち逃げ】${m.name}が ${this.getItemName(nearbyItem.type)} を拾って逃げ出した！`);
              }
            }
            continue;
          }
        }
      }

      // ◆ GOBLIN（ゴブリン族）: 俊敏な追尾（2ターンに1回、2歩進む）
      if (m.type === 'GOBLIN' && distToPlayer <= 8) {
        this.stepMonsterTowards(m, this.player.x, this.player.y);
        if (this.turnCount % 2 === 0 && Math.hypot(m.x - this.player.x, m.y - this.player.y) > 1.1) {
          this.stepMonsterTowards(m, this.player.x, this.player.y);
        }
        continue;
      }

      // 3. 基本索敵・追尾移動
      if (distToPlayer <= 7) {
        this.stepMonsterTowards(m, this.player.x, this.player.y);
      } else {
        // ランダム徘徊
        const dirs = [
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: 1 },
          { dx: 0, dy: -1 },
        ];
        const dir = dirs[Math.floor(Math.random() * dirs.length)];
        this.tryMoveMonster(m, m.x + dir.dx, m.y + dir.dy);
      }
    }
  }

  /** 魔術師モンスターの遠距離攻撃 */
  private monsterCastSpell(m: MonsterEntity): void {
    const dx = Math.sign(this.player.x - m.x);
    const dy = Math.sign(this.player.y - m.y);
    this.soundManager.playSfx('SPELL_CAST');
    this.projectiles.push({
      id: `m_spell_${Date.now()}_${Math.random()}`,
      x: m.x * TILE_SIZE + TILE_SIZE / 2,
      y: m.y * TILE_SIZE + TILE_SIZE / 2,
      dx,
      dy,
      speed: 240,
      damage: m.attackPower,
      fromPlayer: false,
      lifetime: 2.0,
      color: '#9b59b6',
      size: 6,
    });
    this.logMessage('魔術師が邪悪な魔導弾を放った！');
  }

  /** ドラゴンボスのターン行動（最奥で待ち構える不動の巨竜） */
  private executeDragonTurn(): void {
    const d = this.floor.dragon;
    if (!d.isAwake) return;

    // 王冠3つ未達成時、10マス以上離れるとドラゴンは再び眠りにつく
    if (this.player.crownsDelivered < CROWNS_REQUIRED_PER_FLOOR) {
      const distToDragon = Math.hypot((d.x + 0.5) - this.player.x, (d.y + 0.5) - this.player.y);
      if (distToDragon >= 10.0) {
        d.isAwake = false;
        this.addTextParticle(d.x * TILE_SIZE, d.y * TILE_SIZE, 'zzz...', '#3498db');
        this.logMessage('ドラゴンは遠く離れた勇者を見失い、再び深い眠りについた……（zzz）');
        return;
      }
    }

    // 万が一の重なり検知時の安全解消ガード
    this.resolvePlayerDragonOverlap(d);

    // プレイヤーがドラゴンの周囲（4マスの隣接8方位）にいるか判定
    const isPlayerAdjacent =
      this.player.x >= d.x - 1 &&
      this.player.x <= d.x + 2 &&
      this.player.y >= d.y - 1 &&
      this.player.y <= d.y + 2;

    // 隣接している場合は重ならず、至近距離での強烈な爪撃を繰り出す
    if (isPlayerAdjacent) {
      this.dragonMeleeAttack(d);
      return;
    }

    // 8マス以内に入らないと遠距離攻撃（ブレス）してこないように制限！
    const distToPlayer = Math.hypot((d.x + 0.5) - this.player.x, (d.y + 0.5) - this.player.y);
    if (distToPlayer > 8.0) {
      // 8マスより遠い場合はブレスを撃たずに静観
      return;
    }

    if (d.breathCooldown > 0) {
      d.breathCooldown--;
    }
    // ユーザー要求：遠距離火炎ブレスの連続発射を防止し、10ターンのクールタイムを設定
    if (d.breathCooldown <= 0) {
      d.breathCooldown = 10;
      this.fireDragonBreath(d);
      return;
    }

    // ドラゴンは動かず、最奥の守護竜として威圧する
  }

  /** ボスによる至近距離の攻撃（ボス種別ごとに固有の近接技） */
  private dragonMeleeAttack(d: DragonBoss): void {
    switch (d.bossType) {
      case 'SPIDER': {
        this.addSparkParticles(d.x * TILE_SIZE + 32, d.y * TILE_SIZE + 32, '#8e44ad');
        this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#9b59b6');
        this.applyDamageToPlayer(d.attackPower, `${d.name}の劇毒大牙咬傷`);
        // 毒の追撃（シールドがない場合）
        if (!this.player.shieldCharges || this.player.shieldCharges === 0) {
          const poisonDmg = Math.max(2, Math.floor(d.attackPower * 0.25));
          this.applyDamageToPlayer(poisonDmg, `${d.name}の浸透神経毒`);
          this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, `POISON -${poisonDmg}`, '#8e44ad');
        }
        break;
      }

      case 'ANT': {
        this.addSparkParticles(d.x * TILE_SIZE + 32, d.y * TILE_SIZE + 32, '#e67e22');
        this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#f39c12');
        // 大顎による高威力物理挟撃
        const antDmg = Math.floor(d.attackPower * 1.3);
        this.applyDamageToPlayer(antDmg, `${d.name}の大顎ギロチンクランチ`);
        // 防具耐久度を腐食酸で追加劣化
        if (this.player.equippedArmor && this.player.equippedArmor.durability > 0) {
          this.player.equippedArmor.durability = Math.max(0, this.player.equippedArmor.durability - 1);
          this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, 'ARMOR CORRODED!', '#2ecc71');
        }
        break;
      }

      case 'LIZARD': {
        this.addSparkParticles(d.x * TILE_SIZE + 32, d.y * TILE_SIZE + 32, '#16a085');
        this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#1abc9c');
        this.renderer.triggerScreenShake(5);
        this.applyDamageToPlayer(d.attackPower, `${d.name}の猛毒テイルスイング`);
        break;
      }

      case 'GOLEM': {
        this.addSparkParticles(d.x * TILE_SIZE + 32, d.y * TILE_SIZE + 32, '#95a5a6');
        this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#bdc3c7');
        // 巨兵のアースクエイク（激しい画面揺れと超打撃）
        this.renderer.triggerScreenShake(14);
        const golemDmg = Math.floor(d.attackPower * 1.4);
        this.applyDamageToPlayer(golemDmg, `${d.name}の大地粉砕アースクエイク`);
        break;
      }

      case 'DRAGON':
      default: {
        this.addSparkParticles(d.x * TILE_SIZE + 32, d.y * TILE_SIZE + 32, '#c0392b');
        this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#e74c3c');
        this.renderer.triggerScreenShake(7);
        this.applyDamageToPlayer(d.attackPower, `${d.name}の竜爪撃＆紅蓮咆哮`);
        break;
      }
    }
  }

  /** プレイヤーとドラゴンの万が一の重なりを解消する安全処理 */
  private resolvePlayerDragonOverlap(d: DragonBoss): void {
    const isOverlapping =
      this.player.x >= d.x &&
      this.player.x <= d.x + 1 &&
      this.player.y >= d.y &&
      this.player.y <= d.y + 1;

    if (!isOverlapping) return;

    // 重なっている場合、周囲の最も安全な床マスへプレイヤーを押し出す
    const escapeOffsets = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 2 },
      { dx: -1, dy: 0 }, { dx: 2, dy: 0 },
      { dx: -1, dy: -1 }, { dx: 2, dy: 2 }
    ];

    for (const offset of escapeOffsets) {
      const ex = d.x + offset.dx;
      const ey = d.y + offset.dy;
      if (
        ex >= 0 && ex < this.floor.width &&
        ey >= 0 && ey < this.floor.height &&
        this.floor.tiles[ey][ex] === 'FLOOR'
      ) {
        this.player.x = ex;
        this.player.y = ey;
        break;
      }
    }
  }

  /** モンスターを目標座標に向けて1歩進める */
  private stepMonsterTowards(m: MonsterEntity, targetX: number, targetY: number): void {
    const dx = Math.sign(targetX - m.x);
    const dy = Math.sign(targetY - m.y);

    if (Math.random() < 0.5 && dx !== 0) {
      if (this.tryMoveMonster(m, m.x + dx, m.y)) return;
      if (dy !== 0) this.tryMoveMonster(m, m.x, m.y + dy);
    } else if (dy !== 0) {
      if (this.tryMoveMonster(m, m.x, m.y + dy)) return;
      if (dx !== 0) this.tryMoveMonster(m, m.x + dx, m.y);
    }
  }

  /** モンスターの移動試行 */
  private tryMoveMonster(m: MonsterEntity, targetX: number, targetY: number): boolean {
    if (targetX < 0 || targetX >= this.floor.width || targetY < 0 || targetY >= this.floor.height) {
      return false;
    }

    const tile = this.floor.tiles[targetY][targetX];

    // HOMEは聖域のためモンスターは進入不可
    if (tile === 'HOME') return false;

    // ゴーストは壁・ブロックをすり抜ける！
    if (m.type === 'GHOST') {
      if (targetX === this.player.x && targetY === this.player.y) return false;
      m.x = targetX;
      m.y = targetY;
      return true;
    }

    // ◆ GOLEM（巨兵族）: 怪力により岩ブロック（BLOCK）を粉砕破壊して直進可能！
    if (m.type === 'GOLEM' && tile === 'BLOCK') {
      this.floor.tiles[targetY][targetX] = 'FLOOR';
      this.soundManager.playSfx('PUSH_BLOCK');
      this.addSparkParticles(targetX * TILE_SIZE + 16, targetY * TILE_SIZE + 16, '#95a5a6');
      this.addTextParticle(targetX * TILE_SIZE, targetY * TILE_SIZE, 'SMASH ROCK!', '#e67e22');
      this.logMessage(`【巨兵の怪力】${m.name}が前方の岩ブロックを粉砕して突破した！`);
      m.x = targetX;
      m.y = targetY;
      return true;
    }

    // 一般モンスターは床のみ通行可能（壁・水路・墓石・岩は進入不可）
    if (tile !== 'FLOOR') {
      return false;
    }

    // 他のモンスターと重ならない
    if (this.floor.monsters.some((other) => other !== m && other.x === targetX && other.y === targetY)) {
      return false;
    }

    // プレイヤーのマスには進入せず攻撃判定へ回す
    if (targetX === this.player.x && targetY === this.player.y) {
      return false;
    }

    m.x = targetX;
    m.y = targetY;
    return true;
  }

  /** モンスターからプレイヤーへの攻撃 */
  private monsterAttackPlayer(m: MonsterEntity): void {
    let atk = m.attackPower;
    // ◆ REPTILE（竜人族）: HP50%以下でバーサーク激昂（攻撃力1.5倍）
    if (m.type === 'REPTILE' && m.hp < m.maxHp * 0.5) {
      atk = Math.floor(atk * 1.5);
      this.addTextParticle(m.x * TILE_SIZE, m.y * TILE_SIZE, 'BERSERK!!', '#e74c3c');
      this.addSparkParticles(m.x * TILE_SIZE + 16, m.y * TILE_SIZE + 16, '#c0392b');
    }

    this.applyDamageToPlayer(atk, `${m.name}の攻撃`);

    // ◆ INSECT（節足虫族）: 毒針追加ダメージ（シールドがない場合のみ）
    if (m.type === 'INSECT' && (!this.player.shieldCharges || this.player.shieldCharges === 0)) {
      const poisonDmg = Math.min(8, Math.max(2, Math.floor(m.level * 0.2) + 2));
      this.applyDamageToPlayer(poisonDmg, `${m.name}の猛毒`);
    }
  }

  /** ボスの遠距離特殊技放射（火炎ブレス・猛毒糸・強酸弾・石化光線・岩石砲） */
  private fireDragonBreath(d: DragonBoss): void {
    const centerDx = d.x * TILE_SIZE + TILE_SIZE;
    const centerDy = d.y * TILE_SIZE + TILE_SIZE;
    const playerPixelX = this.player.x * TILE_SIZE + TILE_SIZE / 2;
    const playerPixelY = this.player.y * TILE_SIZE + TILE_SIZE / 2;

    const angle = Math.atan2(playerPixelY - centerDy, playerPixelX - centerDx);

    switch (d.bossType) {
      case 'SPIDER': {
        // ◆ クイーンスパイダー: 『猛毒糸結界』
        // 全方位扇状に5本の粘着毒糸弾を放射（低速・広角・滞空時間長）
        this.soundManager.playSfx('DRAGON_BREATH');
        this.logMessage(`【妖糸放射】${d.name}が『${d.specialSkillName}』を発動！粘着猛毒糸を広角拡散射出した！`);
        for (let offset = -0.5; offset <= 0.5; offset += 0.25) {
          const finalAngle = angle + offset;
          this.projectiles.push({
            id: `spider_web_${Date.now()}_${Math.random()}`,
            x: centerDx,
            y: centerDy,
            dx: Math.cos(finalAngle),
            dy: Math.sin(finalAngle),
            speed: 160,
            damage: Math.max(1, Math.floor(d.attackPower * 0.8)),
            fromPlayer: false,
            lifetime: 3.5,
            color: '#7209b7',
            size: 8,
          });
        }
        break;
      }

      case 'ANT': {
        // ◆ タイタンアント: 『強酸液噴射』
        // 直線状に超高初速・強酸ビーム弾を猛スピードで2連続直進発射（高初速・高威力）
        this.soundManager.playSfx('DRAGON_BREATH');
        this.logMessage(`【強酸射出】${d.name}が『${d.specialSkillName}』を発動！高初速の濃縮強酸液を猛射した！`);
        [-0.05, 0.05].forEach((offset) => {
          const finalAngle = angle + offset;
          this.projectiles.push({
            id: `ant_acid_${Date.now()}_${Math.random()}`,
            x: centerDx,
            y: centerDy,
            dx: Math.cos(finalAngle),
            dy: Math.sin(finalAngle),
            speed: 380, // 超高速直進
            damage: Math.floor(d.attackPower * 1.2),
            fromPlayer: false,
            lifetime: 2.0,
            color: '#2ecc71',
            size: 11,
          });
        });
        break;
      }

      case 'LIZARD': {
        // ◆ バジリスク: 『石化邪眼光』
        // 邪眼から放たれる扇状7連波（広範囲カバー）
        this.soundManager.playSfx('DRAGON_BREATH');
        this.logMessage(`【邪眼照射】${d.name}が『${d.specialSkillName}』を発動！石化邪眼波を扇状放射した！`);
        for (let offset = -0.45; offset <= 0.45; offset += 0.15) {
          const finalAngle = angle + offset;
          this.projectiles.push({
            id: `lizard_gaze_${Date.now()}_${Math.random()}`,
            x: centerDx,
            y: centerDy,
            dx: Math.cos(finalAngle),
            dy: Math.sin(finalAngle),
            speed: 210,
            damage: Math.max(1, Math.floor(d.attackPower * 0.9)),
            fromPlayer: false,
            lifetime: 2.8,
            color: '#1abc9c',
            size: 8,
          });
        }
        break;
      }

      case 'GOLEM': {
        // ◆ メガリスゴーレム: 『岩石崩落撃』
        // 超巨大な古代巨石砲弾をドカンと投擲（サイズ18、超重砲弾、激震）
        this.soundManager.playSfx('PUSH_BLOCK');
        this.renderer.triggerScreenShake(8);
        this.logMessage(`【巨石投擲】${d.name}が『${d.specialSkillName}』を発動！巨大な古代岩塊を剛腕で投げ飛ばした！`);
        this.projectiles.push({
          id: `golem_rock_${Date.now()}_${Math.random()}`,
          x: centerDx,
          y: centerDy,
          dx: Math.cos(angle),
          dy: Math.sin(angle),
          speed: 180,
          damage: Math.floor(d.attackPower * 1.5),
          fromPlayer: false,
          lifetime: 3.0,
          color: '#7f8c8d',
          size: 18,
        });
        break;
      }

      case 'DRAGON':
      default: {
        // ◆ ヴォルケイドラゴン: 『焦熱火炎ブレス』
        // クラスター状の爆炎弾を放射（高密度5連炎球）
        this.soundManager.playSfx('DRAGON_BREATH');
        this.logMessage(`【業火放射】${d.name}が『${d.specialSkillName}』を一斉放射した！`);
        for (let offset = -0.3; offset <= 0.3; offset += 0.15) {
          const finalAngle = angle + offset;
          this.projectiles.push({
            id: `dragon_flame_${Date.now()}_${Math.random()}`,
            x: centerDx,
            y: centerDy,
            dx: Math.cos(finalAngle),
            dy: Math.sin(finalAngle),
            speed: 240,
            damage: d.attackPower,
            fromPlayer: false,
            lifetime: 2.5,
            color: '#ff4757',
            size: 10,
          });
        }
        break;
      }
    }
  }

  /** 飛翔体の物理演算・当たり判定 */
  private updateProjectiles(deltaTime: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.dx * p.speed * deltaTime;
      p.y += p.dy * p.speed * deltaTime;
      p.lifetime -= deltaTime;

      if (p.lifetime <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const gridX = Math.floor(p.x / TILE_SIZE);
      const gridY = Math.floor(p.y / TILE_SIZE);

      // 壁・マップ外衝突
      if (
        gridX < 0 || gridX >= this.floor.width ||
        gridY < 0 || gridY >= this.floor.height ||
        this.floor.tiles[gridY][gridX] === 'WALL'
      ) {
        this.addSparkParticles(p.x, p.y, p.color);
        this.projectiles.splice(i, 1);
        continue;
      }

      // 岩ブロック（BLOCK）への衝突（プレイヤー魔法弾なら粉砕！）
      if (this.floor.tiles[gridY][gridX] === 'BLOCK') {
        if (p.fromPlayer) {
          this.floor.tiles[gridY][gridX] = 'FLOOR';
          this.soundManager.playSfx('MONSTER_DEFEAT');
          this.addSparkParticles(gridX * TILE_SIZE + 16, gridY * TILE_SIZE + 16, '#e67e22');
          this.addTextParticle(gridX * TILE_SIZE, gridY * TILE_SIZE, 'SMASHED!', '#e67e22');
          this.logMessage('【粉砕】魔導の弾丸が岩ブロックを粉々に砕いた！');
        } else {
          this.addSparkParticles(p.x, p.y, p.color);
        }
        this.projectiles.splice(i, 1);
        continue;
      }

      // プレイヤー弾が敵に命中
      if (p.fromPlayer) {
        const monster = this.floor.monsters.find((m) => m.x === gridX && m.y === gridY);
        if (monster) {
          monster.hp -= p.damage;
          this.addSparkParticles(p.x, p.y, '#3498db');
          this.addTextParticle(monster.x * TILE_SIZE, monster.y * TILE_SIZE, `-${p.damage}`, '#3498db');
          if (monster.hp <= 0) this.defeatMonster(monster);
          this.projectiles.splice(i, 1);
          continue;
        }

        const d = this.floor.dragon;
        if (gridX >= d.x && gridX <= d.x + 1 && gridY >= d.y && gridY <= d.y + 1) {
          this.playerAttackDragon(d, true, p.damage);
          this.projectiles.splice(i, 1);
          continue;
        }
      } else {
        // 敵の弾・火炎ブレスがプレイヤーに命中
        const pDist = Math.hypot(
          p.x - (this.player.x * TILE_SIZE + TILE_SIZE / 2),
          p.y - (this.player.y * TILE_SIZE + TILE_SIZE / 2)
        );
        if (pDist < 16) {
          this.applyDamageToPlayer(p.damage, '敵の飛翔攻撃');
          this.projectiles.splice(i, 1);
          continue;
        }
      }
    }
  }

  /** パーティクル更新 */
  private updateParticles(deltaTime: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.life -= deltaTime;
      p.alpha = Math.max(0, p.life / p.maxLife);

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  /** テキストポップアップパーティクル */
  private addTextParticle(x: number, y: number, text: string, color: string): void {
    this.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 15,
      vy: -35,
      life: 0.9,
      maxLife: 0.9,
      size: 12,
      color,
      alpha: 1,
      text,
    });
  }

  /** スパーク火花パーティクル */
  private addSparkParticles(x: number, y: number, color: string): void {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.2,
        maxLife: 0.6,
        size: 3,
        color,
        alpha: 1,
      });
    }
  }

  /** 10ターン前巻き戻し用スナップショットを毎ターン保存 */
  private saveTurnSnapshot(): void {
    const snapshot: GameStateSnapshot = {
      turnCount: this.turnCount,
      player: JSON.parse(JSON.stringify(this.player)),
      floor: JSON.parse(JSON.stringify(this.floor)),
      globalHomeCharge: this.globalHomeCharge,
    };
    this.historySnapshots.push(snapshot);
    if (this.historySnapshots.length > 15) {
      this.historySnapshots.shift();
    }
  }

  /** ゲームオーバー処理（ステージ毎に初回無料、2回目以降は黄泉還りの秘薬を消費） */
  private gameOver(): void {
    const canFreeRevive = !this.player.floorFreeReviveUsed;
    const potions = this.player.revivePotionsCount || 0;

    if (canFreeRevive || potions > 0) {
      if (this.onRevivePromptCallback) {
        this.onRevivePromptCallback(canFreeRevive ? 1 : 0, potions);
        return;
      }
    }
    this.confirmGameOver();
  }

  /** コンティニュー実行（無料枠または秘薬消費でHP100%全快で完全蘇生） */
  public revivePlayer(): boolean {
    const canFreeRevive = !this.player.floorFreeReviveUsed;
    const potions = this.player.revivePotionsCount || 0;

    if (canFreeRevive) {
      this.player.floorFreeReviveUsed = true;
      this.player.hp = this.player.maxHp;
      this.status = 'PLAYING';

      this.soundManager.startBgm();
      this.soundManager.playSfx('POWER_UP');
      this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#00ffcc');
      this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE - 20, 'FREE REVIVE! HP 100%!', '#00ffcc');
      this.logMessage('【不死の恩寵】フロア初回の無料蘇生により、HP100%全快で完全復活した！');

      if (this.onStateChangeCallback) this.onStateChangeCallback();
      return true;
    } else if (potions > 0) {
      this.player.revivePotionsCount--;
      this.player.hp = this.player.maxHp;
      this.status = 'PLAYING';

      this.soundManager.startBgm();
      this.soundManager.playSfx('POWER_UP');
      this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#e056fd');
      this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE - 20, 'POTION REVIVE! HP 100%!', '#e056fd');
      this.logMessage(`【黄泉還りの秘薬】霊薬を消費してHP100%全快で奇跡の蘇生！（残り秘薬: ${this.player.revivePotionsCount}個）`);

      if (this.onStateChangeCallback) this.onStateChangeCallback();
      return true;
    }

    this.restartFloor();
    return false;
  }

  /** 復活しない場合：ステージに来た時と同じ状況で再開（ユーザー要求：スナップショットからの完全復元） */
  public restartFloor(): void {
    const currentFloorNum = this.floor.floorNumber;
    this.floor = DungeonGenerator.generateFloor(currentFloorNum);

    if (this.floorEntryPlayerSnapshot) {
      // ユーザー要求：そのステージに来た時と同じ状況で再開
      this.player = JSON.parse(JSON.stringify(this.floorEntryPlayerSnapshot));
      this.player.x = this.floor.homePos.x;
      this.player.y = this.floor.homePos.y;
      this.player.renderX = this.floor.homePos.x;
      this.player.renderY = this.floor.homePos.y;
      this.player.floorFreeReviveUsed = false;
    } else {
      this.player = this.createInitialPlayerState(this.floor.homePos.x, this.floor.homePos.y);
    }

    this.turnCount = 0;
    this.killCount = 0;
    this.status = 'PLAYING';
    this.updateExploredArea(this.player.x, this.player.y);
    this.soundManager.startBgm();
    this.logMessage(`【階層再起】地下${currentFloorNum}階の到達時状況から探索をやり直した！（HP・装備・所持品を完全復元）`);
    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** 復活回数上限等による確定ゲームオーバー処理 */
  public confirmGameOver(): void {
    this.status = 'GAME_OVER';
    this.soundManager.stopBgm();
    this.soundManager.playSfx('GAME_OVER');
    const save = SaveManager.getInstance();
    save.incrementPlayCount();
    this.player.gold = save.getGold();
    this.logMessage(
      `【白骨粉砕】スケルトンは砕け散り、魂は迷宮の深淵に呑まれた……獲得したゴールド（${this.player.gold} G）と主神の加護は次なる骨へと受け継がれる！`
    );
    if (this.onStateChangeCallback) this.onStateChangeCallback();
  }

  /** 冒険者パーティ（中ボス侵略者）の襲来・進行・退却処理 */
  private updateAdventurerParty(): void {
    // ユーザー要求：特定のターン（1000ターン）経過ごとに冒険者一行が攻めてくる
    if (this.turnCount > 0 && this.turnCount % 1000 === 0) {
      this.spawnAdventurerParty();
    }

    if (!this.floor.adventurers || this.floor.adventurers.length === 0) return;

    // 滞在ターンの減算と撤退チェック（ユーザー要求：500ターン逃げると冒険者は退却していなくなる）
    let partyRetreated = false;
    for (let i = this.floor.adventurers.length - 1; i >= 0; i--) {
      const adv = this.floor.adventurers[i];
      adv.turnsRemaining--;
      if (adv.turnsRemaining <= 0) {
        const idxInMonsters = this.floor.monsters.indexOf(adv);
        if (idxInMonsters !== -1) {
          this.floor.monsters.splice(idxInMonsters, 1);
        }
        this.floor.adventurers.splice(i, 1);
        this.addSparkParticles(adv.x * TILE_SIZE + 16, adv.y * TILE_SIZE + 16, '#74b9ff');
        partyRetreated = true;
      }
    }

    if (partyRetreated && this.floor.adventurers.length === 0) {
      this.soundManager.playSfx('POWER_UP');
      this.logMessage('【冒険者撤退】500ターン逃げ延びた！魔物討伐を諦めた人間の冒険者一行は迷宮から退却していった！');
    }
  }

  /** 冒険者一行を召喚・スポーン */
  private spawnAdventurerParty(): void {
    const invasionCount = Math.floor(this.turnCount / 1000); // 1, 2, 3...
    // 経過ターンが増えると複数攻めてきたり強くなる
    const partySize = Math.min(3, invasionCount);
    const baseAdvLv = Math.max(2, this.getEnemyLevel() + Math.min(6, invasionCount * 2));

    this.soundManager.playSfx('DRAGON_ROAR');
    this.renderer.triggerScreenShake(12);

    const roles: ('HERO' | 'WARRIOR' | 'MAGE')[] = ['HERO', 'WARRIOR', 'MAGE'];
    const names = [
      ['討伐隊長 勇者ジーク', '豪剣士 ギルバート', '大賢者 メルディス'],
      ['聖騎士 ローランド', '破滅の魔導神官', '双剣の勇者レオン'],
      ['神託の勇者 アルトリア', '剛腕重戦士 バルガス', '禁呪魔導士 クロード']
    ];
    const partyNameList = names[(invasionCount - 1) % names.length];

    for (let i = 0; i < partySize; i++) {
      const role = roles[i % roles.length];
      const name = partyNameList[i % partyNameList.length];

      let spawnX = this.player.x;
      let spawnY = this.player.y;
      for (let attempts = 0; attempts < 30; attempts++) {
        const sx = Math.max(2, Math.min(this.floor.width - 3, this.player.x + (Math.floor(Math.random() * 15) - 7)));
        const sy = Math.max(2, Math.min(this.floor.height - 3, this.player.y + (Math.floor(Math.random() * 15) - 7)));
        if (
          this.floor.tiles[sy]?.[sx] === 'FLOOR' &&
          Math.hypot(sx - this.player.x, sy - this.player.y) >= 4 &&
          !this.floor.monsters.some((m) => m.x === sx && m.y === sy)
        ) {
          spawnX = sx;
          spawnY = sy;
          break;
        }
      }

      const hp = 30 + baseAdvLv * 8;
      const atk = Math.max(3, 4 + Math.floor(baseAdvLv * 0.8));

      const adv: AdventurerEntity = {
        id: `adv_${this.turnCount}_${i}`,
        type: role === 'MAGE' ? 'WIZARD' : 'GOBLIN',
        catalogId: `adv_catalog_${role}`,
        name: `⚔️[冒険者] ${name}`,
        color: role === 'HERO' ? '#f1c40f' : role === 'MAGE' ? '#9b59b6' : '#e74c3c',
        subColor: '#ffffff',
        x: spawnX,
        y: spawnY,
        renderX: spawnX,
        renderY: spawnY,
        direction: 'DOWN',
        hp,
        maxHp: hp,
        attackPower: atk,
        defensePower: Math.floor(baseAdvLv * 0.4),
        speed: 1,
        moveTimer: 0,
        carriedItem: null,
        level: baseAdvLv,
        isPreemptive: true,
        isRanged: role === 'MAGE',
        isAdventurer: true,
        role,
        turnsRemaining: 500,
        initialTurns: 500,
      };

      this.floor.monsters.push(adv);
      if (!this.floor.adventurers) this.floor.adventurers = [];
      this.floor.adventurers.push(adv);
      this.addSparkParticles(spawnX * TILE_SIZE + 16, spawnY * TILE_SIZE + 16, '#ffd700');
    }

    this.logMessage(
      `⚠️【警告】第${invasionCount}波 人間の冒険者一行（${partySize}名）がスケルトン討伐のため迷宮へ急襲！500ターン逃げ延びよ！`
    );
  }

  /** FOE（世界樹の迷宮のField On Enemy徘徊巨影）の更新処理 */
  private updateFoe(): void {
    if (!this.floor.foe) {
      if (this.turnCount >= 60 && this.turnCount % 120 === 0 && Math.random() < 0.6) {
        this.spawnFoe();
      }
      return;
    }

    const foe = this.floor.foe;
    foe.remainingTurns--;

    // 消滅判定
    if (foe.remainingTurns <= 0) {
      this.addSparkParticles(foe.x * TILE_SIZE + 32, foe.y * TILE_SIZE + 32, '#a55eea');
      this.logMessage(`【巨影霧散】徘徊していた『${foe.name}』は異界の暗がりへと消え去った……`);
      this.floor.foe = null;
      return;
    }

    // ユーザー要求：2マス以内に近づくと攻撃してくる
    const distToPlayer = Math.max(
      Math.abs(foe.x - this.player.x),
      Math.abs(foe.y - this.player.y),
      Math.abs((foe.x + 1) - this.player.x),
      Math.abs((foe.y + 1) - this.player.y)
    );

    if (distToPlayer <= 2) {
      this.soundManager.playSfx('DRAGON_BREATH');
      this.renderer.triggerScreenShake(10);
      this.addSparkParticles(this.player.x * TILE_SIZE + 16, this.player.y * TILE_SIZE + 16, '#8854d0');
      this.addTextParticle(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, 'FOE DANGER STRIKE!', '#eb3b5a');
      this.logMessage(`⚠️【FOE接近危険！】『${foe.name}』の間合い（2マス以内）に踏み込んでしまった！巨影の破壊波動を喰らった！`);
      
      const foeDamage = Math.max(8, Math.floor(this.player.maxHp * 0.35));
      this.applyDamageToPlayer(foeDamage, `${foe.name}の殲滅領域`);
    }

    // ユーザー要求：プレイヤーを狙ってはこない、うろうろ徘徊する
    foe.roamCooldown = (foe.roamCooldown || 0) + 1;
    if (foe.roamCooldown >= 2) {
      foe.roamCooldown = 0;
      const dirs = [
        { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
      ];
      const d = dirs[Math.floor(Math.random() * dirs.length)];
      const tx = foe.x + d.dx;
      const ty = foe.y + d.dy;

      if (
        tx >= 1 && tx + 1 < this.floor.width &&
        ty >= 1 && ty + 1 < this.floor.height &&
        this.floor.tiles[ty]?.[tx] === 'FLOOR' &&
        this.floor.tiles[ty]?.[tx + 1] === 'FLOOR' &&
        this.floor.tiles[ty + 1]?.[tx] === 'FLOOR' &&
        this.floor.tiles[ty + 1]?.[tx + 1] === 'FLOOR'
      ) {
        foe.x = tx;
        foe.y = ty;
      }
    }
  }

  /** FOE（徘徊巨大エネミー）のスポーン */
  private spawnFoe(): void {
    let spawnX = -1;
    let spawnY = -1;
    for (let attempts = 0; attempts < 40; attempts++) {
      const rx = 3 + Math.floor(Math.random() * (this.floor.width - 6));
      const ry = 3 + Math.floor(Math.random() * (this.floor.height - 6));
      if (
        Math.hypot(rx - this.player.x, ry - this.player.y) >= 10 &&
        this.floor.tiles[ry]?.[rx] === 'FLOOR' &&
        this.floor.tiles[ry]?.[rx + 1] === 'FLOOR' &&
        this.floor.tiles[ry + 1]?.[rx] === 'FLOOR' &&
        this.floor.tiles[ry + 1]?.[rx + 1] === 'FLOOR'
      ) {
        spawnX = rx;
        spawnY = ry;
        break;
      }
    }

    if (spawnX < 0) return;

    this.floor.foe = {
      id: `foe_${Date.now()}`,
      name: '深淵の巨影 ヴォイドコロッサス',
      x: spawnX,
      y: spawnY,
      renderX: spawnX,
      renderY: spawnY,
      size: 2,
      color: '#341f97',
      subColor: '#5f27cd',
      eyeColor: '#ff3838',
      hp: 99999,
      maxHp: 99999,
      attackPower: 9999,
      defensePower: 999,
      remainingTurns: 150,
      maxTurns: 150,
      roamCooldown: 0,
    };

    this.soundManager.playSfx('DRAGON_ROAR');
    this.logMessage('⚠️【FOE出現】とてもじゃないが倒せない罠的巨大エネミー『深淵の巨影』が出現した！狙ってはこないが2マス以内に近づくと攻撃される！');
  }
}
