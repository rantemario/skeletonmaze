/**
 * Canvas 2D 高精細ピクセルアート・レンダリングエンジン
 * 初代ドラゴンスレイヤーのPC-8801/80年代テイストをリスペクトしつつ、
 * 動的なトーチライティング、美麗なプロシージャル・ドット絵スプライト、
 * ミニマップレーダー、画面振動、CRTスキャンラインエフェクトを統合する。
 */

import { TILE_SIZE } from '../types';
import type {
  DungeonFloor,
  PlayerState,
  Projectile,
  Particle,
  TileType,
  FieldItem,
  MonsterEntity,
  DragonBoss,
  MonsterPortal,
  FoeEntity,
} from '../types';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private miniMapCanvas: HTMLCanvasElement;
  private miniMapCtx: CanvasRenderingContext2D;

  // 拡大戦術レーダーマップ用
  private expandedRadarCanvas: HTMLCanvasElement | null = null;
  private expandedRadarCtx: CanvasRenderingContext2D | null = null;
  public focusTileX: number = -1;
  public focusTileY: number = -1;
  public coveragePercent: number = 0;

  public enableCrtFilter: boolean = true;
  private screenShakeAmount: number = 0;
  private animationFrameCount: number = 0;

  // 画像スプライトアセット（王冠）
  private crownImg: HTMLImageElement | null = null;

  constructor(canvas: HTMLCanvasElement, miniMapCanvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2Dコンテキストの取得に失敗しました');
    this.ctx = ctx;

    this.miniMapCanvas = miniMapCanvas;
    const miniCtx = miniMapCanvas.getContext('2d');
    if (!miniCtx) throw new Error('ミニマップコンテキストの取得に失敗しました');
    this.miniMapCtx = miniCtx;

    // 拡大レーダーキャンバスのバインド
    const expCanvas = document.getElementById('expanded-radar-canvas') as HTMLCanvasElement | null;
    if (expCanvas) {
      this.expandedRadarCanvas = expCanvas;
      this.expandedRadarCtx = expCanvas.getContext('2d');
    }

    // 画像アセットの先読みロード
    this.loadImages();
  }

  /** 画像アセットのロード */
  private loadImages(): void {
    const crown = new Image();
    crown.src = '/assets/crown.jpg';
    crown.onload = () => { this.crownImg = crown; };
  }

  /** 画面揺れ（スクリーンシェイク）の適用 */
  public triggerScreenShake(amount: number = 10): void {
    this.screenShakeAmount = Math.max(this.screenShakeAmount, amount);
  }

  /** メイン描画メソッド */
  public render(
    floor: DungeonFloor,
    player: PlayerState,
    projectiles: Projectile[],
    particles: Particle[],
    deltaTime: number,
    turnCount: number = 0
  ): void {
    this.animationFrameCount++;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // 画面クリア
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    ctx.save();

    // 画面揺れ減衰と座標シフト
    if (this.screenShakeAmount > 0) {
      const shakeX = (Math.random() - 0.5) * this.screenShakeAmount;
      const shakeY = (Math.random() - 0.5) * this.screenShakeAmount;
      ctx.translate(shakeX, shakeY);
      this.screenShakeAmount = Math.max(0, this.screenShakeAmount - deltaTime * 30);
    }

    // カメラ位置の計算（プレイヤー中心、移動時のサブピクセルジッター・揺れを完全に防ぐため整数スナップ）
    const cameraX = Math.round(player.renderX * TILE_SIZE + TILE_SIZE / 2 - width / 2);
    const cameraY = Math.round(player.renderY * TILE_SIZE + TILE_SIZE / 2 - height / 2);

    ctx.translate(-cameraX, -cameraY);

    // 1. マップタイル描画（視界内のみ）
    this.renderTiles(floor, cameraX, cameraY, width, height);

    // 1.5. 魔法陣（ポータル）描画
    if (floor.portals) {
      this.renderPortals(floor.portals, floor.exploredTiles);
    }

    // 2. アイテム描画
    this.renderItems(floor.items, floor.exploredTiles);

    // 3. モンスター描画
    this.renderMonsters(floor.monsters, floor.exploredTiles);

    // 4. ドラゴンボス描画（王冠3つ未収集時は物理結界エフェクトを表示）
    this.renderDragon(floor.dragon, floor.exploredTiles, player.crownsDelivered >= 3);

    // 4.5. 世界樹の迷宮FOE（巨大徘徊エネミー）描画
    this.renderFoe(floor.foe, floor.exploredTiles);

    // 5. プレイヤー描画
    this.renderPlayer(player);

    // 6. 飛翔体（ブレス・魔法弾）描画
    this.renderProjectiles(projectiles);

    // 7. 動的ライティング・霧（Fog of War / 光源）
    this.renderLightingAndFog(floor, player, cameraX, cameraY, width, height);

    // 8. パーティクル・テキストポップアップ描画
    this.renderParticles(particles);

    ctx.restore();

    // 9. CRTスキャンライン・ビネット（画面全体オーバレイ）
    if (this.enableCrtFilter) {
      this.renderCrtOverlay(width, height);
    }

    // 10. ゲーム画面HUD描画（左上ターン数・右上王冠）
    this.renderHUD(turnCount, player);

    // 11. ミニマップの描画
    this.renderMiniMap(floor, player);

    // 12. 拡大レーダーマップが開いている場合は高精細リアルタイム描画
    if (this.isExpandedRadarOpen()) {
      this.renderExpandedRadar(floor, player);
    }
  }

  /** マップタイルのプロシージャルドット描画 */
  private renderTiles(
    floor: DungeonFloor,
    cameraX: number,
    cameraY: number,
    screenWidth: number,
    screenHeight: number
  ): void {
    const ctx = this.ctx;
    const startCol = Math.max(0, Math.floor(cameraX / TILE_SIZE) - 1);
    const endCol = Math.min(floor.width - 1, Math.ceil((cameraX + screenWidth) / TILE_SIZE) + 1);
    const startRow = Math.max(0, Math.floor(cameraY / TILE_SIZE) - 1);
    const endRow = Math.min(floor.height - 1, Math.ceil((cameraY + screenHeight) / TILE_SIZE) + 1);

    for (let y = startRow; y <= endRow; y++) {
      for (let x = startCol; x <= endCol; x++) {
        // 未探索タイルの描画スキップ
        if (!floor.exploredTiles[y][x]) continue;

        const tile = floor.tiles[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        this.drawTileSprite(ctx, tile, px, py, x, y, floor);
      }
    }
  }

  /** フロア番号に応じたダンジョン壁・床・ブロックのテーマカラーを取得 */
  private getFloorTheme(floorNumber: number): {
    floorBase: string;
    floorBorder: string;
    floorJoint: string;
    wallBase: string;
    wallHighlight: string;
    wallShadow: string;
    blockBase: string;
    blockHighlight: string;
    blockShadow: string;
    blockCore: string;
  } {
    const cycle = Math.max(0, floorNumber - 1) % 5;
    switch (cycle) {
      case 1:
        // 2F: 深緑の地底樹海・苔むした回廊
        return {
          floorBase: '#1c2b22',
          floorBorder: '#283d31',
          floorJoint: '#14211a',
          wallBase: '#264234',
          wallHighlight: '#3c6350',
          wallShadow: '#15261d',
          blockBase: '#3d6138',
          blockHighlight: '#598a52',
          blockShadow: '#263d23',
          blockCore: '#70b366',
        };
      case 2:
        // 3F: 灼熱の紅蓮回廊・マグマ洞窟
        return {
          floorBase: '#331f20',
          floorBorder: '#4a2c2e',
          floorJoint: '#241516',
          wallBase: '#522528',
          wallHighlight: '#75373a',
          wallShadow: '#2e1214',
          blockBase: '#783525',
          blockHighlight: '#a34c37',
          blockShadow: '#4a1e14',
          blockCore: '#e65c00',
        };
      case 3:
        // 4F: 深淵の紫晶魔宮・ヴォイド回廊
        return {
          floorBase: '#221930',
          floorBorder: '#34264a',
          floorJoint: '#171121',
          wallBase: '#3c2357',
          wallHighlight: '#58367d',
          wallShadow: '#211233',
          blockBase: '#5c2d73',
          blockHighlight: '#8242a1',
          blockShadow: '#361845',
          blockCore: '#bd53ed',
        };
      case 4:
        // 5F+: 黄金の聖域・古代神殿
        return {
          floorBase: '#332f20',
          floorBorder: '#4a442e',
          floorJoint: '#211e13',
          wallBase: '#544622',
          wallHighlight: '#7a6836',
          wallShadow: '#2e250f',
          blockBase: '#806e28',
          blockHighlight: '#ad9539',
          blockShadow: '#4d4114',
          blockCore: '#f1c40f',
        };
      case 0:
      default:
        // 1F: 古代石道・重厚な石造り回廊
        return {
          floorBase: '#2d2e3d',
          floorBorder: '#3e3f54',
          floorJoint: '#222330',
          wallBase: '#483d5a',
          wallHighlight: '#65577e',
          wallShadow: '#2c2538',
          blockBase: '#a66832',
          blockHighlight: '#d4984d',
          blockShadow: '#6e3c15',
          blockCore: '#f1c40f',
        };
    }
  }

  /** タイルごとのピクセルアート描画 */
  private drawTileSprite(
    ctx: CanvasRenderingContext2D,
    tile: TileType,
    px: number,
    py: number,
    gridX: number,
    gridY: number,
    floor: DungeonFloor
  ): void {
    const s = TILE_SIZE;
    const theme = this.getFloorTheme(floor.floorNumber);

    switch (tile) {
      case 'FLOOR': {
        // ステージ進行に応じたフロアカラー
        ctx.fillStyle = theme.floorBase;
        ctx.fillRect(px, py, s, s);

        ctx.strokeStyle = theme.floorBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);

        // 石の目地・テクスチャ
        if ((gridX + gridY) % 3 === 0) {
          ctx.fillStyle = theme.floorJoint;
          ctx.fillRect(px + 4, py + 6, 2, 2);
          ctx.fillRect(px + 18, py + 20, 2, 2);
        }
        break;
      }

      case 'WALL': {
        // ステージ進行に応じた重厚なダンジョン外壁
        ctx.fillStyle = theme.wallBase;
        ctx.fillRect(px, py, s, s);

        // 石積みのハイライトとシャドウ
        ctx.fillStyle = theme.wallHighlight;
        ctx.fillRect(px, py, s, 3);
        ctx.fillRect(px, py + s / 2, s, 2);

        ctx.fillStyle = theme.wallShadow;
        ctx.fillRect(px, py + s - 3, s, 3);
        ctx.fillRect(px + (gridY % 2 === 0 ? 10 : 20), py, 2, s / 2);
        ctx.fillRect(px + (gridY % 2 === 0 ? 22 : 8), py + s / 2, 2, s / 2);
        break;
      }

      case 'BLOCK': {
        // ステージ進行に応じた岩ブロック
        ctx.fillStyle = theme.blockBase;
        ctx.fillRect(px, py, s, s);

        // ハイライト
        ctx.fillStyle = theme.blockHighlight;
        ctx.fillRect(px + 2, py + 2, s - 4, 3);
        ctx.fillRect(px + 2, py + 2, 3, s - 4);

        // シャドウ
        ctx.fillStyle = theme.blockShadow;
        ctx.fillRect(px + 2, py + s - 5, s - 4, 3);
        ctx.fillRect(px + s - 5, py + 2, 3, s - 4);

        // 中央の押しやすい手掛かり（古代の取っ手マーク）
        ctx.fillStyle = theme.blockCore;
        ctx.fillRect(px + 10, py + 10, 12, 12);
        ctx.fillStyle = theme.blockShadow;
        ctx.fillRect(px + 13, py + 13, 6, 6);
        break;
      }



      case 'SPRING': {
        // 回復の泉：飲むとHPが全快し、一度使うと消える（枯れて床になる）聖なる泉
        // 1. 周囲の敷石
        ctx.fillStyle = '#222330';
        ctx.fillRect(px, py, s, s);

        // 2. 円形の泉枠（石組み）
        ctx.fillStyle = '#4b5563';
        ctx.beginPath();
        ctx.arc(px + 16, py + 16, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#6b7280';
        ctx.beginPath();
        ctx.arc(px + 15, py + 15, 13, 0, Math.PI * 2);
        ctx.fill();

        // 3. 聖なる澄んだ水たまり（深藍〜エメラルドシアン）
        const waterPulse = Math.sin(this.animationFrameCount * 0.1 + (gridX + gridY)) * 0.15 + 0.85;
        const waterGrad = ctx.createRadialGradient(px + 16, py + 16, 2, px + 16, py + 16, 11);
        waterGrad.addColorStop(0, `rgba(129, 236, 236, ${waterPulse})`);
        waterGrad.addColorStop(0.7, 'rgba(0, 184, 148, 0.9)');
        waterGrad.addColorStop(1, 'rgba(9, 132, 227, 0.95)');
        ctx.fillStyle = waterGrad;
        ctx.beginPath();
        ctx.arc(px + 16, py + 16, 11, 0, Math.PI * 2);
        ctx.fill();

        // 4. 水面の波紋リング
        const rippleR = 3 + (this.animationFrameCount % 24) * 0.35;
        const rippleAlpha = Math.max(0, 1 - (rippleR / 11));
        ctx.strokeStyle = `rgba(223, 249, 251, ${rippleAlpha * 0.7})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px + 16, py + 16, rippleR, 0, Math.PI * 2);
        ctx.stroke();

        // 5. 聖なる湧き水・気泡
        const bubbleY = py + 16 - (this.animationFrameCount % 12);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + 15, bubbleY, 2, 2);
        ctx.fillRect(px + 13, py + 14, 1.5, 1.5);
        ctx.fillRect(px + 18, py + 17, 1.5, 1.5);

        // 6. 聖なる十字架の煌めき（中央）
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + 15, py + 13, 2, 6);
        ctx.fillRect(px + 13, py + 15, 6, 2);
        break;
      }

      case 'HOME': {
        // 我が家（HOME）：聖なる古代の碑石（モノリス・ルーンストーン）
        const stone = floor.homeStones?.find((s) => s.x === gridX && s.y === gridY);
        const chargeTurns = stone ? stone.chargeTurns : 10;
        const isMaxCharge = chargeTurns >= 10;

        // 1. 神聖な石造り基盤・魔法陣サークル
        ctx.fillStyle = '#1e1b2e';
        ctx.fillRect(px, py, s, s);

        // 円形台座の敷石
        ctx.fillStyle = '#2c2240';
        ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
        ctx.fillStyle = '#3a2d54';
        ctx.fillRect(px + 4, py + 4, s - 8, s - 8);

        // 2. 碑石（古代モノリス石柱）の土台
        ctx.fillStyle = '#485460';
        ctx.fillRect(px + 6, py + 22, s - 12, 6);
        ctx.fillStyle = '#1e272e';
        ctx.fillRect(px + 6, py + 26, s - 12, 2);

        // 3. 碑石本体（石柱）
        // 左側の明部（ハイライト）
        ctx.fillStyle = '#808e9b';
        ctx.fillRect(px + 9, py + 5, 4, 17);
        // 中央・右側の本体石材
        ctx.fillStyle = '#57606f';
        ctx.fillRect(px + 13, py + 5, 7, 17);
        // 右端の暗いエッジ影
        ctx.fillStyle = '#2f3542';
        ctx.fillRect(px + 20, py + 6, 3, 16);
        // 上部ピラミッド状の面取り
        ctx.fillStyle = '#a4b0be';
        ctx.fillRect(px + 11, py + 4, 10, 2);
        ctx.fillRect(px + 13, py + 3, 6, 2);

        // 4. 碑石に刻まれた古代ルーン文字（神秘的な脈動発光）
        const runePulse = Math.sin(this.animationFrameCount * 0.1) * 0.35 + 0.65;
        ctx.fillStyle = isMaxCharge ? `rgba(255, 215, 0, ${runePulse})` : `rgba(0, 255, 204, ${runePulse})`;
        // ルーン文字の幾何学パターン刻印
        ctx.fillRect(px + 14, py + 7, 4, 2);
        ctx.fillRect(px + 15, py + 9, 2, 8);
        ctx.fillRect(px + 13, py + 11, 6, 2);
        ctx.fillRect(px + 14, py + 15, 4, 2);

        // 5. 碑石頂点に浮かぶ聖なる魔力球
        const orbBounce = Math.sin(this.animationFrameCount * 0.15) * 1.5;
        ctx.fillStyle = isMaxCharge ? '#ffeaa7' : `rgba(241, 196, 15, ${runePulse * 0.9})`;
        ctx.beginPath();
        ctx.arc(px + 16, py + 2 + orbBounce, isMaxCharge ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();

        // 6. 最大チャージ（10ターン=100%全快可能）の特別エフェクト演出！
        if (isMaxCharge) {
          // A. 天高く伸びる聖なる光柱（グラデーション光）
          const beamGradient = ctx.createLinearGradient(px + 16, py + 32, px + 16, py - 40);
          beamGradient.addColorStop(0, 'rgba(255, 215, 0, 0.45)');
          beamGradient.addColorStop(0.5, 'rgba(0, 255, 204, 0.3)');
          beamGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = beamGradient;
          ctx.fillRect(px + 4, py - 40, 24, 72);

          // B. 黄金の光輪（ヘイロー）
          const haloPulse = Math.sin(this.animationFrameCount * 0.2) * 3 + 12;
          ctx.strokeStyle = `rgba(255, 215, 0, ${runePulse * 0.8})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px + 16, py + 2 + orbBounce, haloPulse, 0, Math.PI * 2);
          ctx.stroke();

          // C. 回転する聖なる光片
          const angle1 = this.animationFrameCount * 0.08;
          const r = 10;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px + 16 + Math.cos(angle1) * r - 1, py + 12 + Math.sin(angle1) * r - 1, 2, 2);
          ctx.fillRect(px + 16 + Math.cos(angle1 + Math.PI) * r - 1, py + 12 + Math.sin(angle1 + Math.PI) * r - 1, 2, 2);

          // D. 「MAX CHARGE」テキスト演出
          ctx.fillStyle = '#ffeaa7';
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('⚡100% MAX⚡', px + 16, py - 10 + orbBounce);
        } else {
          // チャージ進行中インジケーター（チャージターン×10%）
          const pct = chargeTurns * 10;
          ctx.fillStyle = 'rgba(0, 255, 204, 0.2)';
          ctx.fillRect(px, py, s, s);

          // 頭上にチャージ率を控えめに表示
          ctx.fillStyle = 'rgba(0, 255, 204, 0.8)';
          ctx.font = '7px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${pct}%`, px + 16, py - 4);
        }
        break;
      }

      case 'WATER': {
        ctx.fillStyle = '#1e3799';
        ctx.fillRect(px, py, s, s);
        ctx.fillStyle = '#4a69bd';
        const waveOffset = (this.animationFrameCount + gridX * 2) % 10;
        ctx.fillRect(px + waveOffset, py + 8, 6, 2);
        ctx.fillRect(px + ((waveOffset + 8) % s), py + 20, 8, 2);
        break;
      }

      case 'GRAVE': {
        // 墓石（GRAVE）：モンスターハウスの石造り十字架墓標
        ctx.fillStyle = '#12131a';
        ctx.fillRect(px, py, s, s);

        // 墓石土台
        ctx.fillStyle = '#57606f';
        ctx.fillRect(px + 4, py + 22, s - 8, 7);
        ctx.fillStyle = '#2f3542';
        ctx.fillRect(px + 4, py + 27, s - 8, 2);

        // 十字架の縦柱
        ctx.fillStyle = '#747d8c';
        ctx.fillRect(px + 13, py + 5, 6, 18);
        // 十字架の横木
        ctx.fillRect(px + 8, py + 10, 16, 5);

        // 苔・ヒビの陰影
        ctx.fillStyle = '#2f3542';
        ctx.fillRect(px + 14, py + 6, 2, 8);
        ctx.fillStyle = '#27ae60';
        ctx.fillRect(px + 6, py + 24, 3, 2);
        break;
      }

      case 'WARP': {
        // ワープマス：空間転移のルーン陣（妖しい青紫とシアンの回転ワームホール）
        // 1. 床下地
        ctx.fillStyle = '#120d1e';
        ctx.fillRect(px, py, s, s);

        // 2. 回転する外周ルーンサークル
        const rot = (this.animationFrameCount * 0.05) % (Math.PI * 2);
        const pulse = Math.sin(this.animationFrameCount * 0.15) * 0.2 + 0.8;
        ctx.save();
        ctx.translate(px + 16, py + 16);
        ctx.rotate(rot);

        // 外枠の魔法陣
        ctx.strokeStyle = `rgba(165, 94, 234, ${pulse})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.stroke();

        // 幾何学四芒星
        ctx.strokeStyle = `rgba(0, 255, 255, ${pulse * 0.8})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(-8, -8, 16, 16);

        ctx.restore();

        // 3. 中心の空間の裂け目（吸い込まれるような光）
        const coreR = Math.sin(this.animationFrameCount * 0.2) * 2 + 5;
        const grad = ctx.createRadialGradient(px + 16, py + 16, 1, px + 16, py + 16, coreR + 4);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, '#00ffff');
        grad.addColorStop(0.8, '#8854d0');
        grad.addColorStop(1, 'rgba(18, 13, 30, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px + 16, py + 16, coreR + 4, 0, Math.PI * 2);
        ctx.fill();

        // 4. 周囲に舞い散る転移の光粒子
        for (let i = 0; i < 4; i++) {
          const pAngle = (this.animationFrameCount * 0.08 + (i * Math.PI) / 2) % (Math.PI * 2);
          const pr = 9;
          ctx.fillStyle = i % 2 === 0 ? '#00ffff' : '#e056fd';
          ctx.fillRect(px + 15 + Math.cos(pAngle) * pr, py + 15 + Math.sin(pAngle) * pr, 2, 2);
        }
        break;
      }
    }
  }

  /** アイテム一覧のピクセルアート描画 */
  private renderItems(items: FieldItem[], explored: boolean[][]): void {
    const ctx = this.ctx;
    const bounce = Math.sin(this.animationFrameCount * 0.12) * 2; // アイテムの浮遊感

    for (const item of items) {
      if (!explored[item.y][item.x]) continue;

      const px = item.x * TILE_SIZE;
      const py = item.y * TILE_SIZE + bounce;

      switch (item.type) {
        case 'CROWN': {
          // 初代最重要アイテム：王冠（クラウン）
          if (this.crownImg && this.crownImg.complete && this.crownImg.naturalWidth > 0) {
            ctx.save();
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur = 10;
            // 黄金の輝きオーラ
            const auraScale = 1 + Math.sin(this.animationFrameCount * 0.15) * 0.08;
            ctx.drawImage(this.crownImg, px + 3, py + 3, 26 * auraScale, 26 * auraScale);
            ctx.restore();
          } else {
            // プロシージャル描画フォールバック
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(px + 6, py + 10, 20, 12);
            ctx.clearRect(px + 11, py + 10, 3, 5);
            ctx.clearRect(px + 18, py + 10, 3, 5);
            ctx.fillStyle = '#ff3838';
            ctx.fillRect(px + 8, py + 17, 3, 3);
            ctx.fillStyle = '#2ed573';
            ctx.fillRect(px + 14, py + 17, 4, 3);
            ctx.fillStyle = '#1e90ff';
            ctx.fillRect(px + 21, py + 17, 3, 3);
          }
          break;
        }

        case 'POWER_STONE': {
          // パワーストーン（力の石）：青紫の神秘の結晶
          ctx.fillStyle = '#9b59b6';
          ctx.beginPath();
          ctx.moveTo(px + 16, py + 6);
          ctx.lineTo(px + 25, py + 14);
          ctx.lineTo(px + 16, py + 26);
          ctx.lineTo(px + 7, py + 14);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#d2b4de';
          ctx.fillRect(px + 13, py + 10, 6, 6);
          break;
        }

        case 'STAMINA_STONE': {
          // スタミナストーン（生命の石）：エメラルドグリーンの輝く結晶（最大HP・HP上昇）
          ctx.save();
          // 生命の鼓動パルス
          const pulse = Math.sin(this.animationFrameCount * 0.18) * 0.25 + 0.75;
          ctx.shadowColor = `rgba(46, 204, 113, ${pulse})`;
          ctx.shadowBlur = 8;

          // 八角形のグリーンクリスタル
          ctx.fillStyle = '#27ae60';
          ctx.beginPath();
          ctx.moveTo(px + 16, py + 6);
          ctx.lineTo(px + 25, py + 14);
          ctx.lineTo(px + 16, py + 26);
          ctx.lineTo(px + 7, py + 14);
          ctx.closePath();
          ctx.fill();

          // 鮮やかな内側ハイライト
          ctx.fillStyle = '#2ecc71';
          ctx.beginPath();
          ctx.moveTo(px + 16, py + 9);
          ctx.lineTo(px + 22, py + 14);
          ctx.lineTo(px + 16, py + 23);
          ctx.lineTo(px + 10, py + 14);
          ctx.closePath();
          ctx.fill();

          // 心臓の鼓動を模した生命のコア輝き
          ctx.fillStyle = '#a8e6cf';
          ctx.fillRect(px + 13, py + 11, 6, 6);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px + 14, py + 12, 3, 3);
          ctx.restore();
          break;
        }

        case 'KEY': {
          // 鍵
          ctx.fillStyle = '#f1c40f';
          ctx.fillRect(px + 8, py + 10, 8, 8); // 輪
          ctx.clearRect(px + 10, py + 12, 4, 4);
          ctx.fillRect(px + 15, py + 13, 10, 3); // 軸
          ctx.fillRect(px + 21, py + 16, 2, 4); // 突起
          ctx.fillRect(px + 24, py + 16, 2, 4);
          break;
        }

        case 'CHEST_BRONZE':
        case 'CHEST_SILVER':
        case 'CHEST_GOLD':
        case 'TREASURE': {
          const isGold = item.type === 'CHEST_GOLD';
          const isSilver = item.type === 'CHEST_SILVER';

          ctx.save();
          if (isGold) {
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur = 8;
          } else if (isSilver) {
            ctx.shadowColor = '#00d2d3';
            ctx.shadowBlur = 6;
          }

          // 1. 宝箱の下部本体（木製 / 銀製 / 金製）
          const baseColor = isGold ? '#d35400' : isSilver ? '#34495e' : '#5c3818';
          ctx.fillStyle = baseColor;
          ctx.fillRect(px + 6, py + 12, 20, 12);

          // 2. 丸みを帯びたフタ
          const lidColor = isGold ? '#e67e22' : isSilver ? '#4b6584' : '#795548';
          ctx.fillStyle = lidColor;
          ctx.fillRect(px + 6, py + 7, 20, 5);
          ctx.fillRect(px + 8, py + 6, 16, 1);

          // 3. 金属バンド・リベット（ブロンズ・シルバー・ゴールド）
          const metalColor = isGold ? '#f1c40f' : isSilver ? '#d1d8e0' : '#cd7f32';
          ctx.fillStyle = metalColor;
          // フタの帯
          ctx.fillRect(px + 9, py + 6, 2, 6);
          ctx.fillRect(px + 21, py + 6, 2, 6);
          // 本体の帯
          ctx.fillRect(px + 9, py + 12, 2, 12);
          ctx.fillRect(px + 21, py + 12, 2, 12);
          // 横の縁取りライン
          ctx.fillRect(px + 6, py + 11, 20, 2);

          // 4. 豪華な鍵穴・フロントバックル
          const buckleColor = isGold ? '#ffd700' : isSilver ? '#ffffff' : '#f39c12';
          ctx.fillStyle = buckleColor;
          ctx.fillRect(px + 14, py + 11, 4, 5);

          // 5. 鍵穴の黒いスリット
          ctx.fillStyle = '#000000';
          ctx.fillRect(px + 15, py + 13, 2, 2);

          // 6. ゴールド宝箱のキラキラ輝き演出
          if (isGold && this.animationFrameCount % 12 < 6) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(px + 13, py + 5, 2, 2);
          }

          ctx.restore();
          break;
        }

        case 'SCROLL_FIRE_BOLT':
        case 'SCROLL_HEAL_LIGHT':
        case 'SCROLL_THUNDER_STRIKE':
        case 'SCROLL_THUNDER':
        case 'SCROLL_FROST_NOVA':
        case 'SCROLL_METEOR_SWARM':
        case 'SCROLL_METEOR':
        case 'SCROLL_RETURN_HOME':
        case 'SCROLL_POWER':
        case 'SCROLL_RECOVERY':
        case 'SCROLL_BLAST':
        case 'SCROLL_FREEZE':
        case 'SCROLL_CLAIRVOYANCE': {
          // 古代の魔法スクロール（巻物）
          // 羊皮紙の巻物本体
          ctx.fillStyle = '#f5f6fa';
          ctx.fillRect(px + 8, py + 9, 16, 14);

          // 巻物の端の丸まり（上下の木軸）
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(px + 6, py + 7, 20, 3);
          ctx.fillRect(px + 6, py + 22, 20, 3);

          // スクロール種別ごとの魔力リボン・紋章色
          let ribbonColor = '#e74c3c'; // FIRE / POWER
          if (item.type.includes('HEAL') || item.type.includes('RECOVERY')) {
            ribbonColor = '#2ecc71'; // 聖光・治癒
          } else if (item.type.includes('THUNDER') || item.type.includes('BLAST')) {
            ribbonColor = '#f1c40f'; // 迅雷
          } else if (item.type.includes('FROST') || item.type.includes('FREEZE')) {
            ribbonColor = '#00d2d3'; // 氷結
          } else if (item.type.includes('METEOR')) {
            ribbonColor = '#e67e22'; // 隕石
          } else if (item.type.includes('RETURN')) {
            ribbonColor = '#3498db'; // 瞬動
          } else if (item.type.includes('CLAIRVOYANCE')) {
            ribbonColor = '#9b59b6'; // 千里眼
          }

          // 中央の封印リボン
          ctx.fillStyle = ribbonColor;
          ctx.fillRect(px + 14, py + 9, 4, 14);

          // 聖なるルーン文字
          ctx.fillStyle = '#2f3640';
          ctx.fillRect(px + 10, py + 12, 3, 2);
          ctx.fillRect(px + 19, py + 12, 3, 2);
          ctx.fillRect(px + 10, py + 16, 3, 2);
          ctx.fillRect(px + 19, py + 16, 3, 2);

          // 魔力の微粒子オーラ
          if (this.animationFrameCount % 14 < 7) {
            ctx.fillStyle = ribbonColor;
            ctx.fillRect(px + 15, py + 5, 2, 2);
          }
          break;
        }

        case 'RING': {
          // 指輪
          ctx.strokeStyle = '#e74c3c';
          ctx.lineWidth = 3;
          ctx.strokeRect(px + 10, py + 10, 12, 12);
          ctx.fillStyle = '#00ffff';
          ctx.fillRect(px + 14, py + 8, 4, 4); // ダイヤ
          break;
        }

        case 'CROSS': {
          // 聖なる十字架
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px + 14, py + 6, 4, 20);
          ctx.fillRect(px + 8, py + 11, 16, 4);
          // 輝きオーラ
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.fillRect(px + 6, py + 4, 20, 24);
          break;
        }

        case 'POTION': {
          // 回復薬
          ctx.fillStyle = '#2ecc71';
          ctx.fillRect(px + 11, py + 12, 10, 12);
          ctx.fillStyle = '#ecf0f1';
          ctx.fillRect(px + 14, py + 8, 4, 4); // コルク栓
          break;
        }

        case 'REVIVE_POTION': {
          // 黄泉還りの秘薬（コンティニューアイテム）：黄金と不死の紫に輝くフラスコ
          ctx.save();
          const revPulse = Math.sin(this.animationFrameCount * 0.2) * 0.3 + 0.7;
          ctx.shadowColor = `rgba(255, 215, 0, ${revPulse})`;
          ctx.shadowBlur = 10;

          // 黄金のフラスコ枠
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(px + 10, py + 12, 12, 12);
          // 中の不死の紫薬液
          ctx.fillStyle = '#8854d0';
          ctx.fillRect(px + 12, py + 14, 8, 8);
          // 霊光のコア
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px + 14, py + 16, 4, 4);
          // 金の栓
          ctx.fillStyle = '#ffeaa7';
          ctx.fillRect(px + 13, py + 8, 6, 4);
          ctx.restore();
          break;
        }

        case 'SPELL_BOOK': {
          // 魔導書
          ctx.fillStyle = '#34495e';
          ctx.fillRect(px + 8, py + 8, 16, 16);
          ctx.fillStyle = '#e67e22';
          ctx.fillRect(px + 13, py + 11, 6, 10);
          break;
        }

        case 'ARTIFACT_BAG': {
          // 次元の袋（運搬枠拡張アーティファクト）
          // 魔法の革袋本体（深藍〜紫）
          ctx.fillStyle = '#2c3e50';
          ctx.fillRect(px + 8, py + 10, 16, 14);
          ctx.fillStyle = '#34495e';
          ctx.fillRect(px + 9, py + 11, 14, 12);

          // 金の紐・バックル
          ctx.fillStyle = '#f1c40f';
          ctx.fillRect(px + 10, py + 8, 12, 3);
          ctx.fillRect(px + 14, py + 11, 4, 4);

          // 神秘の光を放つ魔力クリスタル
          const pulse = Math.sin(this.animationFrameCount * 0.15) * 0.4 + 0.6;
          ctx.fillStyle = `rgba(0, 255, 204, ${pulse})`;
          ctx.fillRect(px + 15, py + 16, 2, 3);

          // キラキラ光る粒子
          if (this.animationFrameCount % 16 < 8) {
            ctx.fillStyle = '#00ffff';
            ctx.fillRect(px + 6, py + 7, 2, 2);
          }
          break;
        }

        case 'POWER_BRACELET': {
          // 剛力の腕輪（重いブロックを怪力で押せるようになる秘宝）
          // 黄金と紅玉の輝く腕輪
          ctx.fillStyle = '#f39c12';
          ctx.beginPath();
          ctx.arc(px + 16, py + 16, 9, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#d35400';
          ctx.beginPath();
          ctx.arc(px + 16, py + 16, 6, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#1e1b2e';
          ctx.beginPath();
          ctx.arc(px + 16, py + 16, 3.5, 0, Math.PI * 2);
          ctx.fill();

          // 埋め込まれた真紅の力石（ルビー）
          ctx.fillStyle = '#e74c3c';
          ctx.fillRect(px + 14, py + 8, 4, 4);

          // 剛力の脈動オーラ
          const aura = Math.sin(this.animationFrameCount * 0.18) * 0.3 + 0.7;
          ctx.strokeStyle = `rgba(243, 156, 18, ${aura * 0.8})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px + 16, py + 16, 11, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }

        case 'TORCH': {
          // たいまつ：木製の松明と燃え盛るオレンジの炎
          // 1. 木の棒
          ctx.fillStyle = '#795548';
          ctx.fillRect(px + 14, py + 14, 4, 12);
          ctx.fillStyle = '#5d4037';
          ctx.fillRect(px + 13, py + 11, 6, 4);

          // 2. 燃え盛る炎（動的フリッカー）
          const flameFlicker = Math.sin(this.animationFrameCount * 0.25) * 2;
          ctx.fillStyle = '#ff5722';
          ctx.beginPath();
          ctx.moveTo(px + 16, py + 4 + flameFlicker);
          ctx.lineTo(px + 22, py + 12);
          ctx.lineTo(px + 10, py + 12);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#ffeb3b';
          ctx.beginPath();
          ctx.moveTo(px + 16, py + 7 + flameFlicker);
          ctx.lineTo(px + 19, py + 12);
          ctx.lineTo(px + 13, py + 12);
          ctx.closePath();
          ctx.fill();

          // 3. 火の粉の微粒子
          if (this.animationFrameCount % 8 < 4) {
            ctx.fillStyle = '#ff9800';
            ctx.fillRect(px + 15, py + 2, 2, 2);
          }
          break;
        }

        case 'WEAPON': {
          // 武器（剣）：白銀の鋭い刃、黄金の鍔、レザー柄
          ctx.save();
          // 刃（斜め向きの鋭いロングソード）
          ctx.fillStyle = '#ecf0f1';
          ctx.fillRect(px + 14, py + 6, 4, 14);
          ctx.fillStyle = '#bdc3c7';
          ctx.fillRect(px + 16, py + 6, 2, 14);
          // 切っ先
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px + 15, py + 4, 2, 2);
          // 鍔（クロスガード）
          ctx.fillStyle = '#f39c12';
          ctx.fillRect(px + 10, py + 20, 12, 3);
          // 柄と柄頭
          ctx.fillStyle = '#795548';
          ctx.fillRect(px + 15, py + 23, 2, 5);
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(px + 14, py + 28, 4, 2);

          // 威力に応じた魔力オーラ
          if (item.equipmentData && item.equipmentData.bonus >= 20) {
            const glow = Math.sin(this.animationFrameCount * 0.2) * 0.3 + 0.7;
            ctx.shadowColor = 'rgba(0, 200, 255, 0.8)';
            ctx.shadowBlur = 6 * glow;
          }
          ctx.restore();
          break;
        }

        case 'ARMOR': {
          // 防具（重装甲冑・プレートメイル）
          ctx.save();
          // 甲冑プレート（深銀・スチールブルー）
          ctx.fillStyle = '#34495e';
          ctx.fillRect(px + 9, py + 8, 14, 16);
          ctx.fillStyle = '#5dade2';
          ctx.fillRect(px + 11, py + 10, 10, 12);
          // 肩当て
          ctx.fillStyle = '#2c3e50';
          ctx.fillRect(px + 6, py + 9, 4, 6);
          ctx.fillRect(px + 22, py + 9, 4, 6);
          // 黄金のバックル・縁取り
          ctx.fillStyle = '#f1c40f';
          ctx.fillRect(px + 14, py + 14, 4, 4);
          ctx.fillRect(px + 9, py + 8, 14, 2);
          ctx.restore();
          break;
        }
      }
    }
  }

  /** モンスターのプロシージャルピクセル描画（全100種類の外観・カラー・名称に対応） */
  private renderMonsters(monsters: MonsterEntity[], explored: boolean[][]): void {
    const ctx = this.ctx;

    for (const m of monsters) {
      if (!explored[m.y][m.x]) continue;

      const px = m.renderX * TILE_SIZE;
      const py = m.renderY * TILE_SIZE;
      const mainColor = m.color || '#2ecc71';
      const subColor = m.subColor || '#ffffff';

      // ユーザー要求：敵の形の種類を50パターン作成して増やす
      // モンスターの完全固有レベルに基づいて50種類の識別可能な外観形状を割り当て
      const shapeIndex = Math.abs(((m.level ?? 1) - 1) % 50);
      this.renderMonsterShape(px, py, shapeIndex, mainColor, subColor, m);

      // 初代名物：モンスターがアイテムを持ち去っている場合の描画
      if (m.carriedItem) {
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(px + 12, py + 2, 8, 8);
        ctx.fillStyle = '#000000';
        ctx.strokeRect(px + 12, py + 2, 8, 8);
      }

      // 冒険者一行（侵入者中ボス）の黄金オーラ演出
      const isAdventurer = !!m.isAdventurer;
      if (isAdventurer) {
        ctx.save();
        const advPulse = Math.sin(this.animationFrameCount * 0.2 + m.x) * 3 + 6;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = advPulse;
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 2, py + 2, 28, 28);
        ctx.fillStyle = 'rgba(255, 215, 0, 0.12)';
        ctx.fillRect(px + 2, py + 2, 28, 28);
        ctx.restore();
      }

      // 敵の攻撃力表示（ユーザー要望：レベルじゃなくて攻撃力にし、先制攻撃持ちは赤色にする、冒険者は専用表記）
      const isPreemptive = !!m.isPreemptive;
      const atkText = isAdventurer
        ? `⚔️冒険者 ATK ${m.attackPower}`
        : (isPreemptive ? `! ATK ${m.attackPower}` : `ATK ${m.attackPower}`);
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';

      const badgeW = Math.max(28, ctx.measureText(atkText).width + 8);
      const badgeH = 12;
      const badgeX = px + 16 - badgeW / 2;
      const badgeY = py - 14;

      // バッジ背景（冒険者は黄金帯、先制攻撃持ちは警告赤褐色、通常はダーク）
      ctx.fillStyle = isAdventurer
        ? 'rgba(40, 25, 5, 0.92)'
        : (isPreemptive ? 'rgba(60, 10, 18, 0.92)' : 'rgba(12, 12, 20, 0.85)');
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH);

      // バッジ枠線（冒険者はゴールド、先制攻撃持ちは鮮烈な赤、通常はオレンジ）
      ctx.strokeStyle = isAdventurer
        ? '#ffd700'
        : (isPreemptive ? '#ff3838' : '#e67e22');
      ctx.lineWidth = (isAdventurer || isPreemptive) ? 1.5 : 1;
      ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

      // 攻撃力文字色
      ctx.fillStyle = isAdventurer
        ? '#ffeaa7'
        : (isPreemptive ? '#ff4d4d' : '#f39c12');
      ctx.fillText(atkText, px + 16, badgeY + 9);

      // モンスターのHPゲージ（ユーザー要望：敵のHPが減っている場合、敵の下にHPバーを表示）
      if (m.hp < m.maxHp) {
        const hpRate = Math.max(0, m.hp / m.maxHp);
        const barX = px + 4;
        const barY = py + 27; // 敵の下部（足元）
        const barW = 24;
        const barH = 3;

        // 背景（黒下地＋被ダメージ赤）
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(barX, barY, barW, barH);

        // 残りHPゲージ（緑〜黄色の健康ゲージ）
        ctx.fillStyle = hpRate > 0.4 ? '#2ecc71' : '#f1c40f';
        ctx.fillRect(barX, barY, Math.ceil(barW * hpRate), barH);
      }
    }
  }

  /** モンスター固有の形状50パターン描画（角・翼・多腕・大鎌・大顎・甲羅・日輪等） */
  private renderMonsterShape(
    px: number,
    py: number,
    shapeIndex: number,
    mainColor: string,
    subColor: string,
    m: MonsterEntity
  ): void {
    const ctx = this.ctx;
    const anim = this.animationFrameCount;
    const bob = Math.sin(anim * 0.15 + m.x) * 2;
    const squish = Math.sin(anim * 0.2 + m.x) * 1.5;

    ctx.save();

    switch (shapeIndex) {
      // --- スライム系統 (0-4) ---
      case 0: { // 0: 原生ドームスライム
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(px + 16, py + 18 - squish, 10 + squish, Math.PI, 0, false);
        ctx.lineTo(px + 26, py + 24);
        ctx.lineTo(px + 6, py + 24);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 11, py + 15, 3, 3);
        ctx.fillRect(px + 18, py + 15, 3, 3);
        break;
      }
      case 1: { // 1: トゲ付きポイズンスライム
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 7, py + 14 - squish, 18, 11 + squish);
        ctx.fillRect(px + 8, py + 9, 3, 6);
        ctx.fillRect(px + 15, py + 7, 3, 8);
        ctx.fillRect(px + 21, py + 9, 3, 6);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 10, py + 16, 4, 2);
        ctx.fillRect(px + 18, py + 16, 4, 2);
        break;
      }
      case 2: { // 2: 王冠キングスライム
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 5, py + 13 - squish, 22, 13 + squish);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(px + 11, py + 7, 10, 5);
        ctx.clearRect(px + 14, py + 7, 1, 2);
        ctx.clearRect(px + 17, py + 7, 1, 2);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 10, py + 17, 3, 3);
        ctx.fillRect(px + 19, py + 17, 3, 3);
        break;
      }
      case 3: { // 3: キューブスライム
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 7, py + 9, 18, 18);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 12, py + 14, 8, 8);
        break;
      }
      case 4: { // 4: ツインコア・アメーバ
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 5, py + 12, 12, 12);
        ctx.fillRect(px + 15, py + 12, 12, 12);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 8, py + 15, 4, 4);
        ctx.fillRect(px + 20, py + 15, 4, 4);
        break;
      }

      // --- ゴブリン・オーク系統 (5-9) ---
      case 5: { // 5: ゴブリン斥候（とんがり耳と短剣）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 11, py + 10, 10, 10);
        ctx.fillRect(px + 6, py + 11, 4, 3);
        ctx.fillRect(px + 22, py + 11, 4, 3);
        ctx.fillRect(px + 12, py + 20, 8, 7);
        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(px + 23, py + 16, 2, 7);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 13, py + 13, 2, 2);
        ctx.fillRect(px + 17, py + 13, 2, 2);
        break;
      }
      case 6: { // 6: ゴブリン弓手（弓構え）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 11, py + 9, 10, 9);
        ctx.fillRect(px + 7, py + 10, 4, 2);
        ctx.fillRect(px + 21, py + 10, 4, 2);
        ctx.fillRect(px + 12, py + 18, 8, 8);
        ctx.strokeStyle = '#8b5a2b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px + 24, py + 18, 6, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 13, py + 12, 2, 2);
        ctx.fillRect(px + 17, py + 12, 2, 2);
        break;
      }
      case 7: { // 7: オーク戦士（両刃大斧）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 9, py + 8, 14, 10);
        ctx.fillRect(px + 8, py + 18, 16, 9);
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(px + 24, py + 6, 2, 20);
        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(px + 21, py + 7, 8, 5);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 11, py + 11, 3, 3);
        ctx.fillRect(px + 18, py + 11, 3, 3);
        break;
      }
      case 8: { // 8: 重装オーク盾兵（大角盾）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 11, py + 8, 11, 9);
        ctx.fillRect(px + 10, py + 17, 12, 9);
        ctx.fillStyle = '#34495e';
        ctx.fillRect(px + 5, py + 11, 7, 14);
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(px + 7, py + 15, 3, 6);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 14, py + 11, 2, 2);
        ctx.fillRect(px + 18, py + 11, 2, 2);
        break;
      }
      case 9: { // 9: 狂戦士オーク（頭部大角・二刀流）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 10, py + 9, 12, 9);
        ctx.fillRect(px + 9, py + 18, 14, 9);
        ctx.fillStyle = '#f5f6fa';
        ctx.fillRect(px + 7, py + 4, 3, 6);
        ctx.fillRect(px + 22, py + 4, 3, 6);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(px + 4, py + 14, 3, 10);
        ctx.fillRect(px + 25, py + 14, 3, 10);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 12, py + 12, 3, 2);
        ctx.fillRect(px + 17, py + 12, 3, 2);
        break;
      }

      // --- スケルトン・アンデッド系統 (10-14) ---
      case 10: { // 10: スケルトン歩兵（髑髏・肋骨・錆剣）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 11, py + 7, 10, 8);
        ctx.fillRect(px + 13, py + 15, 6, 8);
        ctx.fillRect(px + 10, py + 17, 12, 2);
        ctx.fillStyle = '#95a5a6';
        ctx.fillRect(px + 23, py + 11, 2, 13);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 13, py + 10, 2, 2);
        ctx.fillRect(px + 17, py + 10, 2, 2);
        break;
      }
      case 11: { // 11: デススケルトン（死神の大鎌）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 11, py + 7, 10, 9);
        ctx.fillRect(px + 12, py + 16, 8, 10);
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(px + 24, py + 5, 2, 22);
        ctx.fillStyle = '#ecf0f1';
        ctx.beginPath();
        ctx.moveTo(px + 25, py + 5);
        ctx.quadraticCurveTo(px + 10, py + 3, px + 7, py + 11);
        ctx.lineTo(px + 10, py + 9);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 13, py + 10, 2, 2);
        ctx.fillRect(px + 17, py + 10, 2, 2);
        break;
      }
      case 12: { // 12: 4本腕アームド骸骨
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 11, py + 7, 10, 8);
        ctx.fillRect(px + 13, py + 15, 6, 9);
        ctx.fillRect(px + 5, py + 12, 6, 2);
        ctx.fillRect(px + 5, py + 18, 6, 2);
        ctx.fillRect(px + 21, py + 12, 6, 2);
        ctx.fillRect(px + 21, py + 18, 6, 2);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 13, py + 10, 2, 2);
        ctx.fillRect(px + 17, py + 10, 2, 2);
        break;
      }
      case 13: { // 13: デスナイト（フルプレート甲冑騎士）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 10, py + 6, 12, 10);
        ctx.fillStyle = '#1e272e';
        ctx.fillRect(px + 12, py + 10, 8, 3);
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 9, py + 16, 14, 10);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(px + 14, py + 2, 4, 5);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 14, py + 11, 2, 1);
        ctx.fillRect(px + 18, py + 11, 2, 1);
        break;
      }
      case 14: { // 14: ボーンリッチ（骨の翼）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 11, py + 7 + bob, 10, 9);
        ctx.fillRect(px + 13, py + 16 + bob, 6, 9);
        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(px + 4, py + 10 + bob, 7, 2);
        ctx.fillRect(px + 2, py + 7 + bob, 4, 2);
        ctx.fillRect(px + 21, py + 10 + bob, 7, 2);
        ctx.fillRect(px + 26, py + 7 + bob, 4, 2);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 13, py + 10 + bob, 2, 2);
        ctx.fillRect(px + 17, py + 10 + bob, 2, 2);
        break;
      }

      // --- 霊体・ゴースト系統 (15-19) ---
      case 15: { // 15: 浮遊ファントム（ゆらめく裾）
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 9, py + 7 + bob, 14, 13);
        ctx.fillRect(px + 9, py + 20 + bob, 3, 4);
        ctx.fillRect(px + 15, py + 20 + bob, 3, 5);
        ctx.fillRect(px + 20, py + 20 + bob, 3, 4);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 12, py + 11 + bob, 3, 3);
        ctx.fillRect(px + 18, py + 11 + bob, 3, 3);
        break;
      }
      case 16: { // 16: 仮面ポルターガイスト（白仮面＋浮遊球）
        ctx.fillStyle = '#f5f6fa';
        ctx.fillRect(px + 10, py + 8 + bob, 12, 14);
        ctx.fillStyle = '#2d3436';
        ctx.fillRect(px + 12, py + 12 + bob, 3, 3);
        ctx.fillRect(px + 17, py + 12 + bob, 3, 3);
        ctx.fillRect(px + 14, py + 18 + bob, 4, 2);
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 4, py + 14 - bob, 3, 3);
        ctx.fillRect(px + 25, py + 14 - bob, 3, 3);
        break;
      }
      case 17: { // 17: 怨霊レイス（鋭い鉤爪と煙裾）
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 10, py + 8 + bob, 12, 12);
        ctx.fillRect(px + 11, py + 20 + bob, 10, 6);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 4, py + 14 + bob, 6, 2);
        ctx.fillRect(px + 3, py + 16 + bob, 3, 2);
        ctx.fillRect(px + 22, py + 14 + bob, 6, 2);
        ctx.fillRect(px + 26, py + 16 + bob, 3, 2);
        break;
      }
      case 18: { // 18: ウィルオウィスプ（人魂・プラズマ球）
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(px + 16, py + 16 + bob, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = subColor;
        ctx.beginPath();
        ctx.arc(px + 16, py + 16 + bob, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 19: { // 19: スペクター（暗黒外套・覗く魔眼）
        ctx.fillStyle = '#1e272e';
        ctx.fillRect(px + 9, py + 6 + bob, 14, 20);
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 11, py + 8 + bob, 10, 10);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 12, py + 12 + bob, 3, 2);
        ctx.fillRect(px + 17, py + 12 + bob, 3, 2);
        break;
      }

      // --- ビースト・魔獣系統 (20-24) ---
      case 20: { // 20: 牙狼ウルフ（四足獣・鋭い牙）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 8, py + 11, 16, 9);
        ctx.fillRect(px + 16, py + 7, 9, 8);
        ctx.fillRect(px + 21, py + 4, 3, 4);
        ctx.fillRect(px + 8, py + 20, 3, 6);
        ctx.fillRect(px + 19, py + 20, 3, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + 24, py + 14, 2, 3);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 20, py + 9, 2, 2);
        break;
      }
      case 21: { // 21: 大角バイソン（湾曲巨大角）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 7, py + 11, 18, 12);
        ctx.fillStyle = '#ecf0f1';
        ctx.fillRect(px + 4, py + 6, 4, 8);
        ctx.fillRect(px + 2, py + 4, 4, 3);
        ctx.fillRect(px + 24, py + 6, 4, 8);
        ctx.fillRect(px + 26, py + 4, 4, 3);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 11, py + 14, 3, 2);
        ctx.fillRect(px + 18, py + 14, 3, 2);
        break;
      }
      case 22: { // 22: 鋭爪パンサー（長い跳ね上げ尾）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 9, py + 13, 14, 8);
        ctx.fillRect(px + 17, py + 9, 8, 7);
        ctx.fillRect(px + 5, py + 14, 4, 3);
        ctx.fillRect(px + 3, py + 9, 3, 6);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 19, py + 11, 2, 2);
        break;
      }
      case 23: { // 23: 双頭オルトロス（2つの獣頭）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 8, py + 14, 16, 9);
        ctx.fillRect(px + 7, py + 7, 7, 8);
        ctx.fillRect(px + 18, py + 7, 7, 8);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 9, py + 9, 2, 2);
        ctx.fillRect(px + 21, py + 9, 2, 2);
        break;
      }
      case 24: { // 24: 有翼キマイラ（背中の獣翼）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 9, py + 12, 14, 10);
        ctx.fillRect(px + 12, py + 7, 8, 7);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 4, py + 8, 6, 7);
        ctx.fillRect(px + 22, py + 8, 6, 7);
        break;
      }

      // --- 昆虫・節足系統 (25-29) ---
      case 25: { // 25: 大顎ビートル（クワガタの大顎）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 9, py + 13, 14, 12);
        ctx.fillStyle = '#2f3542';
        ctx.fillRect(px + 8, py + 4, 3, 10);
        ctx.fillRect(px + 11, py + 4, 3, 3);
        ctx.fillRect(px + 21, py + 4, 3, 10);
        ctx.fillRect(px + 18, py + 4, 3, 3);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 12, py + 15, 2, 2);
        ctx.fillRect(px + 18, py + 15, 2, 2);
        break;
      }
      case 26: { // 26: 毒針スコルピオン（ハサミ＋サソリ尾）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 10, py + 13, 12, 9);
        ctx.fillRect(px + 5, py + 16, 5, 4);
        ctx.fillRect(px + 22, py + 16, 5, 4);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 14, py + 7, 4, 7);
        ctx.fillRect(px + 16, py + 4, 5, 4);
        break;
      }
      case 27: { // 27: 節足ムカデ（多足ボディ）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 12, py + 6, 8, 20);
        ctx.fillStyle = subColor;
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(px + 7, py + 8 + i * 4, 5, 2);
          ctx.fillRect(px + 20, py + 8 + i * 4, 5, 2);
        }
        break;
      }
      case 28: { // 28: 重甲スカラベ（硬質甲羅と背筋ライン）
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(px + 16, py + 16, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 15, py + 8, 2, 16);
        break;
      }
      case 29: { // 29: 毒蜂ホーネット（細腰・半透明薄羽・毒針）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 13, py + 8, 6, 6);
        ctx.fillRect(px + 14, py + 15, 4, 4);
        ctx.fillRect(px + 11, py + 19, 10, 6);
        ctx.fillStyle = '#000000';
        ctx.fillRect(px + 15, py + 25, 2, 3);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillRect(px + 5, py + 7, 8, 4);
        ctx.fillRect(px + 19, py + 7, 8, 4);
        break;
      }

      // --- 爬虫類・竜人系統 (30-34) ---
      case 30: { // 30: トカゲ剣士リザードマン（長い口吻・尾・剣）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 12, py + 8, 12, 7);
        ctx.fillRect(px + 10, py + 15, 11, 10);
        ctx.fillRect(px + 5, py + 22, 6, 3);
        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(px + 23, py + 12, 2, 12);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 17, py + 9, 2, 2);
        break;
      }
      case 31: { // 31: 翼竜ドレイク（竜皮膜翼）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 12, py + 9, 8, 13);
        ctx.fillStyle = subColor;
        ctx.beginPath();
        ctx.moveTo(px + 13, py + 11);
        ctx.lineTo(px + 2, py + 7);
        ctx.lineTo(px + 5, py + 18);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + 19, py + 11);
        ctx.lineTo(px + 30, py + 7);
        ctx.lineTo(px + 27, py + 18);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 32: { // 32: 蛇尾ナーガ（蛇下半身・三叉槍）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 11, py + 7, 10, 8);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 10, py + 15, 12, 5);
        ctx.fillRect(px + 7, py + 20, 15, 4);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(px + 23, py + 6, 2, 18);
        ctx.fillRect(px + 21, py + 5, 6, 2);
        break;
      }
      case 33: { // 33: 火炎竜戦士（背ヒレ・炎粒子）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 10, py + 8, 11, 9);
        ctx.fillRect(px + 9, py + 17, 12, 9);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(px + 7, py + 9, 3, 4);
        ctx.fillRect(px + 6, py + 15, 3, 5);
        if (anim % 10 < 5) {
          ctx.fillRect(px + 22, py + 11, 3, 3);
        }
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 14, py + 10, 2, 2);
        break;
      }
      case 34: { // 34: 重鱗ドラゴンロード（双角・鱗装甲）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 9, py + 9, 14, 16);
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(px + 8, py + 4, 3, 6);
        ctx.fillRect(px + 21, py + 4, 3, 6);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 12, py + 14, 8, 2);
        ctx.fillRect(px + 11, py + 18, 10, 2);
        break;
      }

      // --- 悪魔・魔神系統 (35-39) ---
      case 35: { // 35: 小悪魔インプ（コウモリ羽・矢印尾・槍）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 12, py + 10, 8, 8);
        ctx.fillRect(px + 13, py + 18, 6, 6);
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(px + 6, py + 12, 6, 5);
        ctx.fillRect(px + 20, py + 12, 6, 5);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(px + 7, py + 22, 6, 2);
        ctx.fillRect(px + 5, py + 20, 3, 3);
        break;
      }
      case 36: { // 36: 大角デーモン（ねじれ大角・鋭翼）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 10, py + 10, 12, 10);
        ctx.fillRect(px + 9, py + 20, 14, 7);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(px + 6, py + 4, 4, 8);
        ctx.fillRect(px + 22, py + 4, 4, 8);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 13, py + 13, 2, 2);
        ctx.fillRect(px + 17, py + 13, 2, 2);
        break;
      }
      case 37: { // 37: 多眼エンティティ（中央大眼＋4つの小目）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 8, py + 8, 16, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + 13, py + 13, 6, 6);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(px + 15, py + 15, 2, 2);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 10, py + 10, 2, 2);
        ctx.fillRect(px + 20, py + 10, 2, 2);
        ctx.fillRect(px + 10, py + 20, 2, 2);
        ctx.fillRect(px + 20, py + 20, 2, 2);
        break;
      }
      case 38: { // 38: 業火イフリート（炎の逆立ち髪・燃える腕）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 10, py + 11, 12, 11);
        ctx.fillStyle = '#e67e22';
        ctx.fillRect(px + 9, py + 4, 4, 8);
        ctx.fillRect(px + 14, py + 3, 4, 9);
        ctx.fillRect(px + 19, py + 4, 4, 8);
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(px + 5, py + 13, 5, 5);
        ctx.fillRect(px + 22, py + 13, 5, 5);
        break;
      }
      case 39: { // 39: 冥王アークデーモン（漆黒翼・ダーククラウン）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 9, py + 9, 14, 14);
        ctx.fillStyle = '#1e272e';
        ctx.fillRect(px + 2, py + 6, 8, 12);
        ctx.fillRect(px + 22, py + 6, 8, 12);
        ctx.fillStyle = '#9b59b6';
        ctx.fillRect(px + 10, py + 5, 12, 4);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 12, py + 12, 3, 2);
        ctx.fillRect(px + 17, py + 12, 3, 2);
        break;
      }

      // --- ゴーレム系統 (40-44) ---
      case 40: { // 40: 岩石ゴーレム（角丸ブロック巨躯・太腕）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 8, py + 8, 16, 15);
        ctx.fillRect(px + 4, py + 11, 5, 11);
        ctx.fillRect(px + 23, py + 11, 5, 11);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 12, py + 12, 3, 3);
        ctx.fillRect(px + 17, py + 12, 3, 3);
        break;
      }
      case 41: { // 41: 鉄塊アイアンゴーレム（金属鋲・横長スリット単眼）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 8, py + 8, 16, 16);
        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(px + 9, py + 9, 2, 2);
        ctx.fillRect(px + 21, py + 9, 2, 2);
        ctx.fillRect(px + 9, py + 21, 2, 2);
        ctx.fillRect(px + 21, py + 21, 2, 2);
        ctx.fillStyle = '#ff3838';
        ctx.fillRect(px + 11, py + 14, 10, 3);
        break;
      }
      case 42: { // 42: 水晶クリスタルゴーレム（尖った結晶柱）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 9, py + 10, 14, 13);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 6, py + 5, 4, 7);
        ctx.fillRect(px + 14, py + 3, 4, 8);
        ctx.fillRect(px + 22, py + 5, 4, 7);
        break;
      }
      case 43: { // 43: 浮遊ルーンコア（菱形コア＋4つの周回ブロック）
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.moveTo(px + 16, py + 9 + bob);
        ctx.lineTo(px + 22, py + 16 + bob);
        ctx.lineTo(px + 16, py + 23 + bob);
        ctx.lineTo(px + 10, py + 16 + bob);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 5, py + 14 - bob, 4, 4);
        ctx.fillRect(px + 23, py + 14 - bob, 4, 4);
        ctx.fillRect(px + 14, py + 5 + bob, 4, 4);
        ctx.fillRect(px + 14, py + 23 + bob, 4, 4);
        break;
      }
      case 44: { // 44: 古代神像コロッサス（頭部背後の日輪光背）
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(px + 16, py + 12, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 10, py + 8, 12, 16);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 13, py + 12, 2, 2);
        ctx.fillRect(px + 17, py + 12, 2, 2);
        break;
      }

      // --- 魔導・賢者系統 (45-49) ---
      case 45: { // 45: とんがり帽子メイジ（長帽子・杖）
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.moveTo(px + 16, py + 2);
        ctx.lineTo(px + 24, py + 12);
        ctx.lineTo(px + 8, py + 12);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(px + 9, py + 12, 14, 13);
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(px + 24, py + 8, 2, 17);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 23, py + 6, 4, 4);
        break;
      }
      case 46: { // 46: 宝珠ソーサラー（頭上発光オーブ）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 10, py + 11, 12, 13);
        ctx.fillStyle = subColor;
        ctx.beginPath();
        ctx.arc(px + 16, py + 6 + bob, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 47: { // 47: 黒ローブ賢者（フード・魔導マント）
        ctx.fillStyle = '#1e272e';
        ctx.fillRect(px + 8, py + 5, 16, 20);
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 11, py + 8, 10, 9);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 13, py + 11, 2, 2);
        ctx.fillRect(px + 17, py + 11, 2, 2);
        break;
      }
      case 48: { // 48: 浮遊魔導書リッチ（宙に開いた魔導書）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 11, py + 6 + bob, 10, 8);
        ctx.fillRect(px + 12, py + 14 + bob, 8, 8);
        ctx.fillStyle = '#8e44ad';
        ctx.fillRect(px + 4, py + 15 - bob, 8, 6);
        ctx.fillRect(px + 20, py + 15 - bob, 8, 6);
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 13, py + 8 + bob, 2, 2);
        ctx.fillRect(px + 17, py + 8 + bob, 2, 2);
        break;
      }
      case 49:
      default: { // 49: 天体星環アストロマンサー（公転星環リング）
        ctx.fillStyle = mainColor;
        ctx.fillRect(px + 11, py + 8, 10, 14);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(px + 16, py + 15, 13, 5, Math.PI / 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 13, py + 12, 2, 2);
        ctx.fillRect(px + 17, py + 12, 2, 2);
        break;
      }
    }

    ctx.restore();
  }

  /** 巨大守護ボス（2×2マス = 64×64px）：蜘蛛・蟻・トカゲ・ゴーレム・ドラゴンのプロシージャルドット絵 */
  private renderDragon(dragon: DragonBoss, explored: boolean[][], hasAllCrowns: boolean = true): void {
    // 2×2マス内のいずれかが探索済みなら表示
    const isVisible =
      explored[dragon.y]?.[dragon.x] ||
      explored[dragon.y]?.[dragon.x + 1] ||
      explored[dragon.y + 1]?.[dragon.x] ||
      explored[dragon.y + 1]?.[dragon.x + 1];

    if (!isVisible) return;

    const ctx = this.ctx;
    const px = dragon.renderX * TILE_SIZE;
    const py = dragon.renderY * TILE_SIZE;
    const size = dragon.size * TILE_SIZE; // 64px

    ctx.save();

    // 眠っている時と覚醒時で呼吸・演出を変化
    const breathScale = dragon.isAwake
      ? Math.sin(this.animationFrameCount * 0.15) * 2
      : Math.sin(this.animationFrameCount * 0.05) * 1.5;

    const themeColor = dragon.themeColor || '#1b4332';
    const subColor = dragon.subColor || '#2d6a4f';
    const eyeColor = dragon.eyeColor || '#ff0055';

    switch (dragon.bossType) {
      case 'SPIDER': {
        // ◆ 冥界女王 クイーンスパイダー（8本脚、巨大球状腹部、毒牙、不気味な複眼）
        // 1. 8本の関節脚（左右各4本）
        ctx.strokeStyle = subColor;
        ctx.lineWidth = 3;
        const legWave = Math.sin(this.animationFrameCount * 0.12) * 3;
        // 左側の脚
        for (let i = 0; i < 4; i++) {
          const ly = py + 16 + i * 10;
          ctx.beginPath();
          ctx.moveTo(px + 20, ly);
          ctx.lineTo(px + 4, ly - 6 + (i % 2 === 0 ? legWave : -legWave));
          ctx.lineTo(px - 6, ly + 6);
          ctx.stroke();
        }
        // 右側の脚
        for (let i = 0; i < 4; i++) {
          const ly = py + 16 + i * 10;
          ctx.beginPath();
          ctx.moveTo(px + size - 20, ly);
          ctx.lineTo(px + size - 4, ly - 6 + (i % 2 === 0 ? -legWave : legWave));
          ctx.lineTo(px + size + 6, ly + 6);
          ctx.stroke();
        }

        // 2. 巨大な球状後腹部
        ctx.fillStyle = themeColor;
        ctx.beginPath();
        ctx.ellipse(px + size / 2, py + 38 + breathScale, 18, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        // 腹部の毒紋章（ドクロ/妖しい紋様）
        ctx.fillStyle = eyeColor;
        ctx.fillRect(px + size / 2 - 4, py + 34 + breathScale, 8, 4);
        ctx.fillRect(px + size / 2 - 2, py + 38 + breathScale, 4, 6);

        // 3. 頭胸部
        ctx.fillStyle = subColor;
        ctx.beginPath();
        ctx.ellipse(px + size / 2, py + 18 + breathScale, 13, 11, 0, 0, Math.PI * 2);
        ctx.fill();

        // 4. 毒牙
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(px + size / 2 - 6, py + 26 + breathScale);
        ctx.lineTo(px + size / 2 - 4, py + 32 + breathScale);
        ctx.lineTo(px + size / 2 - 2, py + 26 + breathScale);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + size / 2 + 2, py + 26 + breathScale);
        ctx.lineTo(px + size / 2 + 4, py + 32 + breathScale);
        ctx.lineTo(px + size / 2 + 6, py + 26 + breathScale);
        ctx.fill();

        // 5. 複眼
        if (dragon.isAwake) {
          ctx.fillStyle = eyeColor;
          ctx.fillRect(px + 23, py + 14 + breathScale, 4, 4);
          ctx.fillRect(px + 29, py + 12 + breathScale, 3, 3);
          ctx.fillRect(px + 33, py + 12 + breathScale, 3, 3);
          ctx.fillRect(px + 37, py + 14 + breathScale, 4, 4);
        } else {
          ctx.fillStyle = '#4a0e4e';
          ctx.fillRect(px + 24, py + 14 + breathScale, 16, 2);
          ctx.fillStyle = '#a8dadc';
          ctx.font = '10px "Press Start 2P"';
          ctx.fillText('Zzz', px + size - 10, py - 4 + breathScale);
        }
        break;
      }

      case 'ANT': {
        // ◆ 鋼鉄大蟻 タイタンアント（大顎ハサミ、触角、節足、強靭な甲殻）
        // 1. 左右6本の強靭な歩行脚
        ctx.strokeStyle = subColor;
        ctx.lineWidth = 3.5;
        const antWave = Math.sin(this.animationFrameCount * 0.15) * 2;
        for (let i = 0; i < 3; i++) {
          const ly = py + 24 + i * 11;
          // 左脚
          ctx.beginPath();
          ctx.moveTo(px + 18, ly);
          ctx.lineTo(px + 2, ly - 4 + (i % 2 === 0 ? antWave : -antWave));
          ctx.lineTo(px - 4, ly + 8);
          ctx.stroke();
          // 右脚
          ctx.beginPath();
          ctx.moveTo(px + size - 18, ly);
          ctx.lineTo(px + size - 2, ly - 4 + (i % 2 === 0 ? -antWave : antWave));
          ctx.lineTo(px + size + 4, ly + 8);
          ctx.stroke();
        }

        // 2. 巨大な腹部（後節）
        ctx.fillStyle = themeColor;
        ctx.beginPath();
        ctx.ellipse(px + size / 2, py + 44 + breathScale, 16, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        // 腹部の甲殻スリット
        ctx.fillStyle = subColor;
        ctx.fillRect(px + size / 2 - 12, py + 38 + breathScale, 24, 2);
        ctx.fillRect(px + size / 2 - 14, py + 44 + breathScale, 28, 2);

        // 3. 胸部（中節）
        ctx.fillStyle = subColor;
        ctx.fillRect(px + size / 2 - 10, py + 23 + breathScale, 20, 14);

        // 4. 頭部（前節）
        ctx.fillStyle = themeColor;
        ctx.beginPath();
        ctx.ellipse(px + size / 2, py + 15 + breathScale, 14, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // 5. 巨大なハサミ大顎
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        // 左大顎
        ctx.moveTo(px + size / 2 - 10, py + 12 + breathScale);
        ctx.lineTo(px + size / 2 - 14, py + 2 + breathScale);
        ctx.lineTo(px + size / 2 - 6, py + 6 + breathScale);
        ctx.fill();
        // 右大顎
        ctx.beginPath();
        ctx.moveTo(px + size / 2 + 10, py + 12 + breathScale);
        ctx.lineTo(px + size / 2 + 14, py + 2 + breathScale);
        ctx.lineTo(px + size / 2 + 6, py + 6 + breathScale);
        ctx.fill();

        // 6. 触角
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px + size / 2 - 6, py + 8 + breathScale);
        ctx.lineTo(px + size / 2 - 16, py - 2 + breathScale);
        ctx.moveTo(px + size / 2 + 6, py + 8 + breathScale);
        ctx.lineTo(px + size / 2 + 16, py - 2 + breathScale);
        ctx.stroke();

        // 7. 複眼
        if (dragon.isAwake) {
          ctx.fillStyle = eyeColor;
          ctx.fillRect(px + size / 2 - 10, py + 13 + breathScale, 4, 5);
          ctx.fillRect(px + size / 2 + 6, py + 13 + breathScale, 4, 5);
        } else {
          ctx.fillStyle = '#784212';
          ctx.fillRect(px + size / 2 - 10, py + 14 + breathScale, 4, 2);
          ctx.fillRect(px + size / 2 + 6, py + 14 + breathScale, 4, 2);
          ctx.fillStyle = '#a8dadc';
          ctx.font = '10px "Press Start 2P"';
          ctx.fillText('Zzz', px + size - 10, py - 4 + breathScale);
        }
        break;
      }

      case 'LIZARD': {
        // ◆ 毒蛇大蜥蜴 バジリスク（鋭いヒレ、爬虫類ウロコ、二股の舌、石化の邪眼）
        // 1. 太い胴体
        ctx.fillStyle = themeColor;
        ctx.fillRect(px + 12, py + 16 + breathScale, size - 24, size - 26);

        // 2. 背骨のトゲヒレ
        ctx.fillStyle = subColor;
        for (let i = 0; i < 5; i++) {
          const hx = px + 14 + i * 8;
          ctx.beginPath();
          ctx.moveTo(hx, py + 16 + breathScale);
          ctx.lineTo(hx + 4, py + 8 + breathScale);
          ctx.lineTo(hx + 8, py + 16 + breathScale);
          ctx.fill();
        }

        // 3. 平たい頭部
        ctx.fillStyle = themeColor;
        ctx.fillRect(px + 14, py + 6 + breathScale, size - 28, 18);

        // 4. 四肢の鋭い爪
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 4, py + 22, 10, 8);
        ctx.fillRect(px + size - 14, py + 22, 10, 8);
        ctx.fillRect(px + 4, py + 44, 10, 8);
        ctx.fillRect(px + size - 14, py + 44, 10, 8);

        // 5. チロチロ出る二股の赤い舌（覚醒時）
        if (dragon.isAwake) {
          const tongueExt = (this.animationFrameCount % 8 < 4) ? 8 : 4;
          ctx.strokeStyle = '#e74c3c';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + size / 2, py + 6 + breathScale);
          ctx.lineTo(px + size / 2, py + 6 - tongueExt + breathScale);
          ctx.lineTo(px + size / 2 - 3, py + 3 - tongueExt + breathScale);
          ctx.moveTo(px + size / 2, py + 6 - tongueExt + breathScale);
          ctx.lineTo(px + size / 2 + 3, py + 3 - tongueExt + breathScale);
          ctx.stroke();

          // 石化邪眼
          ctx.fillStyle = eyeColor;
          ctx.fillRect(px + 18, py + 10 + breathScale, 7, 5);
          ctx.fillRect(px + size - 25, py + 10 + breathScale, 7, 5);
          // 縦長のスリット瞳孔
          ctx.fillStyle = '#000000';
          ctx.fillRect(px + 21, py + 10 + breathScale, 2, 5);
          ctx.fillRect(px + size - 22, py + 10 + breathScale, 2, 5);
        } else {
          ctx.fillStyle = subColor;
          ctx.fillRect(px + 18, py + 12 + breathScale, 6, 2);
          ctx.fillRect(px + size - 24, py + 12 + breathScale, 6, 2);
          ctx.fillStyle = '#a8dadc';
          ctx.font = '10px "Press Start 2P"';
          ctx.fillText('Zzz', px + size - 10, py - 4 + breathScale);
        }
        break;
      }

      case 'GOLEM': {
        // ◆ 古代巨兵 メガリスゴーレム（巨石ブロック、光る古代ルーンコア、スクエア巨躯）
        // 1. 巨大なスクエア胴体
        ctx.fillStyle = themeColor;
        ctx.fillRect(px + 10, py + 16 + breathScale, size - 20, size - 24);

        // 2. 巨大な両肩のブロックアーマー
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 2, py + 12 + breathScale, 14, 18);
        ctx.fillRect(px + size - 16, py + 12 + breathScale, 14, 18);

        // 3. ゴツゴツした巨石の頭部
        ctx.fillStyle = themeColor;
        ctx.fillRect(px + 18, py + 4 + breathScale, size - 36, 14);

        // 4. 胸部の古代ルーンコア（光のパルス）
        const corePulse = Math.sin(this.animationFrameCount * 0.1) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(0, 210, 211, ${corePulse})`;
        ctx.fillRect(px + size / 2 - 6, py + 28 + breathScale, 12, 12);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + size / 2 - 6, py + 28 + breathScale, 12, 12);

        // 5. 単眼/スリットバイザー
        if (dragon.isAwake) {
          ctx.fillStyle = eyeColor;
          ctx.fillRect(px + 22, py + 9 + breathScale, size - 44, 4);
        } else {
          ctx.fillStyle = '#1c2833';
          ctx.fillRect(px + 22, py + 9 + breathScale, size - 44, 3);
          ctx.fillStyle = '#a8dadc';
          ctx.font = '10px "Press Start 2P"';
          ctx.fillText('Zzz', px + size - 10, py - 4 + breathScale);
        }
        break;
      }

      default: {
        // ◆ ヴォルケイドラゴン（紅蓮の竜鱗、巨大な翼と角、黄金蛇腹）
        // 胴体
        ctx.fillStyle = themeColor;
        ctx.fillRect(px + 8, py + 12 + breathScale, size - 16, size - 20);

        // 翼
        ctx.fillStyle = subColor;
        ctx.fillRect(px + 2, py + 6, 14, 20);
        ctx.fillRect(px + size - 16, py + 6, 14, 20);

        // 腹部の黄金蛇腹
        ctx.fillStyle = '#d4a373';
        ctx.fillRect(px + 18, py + 24 + breathScale, size - 36, size - 36);

        // 頭部
        ctx.fillStyle = themeColor;
        ctx.fillRect(px + 16, py + 4 + breathScale, size - 32, 20);

        // 角
        ctx.fillStyle = '#faedcd';
        ctx.fillRect(px + 14, py, 4, 8);
        ctx.fillRect(px + size - 18, py, 4, 8);

        // 瞳
        if (dragon.isAwake) {
          ctx.fillStyle = eyeColor;
          ctx.fillRect(px + 22, py + 10 + breathScale, 6, 6);
          ctx.fillRect(px + size - 28, py + 10 + breathScale, 6, 6);
          ctx.fillStyle = '#ffff00';
          ctx.fillRect(px + 24, py + 12 + breathScale, 2, 2);
          ctx.fillRect(px + size - 26, py + 12 + breathScale, 2, 2);

          // 口元から立ち上る火の粉
          if (this.animationFrameCount % 6 < 3) {
            ctx.fillStyle = '#ff7b00';
            ctx.fillRect(px + 28, py + 22 + breathScale, 4, 4);
          }
        } else {
          ctx.fillStyle = subColor;
          ctx.fillRect(px + 22, py + 12 + breathScale, 6, 2);
          ctx.fillRect(px + size - 28, py + 12 + breathScale, 6, 2);

          ctx.fillStyle = '#a8dadc';
          ctx.font = '10px "Press Start 2P"';
          ctx.fillText('Zzz', px + size - 10, py - 4 + breathScale);
        }
        break;
      }
    }

    // ボスのHPバー（巨大ボスの風格）
    const barWidth = size + 16;
    const barHeight = 6;
    const hpRate = Math.max(0, dragon.hp / dragon.maxHp);

    ctx.fillStyle = '#000000';
    ctx.fillRect(px - 8, py - 12, barWidth, barHeight);
    ctx.fillStyle = dragon.angerLevel > 0 ? '#ff0055' : '#e63946';
    ctx.fillRect(px - 8, py - 12, barWidth * hpRate, barHeight);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 8.5, py - 12.5, barWidth + 1, barHeight + 1);

    // ボスのATKバッジ（ユーザー要求：ボスの形・色に応じたATK表示）
    const atkText = `🔥 ${dragon.name} ATK ${dragon.attackPower}`;
    ctx.font = 'bold 9px "Press Start 2P", sans-serif';
    ctx.textAlign = 'center';
    const badgeW = ctx.measureText(atkText).width + 12;
    const badgeH = 13;
    const badgeX = px + size / 2 - badgeW / 2;
    const badgeY = py - 27;

    ctx.fillStyle = 'rgba(20, 5, 5, 0.85)';
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    ctx.strokeStyle = dragon.eyeColor || '#e74c3c';
    ctx.lineWidth = 1;
    ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

    ctx.fillStyle = dragon.eyeColor || '#ff4757';
    ctx.fillText(atkText, px + size / 2, badgeY + 10);

    // 睡眠中の演出（ユーザー要求：ボスが寝てるときはZzz...みたいなのを表示して）
    if (!dragon.isAwake) {
      const zOffset = Math.sin(this.animationFrameCount * 0.08) * 3;
      const zPhase = (this.animationFrameCount % 70) / 70;
      const zFloatY = py - 36 - zPhase * 14;
      const zAlpha = Math.sin(zPhase * Math.PI);

      ctx.save();
      ctx.font = 'bold 15px "Outfit", monospace, sans-serif';
      ctx.fillStyle = `rgba(165, 180, 252, ${Math.max(0.35, zAlpha)})`;
      ctx.shadowColor = '#6366f1';
      ctx.shadowBlur = 8;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💤 Zzz...', px + size - 4, zFloatY + zOffset);
      ctx.restore();
    }

    // ユーザー要求：ボスは結界で物理的に守られていて（エフェクト）、攻撃自体できなくする
    if (!hasAllCrowns) {
      ctx.save();
      const centerX = px + size / 2;
      const centerY = py + size / 2;
      const barrierRadius = size / 2 + 8 + Math.sin(this.animationFrameCount * 0.1) * 3;

      // 1. 脈動する半透明エネルギーフィールド
      const barrierGrad = ctx.createRadialGradient(
        centerX, centerY, barrierRadius * 0.4,
        centerX, centerY, barrierRadius + 6
      );
      barrierGrad.addColorStop(0, 'rgba(0, 210, 211, 0.05)');
      barrierGrad.addColorStop(0.7, 'rgba(0, 210, 211, 0.25)');
      barrierGrad.addColorStop(1, 'rgba(72, 219, 251, 0.6)');

      ctx.fillStyle = barrierGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, barrierRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. 六角形／正八角形シールド結界の輪郭線
      ctx.strokeStyle = `rgba(0, 255, 255, ${0.7 + Math.sin(this.animationFrameCount * 0.15) * 0.25})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#00d2d3';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      const sides = 6;
      const rot = this.animationFrameCount * 0.02;
      for (let s = 0; s < sides; s++) {
        const theta = rot + (s * Math.PI * 2) / sides;
        const hx = centerX + Math.cos(theta) * barrierRadius;
        const hy = centerY + Math.sin(theta) * barrierRadius;
        if (s === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();

      // 3. 結界上を巡る回転ルーン粒子
      for (let p = 0; p < 4; p++) {
        const pTheta = -rot * 2 + (p * Math.PI * 2) / 4;
        const pxR = centerX + Math.cos(pTheta) * barrierRadius;
        const pyR = centerY + Math.sin(pTheta) * barrierRadius;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(pxR, pyR, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. 頭上結界バッジ
      ctx.font = 'bold 8px "Press Start 2P", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10, 20, 30, 0.9)';
      ctx.fillRect(centerX - 48, py - 40, 96, 12);
      ctx.strokeStyle = '#00d2d3';
      ctx.lineWidth = 1;
      ctx.strokeRect(centerX - 48, py - 40, 96, 12);
      ctx.fillStyle = '#00d2d3';
      ctx.fillText('🛡️ 無敵結界展開中', centerX, py - 31);

      ctx.restore();
    }

    ctx.restore();
  }

  /** 世界樹の迷宮FOE（Field On Enemy）巨大徘徊エネミーのプロシージャル描画 */
  private renderFoe(foe: FoeEntity | null | undefined, explored: boolean[][]): void {
    if (!foe) return;
    if (!explored[foe.y]?.[foe.x]) return;

    const ctx = this.ctx;
    const px = foe.x * TILE_SIZE;
    const py = foe.y * TILE_SIZE;
    const size = TILE_SIZE * 2; // 64x64ピクセルの巨大エネミー

    ctx.save();

    // 1. 禍々しい黒紫の災厄オーラ（蠢く触手・霧）
    const auraPulse = Math.sin(this.animationFrameCount * 0.12) * 4 + 8;
    ctx.shadowColor = '#8854d0';
    ctx.shadowBlur = auraPulse;

    // 闇の球体・影
    const grad = ctx.createRadialGradient(px + size / 2, py + size / 2, 8, px + size / 2, py + size / 2, size / 2 + 6);
    grad.addColorStop(0, '#2c003e');
    grad.addColorStop(0.6, '#150024');
    grad.addColorStop(1, 'rgba(10, 0, 20, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px + size / 2, py + size / 2, size / 2 + 6, 0, Math.PI * 2);
    ctx.fill();

    // 2. 巨躯の本体（異形の深淵巨獣）
    const breath = Math.sin(this.animationFrameCount * 0.1) * 2;
    ctx.fillStyle = '#1e0826';
    ctx.fillRect(px + 8, py + 8 + breath, size - 16, size - 16);

    // 蠢く甲殻・外骨格
    ctx.fillStyle = '#3c0950';
    ctx.fillRect(px + 12, py + 12 + breath, size - 24, size - 24);

    // 3. 巨獣の四本の鋭角（黒角）
    ctx.fillStyle = '#0f0214';
    ctx.fillRect(px + 4, py + 2 + breath, 8, 12);
    ctx.fillRect(px + size - 12, py + 2 + breath, 8, 12);
    ctx.fillRect(px + 2, py + size - 14 + breath, 10, 8);
    ctx.fillRect(px + size - 12, py + size - 14 + breath, 10, 8);

    // 4. 赤く光る無数の邪眼
    const eyeFlicker = this.animationFrameCount % 8 < 4;
    ctx.fillStyle = eyeFlicker ? '#ff3838' : '#ff5252';
    ctx.beginPath();
    ctx.arc(px + size / 2, py + size / 2 + breath, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(px + size / 2 - 1, py + size / 2 - 4 + breath, 2, 8);

    // 周囲の複眼
    ctx.fillStyle = '#ff3838';
    ctx.fillRect(px + 16, py + 22 + breath, 4, 4);
    ctx.fillRect(px + size - 20, py + 22 + breath, 4, 4);
    ctx.fillRect(px + 20, py + size - 24 + breath, 3, 3);
    ctx.fillRect(px + size - 23, py + size - 24 + breath, 3, 3);

    // 5. 「⚠️ FOE: 災厄の巨獣」危険警告バッジ
    const foeText = `⚠️ FOE: 災厄の巨獣`;
    ctx.font = 'bold 9px "Press Start 2P", sans-serif';
    ctx.textAlign = 'center';
    const badgeW = ctx.measureText(foeText).width + 12;
    const badgeH = 13;
    const badgeX = px + size / 2 - badgeW / 2;
    const badgeY = py - 18;

    ctx.fillStyle = 'rgba(25, 0, 35, 0.9)';
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    ctx.strokeStyle = '#e056fd';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);
    ctx.fillStyle = '#ff7979';
    ctx.fillText(foeText, px + size / 2, badgeY + 10);

    // 6. 残り滞在ターン表示（近接2マス危険警報）
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = '#f6e58d';
    ctx.fillText(`⏳ 残り${foe.remainingTurns}T (接近禁止!)`, px + size / 2, py + size + 10);

    ctx.restore();
  }

  /** 最強の魔物を目指すスケルトン主人公のプロシージャルドット描画 */
  private renderPlayer(player: PlayerState): void {
    const ctx = this.ctx;
    const px = player.renderX * TILE_SIZE;
    const py = player.renderY * TILE_SIZE;

    ctx.save();

    // 十字架無敵 / 無敵シールド時の発光点滅・神聖バリア
    if ((player.invincibleTimer > 0 || (player.shieldCharges && player.shieldCharges > 0)) && this.animationFrameCount % 4 < 2) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(px - 2, py - 2, TILE_SIZE + 4, TILE_SIZE + 4);
    }

    // 無敵シールド発動中の魔力バリア光輪エフェクト
    if (player.shieldCharges && player.shieldCharges > 0) {
      const shieldPulse = Math.sin(this.animationFrameCount * 0.15) * 2;
      ctx.strokeStyle = 'rgba(0, 255, 204, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px + 16, py + 16, 17 + shieldPulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 255, 204, 0.12)';
      ctx.beginPath();
      ctx.arc(px + 16, py + 16, 17 + shieldPulse, 0, Math.PI * 2);
      ctx.fill();

      // 回転する光の粒子
      const angle = this.animationFrameCount * 0.08;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px + 16 + Math.cos(angle) * 17 - 1.5, py + 16 + Math.sin(angle) * 17 - 1.5, 3, 3);
      ctx.fillRect(px + 16 + Math.cos(angle + Math.PI) * 17 - 1.5, py + 16 + Math.sin(angle + Math.PI) * 17 - 1.5, 3, 3);
    }

    // 最強の魔物を目指す白骨の魔物「スケルトン」（プロシージャルドット絵）
    const boneWhite = '#f1f2f6';
    const boneShadow = '#ced6e0';
    const boneDark = '#747d8c';

    // 1. ボロボロの暗黒マント（背後）
    ctx.fillStyle = '#2c1b4d';
    ctx.fillRect(px + 8, py + 12, 16, 12);
    ctx.fillRect(px + 6, py + 18, 4, 6);
    ctx.fillRect(px + 22, py + 18, 4, 6);

    // 2. 白骨頭蓋骨（スカルフェイス）
    ctx.fillStyle = boneWhite;
    // 頭蓋上部（丸み）
    ctx.fillRect(px + 11, py + 3, 10, 8);
    // 頬骨・上顎
    ctx.fillRect(px + 10, py + 8, 12, 4);
    // 下顎
    ctx.fillStyle = boneShadow;
    ctx.fillRect(px + 12, py + 12, 8, 3);
    // 歯並び（細いスリット）
    ctx.fillStyle = '#1e272e';
    ctx.fillRect(px + 14, py + 12, 1, 3);
    ctx.fillRect(px + 16, py + 12, 1, 3);
    ctx.fillRect(px + 18, py + 12, 1, 3);

    // 3. 眼窩（黒い窪み＋青白く燃える魔眼ソウルファイア）
    ctx.fillStyle = '#11141a';
    ctx.fillRect(px + 12, py + 6, 3, 4);
    ctx.fillRect(px + 17, py + 6, 3, 4);
    // 魔光の瞳（点滅）
    const soulPulse = Math.sin(this.animationFrameCount * 0.2) * 0.25 + 0.75;
    ctx.fillStyle = `rgba(0, 255, 255, ${soulPulse})`;
    ctx.fillRect(px + 13, py + 7, 2, 2);
    ctx.fillRect(px + 18, py + 7, 2, 2);

    // 4. 首骨（頸椎）
    ctx.fillStyle = boneDark;
    ctx.fillRect(px + 15, py + 14, 2, 2);

    // 5. 剥き出しの胸部肋骨（リブケージ）
    ctx.fillStyle = boneDark;
    ctx.fillRect(px + 15, py + 16, 2, 7);
    ctx.fillStyle = boneWhite;
    ctx.fillRect(px + 11, py + 16, 10, 2);
    ctx.fillRect(px + 12, py + 19, 8, 2);
    ctx.fillRect(px + 13, py + 22, 6, 1);

    // 6. 骨盤
    ctx.fillStyle = boneShadow;
    ctx.fillRect(px + 12, py + 23, 8, 2);

    // 7. 白骨の脚（大腿骨・脛骨）
    ctx.fillStyle = boneWhite;
    ctx.fillRect(px + 11, py + 25, 2, 6);
    ctx.fillRect(px + 19, py + 25, 2, 6);
    ctx.fillStyle = boneShadow;
    ctx.fillRect(px + 10, py + 29, 3, 2);
    ctx.fillRect(px + 19, py + 29, 3, 2);

    // 8. 向きに応じた骨刀（ボーンソード）の構え
    ctx.fillStyle = '#ecf0f1';
    switch (player.direction) {
      case 'RIGHT':
        ctx.fillRect(px + 20, py + 16, 3, 2);
        ctx.fillRect(px + 23, py + 14, 8, 3);
        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(px + 21, py + 13, 2, 5); // 鍔
        break;
      case 'LEFT':
        ctx.fillRect(px + 9, py + 16, 3, 2);
        ctx.fillRect(px + 1, py + 14, 8, 3);
        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(px + 9, py + 13, 2, 5); // 鍔
        break;
      case 'UP':
        ctx.fillRect(px + 20, py + 3, 3, 9);
        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(px + 19, py + 12, 5, 2);
        break;
      case 'DOWN':
        ctx.fillRect(px + 20, py + 19, 3, 9);
        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(px + 19, py + 18, 5, 2);
        break;
    }

    // 所持している個数だけをキャラ頭上に表示（アイテムアイコンは不要）
    const itemCount = player.carriedItems ? player.carriedItems.length : 0;
    if (itemCount > 0) {
      const iy = py - 7;
      ctx.fillStyle = 'rgba(15, 15, 25, 0.85)';
      ctx.beginPath();
      ctx.arc(px + 16, iy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${itemCount}`, px + 16, iy);
    }

    ctx.restore();
  }

  /** 飛翔体（炎や魔法）の描画 */
  private renderProjectiles(projectiles: Projectile[]): void {
    const ctx = this.ctx;

    for (const p of projectiles) {
      ctx.save();
      ctx.fillStyle = p.color;

      if (p.fromPlayer) {
        // プレイヤーの魔導弾（青紫の光球）
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // ドラゴンの火炎ブレス（激しい炎）
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /** 動的ライティング＆視界の霧（Fog of War） */
  private renderLightingAndFog(
    floor: DungeonFloor,
    player: PlayerState,
    cameraX: number,
    cameraY: number,
    screenWidth: number,
    screenHeight: number
  ): void {
    const ctx = this.ctx;
    const playerPixelX = player.renderX * TILE_SIZE + TILE_SIZE / 2;
    const playerPixelY = player.renderY * TILE_SIZE + TILE_SIZE / 2;

    // トーチライトの動的フリッカー（たいまつ有効時は視界1.5倍）
    const flicker = Math.sin(this.animationFrameCount * 0.15) * 8;
    const isTorchActive = player.torchTimer > 0;
    const torchMultiplier = isTorchActive ? 1.5 : 1.0;
    const torchRadius = (340 + flicker) * torchMultiplier;

    // 暗闇のオーバレイグラデーション（プレイヤー周囲をクリアにし、遠景も真っ暗にならない自然な陰影）
    const lightGradient = ctx.createRadialGradient(
      playerPixelX,
      playerPixelY,
      torchRadius * 0.45,
      playerPixelX,
      playerPixelY,
      torchRadius
    );
    lightGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    lightGradient.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
    lightGradient.addColorStop(0.85, 'rgba(8, 8, 14, 0.2)');
    lightGradient.addColorStop(1, 'rgba(8, 8, 14, 0.45)');

    ctx.fillStyle = lightGradient;
    ctx.fillRect(cameraX, cameraY, screenWidth, screenHeight);

    // たいまつ点灯時の温かなオレンジ炎光の追加
    if (isTorchActive) {
      const torchWarmth = ctx.createRadialGradient(
        playerPixelX,
        playerPixelY,
        0,
        playerPixelX,
        playerPixelY,
        torchRadius * 0.65
      );
      torchWarmth.addColorStop(0, 'rgba(255, 140, 0, 0.12)');
      torchWarmth.addColorStop(0.6, 'rgba(255, 100, 0, 0.04)');
      torchWarmth.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = torchWarmth;
      ctx.fillRect(cameraX, cameraY, screenWidth, screenHeight);
    }

    // 未探索マスの完全な黒塗りマスク
    const startCol = Math.max(0, Math.floor(cameraX / TILE_SIZE) - 1);
    const endCol = Math.min(floor.width - 1, Math.ceil((cameraX + screenWidth) / TILE_SIZE) + 1);
    const startRow = Math.max(0, Math.floor(cameraY / TILE_SIZE) - 1);
    const endRow = Math.min(floor.height - 1, Math.ceil((cameraY + screenHeight) / TILE_SIZE) + 1);

    ctx.fillStyle = '#0a0a12';
    for (let y = startRow; y <= endRow; y++) {
      for (let x = startCol; x <= endCol; x++) {
        if (!floor.exploredTiles[y][x]) {
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  /** パーティクルとポップアップテキストの描画 */
  private renderParticles(particles: Particle[]): void {
    const ctx = this.ctx;

    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;

      if (p.text) {
        ctx.fillStyle = p.color;
        ctx.font = 'bold 12px "Press Start 2P", monospace';
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }

      ctx.restore();
    }
  }

  /** レトロCRTスキャンライン＆ビネットエフェクト（視認性を確保する明るめ設定） */
  private renderCrtOverlay(width: number, height: number): void {
    const ctx = this.ctx;

    // 走査線（薄くして明るさを損なわない）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (let y = 0; y < height; y += 3) {
      ctx.fillRect(0, y, width, 1);
    }

    // 周囲のビネット減光（マイルドな陰影）
    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      width * 0.45,
      width / 2,
      height / 2,
      width * 0.8
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.25)');

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  /** HUD内ミニマップのリアルタイム描画 */
  private renderMiniMap(floor: DungeonFloor, player: PlayerState): void {
    const mCtx = this.miniMapCtx;
    const w = this.miniMapCanvas.width;
    const h = this.miniMapCanvas.height;

    mCtx.fillStyle = '#0d0d14';
    mCtx.fillRect(0, 0, w, h);

    const cellW = w / floor.width;
    const cellH = h / floor.height;

    // ユーザー要求：移動可能なマスの踏破率を算出（小数点は不要）
    let totalWalkable = 0;
    let exploredWalkable = 0;

    // タイルの簡易プロット
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        const tile = floor.tiles[y][x];

        // 移動可能マスのカウント（壁・ブロック・墓以外）
        if (tile !== 'WALL' && tile !== 'BLOCK' && tile !== 'GRAVE') {
          totalWalkable++;
          if (floor.exploredTiles[y]?.[x]) {
            exploredWalkable++;
          }
        }

        if (!floor.exploredTiles[y]?.[x]) continue;

        if (tile === 'WALL' || tile === 'BLOCK' || tile === 'GRAVE') {
          // ユーザー要求：右側のマップにブロックや墓のマスの色は壁と同じにして
          mCtx.fillStyle = '#2c2538';
          mCtx.fillRect(x * cellW, y * cellH, cellW, cellH);
        } else if (tile === 'HOME' || tile === 'SPRING') {
          // 聖なる碑石（旧HOME）または回復の泉（SPRING）：澄んだ青緑・シアンの輝き
          mCtx.fillStyle = this.animationFrameCount % 16 < 8 ? '#00ffcc' : '#0984e3';
          mCtx.fillRect(x * cellW - 0.5, y * cellH - 0.5, cellW + 1.5, cellH + 1.5);
        } else if (tile === 'WARP') {
          // ワープマス：妖しいシアン＆紫のパルス光
          mCtx.fillStyle = this.animationFrameCount % 12 < 6 ? '#a55eea' : '#00ffff';
          mCtx.fillRect(x * cellW - 0.5, y * cellH - 0.5, cellW + 1, cellH + 1);
        } else {
          mCtx.fillStyle = '#1c1c24';
          mCtx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
      }
    }

    // 踏破率のUIバッジ更新
    const coveragePercent = totalWalkable > 0 ? Math.floor((exploredWalkable / totalWalkable) * 100) : 0;
    this.coveragePercent = coveragePercent;
    const badgeEl = document.getElementById('radar-coverage-value');
    if (badgeEl && badgeEl.textContent !== `${coveragePercent}`) {
      badgeEl.textContent = `${coveragePercent}`;
    }

    // 魔法陣（ポータル）の位置プロット（紫色）
    if (floor.portals) {
      for (const p of floor.portals) {
        if (floor.exploredTiles[p.y]?.[p.x]) {
          mCtx.fillStyle = p.isActive ? '#9b59b6' : '#576574';
          mCtx.fillRect(p.x * cellW, p.y * cellH, cellW * 2, cellH * 2);
        }
      }
    }

    // 回復薬（POTION）の表示
    for (const it of floor.items) {
      if (it.type === 'POTION' && floor.exploredTiles[it.y]?.[it.x]) {
        const px = (it.x + 0.5) * cellW;
        const py = (it.y + 0.5) * cellH;
        mCtx.fillStyle = '#ff7675';
        mCtx.beginPath();
        mCtx.arc(px, py, Math.max(2, cellW), 0, Math.PI * 2);
        mCtx.fill();
      }
    }

    // 王冠（大きめ＆チカチカ点滅、未探索でもレーダー探知）
    const crownFlash = this.animationFrameCount % 6 < 3;
    const crownPulse = Math.sin(this.animationFrameCount * 0.25) * 1.5 + 4.5;
    for (const it of floor.items) {
      if (it.type === 'CROWN') {
        const isExplored = !!floor.exploredTiles[it.y]?.[it.x];
        const cx = (it.x + 0.5) * cellW;
        const cy = (it.y + 0.5) * cellH;

        if (isExplored) {
          // 探索済み：黄金パルス光輪 ＋ 白と黄金の高速チカチカ点滅
          mCtx.fillStyle = 'rgba(255, 215, 0, 0.45)';
          mCtx.beginPath();
          mCtx.arc(cx, cy, crownPulse, 0, Math.PI * 2);
          mCtx.fill();

          // クラウンコア
          mCtx.fillStyle = crownFlash ? '#ffffff' : '#ffd700';
          mCtx.beginPath();
          mCtx.arc(cx, cy, 3.5, 0, Math.PI * 2);
          mCtx.fill();

          // 王冠の3連突起
          mCtx.fillRect(cx - 3, cy - 3.5, 2, 2);
          mCtx.fillRect(cx - 1, cy - 4.5, 2, 2);
          mCtx.fillRect(cx + 1, cy - 3.5, 2, 2);
        } else {
          // 未探索：レーダーによる微弱な秘宝霊気の探知表示
          mCtx.fillStyle = 'rgba(255, 215, 0, 0.3)';
          mCtx.beginPath();
          mCtx.arc(cx, cy, 2.5, 0, Math.PI * 2);
          mCtx.fill();
        }
      }
    }

    // ユーザー要求：ミニマップでボス（赤）とFOE（濃い紫）も王冠と同じくキラキラして
    const foePulse = Math.sin(this.animationFrameCount * 0.16 + 1.2) * 2.5 + 6;
    const foeFlash = Math.floor(this.animationFrameCount / 7) % 2 === 0;

    // FOEのプロット（濃い紫でキラキラ）
    if (floor.foe && floor.exploredTiles[floor.foe.y]?.[floor.foe.x]) {
      const fx = (floor.foe.x + 1) * cellW;
      const fy = (floor.foe.y + 1) * cellH;

      // 濃い紫パルス光輪
      mCtx.fillStyle = 'rgba(106, 13, 173, 0.55)';
      mCtx.beginPath();
      mCtx.arc(fx, fy, foePulse, 0, Math.PI * 2);
      mCtx.fill();

      // コア点滅（白と濃い紫）
      mCtx.fillStyle = foeFlash ? '#ffffff' : '#4a0072';
      mCtx.beginPath();
      mCtx.arc(fx, fy, 4, 0, Math.PI * 2);
      mCtx.fill();

      // 妖しい光芒
      mCtx.fillStyle = '#8854d0';
      mCtx.fillRect(fx - 4, fy - 1, 8, 2);
      mCtx.fillRect(fx - 1, fy - 4, 2, 8);
    }

    const bossPulse = Math.sin(this.animationFrameCount * 0.18) * 2.5 + 6;
    const bossFlash = Math.floor(this.animationFrameCount / 6) % 2 === 0;

    // ボスの位置（赤色でキラキラ）
    const d = floor.dragon;
    if (floor.exploredTiles[d.y]?.[d.x]) {
      const bx = (d.x + 1) * cellW;
      const by = (d.y + 1) * cellH;

      // 赤色パルス光輪
      mCtx.fillStyle = 'rgba(235, 47, 6, 0.5)';
      mCtx.beginPath();
      mCtx.arc(bx, by, bossPulse, 0, Math.PI * 2);
      mCtx.fill();

      // コア点滅（白と鮮血赤）
      mCtx.fillStyle = bossFlash ? '#ffffff' : (d.eyeColor || '#ff0055');
      mCtx.beginPath();
      mCtx.arc(bx, by, 4, 0, Math.PI * 2);
      mCtx.fill();

      // 星型・十字光芒
      mCtx.fillStyle = '#ff4d4d';
      mCtx.fillRect(bx - 4.5, by - 1, 9, 2);
      mCtx.fillRect(bx - 1, by - 4.5, 2, 9);
    }

    // プレイヤーの位置（目立つ青緑の点滅光）
    mCtx.fillStyle = '#00ffcc';
    mCtx.fillRect(player.x * cellW - 1, player.y * cellH - 1, cellW * 2 + 1, cellH * 2 + 1);
  }

  /** 拡大レーダーマップモーダルの表示状態チェック */
  public isExpandedRadarOpen(): boolean {
    const modal = document.getElementById('modal-expanded-radar');
    return modal !== null && modal.classList.contains('active');
  }

  /** 拡大戦術レーダーマップ（タップで拡大）の高精細リアルタイム描画 */
  public renderExpandedRadar(floor: DungeonFloor, player: PlayerState): void {
    if (!this.expandedRadarCanvas || !this.expandedRadarCtx) {
      const expCanvas = document.getElementById('expanded-radar-canvas') as HTMLCanvasElement | null;
      if (expCanvas) {
        this.expandedRadarCanvas = expCanvas;
        this.expandedRadarCtx = expCanvas.getContext('2d');
      }
    }
    const eCtx = this.expandedRadarCtx;
    const canvas = this.expandedRadarCanvas;
    if (!eCtx || !canvas) return;

    const w = canvas.width;
    const h = canvas.height;

    eCtx.fillStyle = '#0a0a12';
    eCtx.fillRect(0, 0, w, h);

    const cellW = w / floor.width;
    const cellH = h / floor.height;

    // タイルの高精細描画（ユーザー要求：ブロックや墓は壁と同じ色にする）
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        if (!floor.exploredTiles[y]?.[x]) continue;

        const tile = floor.tiles[y][x];
        const px = x * cellW;
        const py = y * cellH;

        if (tile === 'WALL' || tile === 'BLOCK' || tile === 'GRAVE') {
          // ユーザー要求：右側のマップにブロックや墓のマスの色は壁と同じにして
          eCtx.fillStyle = '#2c2538';
          eCtx.fillRect(px, py, cellW + 0.5, cellH + 0.5);
        } else if (tile === 'HOME' || tile === 'SPRING') {
          eCtx.fillStyle = this.animationFrameCount % 16 < 8 ? '#00ffcc' : '#0984e3';
          eCtx.fillRect(px, py, cellW + 1, cellH + 1);
        } else if (tile === 'WARP') {
          // ワープマス：シアン＆紫のパルス光
          eCtx.fillStyle = this.animationFrameCount % 12 < 6 ? '#a55eea' : '#00ffff';
          eCtx.fillRect(px, py, cellW + 1, cellH + 1);
        } else {
          eCtx.fillStyle = '#1c1c28';
          eCtx.fillRect(px, py, cellW + 0.5, cellH + 0.5);
        }
      }
    }

    // 魔法陣（ポータル）
    if (floor.portals) {
      for (const p of floor.portals) {
        if (floor.exploredTiles[p.y]?.[p.x]) {
          eCtx.fillStyle = p.isActive ? '#9b59b6' : '#576574';
          eCtx.fillRect(p.x * cellW, p.y * cellH, cellW * 2.5, cellH * 2.5);
        }
      }
    }

    // 回復薬（POTION）
    for (const it of floor.items) {
      if (it.type === 'POTION' && floor.exploredTiles[it.y]?.[it.x]) {
        const px = (it.x + 0.5) * cellW;
        const py = (it.y + 0.5) * cellH;
        eCtx.fillStyle = '#ff7675';
        eCtx.beginPath();
        eCtx.arc(px, py, 4, 0, Math.PI * 2);
        eCtx.fill();
        eCtx.strokeStyle = '#ffffff';
        eCtx.lineWidth = 1;
        eCtx.stroke();
      }
    }

    // 王冠（大きめ＆チカチカ点滅、未探索でもレーダー探知）
    const crownFlash = this.animationFrameCount % 6 < 3;
    const crownPulse = Math.sin(this.animationFrameCount * 0.25) * 2 + 7;
    for (const it of floor.items) {
      if (it.type === 'CROWN') {
        const isExplored = !!floor.exploredTiles[it.y]?.[it.x];
        const cx = (it.x + 0.5) * cellW;
        const cy = (it.y + 0.5) * cellH;

        if (isExplored) {
          // ユーザー要求：拡大マップでは既に踏破部分に王冠があるときは、↓矢印などで場所をわかりやすく表示して
          const arrowBob = Math.sin(this.animationFrameCount * 0.22) * 3;
          const arrowY = cy - 14 + arrowBob;

          eCtx.save();
          eCtx.shadowColor = '#ffd700';
          eCtx.shadowBlur = 8;
          eCtx.fillStyle = '#ffd700';

          // 黄金の「↓」下向き矢印マーカー
          eCtx.beginPath();
          eCtx.moveTo(cx, arrowY + 8); // 下の先端
          eCtx.lineTo(cx - 5, arrowY + 2); // 左翼
          eCtx.lineTo(cx - 2, arrowY + 2);
          eCtx.lineTo(cx - 2, arrowY - 4); // 軸上左
          eCtx.lineTo(cx + 2, arrowY - 4); // 軸上右
          eCtx.lineTo(cx + 2, arrowY + 2);
          eCtx.lineTo(cx + 5, arrowY + 2); // 右翼
          eCtx.closePath();
          eCtx.fill();
          eCtx.restore();

          // 黄金パルス光輪
          eCtx.fillStyle = 'rgba(255, 215, 0, 0.4)';
          eCtx.beginPath();
          eCtx.arc(cx, cy, crownPulse, 0, Math.PI * 2);
          eCtx.fill();

          // クラウンコア
          eCtx.fillStyle = crownFlash ? '#ffffff' : '#ffd700';
          eCtx.beginPath();
          eCtx.arc(cx, cy, 5, 0, Math.PI * 2);
          eCtx.fill();

          // クラウン冠状突起
          eCtx.fillRect(cx - 4, cy - 6, 2.5, 3);
          eCtx.fillRect(cx - 1, cy - 8, 2.5, 3);
          eCtx.fillRect(cx + 2, cy - 6, 2.5, 3);
        } else {
          // 未探索：レーダーによる秘宝霊気探知
          eCtx.fillStyle = 'rgba(255, 215, 0, 0.35)';
          eCtx.beginPath();
          eCtx.arc(cx, cy, 3.5, 0, Math.PI * 2);
          eCtx.fill();
        }
      }
    }

    // ユーザー要求：拡大ミニマップでボス（赤）とFOE（濃い紫）も王冠と同じくキラキラして
    const expFoePulse = Math.sin(this.animationFrameCount * 0.16 + 1.2) * 3 + 9;
    const expFoeFlash = Math.floor(this.animationFrameCount / 7) % 2 === 0;

    // FOEのプロット（濃い紫でキラキラ）
    if (floor.foe && floor.exploredTiles[floor.foe.y]?.[floor.foe.x]) {
      const fx = (floor.foe.x + 1) * cellW;
      const fy = (floor.foe.y + 1) * cellH;

      // 濃い紫パルス光輪
      eCtx.fillStyle = 'rgba(106, 13, 173, 0.55)';
      eCtx.beginPath();
      eCtx.arc(fx, fy, expFoePulse, 0, Math.PI * 2);
      eCtx.fill();

      // コア点滅（白と濃い紫）
      eCtx.fillStyle = expFoeFlash ? '#ffffff' : '#4a0072';
      eCtx.beginPath();
      eCtx.arc(fx, fy, 5.5, 0, Math.PI * 2);
      eCtx.fill();

      // 妖しい光芒
      eCtx.fillStyle = '#8854d0';
      eCtx.fillRect(fx - 6, fy - 1.5, 12, 3);
      eCtx.fillRect(fx - 1.5, fy - 6, 3, 12);
    }

    const expBossPulse = Math.sin(this.animationFrameCount * 0.18) * 3 + 9;
    const expBossFlash = Math.floor(this.animationFrameCount / 6) % 2 === 0;

    // ボスの位置（赤色でキラキラ）
    const d = floor.dragon;
    if (floor.exploredTiles[d.y]?.[d.x]) {
      const bx = (d.x + 1) * cellW;
      const by = (d.y + 1) * cellH;

      // 赤色パルス光輪
      eCtx.fillStyle = 'rgba(235, 47, 6, 0.5)';
      eCtx.beginPath();
      eCtx.arc(bx, by, expBossPulse, 0, Math.PI * 2);
      eCtx.fill();

      // コア点滅（白と鮮血赤）
      eCtx.fillStyle = expBossFlash ? '#ffffff' : (d.eyeColor || '#ff0055');
      eCtx.beginPath();
      eCtx.arc(bx, by, 5.5, 0, Math.PI * 2);
      eCtx.fill();

      // 星型・十字光芒
      eCtx.fillStyle = '#ff4d4d';
      eCtx.fillRect(bx - 7, by - 1.5, 14, 3);
      eCtx.fillRect(bx - 1.5, by - 7, 3, 14);
    }

    // プレイヤーの位置
    eCtx.fillStyle = '#00ffcc';
    eCtx.fillRect(player.x * cellW - 1, player.y * cellH - 1, cellW * 2.5, cellH * 2.5);

    // タップされた注目地点（フォーカス照準レティクル）
    if (this.focusTileX >= 0 && this.focusTileY >= 0) {
      const fx = (this.focusTileX + 0.5) * cellW;
      const fy = (this.focusTileY + 0.5) * cellH;
      const reticlePulse = Math.sin(this.animationFrameCount * 0.2) * 2 + 10;

      eCtx.strokeStyle = '#00ffcc';
      eCtx.lineWidth = 1.5;
      // 照準サークル
      eCtx.beginPath();
      eCtx.arc(fx, fy, reticlePulse, 0, Math.PI * 2);
      eCtx.stroke();
      // 十字線
      eCtx.beginPath();
      eCtx.moveTo(fx - reticlePulse - 4, fy);
      eCtx.lineTo(fx + reticlePulse + 4, fy);
      eCtx.moveTo(fx, fy - reticlePulse - 4);
      eCtx.lineTo(fx, fy + reticlePulse + 4);
      eCtx.stroke();
    }
  }

  /** 魔法陣（スポナーポータル）のプロシージャルピクセル描画 */
  private renderPortals(portals: MonsterPortal[], explored: boolean[][]): void {
    const ctx = this.ctx;
    for (const portal of portals) {
      if (!explored[portal.y]?.[portal.x]) continue;

      const px = portal.x * TILE_SIZE;
      const py = portal.y * TILE_SIZE;

      ctx.save();
      if (portal.isActive) {
        // 活性中：怪しく回転発光する紫炎の魔法陣
        const angle = (this.animationFrameCount * 0.04) % (Math.PI * 2);
        const pulse = Math.sin(this.animationFrameCount * 0.12) * 0.25 + 0.75;

        ctx.translate(px + 16, py + 16);
        ctx.rotate(angle);

        // 外周リング
        ctx.strokeStyle = `rgba(155, 89, 182, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.stroke();

        // 内部五芒星・ルーン
        ctx.strokeStyle = `rgba(231, 76, 60, ${pulse * 0.9})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i * 4 * Math.PI) / 5;
          const rx = Math.cos(a) * 10;
          const ry = Math.sin(a) * 10;
          if (i === 0) ctx.moveTo(rx, ry);
          else ctx.lineTo(rx, ry);
        }
        ctx.closePath();
        ctx.stroke();

        // 中心コアの魔力光
        ctx.fillStyle = `rgba(241, 196, 15, ${pulse})`;
        ctx.fillRect(-2, -2, 4, 4);
      } else {
        // 休眠中：暗く鎮火した灰色の魔法陣
        ctx.strokeStyle = 'rgba(100, 110, 125, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px + 16, py + 16, 11, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(60, 65, 80, 0.6)';
        ctx.fillRect(px + 14, py + 14, 4, 4);
      }
      ctx.restore();
    }
  }

  /** ゲーム画面のHUD（左上：ターン数、右上：王冠スロット） */
  private renderHUD(turnCount: number, player: PlayerState): void {
    const ctx = this.ctx;
    ctx.save();
    // 左上にスタイリッシュな半透明バッジ（ターン数）
    ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
    ctx.fillRect(10, 10, 120, 26);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, 120, 26);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 10px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`TURN: ${turnCount}`, 18, 23);

    // ユーザー要求：トーチの有効ターンを左上のターンの下にアイコンとともに記載（小さくていい）
    if (player.torchTimer > 0) {
      const torchBoxY = 40;
      const torchBoxW = 86;
      const torchBoxH = 20;

      ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
      ctx.fillRect(10, torchBoxY, torchBoxW, torchBoxH);
      ctx.strokeStyle = 'rgba(255, 140, 0, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(10, torchBoxY, torchBoxW, torchBoxH);

      // アイコン
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔥', 14, torchBoxY + 10);

      // ターン数表示
      ctx.fillStyle = '#ff9f43';
      ctx.font = 'bold 9px "Press Start 2P", monospace';
      ctx.fillText(`${player.torchTimer}T`, 30, torchBoxY + 10);
    }

    // ユーザー要求：王冠の表示はヘッダーではなく、マップの右上に表示する（ターンの逆側）
    const slotBoxW = 104;
    const slotBoxH = 26;
    const rightX = this.canvas.width - slotBoxW - 10;
    const rightY = 10;

    ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
    ctx.fillRect(rightX, rightY, slotBoxW, slotBoxH);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rightX, rightY, slotBoxW, slotBoxH);

    const delivered = player.crownsDelivered;
    for (let i = 0; i < 3; i++) {
      const iconCenterX = rightX + 18 + i * 34;
      const iconCenterY = rightY + 13;
      const isObtained = i < delivered;

      if (isObtained) {
        if (this.crownImg && this.crownImg.complete && this.crownImg.naturalWidth > 0) {
          ctx.save();
          ctx.shadowColor = '#ffd700';
          ctx.shadowBlur = 6;
          ctx.drawImage(this.crownImg, iconCenterX - 10, iconCenterY - 10, 20, 20);
          ctx.restore();
        } else {
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('👑', iconCenterX, iconCenterY);
        }
      } else {
        // 未所持：グレーの王冠シルエット
        ctx.save();
        ctx.globalAlpha = 0.35;
        if (this.crownImg && this.crownImg.complete && this.crownImg.naturalWidth > 0) {
          ctx.filter = 'grayscale(100%) brightness(50%)';
          ctx.drawImage(this.crownImg, iconCenterX - 10, iconCenterY - 10, 20, 20);
        } else {
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#636e72';
          ctx.fillText('👑', iconCenterX, iconCenterY);
        }
        ctx.restore();
      }
    }

    ctx.restore();
  }
}
