# Goobert VoIP
A free-to-start browser voice calling app. Static frontend deploys with Vercel Drop; Supabase provides email/password auth, profiles, database and realtime signaling; WebRTC carries audio peer-to-peer.

## Deploy
1. The Goobert project URL and public publishable key are already configured in `app.js`.
2. The Supabase database schema must already be installed by running `setup.sql` once in Supabase SQL Editor.
3. Deploy the contents of this folder with https://vercel.com/drop.
4. Open the deployed HTTPS website. Users can create accounts with an email address and password; the username is optional and Goobert generates one if omitted.
5. If Supabase email confirmation is enabled, new users must confirm their email before logging in. This setting is controlled in Supabase Authentication settings.
6. Have another person open the same website, create an account, search your username and press Call. Both people must allow microphone access.

The publishable key is intended for browser use. Never put a Supabase `service_role` or secret key in this website. Row Level Security policies in `setup.sql` protect database access.

## Free service links
- Vercel Drop: https://vercel.com/drop
- Supabase dashboard: https://supabase.com/dashboard
- Supabase docs: https://supabase.com/docs
- WebRTC overview: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API

## Important limitations
- This is a working starter, not a production-grade phone network. It calls other Goobert VoIP accounts, not ordinary telephone numbers.
- The app uses public STUN servers. Some networks and restrictive NAT/firewall setups require a TURN relay; a dependable TURN service may cost money. Calls may fail on those networks.
- Browser microphone access requires HTTPS (Vercel provides HTTPS) or localhost.
- Supabase Free currently has quotas and may pause inactive projects. Check its current plan limits: https://supabase.com/pricing
- The app's client key is designed to be public. Database Row Level Security policies in `setup.sql` protect rows; do not add a service-role key to the website.
- For real public deployment, add stronger abuse prevention, call expiry/cleanup, TURN, account verification and security review. Do not use this starter for emergency calls.

## Troubleshooting
- **Profile not found:** check that `setup.sql` ran successfully before signing up. If you created accounts before running the SQL, delete and recreate those test accounts, or create their matching `profiles` rows in the SQL editor.
- **Email confirmation:** check the inbox and spam folder. You can adjust confirmation settings in Supabase Authentication settings while testing.
- **No microphone:** use Chrome/Edge on HTTPS and allow microphone permission for the site.
- **Call rings but won't connect:** try both users on different networks. Some networks require a TURN server; the included free STUN servers cannot relay media.

## Updated visual design
The interface has been redesigned with a neon purple/blue Goobert theme, responsive sidebar, friends/search panel, call stage, quick actions, account area, and a bundled Goobert mascot image (`goobert-mascot.png`). The existing account and WebRTC signaling code is retained.

## Easier account setup
The username field is optional now. If a new user leaves it blank, Goobert creates a unique username from their email prefix plus a short number. They can share that username with friends to be found in search. The password field includes a Show/Hide control. Email confirmation behavior is still controlled by your Supabase Auth settings.


## Connection reliability and TURN
The app now supports optional TURN credentials. STUN-only WebRTC can still fail behind symmetric NATs, strict firewalls, VPNs, or carrier networks. In **Quick Actions -> Account settings**, paste the TURN URLs, username, and credential from a TURN provider. Credentials are saved only in that browser's local storage. Never paste a service secret or server API key here. Metered documents a free Open Relay allowance (20 GB/month) and no-credit-card free tier; check current terms before use: https://www.metered.ca/tools/openrelay/webrtc-signaling-server/

## Communities, text channels, and group voice
Run `communities.sql` once in Supabase SQL Editor. This creates:
- Communities (servers) with invite codes.
- Memberships and owner/admin roles.
- Text and voice channels.
- Persistent text messages.
- A join-by-invite database function.

Group voice uses a browser WebRTC mesh and Supabase Realtime presence/broadcast. It is intended for small groups (about 2–4 people); mesh bandwidth and CPU use rise quickly as participants increase. Larger Discord-style voice rooms should use an SFU service such as LiveKit or Cloudflare Realtime. Do not expose provider secret keys in browser code.


## Calling reliability / free TURN relay
If the app shows **Connection failed**, the two devices may be behind NATs/firewalls that block direct peer-to-peer media. STUN alone cannot solve every network. Open Quick Actions -> Account settings -> Configure free TURN relay, then paste the TURN URL(s), username, and credential issued by a TURN provider. These values are stored only in that browser's local storage. Never put a provider API secret or service-role key into frontend code.
- Metered Open Relay advertises a free no-credit-card tier with a 20 GB/month TURN relay allowance. Check the current terms and obtain your own credentials here: https://www.metered.ca/tools/openrelay/webrtc-signaling-server/
- After saving TURN credentials, reload Goobert VoIP and try again.

