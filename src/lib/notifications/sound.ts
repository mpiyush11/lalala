'use client';

/**
 * Front-desk alert tone built on the native Web Audio API.
 *
 * Deliberately asset-free: no audio file to ship, cache, or fail to load. A
 * short two-tone sine chirp is audible over gym background noise without being
 * startling at a customer-facing counter.
 */

let audioContext: AudioContext | null = null;

type AudioContextConstructor = new () => AudioContext;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor })
      .webkitAudioContext;

  if (!Ctor) return null;

  if (!audioContext) {
    audioContext = new Ctor();
  }

  return audioContext;
}

/**
 * Plays a soft ~150ms alert chirp (440Hz -> 880Hz).
 *
 * Safe to call on every render pass: it never throws, and silently no-ops when
 * the browser blocks audio before the first user gesture.
 */
export function playAlertBeep(): void {
  try {
    const context = getAudioContext();
    if (!context) return;

    // Browsers suspend the context until a user gesture occurs.
    if (context.state === 'suspended') {
      void context.resume();
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, now);
    oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.12);

    // Short fade prevents an audible click at the tone boundaries.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(now);
    oscillator.stop(now + 0.16);
  } catch {
    // Audio is a convenience signal; never let it break a desk workflow.
  }
}
