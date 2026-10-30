"use client";

import { useState } from "react";
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
import { ConnectionState, Track, type Participant } from "livekit-client";
import { MAX_PARTICIPANTS } from "@/lib/channels";
import { HangUpIcon, HeadphonesIcon, HeadphonesOffIcon, MicIcon, MicOffIcon } from "@/components/Icons";

type Props = {
  serverUrl: string;
  token: string;
  channelName: string;
  onLeave: () => void;
  onError: (msg: string) => void;
  onShowChannels: () => void;
};

export default function VoiceRoom({ serverUrl, token, channelName, onLeave, onError, onShowChannels }: Props) {
  const [deafened, setDeafened] = useState(false);

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
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      }}
      onDisconnected={onLeave}
      onError={(e) => onError(e.message)}
      onMediaDeviceFailure={() => onError("Could not access your microphone. Check browser permissions.")}
    >
      <RoomHeader channelName={channelName} onShowChannels={onShowChannels} />
      <ParticipantGrid />
      <Controls deafened={deafened} setDeafened={setDeafened} />
      {/* Plays everyone else's audio; muted when deafened */}
      <RoomAudioRenderer muted={deafened} />
      <StartAudio label="Click to enable audio" className="start-audio" />
    </LiveKitRoom>
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

function ParticipantGrid() {
  const participants = useParticipants();
  return (
    <div className="grid">
      {participants.map((p) => (
        <ParticipantTile key={p.identity} participant={p} />
      ))}
    </div>
  );
}

function ParticipantTile({ participant }: { participant: Participant }) {
  const speaking = useIsSpeaking(participant);
  const { isMuted } = useTrackMutedIndicator({ participant, source: Track.Source.Microphone });
  const name = participant.name || "Unknown";
  return (
    <div className={`tile ${speaking ? "speaking" : ""}`}>
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
    </div>
  );
}

function Controls({ deafened, setDeafened }: { deafened: boolean; setDeafened: (d: boolean) => void }) {
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
      <button className="ctrl leave" onClick={() => room.disconnect()} aria-label="Leave">
        <span className="ctrl-icon">
          <HangUpIcon />
        </span>
        <span className="ctrl-label">Leave</span>
      </button>
    </div>
  );
}
