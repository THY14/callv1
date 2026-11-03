// Short Discord-style UI sounds, synthesized with Web Audio so there are no files to load.
import { prefs } from "@/lib/prefs";

export type SoundName = "join" | "leave" | "mute" | "unmute" | "deafen" | "undeafen";

// [frequency Hz, start offset s] for each note
const SOUNDS: Record<SoundName, [number, number][]> = {
  join: [[523, 0], [784, 0.09]], // rising: someone arrived
  leave: [[784, 0], [523, 0.09]], // falling: someone left
  unmute: [[880, 0]],
  mute: [[440, 0]],
  undeafen: [[392, 0], [587, 0.07], [784, 0.14]],
  deafen: [[784, 0], [587, 0.07], [392, 0.14]],
};

let ctx: AudioContext | null = null;

export function playSound(name: SoundName) {
  if (typeof window === "undefined" || !prefs.sounds()) return;
  try {
    ctx ??= new AudioContext();
    // Browsers start the context suspended until a tap/click; resume is a no-op otherwise
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    for (const [freq, offset] of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + offset;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    }
  } catch {}
}
