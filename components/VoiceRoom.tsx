"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useConnectionState,
  useIsSpeaking,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTrackMutedIndicator,
} from "@livekit/components-react";
import { useKrispNoiseFilter } from "@livekit/components-react/krisp";
import { ConnectionState, Track, type Participant, type RemoteParticipant } from "livekit-client";
import { MAX_PARTICIPANTS } from "@/lib/channels";
import { prefs } from "@/lib/prefs";
import {
  HangUpIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  MicIcon,
  MicOffIcon,
  SettingsIcon,
  VolumeIcon,
} from "@/components/Icons";
import { SettingsSheet, VolumeSheet } from "@/components/AudioSheets";

type Props = {
  serverUrl: string;
  token: string;
  channelName: string;
  onLeave: () => void;
  onError: (msg: string) => void;
  onShowChannels: () => void;
};

export default function VoiceRoom({ serverUrl, token, channelName, onLeave, onError, onShowChannels }: Props) {
  // Read saved devices once, so the call starts on the user's chosen mic/speaker
  const [micId] = useState(() => prefs.micId());
  const [speakerId] = useState(() => prefs.speakerId());

  return (
    <LiveKitRoom
      className="room"
      serverUrl={serverUrl}
      token={token}
      connect
      audio
      video={false}
      options={{
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // "ideal" falls back to the default mic if the saved one is unplugged
          ...(micId ? { deviceId: { ideal: micId } } : {}),
        },
        ...(speakerId ? { audioOutput: { deviceId: speakerId } } : {}),
      }}
      onDisconnected={onLeave}
      onError={(e) => onError(e.message)}
      onMediaDeviceFailure={() => onError("Could not access your microphone. Check browser permissions.")}
    >
      <RoomView channelName={channelName} onShowChannels={onShowChannels} />
      <StartAudio label="Click to enable audio" className="start-audio" />
    </LiveKitRoom>
  );
}

type Sheet = { type: "settings" } | { type: "volume"; participant: RemoteParticipant } | null;

function RoomView({ channelName, onShowChannels }: { channelName: string; onShowChannels: () => void }) {
  const [deafened, setDeafened] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [volumes, setVolumes] = useState(() => prefs.volumes());

  // Krisp AI noise cancellation (LiveKit Cloud only). One hook instance for the whole room.
  const krisp = useKrispNoiseFilter();
  const [krispSupported, setKrispSupported] = useState<boolean | null>(null);
  const { setNoiseFilterEnabled } = krisp;

  useEffect(() => {
    import("@livekit/krisp-noise-filter")
      .then((m) => {
        const ok = m.isKrispNoiseFilterSupported();
        setKrispSupported(ok);
        if (ok && prefs.noiseFilter()) setNoiseFilterEnabled(true);
      })
      .catch(() => setKrispSupported(false));
  }, [setNoiseFilterEnabled]);

  const toggleNoiseFilter = (on: boolean) => {
    prefs.setNoiseFilter(on);
    setNoiseFilterEnabled(on);
  };

  const setVolume = useCallback((name: string, volume: number) => {
    setVolumes((prev) => {
      const next = { ...prev };
      if (volume === 1) delete next[name];
      else next[name] = volume;
      prefs.setVolumes(next);
      return next;
    });
  }, []);

  const closeSheet = useCallback(() => setSheet(null), []);

  return (
    <>
      <RoomHeader channelName={channelName} onShowChannels={onShowChannels} />
      <ParticipantGrid
        volumes={volumes}
        onOpenVolume={(p) => setSheet({ type: "volume", participant: p })}
        onOpenSettings={() => setSheet({ type: "settings" })}
      />
      <Controls deafened={deafened} setDeafened={setDeafened} onOpenSettings={() => setSheet({ type: "settings" })} />
      {/* Plays everyone else's audio; muted when deafened */}
      <RoomAudioRenderer muted={deafened} />

      {sheet?.type === "settings" && (
        <SettingsSheet
          onClose={closeSheet}
          noiseFilter={{
            supported: krispSupported,
            enabled: krisp.isNoiseFilterEnabled,
            pending: krisp.isNoiseFilterPending,
            onToggle: toggleNoiseFilter,
          }}
        />
      )}
      {sheet?.type === "volume" && (
        <VolumeSheet
          name={sheet.participant.name || "Unknown"}
          volume={volumes[sheet.participant.name || ""] ?? 1}
          onChange={(v) => setVolume(sheet.participant.name || "", v)}
          onClose={closeSheet}
        />
      )}
    </>
  );
}

