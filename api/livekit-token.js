import { AccessToken } from 'livekit-server-sdk';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bdbzpwsdjuoigpxntlim.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_VqRbHogpVXM8DEwPb9xQvQ_y5bME2ZW';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  try {
    const authorization = req.headers.authorization || '';
    const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!accessToken) return res.status(401).json({ error: 'Please log in again.' });

    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` }
    });
    if (!authResponse.ok) return res.status(401).json({ error: 'Your Goobert login expired. Log in again.' });
    const authUser = await authResponse.json();

    const roomName = String(req.body?.roomName || '');
    if (!/^[a-zA-Z0-9_-]{3,120}$/.test(roomName)) return res.status(400).json({ error: 'Invalid voice room.' });

    const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return res.status(503).json({ error: 'LiveKit is not configured yet. Add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Vercel Environment Variables.' });
    }

    const username = String(authUser.user_metadata?.username || authUser.email?.split('@')[0] || 'Goobert').slice(0, 48);
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: authUser.id,
      name: username,
      ttl: '10m'
    });
    token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true });
    const jwt = await token.toJwt();
    return res.status(200).json({ serverUrl: LIVEKIT_URL, token: jwt });
  } catch (error) {
    console.error('LiveKit token error:', error);
    return res.status(500).json({ error: 'Could not prepare the voice connection.' });
  }
}
