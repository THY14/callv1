# Voice Community

Discord-style voice channels in the browser, up to 10 people per channel. Built with Next.js + LiveKit.

## Run it

1. **Get a LiveKit server** (pick one):
   - **LiveKit Cloud (easiest, free tier):** sign up at https://cloud.livekit.io, create a project, go to Settings → Keys, and put the values in `.env.local`:
     ```
     LIVEKIT_URL=wss://your-project.livekit.cloud
     LIVEKIT_API_KEY=...
     LIVEKIT_API_SECRET=...
     ```
   - **Local dev server:** download `livekit-server` for Windows from https://github.com/livekit/livekit/releases and run `livekit-server --dev`. The default `.env.local` already points at it.

2. **Start the website:**
   ```
   npm install
   npm run dev
   ```
3. Open http://localhost:3000, pick a name, click a voice channel. Open more tabs (or other devices) to test with several people.

> Microphone access needs `localhost` or HTTPS. To test with friends on other networks, use LiveKit Cloud and deploy the site (e.g. Vercel), or tunnel it with something like ngrok.

## Features
- **Rooms:** press "Create room" to get your own room with a 6-character code, like `K7P-4QX` (one room per
  person/browser). Tap the code to copy it, or copy the invite link (`/?room=K7P4QX`). Anyone with the code or link
  can join, whether or not you're in. No time limit. Rooms are stored in Supabase (`rooms` table in `supabase/schema.sql`).
- Call timer in the call header, the "Voice Connected" bar, and on every active channel/room card
- 3 voice channels (edit them in `lib/channels.ts`)
- Sidebar shows who is in each channel, live
- Speaking indicator (green ring) in the call and in the sidebar, mute, deafen, leave
- Discord-style bottom-left panel: mute / deafen / settings work anywhere, even before joining
- Everyone can see who is muted or deafened (sidebar + call tiles)
- Join/leave and mute/deafen sounds (can be turned off in settings)
- Shortcuts: Ctrl+Shift+M mute, Ctrl+Shift+D deafen
- 10-person cap per channel (enforced by the server)
- Echo cancellation + noise suppression + auto gain

## Files
- `app/page.tsx`: layout, name screen, desktop sidebar, phone tabs (Calls / Chat)
- `components/Home.tsx`: the Calls home screen (create room, join with code, channels)
- `components/Elapsed.tsx`: the live call timer
- `components/VoiceRoom.tsx`: the call (participants, controls, audio)
- `app/api/token/route.ts`: issues LiveKit join tokens and enforces the room limit
- `app/api/rooms/route.ts`: lists who is in each channel (with muted/deafened)
- `app/api/voice-state/route.ts`: tells the call you deafened (checked against your join token)
- `app/api/my-room/route.ts` + `lib/room-codes.ts`: create/look up your room (Supabase `rooms` table)
- `lib/rooms.ts`: room code format (no 0/O/1/I/L so codes are easy to read out)
- `components/VoiceMembers.tsx`: sidebar member lists with live speaking rings
- `lib/sounds.ts`: the join/leave/mute chimes (generated in the browser, no audio files)

## Deploying
The GitHub repo is connected to Vercel. Every push to `main` deploys to https://call.muymethy.tech automatically:
```
git add .
git commit -m "what I changed"
git push
```
Pushes to other branches get their own preview URL, so you can test changes before merging into `main`.
LiveKit keys for the live site are set in Vercel → Project → Settings → Environment Variables (not in git).
