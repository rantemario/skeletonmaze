/**
 * Web Audio API を活用したプロシージャル・レトロサウンドシステム
 * 外部音声ファイルへの依存を排除し、80年代レトロPSG風（矩形波・ノイズ・三角波）の
 * 迫力ある効果音とクラシックなダンジョン旋律BGMをリアルタイム合成する。
 */

import type { SoundEffectType } from '../types';

export class SoundManager {
  private audioContext: AudioContext | null = null;
  private isMuted: boolean = false;
  private bgmGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private isBgmPlaying: boolean = false;
  private bgmStepIndex: number = 0;
  private bgmTimerId: number | null = null;

  // ドラゴンスレイヤーへのオマージュを込めた、哀愁と緊迫感のある短調アルペジオ旋律
  private readonly melodyNotes: number[] = [
    220.00, // A3
    261.63, // C4
    329.63, // E4
    440.00, // A4
    415.30, // G#4
    329.63, // E4
    261.63, // C4
    415.30, // G#4
    196.00, // G3
    246.94, // B3
    293.66, // D4
    392.00, // G4
    369.99, // F#4
    293.66, // D4
    246.94, // B3
    369.99, // F#4
    174.61, // F3
    220.00, // A3
    261.63, // C4
    349.23, // F4
    329.63, // E4
    261.63, // C4
    220.00, // A3
    329.63, // E4
    164.81, // E3
    207.65, // G#3
    246.94, // B3
    329.63, // E4
    311.13, // D#4
    246.94, // B3
    207.65, // G#3
    311.13, // D#4
  ];

  /** オーディオコンテキストの初期化（ブラウザの自動再生ポリシー対策でユーザー操作時に呼び出し） */
  public init(): void {
    if (this.audioContext) return;

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AudioContextClass();

    this.bgmGainNode = this.audioContext.createGain();
    this.bgmGainNode.gain.setValueAtTime(0.08, this.audioContext.currentTime);
    this.bgmGainNode.connect(this.audioContext.destination);

    this.sfxGainNode = this.audioContext.createGain();
    this.sfxGainNode.gain.setValueAtTime(0.18, this.audioContext.currentTime);
    this.sfxGainNode.connect(this.audioContext.destination);
  }

