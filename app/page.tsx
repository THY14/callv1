"use client";

import { useCallback, useEffect, useState } from "react";
import { RoomContext } from "@livekit/components-react";
import type { Room } from "livekit-client";
import {
  CHANNELS,
  MAX_PARTICIPANTS,
  TEXT_CHANNELS,
  type ChannelId,
  type TextChannelId,
} from "@/lib/channels";
import VoiceRoom, { createVoiceRoom, type VoiceState } from "@/components/VoiceRoom";
import TextChat from "@/components/TextChat";
import { LobbySettingsSheet } from "@/components/AudioSheets";
import { LiveMemberList, MemberList, SelfAvatar, type Member } from "@/components/VoiceMembers";
import {
  HangUpIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  LinkIcon,
  MicIcon,
  MicOffIcon,
  SettingsIcon,
} from "@/components/Icons";
import { detectDevice } from "@/lib/device";
import { playSound } from "@/lib/sounds";
import { getAuthorToken } from "@/lib/author";
import { formatCode, inviteLink, isRoomCode, normalizeCode } from "@/lib/rooms";

/** Members per public channel id or personal room code */
type Occupancy = Record<string, Member[]>;
/** Where to join: a public channel, or someone's personal room */
type Target = { kind: "channel"; id: ChannelId } | { kind: "room"; code: string };
/** key = channel id or room code */
type Session = { key: string; kind: Target["kind"]; title: string; token: string; url: string; room: Room };
/** What the main area shows: a text channel, or the voice call / voice lobby. */
type MainView = "text" | "voice";
/** Which panel is shown on phones (desktop always shows both). */
type MobileView = "channels" | "main";

const targetKey = (t: Target) => (t.kind === "channel" ? t.id : t.code);

