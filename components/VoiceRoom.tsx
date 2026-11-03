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
  ChevronIcon,
  CopyIcon,
  HeadphonesOffIcon,
  LinkIcon,
  MicIcon,
  MicOffIcon,
  SettingsIcon,
  VolumeIcon,
} from "@/components/Icons";
import { SettingsSheet, VolumeSheet } from "@/components/AudioSheets";
import { Elapsed } from "@/components/Elapsed";
import { formatCode } from "@/lib/rooms";

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
  /** When the call started, for the timer */
  startedAt: number;
  /** Personal rooms show their code (tap to copy) and an Invite button in the header */
  roomCode?: string;
  onCopyCode?: () => void;
  onInvite?: () => void;
};

export default function VoiceRoom({ room, serverUrl, token, onMicFailure, onLeave, onError, ...rest }: Props) {
  return (
    <LiveKitRoom
      className="room"
      room={room}
      serverUrl={serverUrl}
      token={token}
      connect
      // The mic is turned on by useMicSync once connected, so only one place ever publishes it
      audio={false}
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
  startedAt,
  roomCode,
  onCopyCode,
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
      <RoomHeader
        channelName={channelName}
        startedAt={startedAt}
        roomCode={roomCode}
        onCopyCode={onCopyCode}
        onInvite={onInvite}
        onShowChannels={onShowChannels}
      />
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

/**
 * Keeps the real mic in line with mute/deafen. Only acts while connected: publishing earlier
 * waits for the connection and fails after 15s ("publishing rejected as engine not connected").
 */
function useMicSync(micOn: boolean) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const state = useConnectionState();
  const busy = useRef(false);
  useEffect(() => {
    if (state !== ConnectionState.Connected || busy.current || micOn === isMicrophoneEnabled) return;
    busy.current = true;
    // When it finishes, isMicrophoneEnabled changes and this re-checks (in case you toggled meanwhile).
    // On failure (e.g. mic permission denied) the page mutes you via onMicFailure.
    localParticipant
      .setMicrophoneEnabled(micOn)
      .catch(() => {})
      .finally(() => {
        busy.current = false;
      });
  }, [state, micOn, isMicrophoneEnabled, localParticipant]);
}

/** Lets everyone see the deafened icon, by syncing it to our participant attributes. */
function useBroadcastDeafened(deafened: boolean, token: string) {
  const { localParticipant } = useLocalParticipant();
  const state = useConnectionState();
  const onServer = useParticipantAttribute("deafened", { participant: localParticipant }) === "1";
  const lastSent = useRef<boolean | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    if (state !== ConnectionState.Connected) return;
    lastSent.current ??= onServer; // starting value came from the join token
    if (lastSent.current === deafened) return;
    lastSent.current = deafened;
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
  }, [state, deafened, onServer, token]);
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
  startedAt,
  roomCode,
  onCopyCode,
  onInvite,
  onShowChannels,
}: {
  channelName: string;
  startedAt: number;
  roomCode?: string;
  onCopyCode?: () => void;
  onInvite?: () => void;
  onShowChannels: () => void;
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
      <button className="back-btn mobile-only" onClick={onShowChannels} aria-label="Back">
        <ChevronIcon size={22} />
      </button>
      <span className="header-icon">
        <VolumeIcon size={20} />
      </span>
      <div className="room-title">
        <h2>{channelName}</h2>
        <span className={`status ${state === ConnectionState.Connected ? "ok" : "warn"}`}>
          {label}
          {state === ConnectionState.Connected && <Elapsed since={startedAt} className="status-time" />}
        </span>
      </div>
      <span className="room-count">
        {participants.length}/{MAX_PARTICIPANTS}
      </span>
      {roomCode && onCopyCode && (
        <button className="code-chip" onClick={onCopyCode} title="Copy room code">
          {formatCode(roomCode)} <CopyIcon size={14} />
        </button>
      )}
      {onInvite && (
        <button className="invite-btn" onClick={onInvite} title="Copy invite link" aria-label="Copy invite link">
          <LinkIcon size={16} /> <span className="invite-label">Invite</span>
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
