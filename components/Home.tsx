"use client";

import { useState } from "react";
import { CHANNELS, MAX_PARTICIPANTS } from "@/lib/channels";
import { NO_ONE, type Occupancy, type Target } from "@/lib/calls";
import { formatCode, formatCodeInput, isRoomCode, normalizeCode } from "@/lib/rooms";
import type { Member } from "@/components/VoiceMembers";
import { Elapsed } from "@/components/Elapsed";
import {
  CallIcon,
  CopyIcon,
  HomeIcon,
  KeypadIcon,
  PlusIcon,
  SettingsIcon,
  ShareIcon,
  VolumeIcon,
} from "@/components/Icons";

type Props = {
  name: string;
  occupancy: Occupancy;
  joining: string | null;
  /** Key of the call you're in (channel id or room code), if any */
  currentKey: string | null;
  myCode: string | null;
  myRoomChecked: boolean;
  creating: boolean;
  inviteCode: string | null;
  onJoin: (t: Target) => void;
  onCreate: () => void;
  onCopyCode: (code: string) => void;
  onShare: (code: string) => void;
  onBadCode: () => void;
  onOpenSettings: () => void;
  onChangeName: () => void;
};

/** The "Calls" home screen: invite, your room (or Create), join with a code, and the public channels. */
export default function Home(props: Props) {
  const { name, occupancy, joining, currentKey, myCode, myRoomChecked, inviteCode } = props;
  const invited = inviteCode && inviteCode !== myCode ? inviteCode : null;

  return (
    <div className="home">
      <header className="home-top">
        <span className="brand-logo">
          <CallIcon size={18} />
        </span>
        <h1>Calls</h1>
        <button className="icon-btn" onClick={props.onOpenSettings} aria-label="Audio settings" title="Audio settings">
          <SettingsIcon size={20} />
        </button>
        <button className="avatar-btn" onClick={props.onChangeName} aria-label="Change name" title="Change name">
          {name.charAt(0).toUpperCase()}
        </button>
      </header>

      <div className="home-body">
        <div className="home-inner">
          <div className="hello">
            <h2>Hi {name} 👋</h2>
            <p>Start a call or join your friends. Up to {MAX_PARTICIPANTS} people, no time limit.</p>
          </div>

          {invited && (
            <InviteCard
              code={invited}
              info={occupancy[invited] ?? NO_ONE}
              joining={joining}
              onJoin={() => props.onJoin({ kind: "room", code: invited })}
            />
          )}

          <div className="hero-grid">
            {myCode ? (
              <MyRoomCard
                code={myCode}
                info={occupancy[myCode] ?? NO_ONE}
                inIt={currentKey === myCode}
                joining={joining}
                onJoin={() => props.onJoin({ kind: "room", code: myCode })}
                onCopy={() => props.onCopyCode(myCode)}
                onShare={() => props.onShare(myCode)}
              />
            ) : (
              myRoomChecked && (
                <button className="card create-card" onClick={props.onCreate} disabled={props.creating}>
                  <span className="create-plus">
                    <PlusIcon size={28} />
                  </span>
                  <strong>{props.creating ? "Creating…" : "Create a room"}</strong>
                  <span className="muted">Get a code to send to friends</span>
                </button>
              )
            )}
            <JoinCodeCard
              disabled={joining !== null}
              onJoin={(code) => props.onJoin({ kind: "room", code })}
              onBadCode={props.onBadCode}
            />
          </div>

          <h3 className="section-title">Channels</h3>
          <div className="channel-cards">
            {CHANNELS.map((c) => {
              const info = occupancy[c.id] ?? NO_ONE;
              const inIt = currentKey === c.id;
              const full = info.members.length >= MAX_PARTICIPANTS && !inIt;
              return (
                <button
                  key={c.id}
                  className={`call-row ${inIt ? "current" : ""}`}
                  onClick={() => props.onJoin({ kind: "channel", id: c.id })}
                  disabled={full || (joining !== null && joining !== c.id)}
                >
                  <span className="icon-badge">
                    <VolumeIcon size={20} />
                  </span>
                  <span className="call-row-text">
                    <strong>{c.name}</strong>
                    <CallStatus info={info} />
                  </span>
                  <Faces members={info.members} />
                  <span className={`join-pill ${inIt ? "current" : ""}`}>
                    {joining === c.id ? "…" : inIt ? "Open" : full ? "Full" : "Join"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** "Nobody here" or "● 3 in call · 12:34" */
function CallStatus({ info }: { info: Occupancy[string] }) {
  const n = info.members.length;
  if (n === 0) return <span className="muted">Nobody here</span>;
  return (
    <span className="live-text">
      <span className="live-dot" />
      {n} in call
      {info.startedAt && (
        <>
          {" · "}
          <Elapsed since={info.startedAt} className="tabular" />
        </>
      )}
    </span>
  );
}

/** Overlapping avatar stack, max 4 */
function Faces({ members }: { members: Member[] }) {
  if (members.length === 0) return null;
  const extra = members.length - 4;
  return (
    <span className="faces">
      {members.slice(0, 4).map((m) => (
        <span key={m.identity} className="face" title={m.name}>
          {m.name.charAt(0).toUpperCase()}
        </span>
      ))}
      {extra > 0 && <span className="face more">+{extra}</span>}
    </span>
  );
}

function InviteCard({
  code,
  info,
  joining,
  onJoin,
}: {
  code: string;
  info: Occupancy[string];
  joining: string | null;
  onJoin: () => void;
}) {
  return (
    <div className="card invite-card">
      <div className="card-head">
        <span className="icon-badge blurple">
          <CallIcon size={20} />
        </span>
        <span className="card-title">
          <strong>You&apos;re invited</strong>
          <span className="muted">Room {formatCode(code)}</span>
        </span>
        <Faces members={info.members} />
      </div>
      <CallStatus info={info} />
      <button className="btn btn-green btn-big" onClick={onJoin} disabled={joining !== null}>
        <CallIcon size={20} /> {joining === code ? "Joining…" : "Join call"}
      </button>
    </div>
  );
}

function MyRoomCard({
  code,
  info,
  inIt,
  joining,
  onJoin,
  onCopy,
  onShare,
}: {
  code: string;
  info: Occupancy[string];
  inIt: boolean;
  joining: string | null;
  onJoin: () => void;
  onCopy: () => void;
  onShare: () => void;
}) {
  const busy = info.members.length > 0;
  return (
    <div className="card room-card">
      <div className="card-head">
        <span className="icon-badge green">
          <HomeIcon size={20} />
        </span>
        <span className="card-title">
          <strong>My room</strong>
          <CallStatus info={info} />
        </span>
        <Faces members={info.members} />
      </div>
      <button className="big-code" onClick={onCopy} title="Tap to copy the code">
        <span>{formatCode(code)}</span>
        <span className="big-code-hint">
          <CopyIcon size={15} /> Copy
        </span>
      </button>
      <div className="card-actions">
        <button className="btn btn-gray" onClick={onShare}>
          <ShareIcon size={18} /> Share link
        </button>
        <button className="btn btn-green" onClick={onJoin} disabled={joining !== null && !inIt}>
          <CallIcon size={18} /> {joining === code ? "Joining…" : inIt ? "Open" : busy ? "Join" : "Start call"}
        </button>
      </div>
    </div>
  );
}

function JoinCodeCard({
  disabled,
  onJoin,
  onBadCode,
}: {
  disabled: boolean;
  onJoin: (code: string) => void;
  onBadCode: () => void;
}) {
  const [draft, setDraft] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeCode(draft);
    if (!isRoomCode(code)) return onBadCode();
    setDraft("");
    onJoin(code);
  };
  return (
    <form className="card join-card" onSubmit={submit}>
      <div className="card-head">
        <span className="icon-badge blurple">
          <KeypadIcon size={20} />
        </span>
        <span className="card-title">
          <strong>Join with a code</strong>
          <span className="muted">Got a link? Just open it.</span>
        </span>
      </div>
      <div className="join-row">
        <input
          className="code-input"
          placeholder="ABC-123"
          aria-label="Room code"
          value={draft}
          onChange={(e) => setDraft(formatCodeInput(e.target.value))}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          inputMode="text"
        />
        <button className="btn btn-blurple" type="submit" disabled={disabled || normalizeCode(draft).length < 6}>
          Join
        </button>
      </div>
    </form>
  );
}