function RoomHeader({ channelName, onShowChannels }: { channelName: string; onShowChannels: () => void }) {
  const state = useConnectionState();
  const participants = useParticipants();
  const label =
    state === ConnectionState.Connected
      ? "Voice Connected"
      : state === ConnectionState.Reconnecting
        ? "Reconnecting…"
        : "Connecting…";
  return (
    <header className="room-header">
      <button className="back-btn mobile-only" onClick={onShowChannels} aria-label="Show channels">
        ‹
      </button>
      <span className="channel-icon">🔊</span>
      <div className="room-title">
        <h2>{channelName}</h2>
        <span className={`status ${state === ConnectionState.Connected ? "ok" : "warn"}`}>{label}</span>
      </div>
      <span className="room-count">
        {participants.length}/{MAX_PARTICIPANTS}
      </span>
    </header>
  );
}

type GridProps = {
  volumes: Record<string, number>;
  onOpenVolume: (p: RemoteParticipant) => void;
  onOpenSettings: () => void;
};

function ParticipantGrid({ volumes, onOpenVolume, onOpenSettings }: GridProps) {
  const participants = useParticipants();
  return (
    <div className="grid">
      {participants.map((p) => (
        <ParticipantTile
          key={p.identity}
          participant={p}
          volume={volumes[p.name || ""] ?? 1}
          onClick={() => (p.isLocal ? onOpenSettings() : onOpenVolume(p as RemoteParticipant))}
        />
      ))}
    </div>
  );
}

function ParticipantTile({
  participant,
  volume,
  onClick,
}: {
  participant: Participant;
  volume: number;
  onClick: () => void;
}) {
  const speaking = useIsSpeaking(participant);
  const { isMuted } = useTrackMutedIndicator({ participant, source: Track.Source.Microphone });
  const name = participant.name || "Unknown";

  // Apply this person's saved volume (LiveKit also re-applies it when their audio arrives)
  useEffect(() => {
    if (!participant.isLocal) (participant as RemoteParticipant).setVolume(volume);
  }, [participant, volume]);

  return (
    <button
      className={`tile ${speaking ? "speaking" : ""}`}
      onClick={onClick}
      title={participant.isLocal ? "Audio settings" : `Adjust ${name}'s volume`}
    >
      <div className="avatar">
        {name.charAt(0).toUpperCase()}
        {isMuted && (
          <span className="muted-badge" title="Muted">
            <MicOffIcon size={14} />
          </span>
        )}
      </div>
      <div className="tile-name">
        <span className="tile-name-text">{name}</span>
        {participant.isLocal && <span className="you">(you)</span>}
      </div>
      {!participant.isLocal && volume !== 1 && (
        <span className="volume-badge">
          <VolumeIcon size={12} /> {Math.round(volume * 100)}%
        </span>
      )}
    </button>
  );
}

function Controls({
  deafened,
  setDeafened,
  onOpenSettings,
}: {
  deafened: boolean;
  setDeafened: (d: boolean) => void;
  onOpenSettings: () => void;
}) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();

  const toggleMic = () => {
    const enable = !isMicrophoneEnabled;
    localParticipant.setMicrophoneEnabled(enable);
    if (enable && deafened) setDeafened(false); // unmuting also undeafens, like Discord
  };

  const toggleDeafen = () => {
    const next = !deafened;
    setDeafened(next);
    localParticipant.setMicrophoneEnabled(!next); // deafening also mutes your mic
  };

  return (
    <div className="controls">
      <button
        className={`ctrl ${isMicrophoneEnabled ? "" : "off"}`}
        onClick={toggleMic}
        aria-label={isMicrophoneEnabled ? "Mute" : "Unmute"}
      >
        <span className="ctrl-icon">{isMicrophoneEnabled ? <MicIcon /> : <MicOffIcon />}</span>
        <span className="ctrl-label">{isMicrophoneEnabled ? "Mute" : "Unmute"}</span>
      </button>
      <button
        className={`ctrl ${deafened ? "off" : ""}`}
        onClick={toggleDeafen}
        aria-label={deafened ? "Undeafen" : "Deafen"}
      >
        <span className="ctrl-icon">{deafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}</span>
        <span className="ctrl-label">{deafened ? "Undeafen" : "Deafen"}</span>
      </button>
      <button className="ctrl" onClick={onOpenSettings} aria-label="Audio settings">
        <span className="ctrl-icon">
          <SettingsIcon />
        </span>
        <span className="ctrl-label">Settings</span>
      </button>
      <button className="ctrl leave" onClick={() => room.disconnect()} aria-label="Leave">
        <span className="ctrl-icon">
          <HangUpIcon />
        </span>
        <span className="ctrl-label">Leave</span>
      </button>
    </div>
  );
}
