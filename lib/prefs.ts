// User audio preferences, saved in the browser so they survive reloads.

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const prefs = {
  sounds: () => read("pref.sounds", true),
  setSounds: (on: boolean) => write("pref.sounds", on),

  noiseFilter: () => read("pref.noiseFilter", true),
  setNoiseFilter: (on: boolean) => write("pref.noiseFilter", on),

  micId: () => read<string>("pref.micId", ""),
  setMicId: (id: string) => write("pref.micId", id),

  speakerId: () => read<string>("pref.speakerId", ""),
  setSpeakerId: (id: string) => write("pref.speakerId", id),

  // Keyed by display name, since identities are random per connection
  volumes: () => read<Record<string, number>>("pref.volumes", {}),
  setVolumes: (v: Record<string, number>) => write("pref.volumes", v),
};
