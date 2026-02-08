import { PentatonicNote } from '../types';

/**
 * Manages game audio using the Web Audio API.
 * Generates pentatonic bell tones programmatically.
 *
 * CRITICAL: Sound isolation is enforced at the game logic level —
 * this manager simply plays whatever it's told to play.
 * The GameScene is responsible for only calling playBellNote()
 * for the local player's actions.
 */
export class AudioManager {
  private audioContext: AudioContext | null = null;
  private initialized = false;

  /**
   * Frequencies for the Chinese pentatonic scale (宫商角徵羽).
   * Based on C pentatonic: C D E G A
   * Using octave 4 for a resonant bell sound.
   */
  private readonly noteFrequencies: Record<string, number> = {
    [PentatonicNote.Gong]: 523.25,   // C5 — 宫
    [PentatonicNote.Shang]: 587.33,  // D5 — 商
    [PentatonicNote.Jue]: 659.25,    // E5 — 角
    [PentatonicNote.Zhi]: 783.99,    // G5 — 徵
    [PentatonicNote.Yu]: 880.00,     // A5 — 羽
  };

  private ensureContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    this.initialized = true;
    return this.audioContext;
  }

  /**
   * Play a bell tone for the given note.
   * Simulates a 编钟 strike with a metallic, resonant character.
   */
  playBellNote(note: string) {
    const ctx = this.ensureContext();
    const freq = this.noteFrequencies[note];
    if (!freq) return;

    const now = ctx.currentTime;

    // Main tone — sine wave for the fundamental
    const fundamental = ctx.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.setValueAtTime(freq, now);

    // Overtone — adds metallic bell character
    const overtone = ctx.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(freq * 2.76, now); // Non-harmonic partial for bell timbre

    // Second overtone
    const overtone2 = ctx.createOscillator();
    overtone2.type = 'sine';
    overtone2.frequency.setValueAtTime(freq * 5.4, now);

    // Gain envelopes — sharp attack, long decay (bell-like)
    const mainGain = ctx.createGain();
    mainGain.gain.setValueAtTime(0, now);
    mainGain.gain.linearRampToValueAtTime(0.4, now + 0.005);  // Sharp attack
    mainGain.gain.exponentialRampToValueAtTime(0.001, now + 3); // Long decay

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(0, now);
    overtoneGain.gain.linearRampToValueAtTime(0.15, now + 0.003);
    overtoneGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    const overtone2Gain = ctx.createGain();
    overtone2Gain.gain.setValueAtTime(0, now);
    overtone2Gain.gain.linearRampToValueAtTime(0.05, now + 0.002);
    overtone2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    // Connect
    fundamental.connect(mainGain).connect(ctx.destination);
    overtone.connect(overtoneGain).connect(ctx.destination);
    overtone2.connect(overtone2Gain).connect(ctx.destination);

    // Start and stop
    fundamental.start(now);
    overtone.start(now);
    overtone2.start(now);
    fundamental.stop(now + 3);
    overtone.stop(now + 1.5);
    overtone2.stop(now + 0.8);
  }

  /**
   * Play a success chord when a puzzle is solved.
   */
  playSuccessChord() {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    // Play all five pentatonic notes in a gentle arpeggio
    const notes = Object.values(this.noteFrequencies);
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.1 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 2);

      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 2);
    });
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
