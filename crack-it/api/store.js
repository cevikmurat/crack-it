// ════════════════════════════════════════════════════════════
//  Crack It! — shared backend (Vercel serverless function)
//  One tiny API that every device talks to, so the whole class
//  shares the same rooms and the same live leaderboard.
//
//  Data is stored in a free Upstash Redis database. The Vercel
//  Upstash integration injects the connection details as env
//  vars; Redis.fromEnv() picks them up automatically.
// ════════════════════════════════════════════════════════════
import { Redis } from '@upstash/redis';

// Vercel'in Upstash entegrasyonu bağlantı anahtarlarını KV_REST_API_* adlarıyla
// enjekte ediyor; @upstash/redis'in fromEnv()'i ise UPSTASH_REDIS_REST_* arar.
// Hangi ad enjekte edilirse edilsin çalışsın diye ikisini de destekliyoruz.
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const CODE_RE = /^[A-Z0-9]{3,6}$/;      // room codes are short + alphanumeric
const ROOM_TTL = 60 * 60 * 24;          // rooms auto-expire after 24h (self-cleaning)

const roomKey   = (code) => 'wcc:room:' + code;
const scoresKey = (code) => 'wcc:scores:' + code;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  // Vercel parses JSON bodies automatically, but be defensive.
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const action = body.action;
  const code = typeof body.code === 'string' ? body.code.toUpperCase() : '';

  try {
    // ── Teacher creates a room (nx = only if the code is free) ──
    if (action === 'createRoom') {
      if (!CODE_RE.test(code)) return res.status(400).json({ error: 'bad code' });
      const room = sanitizeRoom(body.room);
      if (!room) return res.status(400).json({ error: 'bad room' });
      const result = await redis.set(roomKey(code), room, { nx: true, ex: ROOM_TTL });
      // Upstash returns "OK" when the key was set, null when nx blocked it.
      return res.status(200).json({ created: result === 'OK' || result === true });
    }

    // ── Student looks up a room by code ──
    if (action === 'getRoom') {
      if (!CODE_RE.test(code)) return res.status(200).json({ room: null });
      const room = await redis.get(roomKey(code));
      return res.status(200).json({ room: room || null });
    }

    // ── Student saves their result (one field per student in a hash) ──
    if (action === 'putScore') {
      if (!CODE_RE.test(code)) return res.status(400).json({ error: 'bad code' });
      const sid = String(body.studentId || '').slice(0, 40);
      if (!sid) return res.status(400).json({ error: 'bad student' });
      const entry = sanitizeEntry(body.entry, sid);
      if (!entry) return res.status(400).json({ error: 'bad entry' });
      await redis.hset(scoresKey(code), { [sid]: entry });
      await redis.expire(scoresKey(code), ROOM_TTL);
      return res.status(200).json({ ok: true });
    }

    // ── Anyone reads the whole leaderboard in ONE request ──
    if (action === 'getScores') {
      if (!CODE_RE.test(code)) return res.status(200).json({ scores: [] });
      const all = await redis.hgetall(scoresKey(code)); // { studentId: entryObject }
      const scores = all ? Object.values(all) : [];
      return res.status(200).json({ scores });
    }

    // ── Teacher resets the board for a room ──
    if (action === 'resetScores') {
      if (!CODE_RE.test(code)) return res.status(400).json({ error: 'bad code' });
      await redis.del(scoresKey(code));
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(500).json({ error: 'server', detail: String((e && e.message) || e) });
  }
}

// ── Validation / clamping so nothing weird ends up in the database ──
function sanitizeRoom(r) {
  if (!r || typeof r !== 'object') return null;
  const target = String(r.target || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10);
  const clue = String(r.clue || '').slice(0, 60);
  let mg = parseInt(r.maxGuesses, 10);
  if (!(mg >= 1 && mg <= 20)) mg = 7;
  if (target.length < 3) return null;
  return { target, clue, maxGuesses: mg, createdAt: Date.now() };
}

function sanitizeEntry(e, sid) {
  if (!e || typeof e !== 'object') return null;
  return {
    studentId: sid,
    name: String(e.name || '').slice(0, 24),
    solved: !!e.solved,
    guesses: Math.max(0, Math.min(99, parseInt(e.guesses, 10) || 0)),
    timeMs: Math.max(0, Math.min(1e9, parseInt(e.timeMs, 10) || 0)),
    hintUsed: !!e.hintUsed,
    score: Math.max(0, Math.min(100000, parseInt(e.score, 10) || 0)),
    at: Date.now()
  };
}
