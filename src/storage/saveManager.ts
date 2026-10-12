/**
 * RAGNABANE - 永続セーブデータ管理モジュール
 * ゲームオーバー後もずっと累積される「ゴールド」および、
 * 我が家（HOME）で購入した「主神の加護」のランク状態を localStorage に永続保持する。
 */

import type { BlessingId } from '../types';
import { BLESSING_CATALOG } from '../types';

const STORAGE_KEY = 'ragnabane_meta_save_v1';

export interface PersistentSaveData {
  totalGold: number;
  blessingRanks: Record<BlessingId, number>;
  totalPlayCount: number;
}

export class SaveManager {
  private static instance: SaveManager;

  private data: PersistentSaveData;
  private floorMapsCache: Map<number, string> = new Map();

  private constructor() {
    this.data = this.loadFromStorage();
  }

  public static getInstance(): SaveManager {
    if (!SaveManager.instance) {
      SaveManager.instance = new SaveManager();
    }
    return SaveManager.instance;
  }

  /** ローカルストレージからの読み込み（異常時は安全な初期値を返却） */
  private loadFromStorage(): PersistentSaveData {
    const defaultData: PersistentSaveData = {
      totalGold: 0,
      blessingRanks: {
        BLESSING_ATK: 0,
        BLESSING_HP: 0,
        BLESSING_DEF: 0,
        BLESSING_GOLD: 0,
        BLESSING_SCROLL: 0,
      },
      totalPlayCount: 0,
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData;

      const parsed = JSON.parse(raw) as Partial<PersistentSaveData> & { blessingRanks?: Record<string, number> };
      return {
        totalGold: typeof parsed.totalGold === 'number' && !isNaN(parsed.totalGold) ? parsed.totalGold : 0,
        blessingRanks: {
          ...defaultData.blessingRanks,
          ...(parsed.blessingRanks as any || {}),
        },
        totalPlayCount: typeof parsed.totalPlayCount === 'number' ? parsed.totalPlayCount : 0,
      };
    } catch {
      // 破損やアクセス制限時は初期状態を維持し、進行不能を防ぐ
      return defaultData;
    }
  }

  /** ストレージへの保存 */
  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('セーブデータの保存に失敗しました:', e);
    }
  }

  /** 累計所持ゴールドの取得 */
  public getGold(): number {
    return this.data.totalGold;
  }

  /** ゴールドの直接設定（復活時の半減など） */
  public setGold(amount: number): void {
    this.data.totalGold = Math.max(0, Math.floor(amount));
    this.saveToStorage();
  }

  /** ゴールドの加算（宝箱開封など） */
  public addGold(amount: number): void {
    if (amount <= 0) return;
    this.data.totalGold += Math.floor(amount);
    this.saveToStorage();
  }

  /** ゴールドの消費（加護購入など） */
  public spendGold(amount: number): boolean {
    if (amount <= 0) return false;
    if (this.data.totalGold < amount) return false;
    this.data.totalGold -= Math.floor(amount);
    this.saveToStorage();
    return true;
  }

  /** 加護の現在のランクを取得 */
  public getBlessingRank(id: BlessingId): number {
    return this.data.blessingRanks[id] ?? 0;
  }

  /** 加護の必要コストを計算（ユーザー要望：2桁は0で丸めて端数を出さない） */
  public getBlessingCost(id: BlessingId): number {
    const info = BLESSING_CATALOG.find((b) => b.id === id);
    if (!info) return 999999;
    const currentRank = this.getBlessingRank(id);
    if (currentRank >= info.maxRank) return Infinity;
    const rawCost = info.baseCost * Math.pow(info.costMultiplier, currentRank);
    // 2桁は0丸め（100の位に四捨五入、端数を完全排除。最低100G）
    return Math.max(100, Math.round(rawCost / 100) * 100);
  }

  /** 加護のランクアップ購入 */
  public upgradeBlessing(id: BlessingId): boolean {
    const info = BLESSING_CATALOG.find((b) => b.id === id);
    if (!info) return false;

    const currentRank = this.getBlessingRank(id);
    if (currentRank >= info.maxRank) return false;

    const cost = this.getBlessingCost(id);
    if (!this.spendGold(cost)) return false;

    this.data.blessingRanks[id] = currentRank + 1;
    this.saveToStorage();
    return true;
  }

  /** プレイ回数のインクリメント */
  public incrementPlayCount(): void {
    this.data.totalPlayCount++;
    this.saveToStorage();
  }

  /** ステージごとの固定マップデータの取得 */
  public getFloorMapData(floorNumber: number): string | null {
    if (this.floorMapsCache.has(floorNumber)) {
      return this.floorMapsCache.get(floorNumber)!;
    }
    try {
      const key = `ragnabane_floor_map_${floorNumber}`;
      const data = localStorage.getItem(key);
      if (data) {
        this.floorMapsCache.set(floorNumber, data);
        return data;
      }
    } catch {
      // 読み込み失敗時は新規生成へフォールバック
    }
    return null;
  }

  /** ステージごとの固定マップデータの保存 */
  public saveFloorMapData(floorNumber: number, data: string): void {
    this.floorMapsCache.set(floorNumber, data);
    try {
      const key = `ragnabane_floor_map_${floorNumber}`;
      localStorage.setItem(key, data);
    } catch (e) {
      console.warn(`Floor ${floorNumber} map save error:`, e);
    }
  }

  /** 完全データリセット（加護、ゴールド、進捗、キャッシュマップの全消去） */
  public clearAllData(): void {
    try {
      // ragnabane関連のローカルストレージキーを全消去
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('ragnabane_') || key === STORAGE_KEY)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn('LocalStorage clear error:', e);
    }
    this.floorMapsCache.clear();
    this.data = this.loadFromStorage();
  }
}
