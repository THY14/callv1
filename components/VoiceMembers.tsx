"use client";

import {
  useConnectionState,
  useIsSpeaking,
  useLocalParticipant,
  useParticipantAttribute,
  useParticipants,
  useTrackMutedIndicator,
} from "@livekit/components-react";
import { ConnectionState, Track, type Participant } from "livekit-client";
import { DeviceIcon, HeadphonesOffIcon, MicOffIcon } from "@/components/Icons";

/** One person in a voice channel, as returned by /api/rooms. */
export type Member = { identity: string; name: string; device: string; muted: boolean; deafened: boolean };

function MemberRow({ name, device, muted, deafened, speaking }: Omit<Member, "identity"> & { speaking?: boolean }) {
  return (
    <li>
      <span className={`mini-avatar ${speaking ? "speaking" : ""}`}>{name.charAt(0).toUpperCase()}</span>
      <span className="member-name">{name}</span>
      <DeviceIcon device={device} size={13} />
      <span className="member-status">
        {deafened ? (
          <span title="Deafened" aria-label="Deafened">
            <HeadphonesOffIcon size={14} />
          </span>
        ) : (
          muted && (
            <span title="Muted" aria-label="Muted">
              <MicOffIcon size={14} />
            </span>
          )
        )}
      </span>
    </li>
  );
}

/** Members of a channel you're not in (refreshed by polling). */
export function MemberList({ members }: { members: Member[] }) {
  return (
    <ul className="channel-members">
      {members.map((m) => (
        <MemberRow key={m.identity} {...m} />
      ))}
    </ul>
  );
}

/**
 * Members of the channel you're in, straight from the call: speaking rings and
 * mute/deafen icons update instantly. Needs the call's RoomContext.
 */
export function LiveMemberList({ fallback, selfDeafened }: { fallback: Member[]; selfDeafened: boolean }) {
  const state = useConnectionState();
  const participants = useParticipants();
  if (state !== ConnectionState.Connected) return <MemberList members={fallback} />;
  return (
    <ul className="channel-members">
      {participants.map((p) => (
        <LiveMember key={p.identity} participant={p} selfDeafened={selfDeafened} />
      ))}
    </ul>
  );
}

function LiveMember({ participant, selfDeafened }: { participant: Participant; selfDeafened: boolean }) {
  const speaking = useIsSpeaking(participant);
  const { isMuted } = useTrackMutedIndicator({ participant, source: Track.Source.Microphone });
  const device = useParticipantAttribute("device", { participant });
  const deafenedAttr = useParticipantAttribute("deafened", { participant });
  return (
    <MemberRow
      name={participant.name || "Unknown"}
      device={device || "desktop"}
      muted={isMuted}
      deafened={participant.isLocal ? selfDeafened : deafenedAttr === "1"}
      speaking={speaking}
    />
  );
}

/** Your avatar in the bottom-left panel, with a green ring while you talk. */
export function SelfAvatar({ name }: { name: string }) {
  const { localParticipant } = useLocalParticipant();
  const speaking = useIsSpeaking(localParticipant);
  return <span className={`mini-avatar ${speaking ? "speaking" : ""}`}>{name.charAt(0).toUpperCase()}</span>;
}
