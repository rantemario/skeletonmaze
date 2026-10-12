/**
 * HUD（ヘッドアップディスプレイ）およびUI制御モジュール
 * 画面上部大型HUD、画面下部フッター（魔法バー・スクロール枠・運搬荷物枠）、
 * 主神の祭壇（我が家滞在時限定・加護ショップ）、ミニマップ、探索ログ、キーバインドを統括。
 */

import { GameEngine } from '../gameEngine';
import {
  CROWNS_REQUIRED_PER_FLOOR,
  SPELL_CATALOG,
  BLESSING_CATALOG,
} from '../types';
import type { BlessingId } from '../types';
import { SaveManager } from '../storage/saveManager';

export class HudManager {
  private engine: GameEngine;

  // DOMキャッシュ: 画面上部大型HUD（戦闘重要パラメータを集約）
  private topHpBarFill: HTMLElement | null = null;
  private topHpText: HTMLElement | null = null;
  private topLvText: HTMLElement | null = null;
  private topExpBarFill: HTMLElement | null = null;
  private topAtkText: HTMLElement | null = null;
  private topDefText: HTMLElement | null = null;
  private topShieldText: HTMLElement | null = null;
  private topFloorText: HTMLElement | null = null;

  // DOMキャッシュ: 画面下部フッター（神託の秘術魔法バー＆装備ドック）
  private spellSlotsContainer: HTMLElement | null = null;
  private weaponSlotsContainer: HTMLElement | null = null;
  private armorSlotsContainer: HTMLElement | null = null;

  // DOMキャッシュ: サイドバー（上部HUD重複項目は全排除）
  private sidebarGoldText: HTMLElement | null = null;
  private btnOpenAltar: HTMLButtonElement | null = null;
  private scoreText: HTMLElement | null = null;
  private killsText: HTMLElement | null = null;
  private messageLogBox: HTMLElement | null = null;

  // DOMキャッシュ: モーダル・オーバレイ群
  private titleOverlay: HTMLElement | null = null;
  private clearedOverlay: HTMLElement | null = null;
  private gameOverOverlay: HTMLElement | null = null;
  private reviveModal: HTMLElement | null = null;
  private helpModal: HTMLElement | null = null;
  private altarModal: HTMLElement | null = null;
  private altarGoldAmountText: HTMLElement | null = null;
  private blessingsListContainer: HTMLElement | null = null;
  private spellMarketListContainer: HTMLElement | null = null;
  private resetConfirmModal: HTMLElement | null = null;

  // DOMキャッシュ: 拡大戦術レーダーマップ
  private expandedRadarModal: HTMLElement | null = null;
  private expandedFloorText: HTMLElement | null = null;
  private expandedCoverageText: HTMLElement | null = null;
  private expandedCoordsText: HTMLElement | null = null;
  private expandedRadarCanvas: HTMLCanvasElement | null = null;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private radarBox: HTMLElement | null = null;

  // DOMキャッシュ: 画面上部経験値バー（ATK・HP）
  private topAtkExpBarFill: HTMLElement | null = null;
  private topHpExpBarFill: HTMLElement | null = null;

  // 魔法詳細吹き出しポップオーバー & トースト
  private spellPopover: HTMLElement | null = null;
  private spellPopoverContent: HTMLElement | null = null;
  private toastContainer: HTMLElement | null = null;

  constructor(engine: GameEngine) {
    this.engine = engine;
    this.cacheDomElements();
    this.bindEvents();

    // エンジンからのコールバック登録
    this.engine.setMessageCallback((msg) => this.appendLogMessage(msg));
    this.engine.setStateChangeCallback(() => this.updateUi());

    // 黄泉還り復活プロンプトコールバック（無料1回または黄泉還りの秘薬）
    this.engine.setRevivePromptCallback((canFreeRevive, revivePotions) => {
      if (this.reviveModal) {
        const freeStatusEl = document.getElementById('revive-free-status');
        const potionCountEl = document.getElementById('revive-potion-count');
        const confirmBtn = document.getElementById('btn-confirm-revive') as HTMLButtonElement | null;

        if (freeStatusEl) {
          freeStatusEl.textContent = canFreeRevive > 0 ? '利用可能 (1回無料)' : '使用済み (秘薬が必要)';
          freeStatusEl.className = canFreeRevive > 0 ? 'revive-stat-val text-cyan' : 'revive-stat-val text-red';
        }
        if (potionCountEl) {
          potionCountEl.textContent = `${revivePotions} 個`;
        }
        if (confirmBtn) {
          const canRevive = canFreeRevive > 0 || revivePotions > 0;
          confirmBtn.disabled = !canRevive;
          confirmBtn.textContent = canFreeRevive > 0
            ? '⏳ 無料で10ターン前から復活する (HP100%)'
            : (revivePotions > 0
              ? '⏳ 秘薬を1個消費して復活する (HP100%)'
              : '❌ 復活不可 (秘薬がありません)');
        }
        this.reviveModal.classList.add('active');
      }
    });
  }

