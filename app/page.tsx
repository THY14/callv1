"use client";

import { useCallback, useEffect, useState } from "react";
import { RoomContext } from "@livekit/components-react";
import type { Room } from "livekit-client";
import { CHANNELS, MAX_PARTICIPANTS, TEXT_CHANNELS, type TextChannelId } from "@/lib/channels";
import { NO_ONE, type Occupancy, type Target } from "@/lib/calls";
import VoiceRoom, { createVoiceRoom, type VoiceState } from "@/components/VoiceRoom";
import TextChat from "@/components/TextChat";
import Home from "@/components/Home";
import { LobbySettingsSheet } from "@/components/AudioSheets";
import { LiveMemberList, MemberList, SelfAvatar, type Member } from "@/components/VoiceMembers";
import { Elapsed } from "@/components/Elapsed";
import {
  CallIcon,
  ChatIcon,
  ChevronIcon,
  CopyIcon,
  HangUpIcon,
  HashIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  HomeIcon,
  MicIcon,
  MicOffIcon,
  PlusIcon,
  SettingsIcon,
  VolumeIcon,
} from "@/components/Icons";
import { detectDevice } from "@/lib/device";
import { playSound } from "@/lib/sounds";
import { getAuthorToken } from "@/lib/author";
import { formatCode, inviteLink, isRoomCode, normalizeCode } from "@/lib/rooms";

/** key = channel id or room code */
type Session = {
  key: string;
  kind: Target["kind"];
  title: string;
  token: string;
  url: string;
  room: Room;
  startedAt: number;
};
/**
 * What the main area shows. On phones there is no sidebar: "home" and "chats" are the two tabs,
 * and "call" / "text" are full-screen pages with a back button.
 */
type MainView = "home" | "call" | "text" | "chats";

const targetKey = (t: Target) => (t.kind === "channel" ? t.id : t.code);

