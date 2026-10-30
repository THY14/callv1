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
- 3 voice channels (edit them in `lib/channels.ts`)
- Sidebar shows who is in each channel, live
- Speaking indicator (green ring), mute, deafen, leave
- 10-person cap per channel (enforced by the server)
- Echo cancellation + noise suppression + auto gain

## Files
- `app/page.tsx`: layout, name screen, channel sidebar
- `components/VoiceRoom.tsx`: the call (participants, controls, audio)
- `app/api/token/route.ts`: issues LiveKit join tokens and enforces the room limit
- `app/api/rooms/route.ts`: lists who is in each channel

## Deploying
The GitHub repo is connected to Vercel. Every push to `main` deploys to https://call.muymethy.tech automatically:
```
git add .
git commit -m "what I changed"
git push
```
Pushes to other branches get their own preview URL, so you can test changes before merging into `main`.
LiveKit keys for the live site are set in Vercel → Project → Settings → Environment Variables (not in git).