  /** 静的HTML内のDOM要素をキャッシュ */
  private cacheDomElements(): void {
    // 画面上部大型ステータスHUD
    this.topHpBarFill = document.getElementById('top-hp-bar-fill');
    this.topHpText = document.getElementById('top-hp-value');
    this.topHpExpBarFill = document.getElementById('top-hp-exp-bar-fill');
    this.topLvText = document.getElementById('top-lv-value');
    this.topExpBarFill = document.getElementById('top-exp-bar-fill');
    this.topAtkText = document.getElementById('top-atk-value');
    this.topAtkExpBarFill = document.getElementById('top-atk-exp-bar-fill');
    this.topDefText = document.getElementById('top-def-value');
    this.topShieldText = document.getElementById('top-shield-value');
    this.topFloorText = document.getElementById('top-floor-value');

    // 画面下部フッタードック（魔法バー＆装備ドック）
    this.spellSlotsContainer = document.getElementById('spell-slots-container');
    this.weaponSlotsContainer = document.getElementById('weapon-slots-container');
    this.armorSlotsContainer = document.getElementById('armor-slots-container');

    // サイドバー要素（上部HUDと重複しない管理情報）
    this.sidebarGoldText = document.getElementById('sidebar-gold-value');
    this.btnOpenAltar = document.getElementById('btn-open-altar') as HTMLButtonElement | null;
    this.scoreText = document.getElementById('stat-score');
    this.killsText = document.getElementById('stat-kills');
    this.messageLogBox = document.getElementById('message-log-container');

    // モーダル・オーバレイ
    this.titleOverlay = document.getElementById('overlay-title');
    this.clearedOverlay = document.getElementById('overlay-cleared');
    this.gameOverOverlay = document.getElementById('overlay-gameover');
    this.reviveModal = document.getElementById('modal-revive');
    this.helpModal = document.getElementById('modal-help');
    this.altarModal = document.getElementById('modal-altar');
    this.altarGoldAmountText = document.getElementById('altar-gold-amount');
    this.blessingsListContainer = document.getElementById('blessings-list');
    this.spellMarketListContainer = document.getElementById('spell-market-list');
    this.resetConfirmModal = document.getElementById('modal-reset-confirm');

    // 拡大戦術レーダーマップ
    this.expandedRadarModal = document.getElementById('modal-expanded-radar');
    this.expandedFloorText = document.getElementById('expanded-floor-text');
    this.expandedCoverageText = document.getElementById('expanded-coverage-text');
    this.expandedCoordsText = document.getElementById('expanded-coords-text');
    this.expandedRadarCanvas = document.getElementById('expanded-radar-canvas') as HTMLCanvasElement | null;
    this.minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;
    this.radarBox = document.getElementById('radar-box');

    // ポップオーバー & トースト
    this.spellPopover = document.getElementById('spell-popover');
    this.spellPopoverContent = document.getElementById('spell-popover-content');
    this.toastContainer = document.getElementById('toast-container');
  }

