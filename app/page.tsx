"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CHANNELS,
  MAX_PARTICIPANTS,
  TEXT_CHANNELS,
  type ChannelId,
  type TextChannelId,
} from "@/lib/channels";
import VoiceRoom from "@/components/VoiceRoom";
import TextChat from "@/components/TextChat";
import { DeviceIcon } from "@/components/Icons";
import { detectDevice } from "@/lib/device";

type Occupancy = Record<string, { identity: string; name: string; device: string }[]>;
type Session = { channel: ChannelId; token: string; url: string };
/** What the main area shows: a text channel, or the voice call. */
type MainView = "text" | "voice";
/** Which panel is shown on phones (desktop always shows both). */
type MobileView = "channels" | "main";

export default function Home() {
  const [name, setName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [joining, setJoining] = useState<ChannelId | null>(null);
  const [error, setError] = useState("");
  const [occupancy, setOccupancy] = useState<Occupancy>({});
  const [mainView, setMainView] = useState<MainView>("text");
  const [textChannel, setTextChannel] = useState<TextChannelId>("general");
  const [mobileView, setMobileView] = useState<MobileView>("channels");

  useEffect(() => {
    const saved = localStorage.getItem("displayName");
    if (saved) setName(saved);
  }, []);

  const refreshOccupancy = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms", { cache: "no-store" });
      if (res.ok) setOccupancy(await res.json());
    } catch {}
  }, []);

  // Poll who is in each channel so the sidebar stays live
  useEffect(() => {
    refreshOccupancy();
    const t = setInterval(refreshOccupancy, 4000);
    return () => clearInterval(t);
  }, [refreshOccupancy]);

  // Auto-hide errors after a few seconds
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 6000);
    return () => clearTimeout(t);
  }, [error]);

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

  const join = async (channel: ChannelId) => {
    if (session?.channel === channel) {
      showVoice(); // already in it, just show the call
      return;
    }
    if (joining) return;
    setError("");
    setJoining(channel);
    setSession(null); // leave current channel first
    showVoice();
    try {
      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: channel, name, device: detectDevice() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to join");
      setSession({ channel, token: data.token, url: data.url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join");
      setMainView("text");
      setMobileView("channels");
    } finally {
      setJoining(null);
      setTimeout(refreshOccupancy, 1000);
    }
  };

  const leave = useCallback(() => {
    setSession(null);
    setMainView("text");
    setMobileView("channels");
    setTimeout(refreshOccupancy, 500);
  }, [refreshOccupancy]);

  if (!name) {
    return (
      <div className="name-screen">
        <form className="name-card" onSubmit={saveName}>
          <div className="name-logo">🎧</div>
          <h1>Welcome!</h1>
          <p>Pick a display name to chat and join the voice channels.</p>
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

  const activeChannel = CHANNELS.find((c) => c.id === session?.channel);
  const activeText = TEXT_CHANNELS.find((c) => c.id === textChannel)!;

  return (
    <div className="app" data-mobile-view={mobileView} data-main-view={mainView}>
      {error && (
        <button className="toast" onClick={() => setError("")}>
          {error} <span className="toast-close">✕</span>
        </button>
      )}

      <aside className="sidebar">
        <div className="server-name">My Community</div>
        <div className="channel-list">
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

          <div className="section-label">VOICE CHANNELS</div>
          {CHANNELS.map((c) => {
            const members = occupancy[c.id] ?? [];
            const full = members.length >= MAX_PARTICIPANTS && session?.channel !== c.id;
            return (
              <div key={c.id}>
                <button
                  className={`channel ${session?.channel === c.id ? "active" : ""}`}
                  onClick={() => join(c.id)}
                  disabled={full || (joining !== null && joining !== c.id)}
                  title={full ? "Channel is full" : `Join ${c.name}`}
                >
                  <span className="channel-icon">🔊</span>
                  <span className="channel-name">{c.name}</span>
                  <span className={`channel-count ${full ? "full" : ""}`}>
                    {joining === c.id ? "…" : `${members.length}/${MAX_PARTICIPANTS}`}
                  </span>
                </button>
                <ul className="channel-members">
                  {members.map((m) => (
                    <li key={m.identity}>
                      <span className="mini-avatar">{m.name.charAt(0).toUpperCase()}</span>
                      <span className="member-name">{m.name}</span>
                      <DeviceIcon device={m.device} size={13} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Shows you're still in a call while looking at something else */}
        {activeChannel && (
          <button className="voice-bar" onClick={showVoice}>
            <span className="voice-dot" />
            <span className="voice-bar-text">
              <strong>Voice Connected</strong>
              <span>{activeChannel.name}</span>
            </span>
            <span className="voice-bar-open">Open ›</span>
          </button>
        )}

        <div className="user-panel">
          <span className="mini-avatar">{name.charAt(0).toUpperCase()}</span>
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
            change
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
        {session && activeChannel && (
          <div className="voice-wrap" hidden={mainView !== "voice"}>
            <VoiceRoom
              key={session.channel}
              serverUrl={session.url}
              token={session.token}
              channelName={activeChannel.name}
              onLeave={leave}
              onError={setError}
              onShowChannels={() => setMobileView("channels")}
            />
          </div>
        )}

        {mainView === "voice" && !session && (
          <div className="empty-state">
            <h2>{joining ? "Connecting…" : "Pick a voice channel"}</h2>
            <p>Click a channel on the left to hop in. Up to {MAX_PARTICIPANTS} people per channel.</p>
            <button className="back-link mobile-only" onClick={() => setMobileView("channels")}>
              ‹ Back to channels
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
