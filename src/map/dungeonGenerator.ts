/**
 * RAGNABANE - 新世代自由形状＆超広大ダンジョン生成エンジン
 * 四角い単調な部屋を脱却し、円形大広間・八角形ホール・十字型神殿・L字型回廊・有機的自然洞窟など
 * 多彩で自由な形状のマップを生成。旧48x48比で4倍超（96x96〜）の広大マップに対応。
 * 「我が家」を撤廃し「回復の泉（SPRING）」をフロア各所に配置。
 * パワーストーン（攻撃力専用）とスタミナストーン（HP専用）の独立配置、
 * 初動Lv.1（敵Atk 1〜）からの滑らかなレベリング環境を提供する。
 */

import {
  DUNGEON_WIDTH,
  DUNGEON_HEIGHT,
  CROWNS_REQUIRED_PER_FLOOR,
  WEAPON_CATALOG,
  ARMOR_CATALOG,
} from '../types';
import type {
  DungeonFloor,
  TileType,
  Position,
  FieldItem,
  MonsterEntity,
  DragonBoss,
  MonsterPortal,
  EquipmentItem,
  WarpTile,
} from '../types';
import { MONSTER_CATALOG } from './monsterCatalog';

/** 部屋の幾何学的形状種別 */
export type RoomShape =
  | 'RECTANGLE' // 定番の矩形部屋
  | 'CIRCLE'    // 円形大ホール
  | 'OCTAGON'   // 八角形広間
  | 'CROSS'     // 十字型神殿
  | 'L_SHAPED'  // L字型複合回廊
  | 'CAVERN';   // 有機的自然洞窟

/** 部屋の役割タイプ */
export type RoomType =
  | 'START'                    // プレイヤー初期スポーン部屋（安全地帯）
  | 'NORMAL'                   // 通常部屋
  | 'GREAT_HALL'               // 超広大な大広間・中庭
  | 'SPRING_SANCTUM'           // 聖なる回復の泉の間
  | 'VAULT'                    // 宝物庫
  | 'DRAGON_LAIR'              // 巨大竜の巣窟
  | 'PORTAL_SANCTUM'           // 魔法陣のある聖室
  | 'POWER_STONE_VAULT'        // パワー＆スタミナストーン宝物殿（超低確率）
  | 'GRAVEYARD_MONSTER_HOUSE'; // 墓標乱立モンスターハウス（超低確率）

interface Room {
  id: number;
  gridCol: number;
  gridRow: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: RoomType;
  shape: RoomShape;
  centerX: number;
  centerY: number;
  isCorridorOnly?: boolean; // 部屋がなく通路のみ（長廊下・バイパス区画）
  isIsolated?: boolean;     // ユーザー要求：道のない部屋（必ずワープで相互接続し詰み防止）
}