  /** イベントバインド */
  private bindEvents(): void {
    // ゲーム進行ボタン
    document.getElementById('btn-start-game')?.addEventListener('click', () => {
      this.titleOverlay?.classList.remove('active');
      this.engine.startGame();
    });

    document.getElementById('btn-next-floor')?.addEventListener('click', () => {
      this.clearedOverlay?.classList.remove('active');
      if (this.engine.status === 'ALL_CLEARED') {
        this.titleOverlay?.classList.add('active');
        this.engine.status = 'TITLE';
      } else {
        this.engine.nextFloor();
      }
    });

    document.getElementById('btn-retry-game')?.addEventListener('click', () => {
      this.gameOverOverlay?.classList.remove('active');
      this.engine.retryGame();
    });

    // 10ターン前やり直し復活モーダルボタン
    document.getElementById('btn-confirm-revive')?.addEventListener('click', () => {
      this.reviveModal?.classList.remove('active');
      this.engine.revivePlayer();
    });

    document.getElementById('btn-decline-revive')?.addEventListener('click', () => {
      this.reviveModal?.classList.remove('active');
      this.engine.restartFloor();
    });

    // サウンド切り替え
    const btnSound = document.getElementById('btn-toggle-sound');
    btnSound?.addEventListener('click', () => {
      const isMuted = this.engine.soundManager.toggleMute();
      btnSound.textContent = isMuted ? '🔇 SOUND OFF' : '🔊 SOUND ON';
      btnSound.classList.toggle('muted', isMuted);
    });

    // レトロCRTフィルター切り替え
    const btnCrt = document.getElementById('btn-toggle-crt');
    btnCrt?.addEventListener('click', () => {
      this.engine.renderer.enableCrtFilter = !this.engine.renderer.enableCrtFilter;
      btnCrt.textContent = this.engine.renderer.enableCrtFilter ? '📺 CRT: ON' : '📺 CRT: OFF';
      btnCrt.classList.toggle('active', this.engine.renderer.enableCrtFilter);
    });

    // ヘルプモーダルの開閉
    const openHelp = (): void => this.helpModal?.classList.add('active');
    const closeHelp = (): void => this.helpModal?.classList.remove('active');
    document.getElementById('btn-help')?.addEventListener('click', openHelp);
    document.getElementById('btn-close-help')?.addEventListener('click', closeHelp);
    document.getElementById('btn-confirm-help')?.addEventListener('click', closeHelp);
    this.helpModal?.addEventListener('click', (e: MouseEvent) => {
      if (e.target === this.helpModal) closeHelp();
    });

    // 主神の祭壇（加護ショップ）モーダルの開閉（我が家滞在時のみ利用可能、非滞在時はトースト表示）
    const openAltar = (): void => {
      if (!this.engine.isPlayerAtHome()) {
        this.showToast('⚠️ 主神の祭壇は、聖なる碑石（我が家）に滞在している時のみ利用できます。');
        return;
      }
      this.renderAltarBlessings();
      this.altarModal?.classList.add('active');
    };
    const closeAltar = (): void => this.altarModal?.classList.remove('active');
    this.btnOpenAltar?.addEventListener('click', openAltar);
    document.getElementById('btn-close-altar')?.addEventListener('click', closeAltar);
    document.getElementById('btn-confirm-altar')?.addEventListener('click', closeAltar);
    this.altarModal?.addEventListener('click', (e: MouseEvent) => {
      if (e.target === this.altarModal) closeAltar();
    });

    // 完全リセット（GUIDEの右のRESETボタン）
    const openResetConfirm = (): void => this.resetConfirmModal?.classList.add('active');
    const closeResetConfirm = (): void => this.resetConfirmModal?.classList.remove('active');
    document.getElementById('btn-full-reset')?.addEventListener('click', openResetConfirm);
    document.getElementById('btn-close-reset-confirm')?.addEventListener('click', closeResetConfirm);
    document.getElementById('btn-cancel-full-reset')?.addEventListener('click', closeResetConfirm);
    document.getElementById('btn-confirm-full-reset')?.addEventListener('click', () => {
      SaveManager.getInstance().clearAllData();
      window.location.reload();
    });
    this.resetConfirmModal?.addEventListener('click', (e: MouseEvent) => {
      if (e.target === this.resetConfirmModal) closeResetConfirm();
    });

    // ユーザー要求：右側のマップタップでそこを拡大する
    const openExpandedRadar = (e: MouseEvent): void => {
      const canvas = this.minimapCanvas;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const clickY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      const tileX = Math.floor((clickX / rect.width) * this.engine.floor.width);
      const tileY = Math.floor((clickY / rect.height) * this.engine.floor.height);

      this.engine.renderer.focusTileX = Math.max(0, Math.min(this.engine.floor.width - 1, tileX));
      this.engine.renderer.focusTileY = Math.max(0, Math.min(this.engine.floor.height - 1, tileY));

      if (this.expandedFloorText) this.expandedFloorText.textContent = `B${this.engine.floor.floorNumber}F`;
      if (this.expandedCoverageText) this.expandedCoverageText.textContent = `${this.engine.renderer.coveragePercent}%`;
      if (this.expandedCoordsText) {
        this.expandedCoordsText.textContent = `X:${this.engine.renderer.focusTileX}, Y:${this.engine.renderer.focusTileY}`;
      }

      this.expandedRadarModal?.classList.add('active');
      this.engine.renderer.renderExpandedRadar(this.engine.floor, this.engine.player);
    };

    const closeExpandedRadar = (): void => {
      this.expandedRadarModal?.classList.remove('active');
    };

    this.radarBox?.addEventListener('click', openExpandedRadar);
    document.getElementById('btn-close-expanded-radar')?.addEventListener('click', closeExpandedRadar);
    this.expandedRadarModal?.addEventListener('click', (e: MouseEvent) => {
      if (e.target === this.expandedRadarModal) closeExpandedRadar();
    });

    // 拡大マップ内をタップした際もその地点へフォーカス照準を移動
    this.expandedRadarCanvas?.addEventListener('click', (e: MouseEvent) => {
      const canvas = this.expandedRadarCanvas;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const clickY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      const tileX = Math.floor((clickX / rect.width) * this.engine.floor.width);
      const tileY = Math.floor((clickY / rect.height) * this.engine.floor.height);

      this.engine.renderer.focusTileX = Math.max(0, Math.min(this.engine.floor.width - 1, tileX));
      this.engine.renderer.focusTileY = Math.max(0, Math.min(this.engine.floor.height - 1, tileY));
      if (this.expandedCoordsText) {
        this.expandedCoordsText.textContent = `X:${this.engine.renderer.focusTileX}, Y:${this.engine.renderer.focusTileY}`;
      }
      this.engine.renderer.renderExpandedRadar(this.engine.floor, this.engine.player);
    });

    // 画面タップで魔法ポップオーバーを非表示
    document.addEventListener('click', (e: MouseEvent) => {
      if (!this.spellPopover?.classList.contains('hidden')) {
        const target = e.target as HTMLElement;
        if (!target.closest('.spell-slot') && !target.closest('#spell-popover')) {
          this.hideSpellPopover();
        }
      }
    });

    // ユーザー要求：画面の左下の矢印は進むのではなく、その方向にむくボタンにして（ターンの消化はしない）魔法の方向を決めるために使う
    const dirButtons = document.querySelectorAll('.pad-btn');
    dirButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const dir = (e.currentTarget as HTMLElement).getAttribute('data-dir') as 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | null;
        if (dir) {
          this.engine.setPlayerDirection(dir);
        }
      });
    });

    document.getElementById('btn-action-wait')?.addEventListener('click', () => {
      this.engine.playerWait();
    });

    document.getElementById('btn-action-attack')?.addEventListener('click', () => {
      this.engine.playerAttack();
    });

    // キーボード入力
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // ESCキーで開いているモーダルやポップオーバーを閉じる
      if (e.key === 'Escape') {
        if (!this.spellPopover?.classList.contains('hidden')) {
          this.hideSpellPopover();
          return;
        }
        if (this.helpModal?.classList.contains('active')) {
          closeHelp();
          return;
        }
        if (this.altarModal?.classList.contains('active')) {
          closeAltar();
          return;
        }
        if (this.resetConfirmModal?.classList.contains('active')) {
          closeResetConfirm();
          return;
        }
        if (this.expandedRadarModal?.classList.contains('active')) {
          closeExpandedRadar();
          return;
        }
      }

      // モーダル表示中はゲーム操作キーを一時無効化
      if (
        this.helpModal?.classList.contains('active') ||
        this.altarModal?.classList.contains('active') ||
        this.resetConfirmModal?.classList.contains('active') ||
        this.expandedRadarModal?.classList.contains('active')
      ) {
        return;
      }

      // 数字キー [1]〜[6] による対応魔法の即時詠唱
      if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        e.preventDefault();
        const spellIndex = parseInt(e.key, 10) - 1;
        const targetSpell = SPELL_CATALOG[spellIndex];
        if (targetSpell) {
          this.engine.executeSpell(targetSpell.id);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          this.engine.movePlayer(0, -1);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          this.engine.movePlayer(0, 1);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          this.engine.movePlayer(-1, 0);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          this.engine.movePlayer(1, 0);
          break;
        case 'x':
        case 'X':
        case '.':
          e.preventDefault();
          this.engine.playerWait();
          break;
        case ' ':
        case 'j':
        case 'J':
          e.preventDefault();
          this.engine.playerAttack();
          break;
        case 'f':
        case 'F':
        case 'k':
        case 'K':
          e.preventDefault();
          this.engine.castSpell();
          break;
      }
    });
  }

  /** 全体UIステータス情報の更新 */
  public updateUi(): void {
    const p = this.engine.player;

    // 1. HPゲージ
    const hpRate = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
    if (this.topHpBarFill) this.topHpBarFill.style.width = `${hpRate}%`;
    if (this.topHpText) this.topHpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    // ユーザー要求：HP経験値バーも表示（スタミナストーンによる最大HP成長進行度）
    if (this.topHpExpBarFill) {
      const nextHp = p.nextHpExp || 3;
      const curHpExp = p.hpExp || 0;
      const hpExpRate = nextHp > 0 ? Math.max(0, Math.min(100, (curHpExp / nextHp) * 100)) : 0;
      this.topHpExpBarFill.style.width = `${hpExpRate}%`;
    }
    const topHpCard = this.topHpBarFill?.closest('.top-gauge-card');
    topHpCard?.classList.toggle('low-hp', hpRate <= 25);

    // 2. 上部クイックバッジ群（Lv・EXPバー・攻撃・鍵・王冠画像スロット・階層）
    if (this.topLvText) this.topLvText.textContent = `${p.level}`;
    const expRate = p.nextExp > 0 ? Math.max(0, Math.min(100, (p.exp / p.nextExp) * 100)) : 0;
    if (this.topExpBarFill) this.topExpBarFill.style.width = `${expRate}%`;

    const effectiveAtk = this.engine.getEffectiveAttackPower();
    const weaponBonus = p.equippedWeapon ? p.equippedWeapon.bonus : 0;
    if (this.topAtkText) {
      if (weaponBonus > 0) {
        this.topAtkText.textContent = `${p.attackPower} (+${weaponBonus})`;
      } else if (p.atkBuffTimer > 0) {
        this.topAtkText.textContent = `${effectiveAtk} (倍化中)`;
      } else {
        this.topAtkText.textContent = `${effectiveAtk}`;
      }
    }
    // 攻撃力経験値バー更新（パワーストーン複数取得による経験式進行度）
    if (this.topAtkExpBarFill) {
      const atkExpRate = p.nextAtkExp > 0 ? Math.max(0, Math.min(100, (p.atkExp / p.nextAtkExp) * 100)) : 0;
      this.topAtkExpBarFill.style.width = `${atkExpRate}%`;
    }

    const armorBonus = p.equippedArmor ? p.equippedArmor.bonus : 0;
    if (this.topDefText) {
      if (armorBonus > 0) {
        this.topDefText.textContent = `${p.defensePower || 0} (+${armorBonus})`;
      } else {
        this.topDefText.textContent = `${p.defensePower || 0}`;
      }
    }
    if (this.topShieldText) {
      this.topShieldText.textContent = `${p.shieldCharges || 0}`;
    }

    // マップ右上への王冠描画はCanvasRenderer側で行う（旧ヘッダースロット安全消去）
    for (let i = 0; i < CROWNS_REQUIRED_PER_FLOOR; i++) {
      const slotEl = document.getElementById(`crown-slot-${i}`);
      if (slotEl) {
        if (i < p.crownsDelivered) {
          slotEl.classList.remove('inactive');
          slotEl.classList.add('active');
        } else {
          slotEl.classList.add('inactive');
          slotEl.classList.remove('active');
        }
      }
    }
    if (this.topFloorText) this.topFloorText.textContent = `B${this.engine.floor.floorNumber}F`;

    // 3. サイドバー更新（主神の祭壇横のゴールド ＆ レコード）
    if (this.sidebarGoldText) this.sidebarGoldText.textContent = `${p.gold} G`;
    // ユーザー要求：主神の祭壇はいつでも使えるようにする
    if (this.btnOpenAltar) {
      this.btnOpenAltar.classList.add('ready');
    }

    if (this.scoreText) this.scoreText.textContent = `${p.score}`;
    const defeatedCount = Math.max(0, p.score > 0 ? Math.floor(p.score / 50) : 0);
    if (this.killsText) this.killsText.textContent = `${defeatedCount} 匹`;

    // 5. 画面下部フッタードックのレンダリング（コンパクト魔法バー ＆ 装備ドック）
    this.renderSpellSlots();
    this.renderEquipmentSlots();

    // 6. 祭壇モーダルが開いている場合は加護リストもリアルタイム同期
    if (this.altarModal?.classList.contains('active')) {
      this.renderAltarBlessings();
    }

    // 7. リザルト／ゲームオーバー画面の切り替え
    if (this.engine.status === 'ALL_CLEARED') {
      const titleEl = document.querySelector('#overlay-cleared .result-title') as HTMLElement;
      const descEl = document.querySelector('#overlay-cleared .result-desc') as HTMLElement;
      const nextBtn = document.getElementById('btn-next-floor') as HTMLButtonElement;
      if (titleEl) titleEl.innerText = '🎉 全10ステージ 完全制覇！ 🎉';
      if (descEl) descEl.innerHTML = '深淵の全10守護巨獣を滅ぼし、迷宮の白骨スケルトンは究極の覇者となった！<br>各ステージの激闘記録と総合所要ターン数：';
      if (nextBtn) nextBtn.innerText = 'タイトル画面へ戻る (RESTART)';

      const statsContainer = document.getElementById('victory-stats');
      if (statsContainer) {
        const records = this.engine.floorTurnRecords;
        const totalTurns = records.reduce((a, b) => a + b, 0);
        let turnListHtml = '<div class="turn-breakdown-box" style="margin: 12px 0; padding: 10px; background: rgba(0,0,0,0.5); border: 1px solid #ffd700; border-radius: 6px; width: 100%; box-sizing: border-box;">';
        turnListHtml += '<div style="font-weight: bold; color: #ffd700; font-size: 13px; margin-bottom: 6px; text-align: center;">📜 各ステージ所要ターン数一覧</div>';
        turnListHtml += '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; font-size: 11px; color: #ecf0f1;">';
        records.forEach((t, idx) => {
          turnListHtml += `<div style="padding: 3px 6px; background: rgba(255,255,255,0.06); border-radius: 3px;">地下 B${idx + 1}F: <strong style="color: #67e8f9;">${t}</strong> ターン</div>`;
        });
        turnListHtml += '</div>';
        turnListHtml += `<div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed rgba(255,215,0,0.4); text-align: center; font-size: 13px; font-weight: bold; color: #ffd700;">★ 総合消費ターン: <span style="font-size: 16px; color: #ff0055;">${totalTurns}</span> ターン ★</div>`;
        turnListHtml += '</div>';

        statsContainer.innerHTML = `
          ${turnListHtml}
          <div class="stat-badge">獲得スコア: ${p.score} pt</div>
          <div class="stat-badge">最終レベル: Lv.${p.level}</div>
          <div class="stat-badge">蓄積ゴールド: ${p.gold} G</div>
        `;
      }
      this.clearedOverlay?.classList.add('active');
    } else if (this.engine.status === 'FLOOR_CLEARED') {
      const titleEl = document.querySelector('#overlay-cleared .result-title') as HTMLElement;
      const descEl = document.querySelector('#overlay-cleared .result-desc') as HTMLElement;
      const nextBtn = document.getElementById('btn-next-floor') as HTMLButtonElement;
      if (titleEl) titleEl.innerText = `地下 B${this.engine.floor.floorNumber}F 制覇！`;
      if (descEl) descEl.innerHTML = '3つのクラウンの聖なる輝きがフロアの結界を解き放ち、<br>階層を守護する強大なフロアボスを見事に打ち滅ぼした！';
      if (nextBtn) nextBtn.innerText = `深層の次の階層へ進む (B${this.engine.floor.floorNumber + 1}F へ)`;

      const statsContainer = document.getElementById('victory-stats');
      if (statsContainer) {
        const floorTurn = this.engine.turnCount;
        const totalSoFar = this.engine.floorTurnRecords.reduce((a, b) => a + b, 0);
        statsContainer.innerHTML = `
          <div class="stat-badge">制覇階層: B${this.engine.floor.floorNumber}F</div>
          <div class="stat-badge" style="color: #67e8f9;">フロア所要: ${floorTurn} ターン</div>
          <div class="stat-badge" style="color: #ffd700;">累計所要: ${totalSoFar} ターン</div>
          <div class="stat-badge">獲得スコア: ${p.score} pt</div>
          <div class="stat-badge">到達レベル: Lv.${p.level}</div>
          <div class="stat-badge">蓄積ゴールド: ${p.gold} G</div>
        `;
      }
      this.clearedOverlay?.classList.add('active');
    } else if (this.engine.status === 'GAME_OVER') {
      this.gameOverOverlay?.classList.add('active');
    }
  }

  /** 画面下部: 魔法バー（コンパクト化：アイコンと所持数のみ、レベル制限なし） */
  private renderSpellSlots(): void {
    if (!this.spellSlotsContainer) return;

    this.spellSlotsContainer.innerHTML = '';
    const p = this.engine.player;

    SPELL_CATALOG.forEach((spell) => {
      const stock = p.spellStock?.[spell.id] || 0;

      const slot = document.createElement('div');
      slot.className = 'spell-slot-compact';
      if (stock === 0) slot.classList.add('empty');

      slot.innerHTML = `
        <span class="spell-compact-icon">${spell.icon}</span>
        <span class="spell-compact-stock">${stock > 0 ? `×${stock}` : '0'}</span>
      `;

      if (stock > 0) {
        slot.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hideSpellPopover();
          this.engine.castSpell(spell.id);
        });

        slot.addEventListener('mouseenter', () => {
          this.showSpellPopover(spell, slot);
        });
        slot.addEventListener('mouseleave', () => {
          this.hideSpellPopover();
        });
      } else {
        slot.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showToast(`📜 ${spell.icon} ${spell.name} の所持数が0です。`);
        });

        slot.addEventListener('mouseenter', () => {
          this.showSpellPopover(spell, slot);
        });
        slot.addEventListener('mouseleave', () => {
          this.hideSpellPopover();
        });
      }

      this.spellSlotsContainer?.appendChild(slot);
    });
  }

  /** 画面下部: 装備ドック（武器3枠 ＆ 防具3枠。一番左が装備枠、残り2枠がストック） */
  private renderEquipmentSlots(): void {
    const p = this.engine.player;

    // 1. 武器スロットの描画
    if (this.weaponSlotsContainer) {
      this.weaponSlotsContainer.innerHTML = '';

      for (let i = 0; i < 3; i++) {
        const isEquippedSlot = i === 0;
        const weapon = isEquippedSlot ? p.equippedWeapon : p.weaponStock[i - 1];

        const slot = document.createElement('div');
        slot.className = 'equip-slot';
        if (isEquippedSlot) slot.classList.add('is-equipped-slot');

        if (weapon) {
          const durRate = Math.max(0, Math.min(100, (weapon.durability / weapon.maxDurability) * 100));
          const durColor = durRate > 50 ? '#2ecc71' : durRate > 25 ? '#f39c12' : '#e74c3c';

          slot.innerHTML = `
            <div class="equip-slot-top">
              ${isEquippedSlot ? '<span class="equip-tag-badge">装備</span>' : '<span></span>'}
              <span class="equip-bonus-val">+${weapon.bonus}</span>
            </div>
            <div class="equip-slot-center">
              <span class="equip-icon">${weapon.icon}</span>
              <span class="equip-dur-num" style="color: ${durColor};" title="残り耐久度">${weapon.durability}</span>
            </div>
            <div class="equip-durability-track">
              <div class="equip-durability-fill" style="width: ${durRate}%; background: ${durColor};"></div>
            </div>
            <div class="equip-popover">
              <div class="equip-popover-name">${weapon.name}</div>
              <div class="equip-popover-stat">攻撃力: +${weapon.bonus}</div>
              <div class="equip-popover-dur">耐久度: ${weapon.durability} / ${weapon.maxDurability}</div>
              <div class="equip-popover-desc">${weapon.description}</div>
              <button class="btn-discard-equip" title="確認なしでこの武器を捨てます">🗑️ 捨てる</button>
            </div>
          `;

          const btnDiscard = slot.querySelector('.btn-discard-equip');
          if (btnDiscard) {
            btnDiscard.addEventListener('click', (e) => {
              e.stopPropagation();
              if (isEquippedSlot) {
                this.engine.discardEquippedWeapon();
              } else {
                this.engine.discardStockWeapon(i - 1);
              }
              this.showToast(`🗑️ 【${weapon.name}】を捨てました`);
              this.updateUi();
            });
          }

          slot.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isEquippedSlot) {
              this.engine.equipWeapon(i - 1);
              this.showToast(`⚔️ 【${weapon.name}】を装備した！（攻撃力+${weapon.bonus}）`);
              this.updateUi();
            } else {
              this.showToast(`⚔️ 装備中: 【${weapon.name}】（攻撃力+${weapon.bonus}、耐久度: ${weapon.durability}/${weapon.maxDurability}）`);
            }
          });

          slot.setAttribute('draggable', 'true');
          slot.addEventListener('dragstart', () => {
            slot.classList.add('active-popover');
          });
          slot.addEventListener('dragend', () => {
            slot.classList.remove('active-popover');
          });
        } else {
          slot.classList.add('empty');
          slot.innerHTML = `
            <div class="equip-slot-top">
              ${isEquippedSlot ? '<span class="equip-tag-badge">装備</span>' : '<span></span>'}
              <span class="equip-bonus-val" style="color: #636e72;">--</span>
            </div>
            <div class="equip-slot-center">
              <span class="empty-icon">⚔️</span>
              <span class="equip-dur-num" style="color: #636e72;">--</span>
            </div>
            <div class="equip-durability-track" style="opacity: 0;"></div>
          `;
        }

        this.weaponSlotsContainer.appendChild(slot);
      }
    }

    // 2. 防具スロットの描画
    if (this.armorSlotsContainer) {
      this.armorSlotsContainer.innerHTML = '';

      for (let i = 0; i < 3; i++) {
        const isEquippedSlot = i === 0;
        const armor = isEquippedSlot ? p.equippedArmor : p.armorStock[i - 1];

        const slot = document.createElement('div');
        slot.className = 'equip-slot';
        if (isEquippedSlot) slot.classList.add('is-equipped-slot');

        if (armor) {
          const durRate = Math.max(0, Math.min(100, (armor.durability / armor.maxDurability) * 100));
          const durColor = durRate > 50 ? '#2ecc71' : durRate > 25 ? '#f39c12' : '#e74c3c';

          slot.innerHTML = `
            <div class="equip-slot-top">
              ${isEquippedSlot ? '<span class="equip-tag-badge">装備</span>' : '<span></span>'}
              <span class="equip-bonus-val">+${armor.bonus}</span>
            </div>
            <div class="equip-slot-center">
              <span class="equip-icon">${armor.icon}</span>
              <span class="equip-dur-num" style="color: ${durColor};" title="残り耐久度">${armor.durability}</span>
            </div>
            <div class="equip-durability-track">
              <div class="equip-durability-fill" style="width: ${durRate}%; background: ${durColor};"></div>
            </div>
            <div class="equip-popover">
              <div class="equip-popover-name">${armor.name}</div>
              <div class="equip-popover-stat">防御力: +${armor.bonus}</div>
              <div class="equip-popover-dur">耐久度: ${armor.durability} / ${armor.maxDurability}</div>
              <div class="equip-popover-desc">${armor.description}</div>
              <button class="btn-discard-equip" title="確認なしでこの防具を捨てます">🗑️ 捨てる</button>
            </div>
          `;

          const btnDiscard = slot.querySelector('.btn-discard-equip');
          if (btnDiscard) {
            btnDiscard.addEventListener('click', (e) => {
              e.stopPropagation();
              if (isEquippedSlot) {
                this.engine.discardEquippedArmor();
              } else {
                this.engine.discardStockArmor(i - 1);
              }
              this.showToast(`🗑️ 【${armor.name}】を捨てました`);
              this.updateUi();
            });
          }

          slot.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isEquippedSlot) {
              this.engine.equipArmor(i - 1);
              this.showToast(`🛡️ 【${armor.name}】を装備した！（防御力+${armor.bonus}）`);
              this.updateUi();
            } else {
              this.showToast(`🛡️ 装備中: 【${armor.name}】（防御力+${armor.bonus}、耐久度: ${armor.durability}/${armor.maxDurability}）`);
            }
          });

          slot.setAttribute('draggable', 'true');
          slot.addEventListener('dragstart', () => {
            slot.classList.add('active-popover');
          });
          slot.addEventListener('dragend', () => {
            slot.classList.remove('active-popover');
          });
        } else {
          slot.classList.add('empty');
          slot.innerHTML = `
            <div class="equip-slot-top">
              ${isEquippedSlot ? '<span class="equip-tag-badge">装備</span>' : '<span></span>'}
              <span class="equip-bonus-val" style="color: #636e72;">--</span>
            </div>
            <div class="equip-slot-center">
              <span class="empty-icon">🛡️</span>
              <span class="equip-dur-num" style="color: #636e72;">--</span>
            </div>
            <div class="equip-durability-track" style="opacity: 0;"></div>
          `;
        }

        this.armorSlotsContainer.appendChild(slot);
      }
    }
  }

  /** 魔法詳細吹き出しポップオーバーの表示（ターン消化しない） */
  private showSpellPopover(spell: (typeof SPELL_CATALOG)[number], anchorSlot: HTMLElement): void {
    if (!this.spellPopover || !this.spellPopoverContent) return;

    this.spellPopoverContent.innerHTML = `
      <div class="popover-header">
        <div class="popover-title-row">
          <img src="${spell.iconImg}" alt="${spell.name}">
          <span class="popover-spell-name">${spell.name}</span>
        </div>
      </div>
      <div class="popover-desc">${spell.description}</div>
      <button class="popover-action-btn" id="btn-popover-cast">
        ✨ この魔法を詠唱する (再タップ)
      </button>
      <div class="popover-tap-hint">※スロット再タップでも即時詠唱（ターン消化）</div>
    `;

    document.getElementById('btn-popover-cast')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.executeSpell(spell.id);
    });

    // アンカー位置の真上に吹き出しを配置
    const rect = anchorSlot.getBoundingClientRect();
    this.spellPopover.style.left = `${rect.left + rect.width / 2}px`;
    this.spellPopover.style.top = `${rect.top - 10}px`;
    this.spellPopover.classList.remove('hidden');
  }

  /** 魔法詳細吹き出しポップオーバーを非表示 */
  private hideSpellPopover(): void {
    if (this.spellPopover) {
      this.spellPopover.classList.add('hidden');
    }
    this.spellSlotsContainer?.querySelectorAll('.spell-slot.selected').forEach((el) => el.classList.remove('selected'));
  }

  /** 魔法を詠唱実行（ターン消化） */
  private executeSpell(spellId: (typeof SPELL_CATALOG)[number]['id']): void {
    this.hideSpellPopover();
    this.engine.castSpell(spellId);
  }

  /** トースト通知の表示 */
  public showToast(message: string, durationMs: number = 2800): void {
    if (!this.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-fade-out');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, durationMs);
  }



  /** 主神の祭壇モーダル内の加護一覧の描画 */
  private renderAltarBlessings(): void {
    if (!this.blessingsListContainer) return;

    const save = SaveManager.getInstance();
    const currentGold = save.getGold();
    if (this.altarGoldAmountText) {
      this.altarGoldAmountText.textContent = `${currentGold} G`;
    }

    this.blessingsListContainer.innerHTML = '';

    BLESSING_CATALOG.forEach((blessing) => {
      const currentRank = save.getBlessingRank(blessing.id);
      const isMaxRank = currentRank >= blessing.maxRank;
      const cost = save.getBlessingCost(blessing.id);
      const canAfford = currentGold >= cost;

      const card = document.createElement('div');
      card.className = 'blessing-card';

      // 加護の効果値テキスト生成
      const effectDesc = this.getBlessingEffectText(blessing.id, currentRank);

      card.innerHTML = `
        <div class="blessing-icon">${blessing.icon}</div>
        <div class="blessing-info">
          <div class="blessing-title-row">
            <span class="blessing-name">${blessing.name}</span>
            <span class="blessing-rank-badge">Rank ${currentRank}/${blessing.maxRank}</span>
          </div>
          <div class="blessing-effect-desc">${effectDesc}</div>
        </div>
        <div class="blessing-action">
          <button class="btn-buy-blessing" ${isMaxRank || !canAfford ? 'disabled' : ''}>
            ${isMaxRank ? 'MAX RANK' : `加護を授かる`}
          </button>
          ${!isMaxRank ? `<span class="blessing-cost-tag">${cost} G</span>` : ''}
        </div>
      `;

      if (!isMaxRank && canAfford) {
        const btn = card.querySelector('.btn-buy-blessing');
        btn?.addEventListener('click', () => {
          this.engine.purchaseBlessing(blessing.id);
          this.renderAltarBlessings();
          this.updateUi();
        });
      }

      this.blessingsListContainer?.appendChild(card);
    });

    // 魔法購入マーケットも同時に描画更新
    this.renderSpellMarket();
  }

  /** 主神の祭壇モーダル内の魔法購入マーケットの描画（ユーザー要求：1個ずつの価格、価格はどんどん上がり、初期価格も高額に） */
  private renderSpellMarket(): void {
    if (!this.spellMarketListContainer) return;

    const save = SaveManager.getInstance();
    const currentGold = save.getGold();
    const p = this.engine.player;

    this.spellMarketListContainer.innerHTML = '';

    SPELL_CATALOG.forEach((spell) => {
      const stock = p.spellStock?.[spell.id] || 0;
      const purchaseCount = 1;
      const cost = this.engine.getSpellPurchaseCost(spell.id);
      const timesPurchased = p.spellPurchaseCounts?.[spell.id] || 0;
      const canAfford = currentGold >= cost;

      const card = document.createElement('div');
      card.className = 'spell-market-card';

      card.innerHTML = `
        <div class="spell-market-info">
          <img class="spell-market-icon" src="${spell.iconImg}" alt="${spell.name}">
          <div class="spell-market-meta">
            <span class="spell-market-name">${spell.name}</span>
            <span class="spell-market-stock">所持: ${stock}回 (累計購入: ${timesPurchased}回)</span>
          </div>
        </div>
        <div class="spell-market-action">
          <div class="spell-market-cost-badge">💰 ${cost} G</div>
          <button class="btn-buy-spell" ${canAfford ? '' : 'disabled'}>
            +${purchaseCount}回 購入
          </button>
        </div>
      `;

      if (canAfford) {
        const btn = card.querySelector('.btn-buy-spell');
        btn?.addEventListener('click', () => {
          const success = this.engine.purchaseSpellStock(spell.id, purchaseCount, cost);
          if (success) {
            this.showToast(`✨ ${spell.name} のストックを+${purchaseCount}回購入しました！（次回価格上昇）`);
            this.renderAltarBlessings();
            this.updateUi();
          }
        });
      }

      this.spellMarketListContainer?.appendChild(card);
    });
  }

  /** 加護の効果説明テキスト */
  private getBlessingEffectText(id: BlessingId, currentRank: number): string {
    switch (id) {
      case 'BLESSING_ATK':
        return `冒険開始時攻撃力: <span class="blessing-current-value">+${currentRank * 5}</span> → 次ランク: <span class="blessing-next-value">+${(currentRank + 1) * 5}</span>`;
      case 'BLESSING_HP':
        return `冒険開始時最大HP: <span class="blessing-current-value">+${currentRank * 10}</span> → 次ランク: <span class="blessing-next-value">+${(currentRank + 1) * 10}</span>`;
      case 'BLESSING_DEF':
        return `冒険開始時防御力: <span class="blessing-current-value">+${currentRank * 2}</span> → 次ランク: <span class="blessing-next-value">+${(currentRank + 1) * 2}</span>`;
      case 'BLESSING_GOLD':
        return `宝箱ゴールド獲得倍率: <span class="blessing-current-value">+${currentRank * 20}%</span> → 次ランク: <span class="blessing-next-value">+${(currentRank + 1) * 20}%</span>`;
      case 'BLESSING_SCROLL':
        return `フロア開始時巻物授与: <span class="blessing-current-value">+${currentRank} 個</span> → 次ランク: <span class="blessing-next-value">+${currentRank + 1} 個</span>`;
      default:
        return '';
    }
  }



  /** ログメッセージの追記 */
  private appendLogMessage(msg: string): void {
    if (!this.messageLogBox) return;

    const item = document.createElement('div');
    item.className = 'log-item';
    item.textContent = `> ${msg}`;
    this.messageLogBox.prepend(item);

    // 最大件数制限
    while (this.messageLogBox.children.length > 25) {
      if (this.messageLogBox.lastChild) {
        this.messageLogBox.removeChild(this.messageLogBox.lastChild);
      }
    }
  }
}
