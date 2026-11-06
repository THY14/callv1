"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { MAX_MESSAGE_LENGTH } from "@/lib/channels";
import { getSupabase, type ChatMessage } from "@/lib/supabase";
import { getAuthorKey, getAuthorToken } from "@/lib/author";
import { ChevronIcon, HashIcon, SendIcon } from "@/components/Icons";

const PAGE_SIZE = 50;
const GROUP_WINDOW_MS = 5 * 60 * 1000; // same author within 5 min = one block, like Discord
const TYPING_SEND_EVERY_MS = 3000; // how often we tell others "still typing"
const TYPING_SHOW_FOR_MS = 5000; // how long we show someone typing after their last signal

type Props = {
  channel: { id: string; name: string };
  userName: string;
  onBack: () => void;
  onError: (msg: string) => void;
};

type Typer = { name: string; until: number };

// Identifies this tab in typing signals (not secret)
const tabId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());

const isTouch = () => window.matchMedia("(pointer: coarse)").matches;

export default function TextChat({ channel, userName, onBack, onError }: Props) {
  const supabase = getSupabase();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [myKey, setMyKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null); // tapped message (phones)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [typers, setTypers] = useState<Record<string, Typer>>({});
  const [live, setLive] = useState(false); // realtime connection is up

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const restoreFromHeight = useRef<number | null>(null);
  const realtimeRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    getAuthorKey().then(setMyKey).catch(() => setMyKey(null));
  }, []);

  // Merge by id so realtime + fetch + our own send never duplicate a message
  const addMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) => a.id - b.id);
    });
  }, []);

  const removeMessage = useCallback((id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // Load latest messages + subscribe to new/edited/deleted messages and typing signals
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
    const filter = `channel=eq.${channel.id}`;
    const sub = supabase
      .channel(`messages:${channel.id}`, { config: { broadcast: { self: false } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, (payload) => {
        const m = payload.new as ChatMessage;
        addMessages([m]);
        // They sent it, so they've stopped typing
        setTypers((prev) => {
          const next = { ...prev };
          for (const [id, t] of Object.entries(next)) if (t.name === m.author) delete next[id];
          return next;
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, (payload) =>
        addMessages([payload.new as ChatMessage]),
      )
      // Supabase can't filter DELETE events by channel; we just drop the id if we have it
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const id = (payload.old as { id?: number }).id;
        if (typeof id === "number") removeMessage(id);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { tabId: from, name, stop } = payload as { tabId: string; name: string; stop?: boolean };
        if (typeof from !== "string" || typeof name !== "string") return;
        setTypers((prev) => {
          const next = { ...prev };
          if (stop) delete next[from];
          else next[from] = { name: name.slice(0, 32), until: Date.now() + TYPING_SHOW_FOR_MS };
          return next;
        });
      })
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
        // After a reconnect (e.g. phone was asleep), catch up on anything missed
        if (status === "SUBSCRIBED") loadLatest();
      });
    realtimeRef.current = sub;

    return () => {
      cancelled = true;
      realtimeRef.current = null;
      supabase.removeChannel(sub);
    };
    // onError is stable (state setter from the parent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, channel.id, addMessages, removeMessage]);

  // iPhones freeze the live connection when you switch apps or lock the screen, and the page
  // can't tell until the next heartbeat (up to ~25s+). When the page comes back, probe right away:
  // two heartbeats a moment apart; if the first got no answer, the second forces a reconnect.
  useEffect(() => {
    if (!supabase) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const rt = supabase.realtime;
      if (!rt.isConnected()) {
        rt.connect();
        return;
      }
      rt.sendHeartbeat();
      clearTimeout(timer);
      timer = setTimeout(() => rt.sendHeartbeat(), 2500);
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("online", check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("online", check);
    };
  }, [supabase]);

  // Expire typing indicators of people who went quiet
  useEffect(() => {
    if (Object.keys(typers).length === 0) return;
    const t = setInterval(() => {
      const now = Date.now();
      setTypers((prev) => {
        const live = Object.entries(prev).filter(([, v]) => v.until > now);
        return live.length === Object.keys(prev).length ? prev : Object.fromEntries(live);
      });
    }, 1000);
    return () => clearInterval(t);
  }, [typers]);

  const sendTyping = (stop = false) => {
    const ch = realtimeRef.current;
    if (!ch || !live) return; // not connected: skip (typing signals are throwaway anyway)
    const now = Date.now();
    if (!stop && now - lastTypingSent.current < TYPING_SEND_EVERY_MS) return;
    lastTypingSent.current = stop ? 0 : now;
    ch.send({ type: "broadcast", event: "typing", payload: { tabId, name: userName, stop } });
  };

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

  /** Calls /api/messages; returns the JSON or throws with the server's error text. */
  const api = async (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => {
    const res = await fetch("/api/messages", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, authorToken: getAuthorToken() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const data = await api("POST", { channel: channel.id, name: userName, content });
      stickToBottom.current = true;
      addMessages([data.message]);
      setDraft("");
      sendTyping(true);
      if (inputRef.current) inputRef.current.style.height = "";
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to send"); // draft is kept so nothing is lost
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const saveEdit = async (m: ChatMessage, content: string) => {
    const trimmed = content.trim();
    if (!trimmed || trimmed === m.content) return setEditingId(null);
    try {
      const data = await api("PATCH", { id: m.id, content: trimmed });
      addMessages([data.message]);
      setEditingId(null);
      setSelectedId(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to edit");
    }
  };

  const deleteMessage = async (m: ChatMessage) => {
    // First click arms it, second click (within 3s) deletes. No popup needed.
    if (confirmDeleteId !== m.id) {
      setConfirmDeleteId(m.id);
      setTimeout(() => setConfirmDeleteId((cur) => (cur === m.id ? null : cur)), 3000);
      return;
    }
    try {
      await api("DELETE", { id: m.id });
      removeMessage(m.id);
      setConfirmDeleteId(null);
      setSelectedId(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: don't send while a Khmer (or other IME) word is still being composed.
    // On touch screens Enter makes a new line; the send button sends.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isTouch()) {
      e.preventDefault();
      send();
    }
    // Discord shortcut: ↑ in an empty box edits your last message
    if (e.key === "ArrowUp" && !draft && myKey) {
      const mine = [...messages].reverse().find((m) => m.author_key === myKey);
      if (mine) {
        e.preventDefault();
        setEditingId(mine.id);
      }
    }
  };

  const typingNames = [...new Set(Object.values(typers).map((t) => t.name))];
  const typingText =
    typingNames.length === 0
      ? ""
      : typingNames.length === 1
        ? `${typingNames[0]} is typing…`
        : typingNames.length === 2
          ? `${typingNames[0]} and ${typingNames[1]} are typing…`
          : "Several people are typing…";

  return (
    <div className="chat">
      <header className="room-header">
        <button className="back-btn mobile-only" onClick={onBack} aria-label="Back">
          <ChevronIcon size={22} />
        </button>
        <span className="header-icon desktop-only">
          <HashIcon size={20} />
        </span>
        <div className="room-title">
          <h2>{channel.name}</h2>
          {supabase && !live && !loading && <span className="status warn">Connecting…</span>}
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
                <h3>Welcome to #{channel.name}!</h3>
                <p>This is the start of the #{channel.name} channel.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <MessageRow
                key={m.id}
                message={m}
                prev={messages[i - 1]}
                mine={!!myKey && m.author_key === myKey}
                selected={selectedId === m.id}
                editing={editingId === m.id}
                confirmingDelete={confirmDeleteId === m.id}
                onSelect={() => setSelectedId((cur) => (cur === m.id ? null : m.id))}
                onEdit={() => setEditingId(m.id)}
                onDelete={() => deleteMessage(m)}
                onSaveEdit={(content) => saveEdit(m, content)}
                onCancelEdit={() => setEditingId(null)}
              />
            ))}
          </>
        )}
      </div>

      <div className="typing" aria-live="polite">
        {typingText && (
          <>
            <span className="typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="typing-text">{typingText}</span>
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
            if (e.target.value.trim()) sendTyping();
            else sendTyping(true); // cleared the box
          }}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="send-btn" disabled={!draft.trim() || sending} aria-label="Send">
          <SendIcon size={20} />
        </button>
      </form>
    </div>
  );
}

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}

type RowProps = {
  message: ChatMessage;
  prev?: ChatMessage;
  mine: boolean;
  selected: boolean;
  editing: boolean;
  confirmingDelete: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaveEdit: (content: string) => void;
  onCancelEdit: () => void;
};

function MessageRow({
  message: m,
  prev,
  mine,
  selected,
  editing,
  confirmingDelete,
  onSelect,
  onEdit,
  onDelete,
  onSaveEdit,
  onCancelEdit,
}: RowProps) {
  const date = new Date(m.created_at);
  const prevDate = prev ? new Date(prev.created_at) : null;
  const newDay = !prevDate || prevDate.toDateString() !== date.toDateString();
  const grouped =
    !!prev && !newDay && prev.author === m.author && date.getTime() - prevDate!.getTime() < GROUP_WINDOW_MS;
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const content = editing ? (
    <EditBox initial={m.content} onSave={onSaveEdit} onCancel={onCancelEdit} />
  ) : (
    <div className="msg-content">
      {linkify(m.content)}
      {m.edited_at && (
        <span className="msg-edited" title={new Date(m.edited_at).toLocaleString()}>
          {" "}
          (edited)
        </span>
      )}
    </div>
  );

  // Phones: tap your own message to show its buttons. Desktop: hover shows them.
  const rowProps = {
    className: `msg ${grouped ? "grouped" : ""} ${mine ? "mine" : ""} ${selected ? "selected" : ""}`,
    onClick: mine && !editing ? onSelect : undefined,
  };

  return (
    <Fragment>
      {newDay && (
        <div className="day-divider">
          <span>{formatDay(date)}</span>
        </div>
      )}
      <div {...rowProps}>
        {grouped ? (
          <>
            <span className="msg-side-time">{time}</span>
            {content}
          </>
        ) : (
          <>
            <span className="msg-avatar" style={{ background: colorFor(m.author) }}>
              {m.author.charAt(0).toUpperCase()}
            </span>
            <div className="msg-body">
              <div className="msg-head">
                <span className="msg-author">{m.author}</span>
                <span className="msg-time">{time}</span>
              </div>
              {content}
            </div>
          </>
        )}

        {mine && !editing && (
          <div className="msg-actions" onClick={(e) => e.stopPropagation()}>
            <button onClick={onEdit} title="Edit" aria-label="Edit message">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </button>
            <button
              onClick={onDelete}
              className={`danger ${confirmingDelete ? "confirm" : ""}`}
              title={confirmingDelete ? "Click again to delete" : "Delete"}
              aria-label={confirmingDelete ? "Confirm delete" : "Delete message"}
            >
              {confirmingDelete ? (
                <span className="confirm-text">Delete?</span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </Fragment>
  );
}

function EditBox({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length); // cursor at the end
    autoGrow(el);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isTouch()) {
      e.preventDefault();
      onSave(value);
    }
  };

  return (
    <div className="edit-box" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        maxLength={MAX_MESSAGE_LENGTH}
        onChange={(e) => {
          setValue(e.target.value);
          autoGrow(e.target);
        }}
        onKeyDown={onKeyDown}
      />
      <div className="edit-actions">
        <span className="edit-hint">Enter to save, Esc to cancel</span>
        <button type="button" className="edit-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary edit-save" onClick={() => onSave(value)} disabled={!value.trim()}>
          Save
        </button>
      </div>
    </div>
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
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        {part}
      </a>
    ) : (
      part
    ),
  );
}

// Same name -> same avatar tone, so people are easy to tell apart (warm greys from globals.css)
const AVATAR_COLORS = ["var(--avatar-1)", "var(--avatar-2)", "var(--avatar-3)", "var(--avatar-4)"];
function colorFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