export default function Home() {
  const [name, setName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(""); // friendly green toast, e.g. "Invite link copied"
  const [occupancy, setOccupancy] = useState<Occupancy>({});
  const [mainView, setMainView] = useState<MainView>("voice");
  const [textChannel, setTextChannel] = useState<TextChannelId>("general");
  const [mobileView, setMobileView] = useState<MobileView>("channels");
  // Like Discord, you can mute/deafen before joining and it carries into the call
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null); // from a ?room= link
  const [codeDraft, setCodeDraft] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("displayName");
    if (saved) setName(saved);

    // Opened from an invite link: show the invite straight away
    const code = normalizeCode(new URLSearchParams(window.location.search).get("room") ?? "");
    if (isRoomCode(code)) {
      setInviteCode(code);
      setMobileView("main");
    }

    // Every browser owns exactly one room; ask the server for its code
    fetch("/api/my-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorToken: getAuthorToken() }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data?.code && setMyCode(data.code))
      .catch(() => {});
  }, []);

  // Personal rooms we want member lists for (public channels are always included)
  const guestCode = session?.kind === "room" && session.key !== myCode ? session.key : null;
  const watchCodes = [myCode, guestCode, inviteCode].filter(Boolean).join(",");

  const refreshOccupancy = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms?codes=${watchCodes}`, { cache: "no-store" });
      if (res.ok) setOccupancy(await res.json());
    } catch {}
  }, [watchCodes]);

  // Poll who is in each channel so the sidebar stays live
  useEffect(() => {
    refreshOccupancy();
    const t = setInterval(refreshOccupancy, 4000);
    return () => clearInterval(t);
  }, [refreshOccupancy]);

  // Auto-hide errors and notices after a few seconds
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 6000);
    return () => clearTimeout(t);
  }, [error]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const toggleMute = useCallback(() => {
    if (deafened) {
      // Unmuting while deafened also undeafens, like Discord
      setDeafened(false);
      setMuted(false);
      playSound("undeafen");
      return;
    }
    setMuted(!muted);
    playSound(muted ? "unmute" : "mute");
  }, [muted, deafened]);

  const toggleDeafen = useCallback(() => {
    setDeafened(!deafened);
    playSound(deafened ? "undeafen" : "deafen");
  }, [deafened]);

  // Discord shortcuts. e.code is the physical key, so it works with a Khmer keyboard layout too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || e.repeat) return;
      if (e.code === "KeyM") {
        e.preventDefault();
        toggleMute();
      } else if (e.code === "KeyD") {
        e.preventDefault();
        toggleDeafen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMute, toggleDeafen]);

  const voice: VoiceState = { muted, deafened, onToggleMute: toggleMute, onToggleDeafen: toggleDeafen };

  const saveName = (e: React.FormEvent) => {
    e.preventDefault();
    const n = nameDraft.trim().slice(0, 32);
    if (!n) return;
    localStorage.setItem("displayName", n);
    setName(n);
  };

  const openText = (id: TextChannelId) => {
    setTextChannel(id);
    setMainView("text");
    setMobileView("main");
  };

  const showVoice = () => {
    setMainView("voice");
    setMobileView("main");
  };

  const join = async (target: Target) => {
    const key = targetKey(target);
    if (session?.key === key) {
      showVoice(); // already in it, just show the call
      return;
    }
    if (joining) return;
    setError("");
    setJoining(key);
    setSession(null); // leave current channel first
    showVoice();
    try {
      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: key,
          name,
          device: detectDevice(),
          deafened,
          authorToken: getAuthorToken(), // proves you own your room, so you can open it
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to join");
      setSession({ key, kind: target.kind, title: data.title, token: data.token, url: data.url, room: createVoiceRoom() });
      if (key === inviteCode) {
        // Invite used: tidy the address bar so a reload doesn't show it again
        setInviteCode(null);
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join");
      if (!inviteCode) setMobileView("channels");
    } finally {
      setJoining(null);
      setTimeout(refreshOccupancy, 1000);
    }
  };

  const joinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeCode(codeDraft);
    if (!isRoomCode(code)) {
      setError("Room codes have 6 letters and numbers, like K7P-4QX.");
      return;
    }
    setCodeDraft("");
    join({ kind: "room", code });
  };

  /** Phones: open the share sheet (Telegram etc). Desktop: copy the link. */
  const shareRoom = async (code: string) => {
    const url = inviteLink(code);
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: "Join my voice room", text: `Room code: ${formatCode(code)}`, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // they closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice(`Invite link copied (room ${formatCode(code)})`);
    } catch {
      setNotice(`Your room code: ${formatCode(code)}`);
    }
  };

  const leave = useCallback(() => {
    playSound("leave");
    setSession(null);
    setMobileView("channels");
    setTimeout(refreshOccupancy, 500);
  }, [refreshOccupancy]);

  const onMicFailure = useCallback(() => {
    setMuted(true);
    setError("Could not access your microphone. Check browser permissions.");
  }, []);

  if (!name) {
    return (
      <div className="name-screen">
        <form className="name-card" onSubmit={saveName}>
          <div className="name-logo">🎧</div>
          <h1>Welcome!</h1>
          <p>
            {inviteCode
              ? `Pick a display name to join room ${formatCode(inviteCode)}.`
              : "Pick a display name to hop into the voice channels."}
          </p>
          <input
            autoFocus
            maxLength={32}
            placeholder="Your name"
            autoComplete="nickname"
            enterKeyHint="go"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
          />
          <button type="submit" disabled={!nameDraft.trim()}>
            Continue
          </button>
        </form>
      </div>
    );
  }

  const activeText = TEXT_CHANNELS.find((c) => c.id === textChannel)!;
  const micOff = muted || deafened;

  return (
    // Lets the sidebar read the live call (speaking rings etc.) while you're in one
    <RoomContext.Provider value={session?.room}>
      <div className="app" data-mobile-view={mobileView} data-main-view={mainView}>
        {error ? (
          <button className="toast" onClick={() => setError("")}>
            {error} <span className="toast-close">✕</span>
          </button>
        ) : (
          notice && (
            <button className="toast ok" onClick={() => setNotice("")}>
              {notice} <span className="toast-close">✕</span>
            </button>
          )
        )}

        <aside className="sidebar">
          <div className="server-name">My Community</div>
          <div className="channel-list">
            <div className="section-label">ROOMS</div>
            {myCode && (
              <RoomEntry
                label="My room"
                code={myCode}
                members={occupancy[myCode] ?? []}
                active={session?.key === myCode}
                joining={joining}
                deafened={deafened}
                onJoin={() => join({ kind: "room", code: myCode })}
                onShare={() => shareRoom(myCode)}
              />
            )}
            {guestCode && session && (
              <RoomEntry
                label={session.title}
                code={guestCode}
                members={occupancy[guestCode] ?? []}
                active
                joining={joining}
                deafened={deafened}
                onJoin={showVoice}
                onShare={() => shareRoom(guestCode)}
              />
            )}
            <form className="code-form" onSubmit={joinByCode}>
              <input
                placeholder="Enter a room code"
                aria-label="Room code"
                maxLength={7}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="go"
                value={codeDraft}
                onChange={(e) => setCodeDraft(e.target.value)}
              />
              <button type="submit" disabled={!codeDraft.trim() || joining !== null}>
                Join
              </button>
            </form>

            <div className="section-label">VOICE CHANNELS</div>
            {CHANNELS.map((c) => {
              const members = occupancy[c.id] ?? [];
              const inThis = session?.key === c.id;
              const full = members.length >= MAX_PARTICIPANTS && !inThis;
              return (
                <div key={c.id}>
                  <button
                    className={`channel ${inThis ? "active" : ""}`}
                    onClick={() => join({ kind: "channel", id: c.id })}
                    disabled={full || (joining !== null && joining !== c.id)}
                    title={full ? "Channel is full" : `Join ${c.name}`}
                  >
                    <span className="channel-icon">🔊</span>
                    <span className="channel-name">{c.name}</span>
                    <span className={`channel-count ${full ? "full" : ""}`}>
                      {joining === c.id ? "…" : `${members.length}/${MAX_PARTICIPANTS}`}
                    </span>
                  </button>
                  {inThis ? (
                    <LiveMemberList fallback={members} selfDeafened={deafened} />
                  ) : (
                    <MemberList members={members} />
                  )}
                </div>
              );
            })}

            <div className="section-label">TEXT CHANNELS</div>
            {TEXT_CHANNELS.map((c) => (
              <button
                key={c.id}
                className={`channel ${mainView === "text" && textChannel === c.id ? "active" : ""}`}
                onClick={() => openText(c.id)}
              >
                <span className="channel-icon hash">#</span>
                <span className="channel-name">{c.name}</span>
              </button>
            ))}
          </div>

          {/* Shows you're still in a call while looking at something else */}
          {session && (
            <div className="voice-bar">
              <button className="voice-bar-main" onClick={showVoice}>
                <span className="voice-dot" />
                <span className="voice-bar-text">
                  <strong>Voice Connected</strong>
                  <span>{session.title}</span>
                </span>
              </button>
              <button
                className="voice-bar-leave"
                onClick={() => session.room.disconnect()}
                aria-label="Disconnect"
                title="Disconnect"
              >
                <HangUpIcon size={22} />
              </button>
            </div>
          )}

          <div className="user-panel">
            {session ? <SelfAvatar name={name} /> : <span className="mini-avatar">{name.charAt(0).toUpperCase()}</span>}
            <div className="user-info">
              <span className="user-name">{name}</span>
              <button
                className="link-btn"
                onClick={() => {
                  setSession(null);
                  localStorage.removeItem("displayName");
                  setNameDraft(name);
                  setName("");
                }}
              >
                Change name
              </button>
            </div>
            <button
              className={`panel-btn ${micOff ? "off" : ""}`}
              onClick={toggleMute}
              aria-label={micOff ? "Unmute" : "Mute"}
              title={`${micOff ? "Unmute" : "Mute"} (Ctrl+Shift+M)`}
            >
              {micOff ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
            </button>
            <button
              className={`panel-btn ${deafened ? "off" : ""}`}
              onClick={toggleDeafen}
              aria-label={deafened ? "Undeafen" : "Deafen"}
              title={`${deafened ? "Undeafen" : "Deafen"} (Ctrl+Shift+D)`}
            >
              {deafened ? <HeadphonesOffIcon size={20} /> : <HeadphonesIcon size={20} />}
            </button>
            <button
              className="panel-btn"
              onClick={() => setSettingsOpen(true)}
              aria-label="Audio settings"
              title="Audio settings"
            >
              <SettingsIcon size={20} />
            </button>
          </div>
        </aside>

        <main className="main">
          {mainView === "text" && (
            <TextChat
              key={textChannel}
              channel={activeText}
              userName={name}
              onBack={() => setMobileView("channels")}
              onError={setError}
            />
          )}

          {/* The call stays mounted (and audible) while you read a text channel */}
          {session && (
            <div className="voice-wrap" hidden={mainView !== "voice"}>
              <VoiceRoom
                key={session.key}
                room={session.room}
                serverUrl={session.url}
                token={session.token}
                channelName={session.title}
                voice={voice}
                settingsOpen={settingsOpen}
                onOpenSettings={() => setSettingsOpen(true)}
                onCloseSettings={() => setSettingsOpen(false)}
                onLeave={leave}
                onError={setError}
                onMicFailure={onMicFailure}
                onShowChannels={() => setMobileView("channels")}
                onInvite={session.kind === "room" ? () => shareRoom(session.key) : undefined}
              />
            </div>
          )}

          {mainView === "voice" && !session && (
            <VoiceLobby
              occupancy={occupancy}
              joining={joining}
              myCode={myCode}
              inviteCode={inviteCode}
              onJoin={join}
              onShare={shareRoom}
              onBack={() => setMobileView("channels")}
            />
          )}
        </main>

        {/* In a call, the call renders its own settings (it knows about noise cancellation and the mic meter) */}
        {settingsOpen && !session && <LobbySettingsSheet onClose={() => setSettingsOpen(false)} />}
      </div>
    </RoomContext.Provider>
  );
}

/** A personal room in the sidebar: join on click, share button on the right, members below. */
function RoomEntry({
  label,
  code,
  members,
  active,
  joining,
  deafened,
  onJoin,
  onShare,
}: {
  label: string;
  code: string;
  members: Member[];
  active: boolean;
  joining: string | null;
  deafened: boolean;
  onJoin: () => void;
  onShare: () => void;
}) {
  return (
    <div>
      <div className="channel-row">
        <button
          className={`channel ${active ? "active" : ""}`}
          onClick={onJoin}
          disabled={joining !== null && joining !== code}
        >
          <span className="channel-icon">🏠</span>
          <span className="channel-name">
            {label} <span className="channel-sub">{formatCode(code)}</span>
          </span>
          <span className="channel-count">{joining === code ? "…" : `${members.length}/${MAX_PARTICIPANTS}`}</span>
        </button>
        <button className="channel-share" onClick={onShare} aria-label="Copy invite link" title="Copy invite link">
          <LinkIcon size={16} />
        </button>
      </div>
      {active ? <LiveMemberList fallback={members} selfDeafened={deafened} /> : <MemberList members={members} />}
    </div>
  );
}

function Avatars({ members }: { members: Member[] }) {
  return (
    <div className="lobby-people">
      {members.length === 0 ? (
        <span className="lobby-empty">Nobody here yet</span>
      ) : (
        members.map((m) => (
          <span key={m.identity} className="mini-avatar" title={m.name}>
            {m.name.charAt(0).toUpperCase()}
          </span>
        ))
      )}
    </div>
  );
}

/** Shown when you're not in a call: your room, any invite, and the public channels. */
function VoiceLobby({
  occupancy,
  joining,
  myCode,
  inviteCode,
  onJoin,
  onShare,
  onBack,
}: {
  occupancy: Occupancy;
  joining: string | null;
  myCode: string | null;
  inviteCode: string | null;
  onJoin: (t: Target) => void;
  onShare: (code: string) => void;
  onBack: () => void;
}) {
  const myMembers = myCode ? (occupancy[myCode] ?? []) : [];
  const inviteMembers = inviteCode ? (occupancy[inviteCode] ?? []) : [];

  return (
    <div className="lobby">
      <header className="room-header">
        <button className="back-btn mobile-only" onClick={onBack} aria-label="Show channels">
          ‹
        </button>
        <span className="channel-icon">🔊</span>
        <div className="room-title">
          <h2>Voice</h2>
        </div>
      </header>
      <div className="lobby-body">
        <p className="lobby-hint">
          {joining
            ? "Connecting…"
            : `Start your own room or hop into a channel. Up to ${MAX_PARTICIPANTS} people each, no time limit.`}
        </p>

        <div className="lobby-grid">
          {inviteCode && inviteCode !== myCode && (
            <div className="lobby-card invite-card">
              <div className="lobby-card-head">
                <span className="channel-icon">✉️</span>
                <strong>Invite to room {formatCode(inviteCode)}</strong>
              </div>
              <Avatars members={inviteMembers} />
              <button
                className="lobby-join"
                onClick={() => onJoin({ kind: "room", code: inviteCode })}
                disabled={joining !== null}
              >
                {joining === inviteCode ? "Joining…" : "Join room"}
              </button>
            </div>
          )}

          {myCode && (
            <div className="lobby-card">
              <div className="lobby-card-head">
                <span className="channel-icon">🏠</span>
                <strong>My room</strong>
                <span className="room-code">{formatCode(myCode)}</span>
              </div>
              <p className="lobby-desc">Always the same code. Friends can join while someone is inside.</p>
              <Avatars members={myMembers} />
              <div className="lobby-actions">
                <button className="btn-secondary" onClick={() => onShare(myCode)}>
                  <LinkIcon size={16} /> Invite
                </button>
                <button
                  className="lobby-join"
                  onClick={() => onJoin({ kind: "room", code: myCode })}
                  disabled={joining !== null}
                >
                  {joining === myCode ? "Joining…" : myMembers.length ? "Join" : "Start"}
                </button>
              </div>
            </div>
          )}
        </div>

        <h3 className="lobby-title">Public channels</h3>
        <div className="lobby-grid">
          {CHANNELS.map((c) => {
            const members = occupancy[c.id] ?? [];
            const full = members.length >= MAX_PARTICIPANTS;
            return (
              <div key={c.id} className="lobby-card">
                <div className="lobby-card-head">
                  <span className="channel-icon">🔊</span>
                  <strong>{c.name}</strong>
                  <span className={`channel-count ${full ? "full" : ""}`}>
                    {members.length}/{MAX_PARTICIPANTS}
                  </span>
                </div>
                <Avatars members={members} />
                <button
                  className="lobby-join"
                  onClick={() => onJoin({ kind: "channel", id: c.id })}
                  disabled={full || joining !== null}
                >
                  {joining === c.id ? "Joining…" : full ? "Full" : members.length ? "Join call" : "Start call"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
