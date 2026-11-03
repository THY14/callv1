"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useConnectionState,
  useIsSpeaking,
  useLocalParticipant,
  useParticipantAttribute,
  useParticipants,
  useRoomContext,
  useTrackMutedIndicator,
} from "@livekit/components-react";
import { useKrispNoiseFilter } from "@livekit/components-react/krisp";
import { ConnectionState, Room, RoomEvent, Track, type Participant, type RemoteParticipant } from "livekit-client";
import { MAX_PARTICIPANTS } from "@/lib/channels";
import { prefs } from "@/lib/prefs";
import { playSound } from "@/lib/sounds";
import {
  DeviceIcon,
  HangUpIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  LinkIcon,
  MicIcon,
  MicOffIcon,
  SettingsIcon,
  VolumeIcon,
} from "@/components/Icons";
import { SettingsSheet, VolumeSheet } from "@/components/AudioSheets";

/**
 * Creates the call's Room. The page owns it (not <LiveKitRoom>), so the sidebar and the
 * bottom-left panel can show live call state too. Browser only.
 */
export function createVoiceRoom() {
  // Read saved devices, so the call starts on the user's chosen mic/speaker
  const micId = prefs.micId();
  const speakerId = prefs.speakerId();
  return new Room({
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
  });
}

/** Mute/deafen state lives in the page, so it works before joining and from the sidebar. */
export type VoiceState = {
  muted: boolean;
  deafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
};

type Props = {
  room: Room;
  serverUrl: string;
  token: string;
  channelName: string;
  voice: VoiceState;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onLeave: () => void;
  onError: (msg: string) => void;
  onMicFailure: () => void;
  onShowChannels: () => void;
  /** Personal rooms get an Invite button in the header */
  onInvite?: () => void;
};

export default function VoiceRoom({ room, serverUrl, token, onMicFailure, onLeave, onError, ...rest }: Props) {
  // Only the starting value matters; later changes are applied by useMicSync
  const [startWithMic] = useState(() => !rest.voice.muted && !rest.voice.deafened);

  return (
    <LiveKitRoom
      className="room"
      room={room}
      serverUrl={serverUrl}
      token={token}
      connect
      audio={startWithMic}
      video={false}
      onDisconnected={onLeave}
      onError={(e) => onError(e.message)}
      onMediaDeviceFailure={onMicFailure}
    >
      <RoomView token={token} {...rest} />
      <StartAudio label="Click to enable audio" className="start-audio" />
    </LiveKitRoom>
  );
}

type Sheet = { type: "volume"; participant: RemoteParticipant } | null;

type RoomViewProps = Omit<Props, "room" | "serverUrl" | "onLeave" | "onError" | "onMicFailure">;

function RoomView({
  token,
  channelName,
  voice,
  settingsOpen,
  onOpenSettings,
  onCloseSettings,
  onShowChannels,
  onInvite,
}: RoomViewProps) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [volumes, setVolumes] = useState(() => prefs.volumes());

  useMicSync(!voice.muted && !voice.deafened);
  useBroadcastDeafened(voice.deafened, token);
  useCallSounds(voice.deafened);

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
      <RoomHeader channelName={channelName} onShowChannels={onShowChannels} onInvite={onInvite} />
      <ParticipantGrid
        volumes={volumes}
        selfDeafened={voice.deafened}
        onOpenVolume={(p) => setSheet({ type: "volume", participant: p })}
        onOpenSettings={onOpenSettings}
      />
      <Controls voice={voice} onOpenSettings={onOpenSettings} />
      {/* Plays everyone else's audio; muted when deafened */}
      <RoomAudioRenderer muted={voice.deafened} />

      {settingsOpen && (
        <SettingsSheet
          onClose={onCloseSettings}
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

/** Turns the mic on/off when mute or deafen changes (the starting state is set on join). */
function useMicSync(micOn: boolean) {
  const { localParticipant } = useLocalParticipant();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    localParticipant.setMicrophoneEnabled(micOn).catch(() => {});
  }, [micOn, localParticipant]);
}

/** Lets everyone see the deafened icon. The starting value is already in the join token. */
function useBroadcastDeafened(deafened: boolean, token: string) {
  const first = useRef(true);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Chained, so quick toggles can't arrive at the server out of order
    queue.current = queue.current
      .then(() =>
        fetch("/api/voice-state", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ deafened }),
        }),
      )
      .catch(() => {});
  }, [deafened, token]);
}