  /** ミュートの切り替え */
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.bgmGainNode && this.sfxGainNode && this.audioContext) {
      const now = this.audioContext.currentTime;
      this.bgmGainNode.gain.setValueAtTime(this.isMuted ? 0 : 0.08, now);
      this.sfxGainNode.gain.setValueAtTime(this.isMuted ? 0 : 0.18, now);
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /** BGM再生の開始 */
  public startBgm(): void {
    if (this.isBgmPlaying) return;
    this.init();
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    this.isBgmPlaying = true;
    this.bgmStepIndex = 0;
    this.scheduleNextBgmStep();
  }

  /** BGM再生の停止 */
  public stopBgm(): void {
    this.isBgmPlaying = false;
    if (this.bgmTimerId !== null) {
      window.clearTimeout(this.bgmTimerId);
      this.bgmTimerId = null;
    }
  }

  /** リアルタイムBGMノート合成 */
  private scheduleNextBgmStep(): void {
    if (!this.isBgmPlaying || !this.audioContext || !this.bgmGainNode) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const frequency = this.melodyNotes[this.bgmStepIndex % this.melodyNotes.length];

    // レトロPSG特有のパルス波/矩形波による主旋律
    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(frequency, now);

    // エンベロープ設定（減衰型）
    noteGain.gain.setValueAtTime(this.isMuted ? 0 : 0.1, now);
    noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(noteGain);
    noteGain.connect(this.bgmGainNode);

    osc.start(now);
    osc.stop(now + 0.15);

    // 4ステップごとに低音のベース音（三角波）を追加
    if (this.bgmStepIndex % 4 === 0) {
      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bassOsc.type = 'triangle';
      bassOsc.frequency.setValueAtTime(frequency / 2, now);
      bassGain.gain.setValueAtTime(this.isMuted ? 0 : 0.2, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      bassOsc.connect(bassGain);
      bassGain.connect(this.bgmGainNode);

      bassOsc.start(now);
      bassOsc.stop(now + 0.55);
    }

    this.bgmStepIndex++;
    // 16分音符間隔（テンポ約120BPM = 1拍0.5秒 / 4 = 125ms）
    this.bgmTimerId = window.setTimeout(() => this.scheduleNextBgmStep(), 125);
  }

  /** 効果音のリアルタイム合成発音 */
  public playSfx(type: SoundEffectType): void {
    if (this.isMuted) return;
    this.init();
    if (!this.audioContext || !this.sfxGainNode) return;
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    switch (type) {
      case 'STEP': {
        // 軽い足音（短いパルスノイズ）
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.04);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(gain);
        gain.connect(this.sfxGainNode);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
      }

      case 'PUSH_BLOCK': {
        // 岩ブロックを押す鈍い重低音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this.sfxGainNode);
        osc.start(now);
        osc.stop(now + 0.13);
        break;
      }

      case 'PICKUP_ITEM': {
        // アイテム取得（軽快な上昇アルペジオ）
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.05); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.10); // G5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this.sfxGainNode);
        osc.start(now);
        osc.stop(now + 0.19);
        break;
      }

      case 'DELIVER_HOME':
      case 'POWER_UP': {
        // HOMEへの運搬・強化達成ファンファーレ
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.08); // C#5
        osc.frequency.setValueAtTime(659.25, now + 0.16); // E5
        osc.frequency.setValueAtTime(880, now + 0.24); // A5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(this.sfxGainNode);
        osc.start(now);
        osc.stop(now + 0.46);
        break;
      }

      case 'PLAYER_ATTACK': {
        // 剣撃音（シュッというスイープ）
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.sfxGainNode);
        osc.start(now);
        osc.stop(now + 0.09);
        break;
      }

      case 'PLAYER_HIT': {
        // 被弾ダメージ（ノイズと急降下音）
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.sfxGainNode);
        osc.start(now);
        osc.stop(now + 0.16);
        break;
      }

      case 'MONSTER_DEFEAT': {
        // 敵消滅音（下降アルペジオ）
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(this.sfxGainNode);
        osc.start(now);
        osc.stop(now + 0.21);
        break;
      }

      case 'DOOR_UNLOCK': {
        // 扉の解錠（金属音）
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(1200, now + 0.06);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.sfxGainNode);
        osc.start(now);
        osc.stop(now + 0.16);
        break;
      }

      case 'SPELL_CAST': {
        // 魔法放電音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.15);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.sfxGainNode);
        osc.start(now);
        osc.stop(now + 0.16);
        break;
      }

      case 'DRAGON_ROAR': {
        // ドラゴンの咆哮（唸る重低音）
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.linearRampToValueAtTime(70, now + 0.4);
        osc.frequency.linearRampToValueAtTime(50, now + 0.7);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.connect(gain);
        gain.connect(this.sfxGainNode);
        osc.start(now);
        osc.stop(now + 0.75);
        break;
      }

      case 'DRAGON_BREATH': {
        // 激しい火炎ブレス放射音
        const bufferSize = ctx.sampleRate * 0.4;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1; // ホワイトノイズ
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.linearRampToValueAtTime(300, now + 0.4);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGainNode);
        noise.start(now);
        break;
      }

      case 'CROSS_ACTIVATE': {
        // 十字架聖なる輝き
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880.00, now + 0.1); // A5
        osc.frequency.setValueAtTime(1174.66, now + 0.2); // D6
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(this.sfxGainNode);
        osc.start(now);
        osc.stop(now + 0.42);
        break;
      }

      case 'GAME_OVER': {
        // 哀悼の下降音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.linearRampToValueAtTime(293, now + 0.2);
        osc.frequency.linearRampToValueAtTime(261, now + 0.4);
        osc.frequency.linearRampToValueAtTime(164, now + 0.8);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        osc.connect(gain);
        gain.connect(this.sfxGainNode);
        osc.start(now);
        osc.stop(now + 0.95);
        break;
      }

      case 'VICTORY': {
        // ドラゴン討伐・勝利のファンファーレ
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.3); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.45); // C6
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.connect(gain);
        gain.connect(this.sfxGainNode);
        osc.start(now);
        osc.stop(now + 0.85);
        break;
      }
    }
  }
}