## Goobert communities
Run `communities.sql` once in Supabase SQL Editor. It adds community servers, invite codes, memberships, text channels, persistent group messages, voice channels, and secure create/join functions. Owners can create channels and delete their community; members can leave.
- Group voice currently uses a small WebRTC mesh and is limited to 4 participants per room. It is suitable for small groups, not large public Discord-sized rooms.
- For larger voice rooms, an SFU service is the right architecture. LiveKit's free Build plan currently lists 5,000 WebRTC participant minutes and 100 concurrent participants, subject to plan limits and usage caps: https://livekit.com/pricing

## Account recovery and deletion
- Login has a **Forgot password?** flow using Supabase Auth email reset. Add your deployed Vercel URL to Supabase Authentication -> URL Configuration -> Redirect URLs.
- Run `account-recovery.sql` once in Supabase SQL Editor to enable **Delete my account**. It deletes the signed-in user's profile, call records, ICE candidates, and auth account. This is permanent.


## Free TURN relay setup (for networks that block direct WebRTC)
1. Create a free account at https://www.metered.ca/tools/openrelay/ and create a TURN credential.
2. In the Metered dashboard, open TURN Server → Credentials → Get credential → Show API Key. Copy the TURN credential API key (not the account Secret Key).
3. Copy your Metered app domain from Developers (it ends in `.metered.live`).
4. In Goobert, open Quick Actions → Account settings → option 1. Enter the domain and TURN credential API key. Goobert fetches and saves the full ICE server list in that browser.
5. Wait up to 2 minutes after creating a new credential, reload Goobert, and retry the call. See https://www.metered.ca/docs/turn-server-service/creating-turn-credentials/ and https://www.metered.ca/docs/turn-server-service/quickstart/.

The TURN API key is scoped to one TURN credential; never put the Metered account Secret Key in the browser. Each user/browser needs this one-time setup unless a server-side credential endpoint is added. TURN usage is subject to the provider's free-tier limits.


## LiveKit voice relay setup (required for hosted audio)
The app now uses LiveKit Cloud for both direct calls and community voice channels. This replaces the browser-to-browser mesh for audio. Keep the API secret on Vercel only.

1. Create a project at https://cloud.livekit.io/ (the Build plan currently includes 5,000 WebRTC participant minutes and 100 concurrent connections; check the pricing page for current limits).
2. In the LiveKit project, open **Settings → Keys**. Copy the API key and API secret. Also copy the project's WebSocket URL (starts with `wss://`).
3. In Vercel, open the existing `goobert-voip-7` project → **Settings → Environment Variables**. Add these three variables for **Production** (and Preview if you use previews):
   - `LIVEKIT_URL` = your project's `wss://...` URL
   - `LIVEKIT_API_KEY` = your LiveKit API key
   - `LIVEKIT_API_SECRET` = your LiveKit API secret
4. Save the variables. Deploy the updated project files so Vercel installs `livekit-server-sdk` and creates `/api/livekit-token`.
5. Test with two Goobert accounts in two browser windows/devices. Accept the call and allow microphone access.

The API secret is never placed in browser JavaScript. The token endpoint checks the user's Supabase login before issuing a short-lived, room-limited LiveKit token. Do not paste the API secret into chat or into `app.js`.

The LiveKit change affects both direct calls and community voice channels. Existing Supabase accounts, profiles, messages, servers and channels remain in place. Existing calls/ICE tables are retained for compatibility; audio now travels through LiveKit.


## Profile, ringtone, and private-message upgrade

After deploying the updated ZIP, open Supabase → SQL Editor → New Query. Open `social-upgrade.sql` from this folder, copy all of it into the SQL editor, and click Run. This adds profile display names, avatar emoji, short bios, ringtone preferences, and private one-to-one text messages with row-level security. It does not delete existing accounts or messages.

In Goobert, click **Edit my profile** to choose a display name, avatar emoji, short bio, and incoming ringtone. Search for a friend and use **Message** to open a private chat. Direct messages require both users to be signed in and the SQL migration to have run.


## Persistent friends list

Run `friends-upgrade.sql` once in Supabase → SQL Editor → New Query → Run. This creates a private friends table with row-level security. After deployment, search a username and press **Add Friend**. The app saves the friend to your account; on the next login or refresh, the saved list loads automatically. Use **Remove** to remove someone. Adding a friend is currently one-way (it adds them to your list; they must add you separately to have you in theirs).