/** Join/leave chimes, like Discord. */
function useCallSounds(deafened: boolean) {
  const room = useRoomContext();
  const deafenedRef = useRef(deafened);
  useEffect(() => {
    deafenedRef.current = deafened;
  }, [deafened]);

  useEffect(() => {
    let connectedAt = 0;
    // Ignore the burst of events for people who were already in the channel when we joined
    const settled = () => Date.now() - connectedAt > 1500;
    const onConnected = () => {
      connectedAt = Date.now();
      playSound("join");
    };
    const onJoin = () => settled() && !deafenedRef.current && playSound("join");
    const onLeave = () => settled() && !deafenedRef.current && playSound("leave");

    room
      .on(RoomEvent.Connected, onConnected)
      .on(RoomEvent.ParticipantConnected, onJoin)
      .on(RoomEvent.ParticipantDisconnected, onLeave);
    return () => {
      room
        .off(RoomEvent.Connected, onConnected)
        .off(RoomEvent.ParticipantConnected, onJoin)
        .off(RoomEvent.ParticipantDisconnected, onLeave);
    };
  }, [room]);
}

function RoomHeader({
  channelName,
  onShowChannels,
  onInvite,
}: {
  channelName: string;
  onShowChannels: () => void;
  onInvite?: () => void;
}) {
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
      {onInvite && (
        <button className="invite-btn" onClick={onInvite} title="Copy invite link">
          <LinkIcon size={16} /> Invite
        </button>
      )}
    </header>
  );
}

type GridProps = {
  volumes: Record<string, number>;
  selfDeafened: boolean;
  onOpenVolume: (p: RemoteParticipant) => void;
  onOpenSettings: () => void;
};

function ParticipantGrid({ volumes, selfDeafened, onOpenVolume, onOpenSettings }: GridProps) {
  const participants = useParticipants();
  return (
    <div className="grid">
      {participants.map((p) => (
        <ParticipantTile
          key={p.identity}
          participant={p}
          volume={volumes[p.name || ""] ?? 1}
          selfDeafened={selfDeafened}
          onClick={() => (p.isLocal ? onOpenSettings() : onOpenVolume(p as RemoteParticipant))}
        />
      ))}
    </div>
  );
}

function ParticipantTile({
  participant,
  volume,
  selfDeafened,
  onClick,
}: {
  participant: Participant;
  volume: number;
  selfDeafened: boolean;
  onClick: () => void;
}) {
  const speaking = useIsSpeaking(participant);
  const { isMuted } = useTrackMutedIndicator({ participant, source: Track.Source.Microphone });
  const device = useParticipantAttribute("device", { participant });
  const deafenedAttr = useParticipantAttribute("deafened", { participant });
  // Our own state is known instantly; other people's arrives via their attributes
  const deafened = participant.isLocal ? selfDeafened : deafenedAttr === "1";
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
        {(deafened || isMuted) && (
          <span className="muted-badge" title={deafened ? "Deafened" : "Muted"}>
            {deafened ? <HeadphonesOffIcon size={14} /> : <MicOffIcon size={14} />}
          </span>
        )}
      </div>
      <div className="tile-name">
        <span className="tile-name-text">{name}</span>
        {participant.isLocal && <span className="you">(you)</span>}
        <DeviceIcon device={device} />
      </div>
      {!participant.isLocal && volume !== 1 && (
        <span className="volume-badge">
          <VolumeIcon size={12} /> {Math.round(volume * 100)}%
        </span>
      )}
    </button>
  );
}

function Controls({ voice, onOpenSettings }: { voice: VoiceState; onOpenSettings: () => void }) {
  const room = useRoomContext();
  const micOff = voice.muted || voice.deafened;

  return (
    <div className="controls">
      <button className={`ctrl ${micOff ? "off" : ""}`} onClick={voice.onToggleMute} aria-label={micOff ? "Unmute" : "Mute"}>
        <span className="ctrl-icon">{micOff ? <MicOffIcon /> : <MicIcon />}</span>
        <span className="ctrl-label">{micOff ? "Unmute" : "Mute"}</span>
      </button>
      <button
        className={`ctrl ${voice.deafened ? "off" : ""}`}
        onClick={voice.onToggleDeafen}
        aria-label={voice.deafened ? "Undeafen" : "Deafen"}
      >
        <span className="ctrl-icon">{voice.deafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}</span>
        <span className="ctrl-label">{voice.deafened ? "Undeafen" : "Deafen"}</span>
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