/** 決定論的シード乱数生成器（ステージごとに同一の固定マップを再現） */
function createSeededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export class DungeonGenerator {
  /** 指定フロア番号の自由形状ダンジョンを生成 */
  public static generateFloor(floorNumber: number): DungeonFloor {
    // ステージが進むたびにマップを広大化（フロア1: 96x96, フロア2: 108x108, フロア3: 120x120 ...）
    const width = DUNGEON_WIDTH + (floorNumber - 1) * 12;
    const height = DUNGEON_HEIGHT + (floorNumber - 1) * 12;

    // ステージ固定のシード（リトライや再訪時も同じ固定マップを完全に再現）
    const rng = createSeededRandom(10007 * floorNumber + 888);

    // 1. 全体を外壁(WALL)で初期化
    const tiles: TileType[][] = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => 'WALL' as TileType)
    );

    const exploredTiles: boolean[][] = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => false)
    );

    // 2. 広大なグリッド区画（6×6分割 = 計36区画）の設計
    const gridCols = 6;
    const gridRows = 6;
    const cellW = Math.floor((width - 4) / gridCols);
    const cellH = Math.floor((height - 4) / gridRows);

    const rooms: Room[] = [];
    let roomIdCounter = 1;

    let hasPowerVault = false;
    let hasGraveyard = false;

    // ユーザー要求：部屋自体をもっと大きく、複数の部屋がつながった大部屋（連結大部屋）も存在させる
    // 2-1. 連結ペア（Horizontal / Vertical）を事前に選定して大部屋を構築
    // START部屋(0,0)とDRAGON_LAIR(5,5)は独立性を保つためマージ対象から除外
    const mergedRight = new Set<string>(); // "r,c" -> (r, c+1) と横連結
    const mergedBottom = new Set<string>(); // "r,c" -> (r+1, c) と縦連結

    // ユーザー要求：ステージによって開始位置とボス位置を変える
    // 階層番号(floorNumber)に基づいて4隅の対角ペアをダイナミックに切り替え
    const layoutPattern = Math.max(0, floorNumber - 1) % 4;
    let startR = 0;
    let startC = 0;
    let dragonR = gridRows - 1;
    let dragonC = gridCols - 1;

    if (layoutPattern === 1) {
      // 2F, 6F...: 右下スタート → 左上ボス
      startR = gridRows - 1;
      startC = gridCols - 1;
      dragonR = 0;
      dragonC = 0;
    } else if (layoutPattern === 2) {
      // 3F, 7F...: 左下スタート → 右上ボス
      startR = gridRows - 1;
      startC = 0;
      dragonR = 0;
      dragonC = gridCols - 1;
    } else if (layoutPattern === 3) {
      // 4F, 8F...: 右上スタート → 左下ボス
      startR = 0;
      startC = gridCols - 1;
      dragonR = gridRows - 1;
      dragonC = 0;
    }

    const isStartOrDragon = (r: number, c: number): boolean =>
      (r === startR && c === startC) || (r === dragonR && c === dragonC);

    // マップ内に 3〜5箇所の2部屋連結大部屋を生成
    const mergeAttempts = 6;
    for (let i = 0; i < mergeAttempts; i++) {
      const isHorizontal = rng() < 0.5;
      if (isHorizontal) {
        const r = Math.floor(rng() * gridRows);
        const c = Math.floor(rng() * (gridCols - 1));
        // STARTやDRAGON_LAIRを含まないペア
        if (isStartOrDragon(r, c) || isStartOrDragon(r, c + 1)) continue;
        const key = `${r},${c}`;
        const rightKey = `${r},${c + 1}`;
        if (!mergedRight.has(key) && !mergedBottom.has(key) && !mergedBottom.has(rightKey)) {
          mergedRight.add(key);
        }
      } else {
        const r = Math.floor(rng() * (gridRows - 1));
        const c = Math.floor(rng() * gridCols);
        if (isStartOrDragon(r, c) || isStartOrDragon(r + 1, c)) continue;
        const key = `${r},${c}`;
        const bottomKey = `${r + 1},${c}`;
        if (!mergedBottom.has(key) && !mergedRight.has(key) && !mergedRight.has(bottomKey)) {
          mergedBottom.add(key);
        }
      }
    }

    // 2-2. 区画ごとに広大な部屋を配置
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const cellX = 2 + c * cellW;
        const cellY = 2 + r * cellH;

        // 特殊部屋タイプの割り当て
        let type: RoomType = 'NORMAL';
        if (r === startR && c === startC) {
          type = 'START'; // ステージ固有のスタート部屋
        } else if (r === dragonR && c === dragonC) {
          type = 'DRAGON_LAIR'; // ステージ固有の最深部: 巨大竜の巣窟
        } else if ((r === 2 && c === 2) || (r === 3 && c === 3)) {
          type = 'GREAT_HALL'; // 中央部: 超広大な大広間
        } else if ((r === 0 && c === 4) || (r === 4 && c === 0) || (r === 3 && c === 1)) {
          type = 'SPRING_SANCTUM'; // 回復の泉の間
        } else if ((r === 1 && c === 3) || (r === 4 && c === 2) || (r === 2 && c === 5)) {
          type = 'PORTAL_SANCTUM'; // 魔法陣の聖室
        } else if (!hasPowerVault && rng() < 0.18) {
          type = 'POWER_STONE_VAULT'; // 超低確率: ストーン宝物殿
          hasPowerVault = true;
        } else if (!hasGraveyard && rng() < 0.18) {
          type = 'GRAVEYARD_MONSTER_HOUSE'; // 超低確率: 墓標モンスターハウス
          hasGraveyard = true;
        } else if (rng() < 0.35) {
          type = 'VAULT'; // 宝物庫
        }

        // 部屋の形状（円形、八角形、十字型、L字型、有機的洞窟、矩形）
        let shape: RoomShape;
        const shapeRoll = rng();
        if (type === 'DRAGON_LAIR') {
          shape = 'OCTAGON'; // ドラゴンの巣窟は重厚な八角形
        } else if (type === 'GREAT_HALL') {
          shape = shapeRoll < 0.5 ? 'CIRCLE' : 'OCTAGON'; // 大広間は円形または八角形
        } else if (type === 'SPRING_SANCTUM') {
          shape = shapeRoll < 0.6 ? 'CIRCLE' : 'CROSS'; // 聖泉は神秘的な円形または十字型
        } else if (shapeRoll < 0.20) {
          shape = 'CIRCLE'; // 円形ホール
        } else if (shapeRoll < 0.40) {
          shape = 'OCTAGON'; // 八角形広間
        } else if (shapeRoll < 0.55) {
          shape = 'CROSS'; // 十字型神殿
        } else if (shapeRoll < 0.70) {
          shape = 'L_SHAPED'; // L字型回廊
        } else if (shapeRoll < 0.85) {
          shape = 'CAVERN'; // 有機的自然洞窟
        } else {
          shape = 'RECTANGLE'; // 定番の矩形
        }

        // ユーザー要求：部屋自体をもっと大きくする（区画の端近くまで広げる）
        // 部屋のサイズ決定（大広間や通常部屋も大幅に大型化）
        let roomW: number;
        let roomH: number;
        if (type === 'DRAGON_LAIR' || type === 'GREAT_HALL') {
          roomW = Math.max(12, cellW - 2);
          roomH = Math.max(12, cellH - 2);
        } else {
          // 通常部屋もセルいっぱいに近い大型サイズ（11〜15マス）
          roomW = Math.max(10, Math.min(cellW - 2, cellW - 1 - Math.floor(rng() * 3)));
          roomH = Math.max(10, Math.min(cellH - 2, cellH - 1 - Math.floor(rng() * 3)));
        }

        const rx = cellX + Math.floor((cellW - roomW) / 2);
        const ry = cellY + Math.floor((cellH - roomH) / 2);
        const centerX = rx + Math.floor(roomW / 2);
        const centerY = ry + Math.floor(roomH / 2);

        // ユーザー要求：部屋がなくて通路だけで、2部屋以降先の部屋につながっている区画を作成
        let isCorridorOnly = false;
        if (type === 'NORMAL' && !mergedRight.has(`${r},${c}`) && !mergedBottom.has(`${r},${c}`) && rng() < 0.22) {
          isCorridorOnly = true;
        }

        rooms.push({
          id: roomIdCounter++,
          gridCol: c,
          gridRow: r,
          x: rx,
          y: ry,
          width: roomW,
          height: roomH,
          type,
          shape,
          centerX,
          centerY,
          isCorridorOnly,
        });
      }
    }

    // ユーザー要求：ワープマスが多すぎるため「ほぼ出なくていい」ように調整
    // ワープ多発フロアは廃止し、孤立部屋も原則生成しない（3階以降かつ5%の極めて稀なケースのみ）
    const isolatedCandidateRooms = rooms.filter(
      (r) =>
        r.type === 'NORMAL' &&
        !r.isCorridorOnly &&
        !mergedRight.has(`${r.gridRow},${r.gridCol}`) &&
        !mergedBottom.has(`${r.gridRow},${r.gridCol}`) &&
        !isStartOrDragon(r.gridRow, r.gridCol)
    );

    const isolatedCount = floorNumber >= 3 && rng() < 0.05 && isolatedCandidateRooms.length > 0 ? 1 : 0;
    for (let ii = 0; ii < isolatedCount; ii++) {
      const chosen = isolatedCandidateRooms[ii];
      if (chosen) {
        chosen.isIsolated = true;
      }
    }

    // 3. 多彩な形状に応じた床(FLOOR)の掘削
    for (const room of rooms) {
      DungeonGenerator.carveRoom(tiles, room, rng);
    }

    // 3-2. ユーザー要求：複数の部屋がつながった大部屋（連結大部屋）の融合掘削
    // 水平連結：隣接する2つの部屋の間の壁を取り払い、超広大な連結大部屋にする
    for (const key of mergedRight) {
      const [rStr, cStr] = key.split(',');
      const r = parseInt(rStr, 10);
      const c = parseInt(cStr, 10);
      const roomA = rooms[r * gridCols + c];
      const roomB = rooms[r * gridCols + (c + 1)];

      // 2つの部屋の重なるY範囲を特定し、その間の壁を広く開口
      const minY = Math.max(roomA.y + 1, roomB.y + 1);
      const maxY = Math.min(roomA.y + roomA.height - 2, roomB.y + roomB.height - 2);
      const startX = roomA.x + roomA.width - 2;
      const endX = roomB.x + 2;

      for (let y = minY; y <= maxY; y++) {
        for (let x = startX; x <= endX; x++) {
          if (tiles[y]?.[x] !== undefined) {
            tiles[y][x] = 'FLOOR';
          }
        }
      }
    }

    // 垂直連結：上下に隣接する2つの部屋の間の壁を取り払い、広大な縦長大部屋にする
    for (const key of mergedBottom) {
      const [rStr, cStr] = key.split(',');
      const r = parseInt(rStr, 10);
      const c = parseInt(cStr, 10);
      const roomA = rooms[r * gridCols + c];
      const roomB = rooms[(r + 1) * gridCols + c];

      const minX = Math.max(roomA.x + 1, roomB.x + 1);
      const maxX = Math.min(roomA.x + roomA.width - 2, roomB.x + roomB.width - 2);
      const startY = roomA.y + roomA.height - 2;
      const endY = roomB.y + 2;

      for (let y = startY; y <= endY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (tiles[y]?.[x] !== undefined) {
            tiles[y][x] = 'FLOOR';
          }
        }
      }
    }

    // 4. ユーザー要求：必ず部屋と通路がある（通路コリドーの掘削）
    // マージされていない部屋同士、および全区画を確実に繋ぐ通路を掘削（※孤立部屋は通路掘削から除外）
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const currentRoom = rooms[r * gridCols + c];
        if (currentRoom.isIsolated) continue; // 孤立部屋からは通路を通さない

        // 東隣の部屋との接続（辺上のランダム位置から接続し、中央固定を解消）
        if (c < gridCols - 1) {
          const eastRoom = rooms[r * gridCols + (c + 1)];
          const isMerged = mergedRight.has(`${r},${c}`);
          if (!isMerged && !eastRoom.isIsolated) {
            // 出入口を部屋の東辺・西辺上のランダム位置に分散
            const startY = currentRoom.y + 1 + Math.floor(rng() * Math.max(1, currentRoom.height - 2));
            const startX = currentRoom.x + currentRoom.width - 1;
            const endY = eastRoom.y + 1 + Math.floor(rng() * Math.max(1, eastRoom.height - 2));
            const endX = eastRoom.x;

            DungeonGenerator.carveCorridor(
              tiles,
              startX,
              startY,
              endX,
              endY,
              rng() < 0.35, // 35%の確率で幅2マスの広々大通り
              rng
            );
          }
        }

        // 南隣の部屋との接続（辺上のランダム位置から接続）
        if (r < gridRows - 1) {
          const southRoom = rooms[(r + 1) * gridCols + c];
          const isMerged = mergedBottom.has(`${r},${c}`);
          if (!isMerged && !southRoom.isIsolated) {
            const startX = currentRoom.x + 1 + Math.floor(rng() * Math.max(1, currentRoom.width - 2));
            const startY = currentRoom.y + currentRoom.height - 1;
            const endX = southRoom.x + 1 + Math.floor(rng() * Math.max(1, southRoom.width - 2));
            const endY = southRoom.y;

            DungeonGenerator.carveCorridor(
              tiles,
              startX,
              startY,
              endX,
              endY,
              rng() < 0.35,
              rng
            );
          }
        }

        // 斜めショートカット回廊（ダンジョンの探索自由度と多様なルートを確保）
        if (r < gridRows - 1 && c < gridCols - 1 && rng() < 0.20) {
          const diagRoom = rooms[(r + 1) * gridCols + (c + 1)];
          if (!diagRoom.isIsolated) {
            const startX = currentRoom.x + 1 + Math.floor(rng() * Math.max(1, currentRoom.width - 2));
            const startY = currentRoom.y + 1 + Math.floor(rng() * Math.max(1, currentRoom.height - 2));
            const endX = diagRoom.x + 1 + Math.floor(rng() * Math.max(1, diagRoom.width - 2));
            const endY = diagRoom.y + 1 + Math.floor(rng() * Math.max(1, diagRoom.height - 2));

            DungeonGenerator.carveCorridor(
              tiles,
              startX,
              startY,
              endX,
              endY,
              false,
              rng
            );
          }
        }
      }
    }

    // 4-2. ユーザー要求：通路なくて行き止まりだったりするマップのバリエーション
    // 一部の部屋から外側へ伸びる袋小路（行き止まり回廊）を掘削（孤立部屋以外）
    const deadEndRooms = rooms.filter((r) => r.type === 'NORMAL' && !r.isCorridorOnly && !r.isIsolated);
    for (let di = 0; di < Math.min(4, deadEndRooms.length); di++) {
      if (rng() < 0.75) {
        const dr = deadEndRooms[di];
        const dirs = [
          { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
        ];
        const dir = dirs[Math.floor(rng() * dirs.length)];
        const len = 4 + Math.floor(rng() * 5);
        let curX = dr.centerX;
        let curY = dr.centerY;
        for (let step = 0; step < len; step++) {
          curX += dir.dx;
          curY += dir.dy;
          if (curX <= 2 || curX >= width - 3 || curY <= 2 || curY >= height - 3) break;
          tiles[curY][curX] = 'FLOOR';
        }
      }
    }

    // 5. スタート地点の設定（我が家の完全撤廃）
    // プレイヤー初期位置は、安全なSTART部屋の中央
    const startRoom = rooms.find((r) => r.type === 'START')!;
    const homePos: Position = {
      x: startRoom.centerX,
      y: startRoom.centerY,
    };
    tiles[homePos.y][homePos.x] = 'FLOOR';

    // 6. 「回復の泉（SPRING）」のフロア各所への配置
    // 一度使うと消える神聖な泉。START部屋および各SPRING_SANCTUM、遠方の広間に配置
    const springCandidates = rooms.filter(
      (r) => r.type === 'SPRING_SANCTUM' || r.type === 'GREAT_HALL' || r.type === 'NORMAL'
    );
    springCandidates.sort(() => rng() - 0.5);

    // START部屋にも探索準備として1つの泉を設置
    tiles[startRoom.centerY + 1][startRoom.centerX] = 'SPRING';

    // 全フロアに合計4〜6箇所の回復の泉を配置
    const springCount = 4 + Math.floor(rng() * 3);
    let placedSprings = 0;
    for (const room of springCandidates) {
      if (placedSprings >= springCount) break;
      const sx = room.centerX;
      const sy = room.centerY;
      if (tiles[sy]?.[sx] === 'FLOOR') {
        tiles[sy][sx] = 'SPRING';
        placedSprings++;
      }
    }

    // 7. 岩ブロック（BLOCK）のランダム配置
    // ユーザー要求：部屋にブロックが正方形の角みたいな感じで並んでいるのを撤廃し、
    // あったりなかったりランダムに配置してバリエーションと自然な地形変化を作る
    for (const room of rooms) {
      if (room.type === 'START' || room.type === 'DRAGON_LAIR') continue;

      // 約40%の部屋はブロックなし（すっきり広々としたホール）
      if (rng() < 0.40) continue;

      const midX = room.centerX;
      const midY = room.centerY;
      const patternRoll = rng();

      if (patternRoll < 0.40) {
        // パターンA: 部屋内に1〜3個の孤立した障害岩がランダムに点在
        const blockCount = 1 + Math.floor(rng() * 3);
        for (let b = 0; b < blockCount; b++) {
          const offsetX = Math.floor((rng() - 0.5) * (room.width - 4));
          const offsetY = Math.floor((rng() - 0.5) * (room.height - 4));
          const bx = midX + offsetX;
          const by = midY + offsetY;
          // 中心マス（泉や動線の邪魔）でなければ配置
          if (tiles[by]?.[bx] === 'FLOOR' && (bx !== midX || by !== midY)) {
            tiles[by][bx] = 'BLOCK';
          }
        }
      } else if (patternRoll < 0.75) {
        // パターンB: 2〜3個のブロックが連なった小さな岩塊（ミニ壁・L字）
        const startOffX = Math.floor((rng() - 0.5) * (room.width - 6));
        const startOffY = Math.floor((rng() - 0.5) * (room.height - 6));
        const bx = midX + startOffX;
        const by = midY + startOffY;
        const clusterDirs = [
          { dx: 0, dy: 0 },
          rng() < 0.5 ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 },
          rng() < 0.5 ? { dx: 1, dy: 1 } : { dx: -1, dy: 0 },
        ];
        for (const cd of clusterDirs) {
          const cx = bx + cd.dx;
          const cy = by + cd.dy;
          if (tiles[cy]?.[cx] === 'FLOOR' && (cx !== midX || cy !== midY)) {
            tiles[cy][cx] = 'BLOCK';
          }
        }
      } else {
        // パターンC: 部屋の隅寄りまたは非対称な場所に2個の天然石柱
        const sideX = (rng() < 0.5 ? 1 : -1) * (2 + Math.floor(rng() * 2));
        const sideY = (rng() < 0.5 ? 1 : -1) * (2 + Math.floor(rng() * 2));
        const b1x = midX + sideX;
        const b1y = midY + sideY;
        if (tiles[b1y]?.[b1x] === 'FLOOR') tiles[b1y][b1x] = 'BLOCK';

        if (rng() < 0.6) {
          const b2x = midX - sideX + (rng() < 0.5 ? 1 : -1);
          const b2y = midY - sideY;
          if (tiles[b2y]?.[b2x] === 'FLOOR' && (b2x !== midX || b2y !== midY)) {
            tiles[b2y][b2x] = 'BLOCK';
          }
        }
      }
    }

    // 8. 魔法陣（MONSTER_PORTAL）の配置
    const portals: MonsterPortal[] = [];
    const portalRooms = rooms.filter((r) => r.type === 'PORTAL_SANCTUM');
    let portalIdCounter = 1;

    for (const room of portalRooms) {
      const px = room.centerX;
      const py = room.centerY;
      tiles[py][px] = 'FLOOR';
      portals.push({
        id: `portal_${portalIdCounter++}`,
        x: px,
        y: py,
        quota: 6,
        defeatedCount: 0,
        isActive: true,
        dormantTurns: 0,
        maxDormantTurns: 50,
        spawnCooldown: 4 + Math.floor(rng() * 3),
      });
    }

    // 9. アイテムの生成と配置
    const items: FieldItem[] = [];
    let itemIdCounter = 1;

    // 3つのクラウン（王冠）の配置（離れた部屋に1つずつ）
    const crownCandidates = rooms.filter(
      (r) => r.type !== 'START' && r.type !== 'DRAGON_LAIR'
    );
    crownCandidates.sort(() => rng() - 0.5);

    // 部屋候補から確実に王冠を配置
    for (let c = 0; c < CROWNS_REQUIRED_PER_FLOOR; c++) {
      const room = crownCandidates.length > 0 ? crownCandidates[c % crownCandidates.length] : rooms[c % rooms.length];
      const pos = DungeonGenerator.findEmptyFloorPosition(tiles, room, items, rng);
      if (pos) {
        items.push({
          id: `crown_${itemIdCounter++}`,
          type: 'CROWN',
          x: pos.x,
          y: pos.y,
          value: 1,
        });
      }
    }

    // ユーザー要求：鍵の概念を完全撤廃（鍵の生成は行わない）

    // パワーストーン（POWER_STONE: 攻撃力のみ上昇、1〜3確率加算に対応して配置数を拡充）
    const powerStoneCount = 22 + Math.floor(rng() * 8);
    for (let s = 0; s < powerStoneCount; s++) {
      const room = rooms[Math.floor(rng() * rooms.length)];
      if (room.type === 'START') continue;
      const pos = DungeonGenerator.findEmptyFloorPosition(tiles, room, items, rng);
      if (pos) {
        items.push({
          id: `pstone_${itemIdCounter++}`,
          type: 'POWER_STONE',
          x: pos.x,
          y: pos.y,
          value: 1, // 拾得時にrollStoneGainで1〜3を抽選
        });
      }
    }

    // スタミナストーン（STAMINA_STONE: 最大HP＆現在HP上昇、1〜3確率加算に対応して配置数を拡充）
    const staminaStoneCount = 22 + Math.floor(rng() * 8);
    for (let s = 0; s < staminaStoneCount; s++) {
      const room = rooms[Math.floor(rng() * rooms.length)];
      if (room.type === 'START') continue;
      const pos = DungeonGenerator.findEmptyFloorPosition(tiles, room, items, rng);
      if (pos) {
        items.push({
          id: `sstone_${itemIdCounter++}`,
          type: 'STAMINA_STONE',
          x: pos.x,
          y: pos.y,
          value: 1, // 拾得時にrollStoneGainで1〜3を抽選
        });
      }
    }

    // 魔法スクロール（フロア各所に落ちており、拾うと即座に魔法ストック獲得）
    const scrollPool: FieldItem['type'][] = [
      'SCROLL_FIRE_BOLT',
      'SCROLL_HEAL_LIGHT',
      'SCROLL_THUNDER_STRIKE',
      'SCROLL_FROST_NOVA',
      'SCROLL_METEOR_SWARM',
      'SCROLL_RETURN_HOME',
    ];
    const floorScrollCount = 4 + Math.floor(rng() * 3);
    for (let sc = 0; sc < floorScrollCount; sc++) {
      const room = rooms[Math.floor(rng() * rooms.length)];
      if (room.type === 'START' || room.type === 'DRAGON_LAIR') continue;
      const pos = DungeonGenerator.findEmptyFloorPosition(tiles, room, items, rng);
      if (pos) {
        const chosenScroll = scrollPool[Math.floor(rng() * scrollPool.length)];
        items.push({
          id: `scroll_${itemIdCounter++}`,
          type: chosenScroll,
          x: pos.x,
          y: pos.y,
          value: 1,
        });
      }
    }

    // 超低確率: パワーストーン宝物庫（POWER_STONE_VAULT）の追加配置
    const powerVault = rooms.find((r) => r.type === 'POWER_STONE_VAULT');
    if (powerVault) {
      const vaultCount = 6 + Math.floor(rng() * 4);
      for (let vs = 0; vs < vaultCount; vs++) {
        const pos1 = DungeonGenerator.findEmptyFloorPosition(tiles, powerVault, items, rng);
        if (pos1) {
          items.push({
            id: `vault_pstone_${itemIdCounter++}`,
            type: 'POWER_STONE',
            x: pos1.x,
            y: pos1.y,
            value: 2,
          });
        }
        const pos2 = DungeonGenerator.findEmptyFloorPosition(tiles, powerVault, items, rng);
        if (pos2) {
          items.push({
            id: `vault_sstone_${itemIdCounter++}`,
            type: 'STAMINA_STONE',
            x: pos2.x,
            y: pos2.y,
            value: 8,
          });
        }
      }
    }

    // 超低確率: 墓場モンスターハウス（GRAVEYARD_MONSTER_HOUSE）の墓石(GRAVE)配置
    const graveyardRoom = rooms.find((r) => r.type === 'GRAVEYARD_MONSTER_HOUSE');
    if (graveyardRoom) {
      const graveCount = 8 + Math.floor(rng() * 4);
      for (let g = 0; g < graveCount; g++) {
        const gx = graveyardRoom.x + 2 + Math.floor(rng() * (graveyardRoom.width - 4));
        const gy = graveyardRoom.y + 2 + Math.floor(rng() * (graveyardRoom.height - 4));
        if (tiles[gy]?.[gx] === 'FLOOR' && !items.some((it) => it.x === gx && it.y === gy)) {
          tiles[gy][gx] = 'GRAVE';
        }
      }
    }

    // 宝箱（CHEST_BRONZE, CHEST_SILVER, CHEST_GOLD: 要鍵）
    const chestCount = 10 + Math.floor(rng() * 5);
    for (let c = 0; c < chestCount; c++) {
      const room = rooms[Math.floor(rng() * rooms.length)];
      if (room.type === 'START' || room.type === 'DRAGON_LAIR') continue;
      const pos = DungeonGenerator.findEmptyFloorPosition(tiles, room, items, rng);
      if (pos) {
        const rVal = rng();
        const chestType: FieldItem['type'] =
          rVal < 0.75 ? 'CHEST_BRONZE' : rVal < 0.92 ? 'CHEST_SILVER' : 'CHEST_GOLD';
        items.push({
          id: `chest_${itemIdCounter++}`,
          type: chestType,
          x: pos.x,
          y: pos.y,
          value: chestType === 'CHEST_GOLD' ? 500 : chestType === 'CHEST_SILVER' ? 200 : 100,
        });
      }
    }

    // 生命の霊薬（即座にHP50%割合回復）
    for (let p = 0; p < 5; p++) {
      const room = rooms[Math.floor(rng() * rooms.length)];
      if (room.type === 'START') continue;
      const pos = DungeonGenerator.findEmptyFloorPosition(tiles, room, items, rng);
      if (pos) {
        items.push({
          id: `potion_${itemIdCounter++}`,
          type: 'POTION',
          x: pos.x,
          y: pos.y,
          value: 1,
        });
      }
    }

    // 聖なる十字架（一定時間完全無敵）
    for (let cr = 0; cr < 2; cr++) {
      const room = rooms[Math.floor(rng() * rooms.length)];
      if (room.type === 'START') continue;
      const pos = DungeonGenerator.findEmptyFloorPosition(tiles, room, items, rng);
      if (pos) {
        items.push({
          id: `cross_${itemIdCounter++}`,
          type: 'CROSS',
          x: pos.x,
          y: pos.y,
          value: 1,
        });
      }
    }

    // たいまつ（TORCH: ユーザー要求、50ターンの間視界が1.5倍に広がる）
    for (let t = 0; t < 2 + Math.floor(rng() * 2); t++) {
      const room = rooms[Math.floor(rng() * rooms.length)];
      if (room.type === 'START') continue;
      const pos = DungeonGenerator.findEmptyFloorPosition(tiles, room, items, rng);
      if (pos) {
        items.push({
          id: `torch_${itemIdCounter++}`,
          type: 'TORCH',
          x: pos.x,
          y: pos.y,
          value: 50,
        });
      }
    }

    // 武器（WEAPON: ユーザー要求、耐久度あり・攻撃力+5〜+50、フロアに1〜2個の激レア配置）
    const floorWeaponCount = rng() < 0.8 ? 1 : 2;
    for (let w = 0; w < floorWeaponCount; w++) {
      const room = rooms[Math.floor(rng() * rooms.length)];
      if (room.type === 'START' || room.type === 'DRAGON_LAIR') continue;
      const pos = DungeonGenerator.findEmptyFloorPosition(tiles, room, items, rng);
      if (pos) {
        const weaponData = DungeonGenerator.generateRandomWeapon();
        items.push({
          id: `weapon_${itemIdCounter++}`,
          type: 'WEAPON',
          x: pos.x,
          y: pos.y,
          value: weaponData.bonus,
          equipmentData: weaponData,
        });
      }
    }

    // 防具（ARMOR: ユーザー要求、耐久度あり・防御力+2〜+20、フロアに1〜2個の激レア配置）
    const floorArmorCount = rng() < 0.8 ? 1 : 2;
    for (let a = 0; a < floorArmorCount; a++) {
      const room = rooms[Math.floor(rng() * rooms.length)];
      if (room.type === 'START' || room.type === 'DRAGON_LAIR') continue;
      const pos = DungeonGenerator.findEmptyFloorPosition(tiles, room, items, rng);
      if (pos) {
        const armorData = DungeonGenerator.generateRandomArmor();
        items.push({
          id: `armor_${itemIdCounter++}`,
          type: 'ARMOR',
          x: pos.x,
          y: pos.y,
          value: armorData.bonus,
          equipmentData: armorData,
        });
      }
    }

    // ユーザー要求：コンティニュー用アイテム（黄泉還りの秘薬: REVIVE_POTION、ごくまれに拾える超希少品）
    // 孤立部屋がある場合は孤立部屋に優先配置、またはフロアに約30%の低確率で配置
    const isolatedRooms = rooms.filter((r) => r.isIsolated);
    if (isolatedRooms.length > 0) {
      for (const iso of isolatedRooms) {
        if (rng() < 0.7) {
          const pos = DungeonGenerator.findEmptyFloorPosition(tiles, iso, items, rng);
          if (pos) {
            items.push({
              id: `revive_potion_${itemIdCounter++}`,
              type: 'REVIVE_POTION',
              x: pos.x,
              y: pos.y,
              value: 1,
            });
          }
        }
      }
    } else if (rng() < 0.35) {
      const room = rooms[Math.floor(rng() * rooms.length)];
      if (room.type !== 'START' && room.type !== 'DRAGON_LAIR') {
        const pos = DungeonGenerator.findEmptyFloorPosition(tiles, room, items, rng);
        if (pos) {
          items.push({
            id: `revive_potion_${itemIdCounter++}`,
            type: 'REVIVE_POTION',
            x: pos.x,
            y: pos.y,
            value: 1,
          });
        }
      }
    }

    // 10. モンスターの初期配置（初動は必ずLv.1から開始、敵Atk 1〜、距離に応じて滑らかに成長）
    const monsters: MonsterEntity[] = [];
    let monsterIdCounter = 1;
    const monsterCount = 36 + floorNumber * 8;

    // モンスターハウスがある場合、部屋内に集中して魔物を配置
    if (graveyardRoom) {
      const houseMonsters = 8 + Math.floor(rng() * 4);
      // ユーザー要求：初動即死を防ぐため、墓場部屋でもLv.1〜3に抑制
      const housePool = MONSTER_CATALOG.filter((s) => s.level >= 1 && s.level <= 3);
      const effectiveHousePool = housePool.length > 0 ? housePool : MONSTER_CATALOG.slice(0, 5);

      for (let hm = 0; hm < houseMonsters; hm++) {
        const pos = DungeonGenerator.findEmptyFloorPosition(tiles, graveyardRoom, items, rng);
        if (!pos) continue;
        const sp = effectiveHousePool[Math.floor(rng() * effectiveHousePool.length)];
        const scaledHp = sp.baseHp + Math.min(6, (floorNumber - 1) * 2);
        // 初動ATKは最大3〜4に抑制
        const scaledAtk = Math.min(3, sp.baseAtk);
        monsters.push({
          id: `monster_house_${monsterIdCounter++}`,
          type: sp.type,
          catalogId: sp.id,
          name: sp.name,
          color: sp.color,
          subColor: sp.subColor,
          x: pos.x,
          y: pos.y,
          renderX: pos.x,
          renderY: pos.y,
          direction: 'DOWN',
          hp: scaledHp,
          maxHp: scaledHp,
          attackPower: scaledAtk,
          defensePower: Math.floor(sp.tier * 0.5),
          speed: sp.speed,
          moveTimer: rng() * sp.speed,
          carriedItem: null,
          level: sp.level,
          isGhost: sp.isGhost,
          isRanged: sp.isRanged,
          isPreemptive: rng() < 0.08,
        });
      }
    }

    // 各部屋へのモンスター配置（START部屋には配置しない）
    for (let m = 0; m < monsterCount; m++) {
      const room = rooms[Math.floor(rng() * rooms.length)];
      if (room.type === 'START') continue;

      const pos = DungeonGenerator.findEmptyFloorPosition(tiles, room, items, rng);
      if (!pos) continue;

      // START部屋からのマンハッタン距離（0〜10）に基づき、敵レベルを算出
      const roomDist = room.gridCol + room.gridRow;

      // ユーザー要求：新しいステージに入った場合、階層が進むにつれて少しずつ最初の敵を強くする
      // B1F: Lv.1〜3, B2F: Lv.2〜6, B3F: Lv.3〜9, B4F: Lv.5〜12...
      const floorBaseLv = Math.max(1, 1 + (floorNumber - 1) * 2);
      const floorMaxLv = Math.min(80, 3 + (floorNumber - 1) * 3);

      let minLv: number = Math.max(1, floorBaseLv - 1);
      let maxLv: number = floorBaseLv + 1;
      if (roomDist <= 2) {
        minLv = Math.max(1, floorBaseLv - 1);
        maxLv = floorBaseLv + 1;
      } else if (roomDist <= 5) {
        minLv = Math.max(1, floorBaseLv);
        maxLv = Math.min(floorMaxLv, floorBaseLv + 2);
      } else if (roomDist <= 8) {
        minLv = Math.max(1, floorBaseLv);
        maxLv = Math.min(floorMaxLv, floorBaseLv + 3);
      } else {
        minLv = Math.max(1, floorBaseLv + 1);
        maxLv = floorMaxLv;
      }

      let roomPool = MONSTER_CATALOG.filter((s) => s.level >= minLv && s.level <= maxLv);
      if (roomPool.length === 0) {
        roomPool = MONSTER_CATALOG.filter((s) => s.level <= maxLv);
        if (roomPool.length === 0) roomPool = [MONSTER_CATALOG[0]];
      }

      const sp = roomPool[Math.floor(rng() * roomPool.length)];
      const scaledHp = sp.baseHp + Math.min(40, (floorNumber - 1) * 4);
      // 初動配置の敵ATK上限もフロア階層に応じて少しずつ開放（B1F: 4, B2F: 6, B3F: 8...）
      const maxFloorAtk = 4 + (floorNumber - 1) * 2;
      const scaledAtk = Math.max(1, Math.min(maxFloorAtk, sp.baseAtk));

      monsters.push({
        id: `monster_${monsterIdCounter++}`,
        type: sp.type,
        catalogId: sp.id,
        name: sp.name,
        color: sp.color,
        subColor: sp.subColor,
        x: pos.x,
        y: pos.y,
        renderX: pos.x,
        renderY: pos.y,
        direction: 'DOWN',
        hp: scaledHp,
        maxHp: scaledHp,
        attackPower: scaledAtk,
        defensePower: Math.floor(sp.tier * 0.5),
        speed: sp.speed,
        moveTimer: rng() * sp.speed,
        carriedItem: null,
        level: sp.level,
        isGhost: sp.isGhost,
        isRanged: sp.isRanged,
        isPreemptive: rng() < 0.08,
      });
    }

    // 11. ドラゴンボスの配置（最深部ドラゴンの巣窟の中央）
    const dragonLair = rooms.find((r) => r.type === 'DRAGON_LAIR')!;
    const dragonCenterX = dragonLair.centerX - 1;
    const dragonCenterY = dragonLair.centerY - 1;

    // ドラゴン周辺スペースを床に整地
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -1; dx <= 2; dx++) {
        tiles[dragonCenterY + dy][dragonCenterX + dx] = 'FLOOR';
      }
    }

    // ユーザー要求：ボスの形か色をステージごとに変えて（ドラゴンだけでなく蜘蛛・蟻・トカゲ・ゴーレム）
    interface BossPreset {
      bossType: DragonBoss['bossType'];
      name: string;
      themeColor: string;
      subColor: string;
      eyeColor: string;
      specialSkillName: string;
    }

    const bossPresets: BossPreset[] = [
      {
        bossType: 'SPIDER',
        name: '冥界女王 クイーンスパイダー',
        themeColor: '#3a0ca3', // 妖しい深紫
        subColor: '#7209b7',   // 毒紫
        eyeColor: '#f72585',   // 鮮血ネオンピンク複眼
        specialSkillName: '猛毒糸結界',
      },
      {
        bossType: 'ANT',
        name: '鋼鉄大蟻 タイタンアント',
        themeColor: '#d35400', // 琥珀鋼鉄オレンジ
        subColor: '#873600',   // 堅甲ダークブラウン
        eyeColor: '#f1c40f',   // 鋭い黄金眼
        specialSkillName: '強酸液噴射',
      },
      {
        bossType: 'LIZARD',
        name: '毒蛇大蜥蜴 バジリスク',
        themeColor: '#1b4332', // 深緑鱗
        subColor: '#40916c',   // 毒鱗エメラルド
        eyeColor: '#e74c3c',   // 石化邪眼紅
        specialSkillName: '石化邪眼光',
      },
      {
        bossType: 'GOLEM',
        name: '古代巨兵 メガリスゴーレム',
        themeColor: '#495057', // 古代巨石グレー
        subColor: '#212529',   // 黒曜石コア
        eyeColor: '#00d2d3',   // 古代ルーンシアン
        specialSkillName: '岩石崩落撃',
      },
      {
        bossType: 'DRAGON',
        name: '紅蓮古代竜 ヴォルケイドラゴン',
        themeColor: '#9e2a2b', // 紅蓮の竜鱗
        subColor: '#540b0e',   // 黒鉄の翼
        eyeColor: '#ffb703',   // 灼熱の瞳
        specialSkillName: '焦熱火炎ブレス',
      },
    ];

    const presetIndex = (floorNumber - 1) % bossPresets.length;
    const chosenPreset = bossPresets[presetIndex];
    // 深層周回時の冠名付与
    const loopCycle = Math.floor((floorNumber - 1) / bossPresets.length);
    const bossPrefix = loopCycle > 0 ? `真・` : '';

    const dragonHp = 80 + (floorNumber - 1) * 30; // 1F: 80, 2F: 110, 3F: 140
    const dragonAtk = 8 + (floorNumber - 1) * 3;  // 1F: 8, 2F: 11, 3F: 14

    const dragon: DragonBoss = {
      x: dragonCenterX,
      y: dragonCenterY,
      renderX: dragonCenterX,
      renderY: dragonCenterY,
      size: 2,
      hp: dragonHp,
      maxHp: dragonHp,
      attackPower: dragonAtk,
      angerLevel: 0,
      breathCooldown: 6, // 遭遇直後の即死ブレスを防ぐ初期クールダウン
      isAwake: false,
      roamTimer: 0,
      bossType: chosenPreset.bossType,
      name: `${bossPrefix}${chosenPreset.name}`,
      themeColor: chosenPreset.themeColor,
      subColor: chosenPreset.subColor,
      eyeColor: chosenPreset.eyeColor,
      specialSkillName: chosenPreset.specialSkillName,
    };

    // ユーザー要求：ボスの部屋には手下（同じ種族）が生息している
    // ボスの種族に対応した同系統の魔物を3〜4体配下に配置
    const minionCount = 3 + Math.floor(rng() * 2); // 3〜4体
    let candidateMinionPool: typeof MONSTER_CATALOG;

    if (chosenPreset.bossType === 'SPIDER') {
      // 蜘蛛・節足虫族（INSECT族のうちクモ・サソリ・アラクネ等）
      candidateMinionPool = MONSTER_CATALOG.filter(
        (m) => m.type === 'INSECT' && (m.name.includes('クモ') || m.name.includes('スパイダー') || m.name.includes('スコーピオン') || m.name.includes('アラクネ'))
      );
    } else if (chosenPreset.bossType === 'ANT') {
      // 鋼鉄大蟻・甲虫族（INSECT族のうちアント、ビートル、スカラベ等）
      candidateMinionPool = MONSTER_CATALOG.filter(
        (m) => m.type === 'INSECT' && (m.name.includes('アント') || m.name.includes('ビートル') || m.name.includes('スカラベ') || m.name.includes('ビー'))
      );
    } else if (chosenPreset.bossType === 'LIZARD') {
      // 毒蛇大蜥蜴・爬虫竜人族（REPTILE族）
      candidateMinionPool = MONSTER_CATALOG.filter((m) => m.type === 'REPTILE');
    } else if (chosenPreset.bossType === 'GOLEM') {
      // 古代巨兵・巨兵族（GOLEM族）
      candidateMinionPool = MONSTER_CATALOG.filter((m) => m.type === 'GOLEM');
    } else {
      // ヴォルケイドラゴン・竜種（REPTILE族の上位・竜種）
      candidateMinionPool = MONSTER_CATALOG.filter((m) => m.type === 'REPTILE');
    }

    if (candidateMinionPool.length === 0) {
      candidateMinionPool = MONSTER_CATALOG.filter((m) => m.type === 'INSECT');
    }

    // ボスの部屋の空き床マスに手下たちを配置
    for (let mi = 0; mi < minionCount; mi++) {
      const sp = candidateMinionPool[Math.floor(rng() * candidateMinionPool.length)];
      for (let attempt = 0; attempt < 30; attempt++) {
        const mx = dragonLair.x + 1 + Math.floor(rng() * Math.max(1, dragonLair.width - 2));
        const my = dragonLair.y + 1 + Math.floor(rng() * Math.max(1, dragonLair.height - 2));
        const isOverlapBoss =
          mx >= dragonCenterX - 1 &&
          mx <= dragonCenterX + 2 &&
          my >= dragonCenterY - 1 &&
          my <= dragonCenterY + 2;
        const isOverlapMonster = monsters.some((om) => om.x === mx && om.y === my);

        if (tiles[my]?.[mx] === 'FLOOR' && !isOverlapBoss && !isOverlapMonster) {
          const scaledHp = Math.floor(sp.baseHp * (1 + (floorNumber - 1) * 0.15));
          const scaledAtk = Math.max(1, Math.floor(sp.baseAtk * (1 + (floorNumber - 1) * 0.15)));
          monsters.push({
            id: `minion_${monsterIdCounter++}`,
            type: sp.type,
            catalogId: sp.id,
            name: `${chosenPreset.name.split(' ')[0]}配下 ${sp.name}`,
            color: sp.color,
            subColor: sp.subColor,
            x: mx,
            y: my,
            renderX: mx,
            renderY: my,
            direction: 'DOWN',
            hp: scaledHp,
            maxHp: scaledHp,
            attackPower: scaledAtk,
            defensePower: Math.floor(sp.tier * 0.5),
            speed: sp.speed,
            moveTimer: rng() * sp.speed,
            carriedItem: null,
            level: sp.level,
            isGhost: sp.isGhost,
            isRanged: sp.isRanged,
            isPreemptive: rng() < 0.2, // 手下は警戒心が強く先制攻撃率高め
          });
          break;
        }
      }
    }

    // ユーザー要求：1ステージに王冠が存在しないバグがありそうなので、絶対に王冠は3個存在するようにする
    let currentCrownCount = items.filter((it) => it.type === 'CROWN').length;
    if (currentCrownCount < CROWNS_REQUIRED_PER_FLOOR) {
      // マップ内を走査し、安全な空き床タイルを見つけて確実に3個まで補充配置する
      for (let cy = 2; cy < height - 2 && currentCrownCount < CROWNS_REQUIRED_PER_FLOOR; cy++) {
        for (let cx = 2; cx < width - 2 && currentCrownCount < CROWNS_REQUIRED_PER_FLOOR; cx++) {
          if (tiles[cy]?.[cx] === 'FLOOR') {
            const hasItem = items.some((it) => it.x === cx && it.y === cy);
            const isNearStart = Math.hypot(cx - homePos.x, cy - homePos.y) < 4;
            const isNearBoss = Math.hypot(cx - dragonCenterX, cy - dragonCenterY) < 4;
            if (!hasItem && !isNearStart && !isNearBoss) {
              items.push({
                id: `crown_guaranteed_${itemIdCounter++}`,
                type: 'CROWN',
                x: cx,
                y: cy,
                value: 1,
              });
              currentCrownCount++;
            }
          }
        }
      }
    }

    // ユーザー要求：ステージによってはワープマスがいっぱいあるステージを作成、特定場所へ飛ぶものとランダムに飛ぶもの
    // 道のない部屋を作ってもよい、必ずワープマスで移動・戻ることができるようにする（絶対詰むことがないように）
    const warps: WarpTile[] = [];
    let warpIdCounter = 1;

    // 1. 孤立部屋（道のない部屋）への双方向ペアワープ（必ず戻れる保証）
    const normalRoomsForWarp = rooms.filter(
      (r) => r.type === 'NORMAL' && !r.isCorridorOnly && !r.isIsolated
    );

    for (const isoRoom of isolatedRooms) {
      const posIso = DungeonGenerator.findEmptyFloorPosition(tiles, isoRoom, items, rng);
      const hostRoom = normalRoomsForWarp.length > 0
        ? normalRoomsForWarp[Math.floor(rng() * normalRoomsForWarp.length)]
        : rooms.find((r) => r.type === 'START') || rooms[0];
      const posHost = DungeonGenerator.findEmptyFloorPosition(tiles, hostRoom, items, rng);

      if (posIso && posHost) {
        tiles[posHost.y][posHost.x] = 'WARP';
        tiles[posIso.y][posIso.x] = 'WARP';

        const pairKey = `pair_iso_${warpIdCounter++}`;
        warps.push({
          x: posHost.x,
          y: posHost.y,
          targetX: posIso.x,
          targetY: posIso.y,
          pairId: pairKey,
          name: '孤立の間への転移陣',
        });
        warps.push({
          x: posIso.x,
          y: posIso.y,
          targetX: posHost.x,
          targetY: posHost.y,
          pairId: pairKey,
          name: '本道への帰還陣',
        });
      }
    }

    // 2. 通常の固定ペアワープ（ショートカット用・双方向）
    // ユーザー要求：ワープマスはほぼ出なくていい（極めて稀に5%の低確率で1ペアのみ出現）
    const pairWarpCount = rng() < 0.05 ? 1 : 0;
    for (let pw = 0; pw < pairWarpCount; pw++) {
      if (normalRoomsForWarp.length >= 2) {
        const idxA = Math.floor(rng() * normalRoomsForWarp.length);
        let idxB = Math.floor(rng() * normalRoomsForWarp.length);
        if (idxA === idxB) idxB = (idxB + 1) % normalRoomsForWarp.length;

        const roomA = normalRoomsForWarp[idxA];
        const roomB = normalRoomsForWarp[idxB];
        const posA = DungeonGenerator.findEmptyFloorPosition(tiles, roomA, items, rng);
        const posB = DungeonGenerator.findEmptyFloorPosition(tiles, roomB, items, rng);

        if (posA && posB && tiles[posA.y][posA.x] !== 'WARP' && tiles[posB.y][posB.x] !== 'WARP') {
          tiles[posA.y][posA.x] = 'WARP';
          tiles[posB.y][posB.x] = 'WARP';

          const pairKey = `pair_norm_${warpIdCounter++}`;
          warps.push({
            x: posA.x,
            y: posA.y,
            targetX: posB.x,
            targetY: posB.y,
            pairId: pairKey,
            name: '双対の空間跳躍陣A',
          });
          warps.push({
            x: posB.x,
            y: posB.y,
            targetX: posA.x,
            targetY: posA.y,
            pairId: pairKey,
            name: '双対の空間跳躍陣B',
          });
        }
      }
    }

    // 3. ランダムワープマス
    // ユーザー要求：ワープマスはほぼ出なくていい（ランダムワープは廃止）
    const randomWarpCount = 0;
    for (let rw = 0; rw < randomWarpCount; rw++) {
      if (normalRoomsForWarp.length > 0) {
        const roomR = normalRoomsForWarp[Math.floor(rng() * normalRoomsForWarp.length)];
        const posR = DungeonGenerator.findEmptyFloorPosition(tiles, roomR, items, rng);
        if (posR && tiles[posR.y][posR.x] !== 'WARP') {
          tiles[posR.y][posR.x] = 'WARP';
          warps.push({
            x: posR.x,
            y: posR.y,
            targetX: -1,
            targetY: -1,
            isRandom: true,
            name: '混沌のランダム跳躍陣',
          });
        }
      }
    }

    return {
      floorNumber,
      width,
      height,
      tiles,
      homePos,
      homeStones: [], // 我が家は撤廃（互換のため空配列）
      items,
      monsters,
      dragon,
      exploredTiles,
      portals,
      warps,
      adventurers: [],
      foe: null,
    };
  }

  /** 形状に応じた部屋の床掘削 */
  private static carveRoom(tiles: TileType[][], room: Room, rng: () => number): void {
    // ユーザー要求：部屋がなく通路だけの区画（長廊下・バイパス）は部屋を掘削しない
    if (room.isCorridorOnly) return;

    const { x, y, width, height, shape, centerX, centerY } = room;

    switch (shape) {
      case 'CIRCLE': {
        // 円形ホール（中心からのユークリッド距離）
        const radius = Math.min(width, height) / 2 - 0.5;
        for (let py = y; py < y + height; py++) {
          for (let px = x; px < x + width; px++) {
            const dist = Math.hypot(px - centerX, py - centerY);
            if (dist <= radius) {
              tiles[py][px] = 'FLOOR';
            }
          }
        }
        break;
      }

      case 'OCTAGON': {
        // 八角形広間（四隅の三角領域を削る）
        const cut = Math.max(2, Math.floor(Math.min(width, height) * 0.28));
        for (let py = y; py < y + height; py++) {
          for (let px = x; px < x + width; px++) {
            const dx = px - x;
            const dy = py - y;
            const isCorner =
              (dx < cut && dy < cut && dx + dy < cut) || // 左上
              (dx >= width - cut && dy < cut && (width - 1 - dx) + dy < cut) || // 右上
              (dx < cut && dy >= height - cut && dx + (height - 1 - dy) < cut) || // 左下
              (dx >= width - cut && dy >= height - cut && (width - 1 - dx) + (height - 1 - dy) < cut); // 右下

            if (!isCorner) {
              tiles[py][px] = 'FLOOR';
            }
          }
        }
        break;
      }

      case 'CROSS': {
        // 十字型神殿（縦と横の直交バー）
        const barW = Math.max(4, Math.floor(width * 0.5));
        const barH = Math.max(4, Math.floor(height * 0.5));
        const startX = centerX - Math.floor(barW / 2);
        const startY = centerY - Math.floor(barH / 2);

        for (let py = y; py < y + height; py++) {
          for (let px = x; px < x + width; px++) {
            const inHorizontal = px >= x && px < x + width && py >= startY && py < startY + barH;
            const inVertical = py >= y && py < y + height && px >= startX && px < startX + barW;
            if (inHorizontal || inVertical) {
              tiles[py][px] = 'FLOOR';
            }
          }
        }
        break;
      }

      case 'L_SHAPED': {
        // L字型複合回廊（直角に曲がる部屋）
        const halfW = Math.floor(width * 0.55);
        const halfH = Math.floor(height * 0.55);
        for (let py = y; py < y + height; py++) {
          for (let px = x; px < x + width; px++) {
            const inBottomBar = py >= y + height - halfH;
            const inLeftBar = px < x + halfW;
            if (inBottomBar || inLeftBar) {
              tiles[py][px] = 'FLOOR';
            }
          }
        }
        break;
      }

      case 'CAVERN': {
        // 有機的自然洞窟（重なり合う複数の円によるアメーバ状の空洞）
        const numBlobs = 4 + Math.floor(rng() * 3);
        const blobs: { bx: number; by: number; br: number }[] = [];
        for (let i = 0; i < numBlobs; i++) {
          blobs.push({
            bx: centerX + (rng() - 0.5) * (width * 0.5),
            by: centerY + (rng() - 0.5) * (height * 0.5),
            br: 2.5 + rng() * 3.5,
          });
        }
        for (let py = y; py < y + height; py++) {
          for (let px = x; px < x + width; px++) {
            const inAnyBlob = blobs.some((b) => Math.hypot(px - b.bx, py - b.by) <= b.br);
            if (inAnyBlob) {
              tiles[py][px] = 'FLOOR';
            }
          }
        }
        // 中心が確実に床になるよう保証
        tiles[centerY][centerX] = 'FLOOR';
        break;
      }

      case 'RECTANGLE':
      default: {
        // 通常の矩形部屋
        for (let py = y; py < y + height; py++) {
          for (let px = x; px < x + width; px++) {
            tiles[py][px] = 'FLOOR';
          }
        }
        break;
      }
    }
  }

  /** コリドー（通路）の掘削（折れ曲がり・幅広・バラバラな接続経路対応） */
  private static carveCorridor(
    tiles: TileType[][],
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    isWide: boolean,
    rng?: () => number
  ): void {
    const randomVal = rng ? rng() : Math.random();
    const setFloor = (x: number, y: number) => {
      if (tiles[y]?.[x] !== undefined) {
        tiles[y][x] = 'FLOOR';
        if (isWide) {
          if (tiles[y + 1]?.[x] !== undefined) tiles[y + 1][x] = 'FLOOR';
          if (tiles[y]?.[x + 1] !== undefined) tiles[y][x + 1] = 'FLOOR';
        }
      }
    };

    // ユーザー要求：通路の位置が真ん中固定にならずバラバラになるよう、
    // 中間でのクランク折れ曲がり（Z字/S字）や掘削順序のランダム化を行う
    if (randomVal < 0.4) {
      // パターン1: 水平掘削の途中で垂直に折れ曲がり、再び水平へ（Z字/クランク）
      const midX = Math.floor((x1 + x2) / 2);
      let cx = x1;
      let cy = y1;
      while (cx !== midX) {
        setFloor(cx, cy);
        cx += cx < midX ? 1 : -1;
      }
      while (cy !== y2) {
        setFloor(cx, cy);
        cy += cy < y2 ? 1 : -1;
      }
      while (cx !== x2) {
        setFloor(cx, cy);
        cx += cx < x2 ? 1 : -1;
      }
      setFloor(x2, y2);
    } else if (randomVal < 0.7) {
      // パターン2: 垂直掘削の途中で水平に折れ曲がり、再び垂直へ
      const midY = Math.floor((y1 + y2) / 2);
      let cx = x1;
      let cy = y1;
      while (cy !== midY) {
        setFloor(cx, cy);
        cy += cy < midY ? 1 : -1;
      }
      while (cx !== x2) {
        setFloor(cx, cy);
        cx += cx < x2 ? 1 : -1;
      }
      while (cy !== y2) {
        setFloor(cx, cy);
        cy += cy < y2 ? 1 : -1;
      }
      setFloor(x2, y2);
    } else {
      // パターン3: L字掘削（X先行またはY先行をランダム決定）
      let cx = x1;
      let cy = y1;
      if (randomVal < 0.85) {
        while (cx !== x2) {
          setFloor(cx, cy);
          cx += cx < x2 ? 1 : -1;
        }
        while (cy !== y2) {
          setFloor(cx, cy);
          cy += cy < y2 ? 1 : -1;
        }
      } else {
        while (cy !== y2) {
          setFloor(cx, cy);
          cy += cy < y2 ? 1 : -1;
        }
        while (cx !== x2) {
          setFloor(cx, cy);
          cx += cx < x2 ? 1 : -1;
        }
      }
      setFloor(x2, y2);
    }
  }

  /** 部屋内の空いている床マスを探索 */
  private static findEmptyFloorPosition(
    tiles: TileType[][],
    room: Room,
    existingItems: FieldItem[],
    rng: () => number
  ): Position | null {
    let attempts = 0;
    while (attempts < 50) {
      attempts++;
      const x = room.x + 1 + Math.floor(rng() * (room.width - 2));
      const y = room.y + 1 + Math.floor(rng() * (room.height - 2));

      if (
        tiles[y]?.[x] === 'FLOOR' &&
        !existingItems.some((it) => it.x === x && it.y === y)
      ) {
        return { x, y };
      }
    }
    return null;
  }

  /** 指定座標に敵をスポーン生成（ユーザー要求：徐々に強い敵も出るが、弱い敵も引き続き選択される） */
  public static generateMonsterAt(x: number, y: number, enemyLevel: number, turnCount: number = 0): MonsterEntity {
    const maxAvailableLv = Math.max(1, enemyLevel);
    const pool = MONSTER_CATALOG.filter((s) => s.level <= maxAvailableLv);

    // ユーザー要求：強い敵も出るが弱い敵も選択されてほしい
    // 35%の確率で「現在の上位帯（enemyLevel付近）」、65%の確率で「プール全体（Lv.1含む）」から選定
    let sp: (typeof MONSTER_CATALOG)[0];
    if (Math.random() < 0.35 && pool.length > 3) {
      const upperPool = pool.filter((s) => s.level >= Math.max(1, maxAvailableLv - 4));
      sp = upperPool[Math.floor(Math.random() * upperPool.length)];
    } else {
      sp = pool[Math.floor(Math.random() * pool.length)];
    }

    const scaledHp = sp.baseHp + Math.min(30, (sp.level - 1) * 2);
    // ターン数に応じた最大ATKセーフティキャップ
    const maxAtkForTurn = turnCount < 40 ? 4 : turnCount < 80 ? 6 : turnCount < 140 ? 10 : turnCount < 220 ? 15 : 30;
    const rawAtk = sp.baseAtk;
    const scaledAtk = Math.max(1, Math.min(maxAtkForTurn, rawAtk));

    return {
      id: `portal_monster_${Date.now()}_${Math.random()}`,
      type: sp.type,
      catalogId: sp.id,
      name: sp.name,
      color: sp.color,
      subColor: sp.subColor,
      x,
      y,
      renderX: x,
      renderY: y,
      direction: 'DOWN',
      hp: scaledHp,
      maxHp: scaledHp,
      attackPower: scaledAtk,
      defensePower: Math.floor(sp.tier * 0.5),
      speed: sp.speed,
      moveTimer: 0,
      carriedItem: null,
      level: sp.level,
      isGhost: sp.isGhost,
      isRanged: sp.isRanged,
      isPreemptive: Math.random() < 0.08,
    };
  }

  /**
   * 装備の耐久度を抽選（ユーザー要求：10～30ぐらいで5刻み、少ない方の選択率を高く）
   * 10: 45%, 15: 30%, 20: 15%, 25: 7%, 30: 3%
   */
  public static getRandomDurability(): number {
    const roll = Math.random();
    if (roll < 0.45) return 10;
    if (roll < 0.75) return 15;
    if (roll < 0.90) return 20;
    if (roll < 0.97) return 25;
    return 30;
  }

  /** ランダムな武器アイテムデータを生成（+3刻みで+30まで、高い武器は超でにくく設定） */
  public static generateRandomWeapon(): EquipmentItem {
    const roll = Math.random();
    let index = 0;
    if (roll < 0.35) index = 0;        // +3 (骨片のナイフ) 35%
    else if (roll < 0.60) index = 1;   // +6 (錆びたショートソード) 25%
    else if (roll < 0.75) index = 2;   // +9 (スケルトンブレード) 15%
    else if (roll < 0.85) index = 3;   // +12 (漆黒の魔剣) 10%
    else if (roll < 0.91) index = 4;   // +15 (怨嗟の戦斧) 6%
    else if (roll < 0.95) index = 5;   // +18 (業火の大剣) 4%
    else if (roll < 0.975) index = 6;  // +21 (覇王の骨槍) 2.5%
    else if (roll < 0.990) index = 7;  // +24 (竜殺しの剛剣) 1.5%
    else if (roll < 0.997) index = 8;  // +27 (冥府の魔鎌) 0.7%
    else index = 9;                    // +30 (神滅の断罪剣) 0.3% 超低確率！

    const template = WEAPON_CATALOG[index];
    const dur = DungeonGenerator.getRandomDurability();
    return {
      id: `wpn_${Date.now()}_${Math.random()}`,
      ...template,
      durability: dur,
      maxDurability: dur,
    };
  }

  /** ランダムな防具アイテムデータを生成（耐久度は10〜30で少ない方を優先） */
  public static generateRandomArmor(): EquipmentItem {
    const roll = Math.random();
    let index = 0;
    if (roll < 0.30) index = 0;       // +2 (レザーアーマー)
    else if (roll < 0.55) index = 1;  // +4 (ブロンズメイル)
    else if (roll < 0.73) index = 2;  // +6 (アイアンプレート)
    else if (roll < 0.85) index = 3;  // +8 (ミスリルチェスト)
    else if (roll < 0.92) index = 4;  // +10 (竜鱗の甲冑)
    else if (roll < 0.96) index = 5;  // +12 (聖騎士の白銀鎧)
    else if (roll < 0.985) index = 6; // +15 (アテナの神聖鎧)
    else index = 7;                   // +20 (神域のイージスアーマー)

    const template = ARMOR_CATALOG[index];
    const dur = DungeonGenerator.getRandomDurability();
    return {
      id: `arm_${Date.now()}_${Math.random()}`,
      ...template,
      durability: dur,
      maxDurability: dur,
    };
  }
}
