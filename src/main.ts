/**
 * アプリケーション・エントリーポイント
 * ゲームループ（requestAnimationFrame）、オーディオ連携、レンダリング同期
 */

import './style.css';
import { GameEngine } from './gameEngine';
import { SoundManager } from './audio/soundManager';
import { HudManager } from './ui/hudManager';

function initApp(): void {
  const mainCanvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const miniMapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;

  if (!mainCanvas || !miniMapCanvas) {
    throw new Error('Canvas要素（#game-canvas または #minimap-canvas）が見つかりません。');
  }

  // 1. サウンドマネージャー初期化
  const soundManager = new SoundManager();

  // 2. ゲームエンジン初期化（CanvasとSoundManagerを渡す）
  const gameEngine = new GameEngine(mainCanvas, miniMapCanvas, soundManager);

  // 3. HUDマネージャー初期化（完成したEngineを確実にバインド）
  const hudManager = new HudManager(gameEngine);

  // 初回UIステータス反映
  try {
    hudManager.updateUi();
  } catch (err) {
    console.error('HUD initial update error:', err);
  }

  // 4. メインゲームループ（requestAnimationFrame）
  let lastTimestamp = performance.now();

  function gameLoop(currentTimestamp: number): void {
    const deltaTime = Math.min(0.1, (currentTimestamp - lastTimestamp) / 1000);
    lastTimestamp = currentTimestamp;

    // ゲームロジック更新
    try {
      gameEngine.update(deltaTime);
    } catch (err) {
      console.error('GameEngine update error:', err);
    }

    // キャンバスレンダリング（タイトル画面中も迷宮の息吹を確実に描画）
    try {
      gameEngine.renderer.render(
        gameEngine.floor,
        gameEngine.player,
        gameEngine.projectiles,
        gameEngine.particles,
        deltaTime,
        gameEngine.turnCount
      );
    } catch (err) {
      console.error('Renderer error:', err);
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
}

// DOM読み込み完了後に確実に起動
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
