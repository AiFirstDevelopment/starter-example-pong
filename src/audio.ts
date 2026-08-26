/**
 * The three collision sounds. This is the only module that touches Web Audio.
 *
 * The tones are pulled apart on purpose — pitch, waveform and length all differ
 * — so a paddle, a wall and a ball leaving the court are told apart by ear
 * without looking at the screen.
 */

import type { GameEvent } from './game/step';

export type SoundKind = 'paddle-hit' | 'wall-hit' | 'out-of-play';

interface Tone {
  type: OscillatorType;
  frequency: number;
  /** When set, the pitch slides here across the length of the tone. */
  slideTo?: number;
  durationMs: number;
  gain: number;
}

const TONES: Record<SoundKind, Tone> = {
  'paddle-hit': { type: 'square', frequency: 459, durationMs: 90, gain: 0.16 },
  'wall-hit': { type: 'square', frequency: 226, durationMs: 16, gain: 0.16 },
  'out-of-play': {
    type: 'sawtooth',
    frequency: 490,
    slideTo: 120,
    durationMs: 300,
    gain: 0.2,
  },
};

export interface Audio {
  /**
   * Start (or resume) the audio context. Browsers refuse to do this outside a
   * user gesture, so the game calls it from the key press that starts play.
   */
  unlock: () => void;
  play: (kind: SoundKind) => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
}

/** The event kinds that make a sound; the rest are scoring bookkeeping. */
const SOUNDS = new Set<string>(Object.keys(TONES));

export function soundFor(event: GameEvent): SoundKind | null {
  return SOUNDS.has(event.kind) ? (event.kind as SoundKind) : null;
}

export function createAudio(): Audio {
  let context: AudioContext | null = null;
  let muted = false;

  const unlock = (): void => {
    const Constructor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) {
      return;
    }
    if (context === null) {
      context = new Constructor();
    }
    if (context.state === 'suspended') {
      void context.resume();
    }
  };

  const play = (kind: SoundKind): void => {
    if (muted || context === null) {
      return;
    }
    const tone = TONES[kind];
    const start = context.currentTime;
    const end = start + tone.durationMs / 1000;

    const oscillator = context.createOscillator();
    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    if (tone.slideTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(tone.slideTo, end);
    }

    const envelope = context.createGain();
    envelope.gain.setValueAtTime(tone.gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(envelope);
    envelope.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end);
  };

  return {
    unlock,
    play,
    setMuted: (next: boolean) => {
      muted = next;
    },
    isMuted: () => muted,
  };
}
