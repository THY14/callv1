"use client";

import { useEffect, useState } from "react";
import { useLocalParticipant, useMediaDeviceSelect, useTrackVolume } from "@livekit/components-react";
import type { LocalAudioTrack } from "livekit-client";
import { prefs } from "@/lib/prefs";

/** Bottom sheet on phones, centred dialog on desktop. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h3>{title}</h3>
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type NoiseFilter = {
  supported: boolean | null;
  enabled: boolean;
  pending: boolean;
  onToggle: (on: boolean) => void;
};

export function SettingsSheet({ onClose, noiseFilter }: { onClose: () => void; noiseFilter: NoiseFilter }) {
  const { microphoneTrack, isMicrophoneEnabled } = useLocalParticipant();
  const level = useTrackVolume(microphoneTrack?.track as LocalAudioTrack | undefined);

  const mics = useMediaDeviceSelect({ kind: "audioinput" });
  const speakers = useMediaDeviceSelect({ kind: "audiooutput" });
  // iPhone Safari and Firefox can't choose the speaker from a web page
  const canPickSpeaker =
    typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype && speakers.devices.length > 0;

  const pickMic = (id: string) => {
    prefs.setMicId(id);
    mics.setActiveMediaDevice(id);
  };
  const pickSpeaker = (id: string) => {
    prefs.setSpeakerId(id);
    speakers.setActiveMediaDevice(id);
  };

  return (
    <Sheet title="Audio settings" onClose={onClose}>
      <section className="setting">
        <div className="setting-row">
          <div>
            <div className="setting-title">AI noise cancellation</div>
            <div className="setting-desc">
              {noiseFilter.supported === false
                ? "Not supported in this browser."
                : "Removes keyboard, traffic, fans and other background noise."}
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={noiseFilter.enabled}
              disabled={!noiseFilter.supported || noiseFilter.pending}
              onChange={(e) => noiseFilter.onToggle(e.target.checked)}
            />
            <span className="switch-track" />
          </label>
        </div>
      </section>

      <section className="setting">
        <label className="setting-title" htmlFor="mic-select">
          Microphone
        </label>
        <select
          id="mic-select"
          className="select"
          value={mics.activeDeviceId}
          onChange={(e) => pickMic(e.target.value)}
        >
          {mics.devices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone ${i + 1}`}
            </option>
          ))}
        </select>
        <div className="meter" aria-label="Microphone level">
          <div className="meter-fill" style={{ width: `${Math.min(100, Math.round(level * 400))}%` }} />
        </div>
        <div className="setting-desc">
          {isMicrophoneEnabled ? "Talk to test: the bar should move when you speak." : "You're muted. Unmute to test your mic."}
        </div>
      </section>

      {canPickSpeaker && (
        <section className="setting">
          <label className="setting-title" htmlFor="speaker-select">
            Speaker
          </label>
          <select
            id="speaker-select"
            className="select"
            value={speakers.activeDeviceId}
            onChange={(e) => pickSpeaker(e.target.value)}
          >
            {speakers.devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Speaker ${i + 1}`}
              </option>
            ))}
          </select>
        </section>
      )}
    </Sheet>
  );
}

export function VolumeSheet({
  name,
  volume,
  onChange,
  onClose,
}: {
  name: string;
  volume: number;
  onChange: (v: number) => void;
  onClose: () => void;
}) {
  // Local state so the slider moves smoothly; saved on every change
  const [value, setValue] = useState(Math.round(volume * 100));

  const update = (v: number) => {
    setValue(v);
    onChange(v / 100);
  };

  return (
    <Sheet title={`${name}'s volume`} onClose={onClose}>
      <section className="setting">
        <div className="volume-row">
          <input
            type="range"
            className="slider"
            min={0}
            max={100}
            step={5}
            value={value}
            onChange={(e) => update(Number(e.target.value))}
            aria-label={`${name}'s volume`}
          />
          <span className="volume-value">{value}%</span>
        </div>
        <div className="setting-desc">Only changes what you hear. {name} won&apos;t know.</div>
      </section>
      <div className="sheet-actions">
        <button className="btn-secondary" onClick={() => update(0)} disabled={value === 0}>
          Mute for me
        </button>
        <button className="btn-secondary" onClick={() => update(100)} disabled={value === 100}>
          Reset
        </button>
      </div>
    </Sheet>
  );
}
