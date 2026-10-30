"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH } from "@/lib/channels";
import { getSupabase, type ChatMessage } from "@/lib/supabase";

const PAGE_SIZE = 50;
const GROUP_WINDOW_MS = 5 * 60 * 1000; // same author within 5 min = one block, like Discord

type Props = {
  channel: { id: string; name: string };
  userName: string;
  onBack: () => void;
  onError: (msg: string) => void;
};

export default function TextChat({ channel, userName, onBack, onError }: Props) {
  const supabase = getSupabase();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const restoreFromHeight = useRef<number | null>(null);

  // Merge by id so realtime + fetch + our own send never duplicate a message
  const addMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) => a.id - b.id);
    });
  }, []);

  // Load latest messages + subscribe to new ones
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    const loadLatest = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("channel", channel.id)
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);
      if (cancelled) return;
      if (error) onError("Could not load messages.");
      else {
        addMessages(data.reverse());
        setHasMore((prev) => prev || data.length === PAGE_SIZE);
      }
      setLoading(false);
    };

    loadLatest();
    const sub = supabase
      .channel(`messages:${channel.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel=eq.${channel.id}` },
        (payload) => addMessages([payload.new as ChatMessage]),
      )
      .subscribe((status) => {
        // After a reconnect (e.g. phone was asleep), catch up on anything missed
        if (status === "SUBSCRIBED") loadLatest();
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(sub);
    };
    // onError is stable (state setter from the parent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, channel.id, addMessages]);

  // Keep scroll position sensible as messages change
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (restoreFromHeight.current !== null) {
      // Older messages were added on top: keep what the user was looking at in place
      el.scrollTop += el.scrollHeight - restoreFromHeight.current;
      restoreFromHeight.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!supabase || !oldest) return;
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("channel", channel.id)
      .lt("id", oldest.id)
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);
    if (error) return onError("Could not load older messages.");
    restoreFromHeight.current = listRef.current?.scrollHeight ?? null;
    addMessages(data.reverse());
    setHasMore(data.length === PAGE_SIZE);
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: channel.id, name: userName, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      stickToBottom.current = true;
      addMessages([data.message]);
      setDraft("");
      if (inputRef.current) inputRef.current.style.height = "";
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to send"); // draft is kept so nothing is lost
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: don't send while a Khmer (or other IME) word is still being composed.
    // On touch screens Enter makes a new line; the send button sends.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !touch) {
      e.preventDefault();
      send();
    }
  };

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="chat">
      <header className="room-header">
        <button className="back-btn mobile-only" onClick={onBack} aria-label="Show channels">
          ‹
        </button>
        <span className="hash">#</span>
        <div className="room-title">
          <h2>{channel.name}</h2>
        </div>
      </header>

      <div className="chat-list" ref={listRef} onScroll={onScroll}>
        {!supabase ? (
          <div className="chat-empty">
            <h3>Text chat isn&apos;t set up yet</h3>
            <p>Add the Supabase keys to the environment variables to enable it.</p>
          </div>
        ) : loading ? (
          <div className="chat-empty">
            <p>Loading messages…</p>
          </div>
        ) : (
          <>
            {hasMore ? (
              <button className="load-older" onClick={loadOlder}>
                Load older messages
              </button>
            ) : (
              <div className="chat-welcome">
                <div className="chat-welcome-icon">#</div>
                <h3>Welcome to #{channel.name}!</h3>
                <p>This is the start of the #{channel.name} channel.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <MessageRow key={m.id} message={m} prev={messages[i - 1]} />
            ))}
          </>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={`Message #${channel.name}`}
          disabled={!supabase}
          enterKeyHint="send"
          onChange={(e) => {
            setDraft(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="send-btn" disabled={!draft.trim() || sending} aria-label="Send">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3.4 20.4 21 12 3.4 3.6l-.01 6.53L15 12 3.39 13.87z" />
          </svg>
        </button>
      </form>
    </div>
  );
}

function MessageRow({ message: m, prev }: { message: ChatMessage; prev?: ChatMessage }) {
  const date = new Date(m.created_at);
  const prevDate = prev ? new Date(prev.created_at) : null;
  const newDay = !prevDate || prevDate.toDateString() !== date.toDateString();
  const grouped =
    !!prev && !newDay && prev.author === m.author && date.getTime() - prevDate!.getTime() < GROUP_WINDOW_MS;
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <Fragment>
      {newDay && (
        <div className="day-divider">
          <span>{formatDay(date)}</span>
        </div>
      )}
      {grouped ? (
        <div className="msg grouped">
          <span className="msg-side-time">{time}</span>
          <div className="msg-content">{linkify(m.content)}</div>
        </div>
      ) : (
        <div className="msg">
          <span className="msg-avatar" style={{ background: colorFor(m.author) }}>
            {m.author.charAt(0).toUpperCase()}
          </span>
          <div className="msg-body">
            <div className="msg-head">
              <span className="msg-author">{m.author}</span>
              <span className="msg-time">{time}</span>
            </div>
            <div className="msg-content">{linkify(m.content)}</div>
          </div>
        </div>
      )}
    </Fragment>
  );
}

function formatDay(d: Date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}

// Only http(s) links become clickable, so "javascript:" tricks can't sneak in
const URL_RE = /(https?:\/\/[^\s<]+)/g;
function linkify(text: string) {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

// Same name -> same avatar colour, so people are easy to tell apart
const AVATAR_COLORS = ["#5865f2", "#3ba55c", "#faa61a", "#ed4245", "#eb459e", "#00a8fc", "#9b59b6", "#1abc9c"];
function colorFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