export default function Page() {
  const [name, setName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(""); // friendly green toast, e.g. "Code copied"
  const [occupancy, setOccupancy] = useState<Occupancy>({});
  const [mainView, setMainView] = useState<MainView>("home");
  const [textChannel, setTextChannel] = useState<TextChannelId>("general");
  // Like Discord, you can mute/deafen before joining and it carries into the call
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [myRoomChecked, setMyRoomChecked] = useState(false); // so "Create room" doesn't flash for owners
  const [creating, setCreating] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null); // from a ?room= link

  useEffect(() => {
    const saved = localStorage.getItem("displayName");
    if (saved) setName(saved);

    // Opened from an invite link: the home screen shows the invite at the top
    const code = normalizeCode(new URLSearchParams(window.location.search).get("room") ?? "");
    if (isRoomCode(code)) setInviteCode(code);

    // Have we created a room before? (each account can have one)
    fetch("/api/my-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorToken: getAuthorToken() }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data?.code && setMyCode(data.code))
      .catch(() => {})
      .finally(() => setMyRoomChecked(true));
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

  // Poll who is in each channel so the lists stay live
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
    const t = setTimeout(() => setNotice(""), 2500);
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

  const changeName = () => {
    setSession(null);
    localStorage.removeItem("displayName");
    setNameDraft(name);
    setName("");
  };

  const openText = (id: TextChannelId) => {
    setTextChannel(id);
    setMainView("text");
  };

  const join = async (target: Target) => {
    const key = targetKey(target);
    if (session?.key === key) {
      setMainView("call"); // already in it, just show the call
      return;
    }
    if (joining) return;
    setError("");
    setJoining(key);
    setSession(null); // leave the current call first
    try {
      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: key,
          name,
          device: detectDevice(),
          deafened,
          authorToken: getAuthorToken(), // lets the server recognise the room's owner
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to join");
      setSession({
        key,
        kind: target.kind,
        title: data.title,
        token: data.token,
        url: data.url,
        room: createVoiceRoom(),
        startedAt: data.startedAt ?? Date.now(),
      });
      setMainView("call");
      if (key === inviteCode) {
        // Invite used: tidy the address bar so a reload doesn't show it again
        setInviteCode(null);
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join");
    } finally {
      setJoining(null);
      setTimeout(refreshOccupancy, 1000);
    }
  };

  const createRoom = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/my-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorToken: getAuthorToken(), name, create: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create your room");
      setMyCode(data.code);
      setNotice(`Room created! Your code is ${formatCode(data.code)}`);
      setMainView("home"); // the home screen shows the new room with its code
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your room");
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(formatCode(code));
      setNotice(`Code ${formatCode(code)} copied`);
    } catch {
      setNotice(`Room code: ${formatCode(code)}`); // clipboard blocked: at least show it
    }
  };

  /** Phones: open the share sheet (Telegram etc). Desktop: copy the link. */
  const shareRoom = async (code: string) => {
    const url = inviteLink(code);
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: "Join my call", text: `Join my call. Room code: ${formatCode(code)}`, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // they closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Invite link copied");
    } catch {
      setNotice(`Room code: ${formatCode(code)}`);
    }
  };

  const leave = useCallback(() => {
    playSound("leave");
    setSession(null);
    setMainView((v) => (v === "call" ? "home" : v));
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
          <div className="name-logo">
            <CallIcon size={30} />
          </div>
          <h1>{inviteCode ? "You're invited to a call" : "Welcome"}</h1>
          <p>
            {inviteCode
              ? `Pick a name, then join room ${formatCode(inviteCode)}.`
              : "Pick a display name so friends know who's talking."}
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
  const showCall = () => setMainView("call");
  const hangUp = () => session?.room.disconnect();

  return (
    // Lets the sidebar read the live call (speaking rings etc.) while you're in one
    <RoomContext.Provider value={session?.room}>
      <div className="app" data-main-view={mainView} data-in-call={session ? "" : undefined}>
        {error ? (
          <button className="toast" onClick={() => setError("")}>
            {error} <span className="toast-close">✕</span>
          </button>
        ) : (
          notice && (
            <button className="toast ok" onClick={() => setNotice("")}>
              {notice}
            </button>
          )
        )}

        {/* Desktop only (hidden on phones, which use the bottom tabs instead) */}
        <aside className="sidebar">
          <div className="server-name">
            <span className="brand-logo">
              <CallIcon size={16} />
            </span>
            Calls
          </div>
          <div className="channel-list">
            <button className={`channel nav ${mainView === "home" ? "active" : ""}`} onClick={() => setMainView("home")}>
              <span className="channel-icon">
                <HomeIcon size={18} />
              </span>
              <span className="channel-name">Home</span>
            </button>

            <div className="section-label">ROOMS</div>
            {myCode ? (
              <RoomEntry
                label="My room"
                code={myCode}
                members={(occupancy[myCode] ?? NO_ONE).members}
                active={session?.key === myCode}
                joining={joining}
                deafened={deafened}
                onJoin={() => join({ kind: "room", code: myCode })}
                onCopy={() => copyCode(myCode)}
              />
            ) : (
              myRoomChecked && (
                <button className="channel create-room" onClick={createRoom} disabled={creating}>
                  <span className="channel-icon">
                    <PlusIcon size={18} />
                  </span>
                  <span className="channel-name">{creating ? "Creating…" : "Create a room"}</span>
                </button>
              )
            )}
            {guestCode && session && (
              <RoomEntry
                label={session.title}
                code={guestCode}
                members={(occupancy[guestCode] ?? NO_ONE).members}
                active
                joining={joining}
                deafened={deafened}
                onJoin={showCall}
                onCopy={() => copyCode(guestCode)}
              />
            )}

            <div className="section-label">VOICE CHANNELS</div>
            {CHANNELS.map((c) => {
              const members = (occupancy[c.id] ?? NO_ONE).members;
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
                    <span className="channel-icon">
                      <VolumeIcon size={18} />
                    </span>
                    <span className="channel-name">{c.name}</span>
                    <span className={`channel-count ${full ? "full" : ""}`}>
                      {joining === c.id ? "…" : members.length > 0 && `${members.length}/${MAX_PARTICIPANTS}`}
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
                <span className="channel-icon">
                  <HashIcon size={18} />
                </span>
                <span className="channel-name">{c.name}</span>
              </button>
            ))}
          </div>

          {session && (
            <div className="voice-bar">
              <button className="voice-bar-main" onClick={showCall}>
                <span className="voice-dot" />
                <span className="voice-bar-text">
                  <strong>
                    Voice Connected <Elapsed since={session.startedAt} className="voice-bar-time" />
                  </strong>
                  <span>{session.title}</span>
                </span>
              </button>
              <button className="voice-bar-leave" onClick={hangUp} aria-label="Disconnect" title="Disconnect">
                <HangUpIcon size={22} />
              </button>
            </div>
          )}

          <div className="user-panel">
            {session ? <SelfAvatar name={name} /> : <span className="mini-avatar">{name.charAt(0).toUpperCase()}</span>}
            <div className="user-info">
              <span className="user-name">{name}</span>
              <button className="link-btn" onClick={changeName}>
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
          {mainView === "home" && (
            <Home
              name={name}
              occupancy={occupancy}
              joining={joining}
              currentKey={session?.key ?? null}
              myCode={myCode}
              myRoomChecked={myRoomChecked}
              creating={creating}
              inviteCode={inviteCode}
              onJoin={join}
              onCreate={createRoom}
              onCopyCode={copyCode}
              onShare={shareRoom}
              onBadCode={() => setError("Room codes have 6 letters and numbers, like K7P-4QX.")}
              onOpenSettings={() => setSettingsOpen(true)}
              onChangeName={changeName}
            />
          )}

          {mainView === "chats" && <ChatList onOpen={openText} />}

          {mainView === "text" && (
            <TextChat
              key={textChannel}
              channel={activeText}
              userName={name}
              onBack={() => setMainView("chats")}
              onError={setError}
            />
          )}

          {/* The call stays mounted (and audible) while you look at other screens */}
          {session && (
            <div className="voice-wrap" hidden={mainView !== "call"}>
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
                onShowChannels={() => setMainView("home")}
                startedAt={session.startedAt}
                roomCode={session.kind === "room" ? session.key : undefined}
                onCopyCode={() => copyCode(session.key)}
                onInvite={session.kind === "room" ? () => shareRoom(session.key) : undefined}
              />
            </div>
          )}
          {mainView === "call" && !session && (
            <div className="empty-state">
              <h2>{joining ? "Connecting…" : "Not in a call"}</h2>
            </div>
          )}

          {/* Phones: "you're still in a call" bar above the tabs */}
          {session && mainView !== "call" && mainView !== "text" && (
            <div className="call-pill">
              <button className="call-pill-main" onClick={showCall}>
                <span className="voice-dot" />
                <span className="call-pill-text">
                  <strong>{session.title}</strong>
                  <Elapsed since={session.startedAt} className="tabular" />
                </span>
                <span className="call-pill-open">
                  Return <ChevronIcon size={16} />
                </span>
              </button>
              <button className="call-pill-leave" onClick={hangUp} aria-label="Leave call">
                <HangUpIcon size={22} />
              </button>
            </div>
          )}

          {/* Phones: bottom tabs on the two top-level screens */}
          {(mainView === "home" || mainView === "chats") && (
            <nav className="tabbar">
              <button className={mainView === "home" ? "active" : ""} onClick={() => setMainView("home")}>
                <CallIcon size={22} />
                <span>Calls</span>
              </button>
              <button className={mainView === "chats" ? "active" : ""} onClick={() => setMainView("chats")}>
                <ChatIcon size={22} />
                <span>Chat</span>
              </button>
            </nav>
          )}
        </main>

        {/* In a call, the call renders its own settings (it knows about noise cancellation and the mic meter) */}
        {settingsOpen && !session && <LobbySettingsSheet onClose={() => setSettingsOpen(false)} />}
      </div>
    </RoomContext.Provider>
  );
}

/** Phones: the "Chat" tab, a list of text channels. */
function ChatList({ onOpen }: { onOpen: (id: TextChannelId) => void }) {
  return (
    <div className="home">
      <header className="home-top">
        <span className="brand-logo">
          <ChatIcon size={18} />
        </span>
        <h1>Chat</h1>
      </header>
      <div className="home-body">
        <div className="home-inner">
          <div className="channel-cards">
            {TEXT_CHANNELS.map((c) => (
              <button key={c.id} className="call-row" onClick={() => onOpen(c.id)}>
                <span className="icon-badge">
                  <HashIcon size={20} />
                </span>
                <span className="call-row-text">
                  <strong>{c.name}</strong>
                  <span className="muted">Text channel</span>
                </span>
                <ChevronIcon size={18} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A personal room in the sidebar: join on click, copy-code button on the right, members below. */
function RoomEntry({
  label,
  code,
  members,
  active,
  joining,
  deafened,
  onJoin,
  onCopy,
}: {
  label: string;
  code: string;
  members: Member[];
  active: boolean;
  joining: string | null;
  deafened: boolean;
  onJoin: () => void;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="channel-row">
        <button
          className={`channel ${active ? "active" : ""}`}
          onClick={onJoin}
          disabled={joining !== null && joining !== code}
        >
          <span className="channel-icon">
            <HomeIcon size={18} />
          </span>
          <span className="channel-name">
            {label} <span className="channel-sub">{formatCode(code)}</span>
          </span>
          <span className="channel-count">{joining === code ? "…" : members.length > 0 && members.length}</span>
        </button>
        <button className="channel-share" onClick={onCopy} aria-label="Copy room code" title="Copy room code">
          <CopyIcon size={16} />
        </button>
      </div>
      {active ? <LiveMemberList fallback={members} selfDeafened={deafened} /> : <MemberList members={members} />}
    </div>
  );
}
