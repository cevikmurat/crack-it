// ════════════════════════════════════════════════════════════
//  Crack It! — shared backend (Vercel serverless function)
//  One tiny API that every device talks to, so the whole class
//  shares the same rooms, the same live leaderboard, and ONE
//  synchronised countdown when a word gets cracked.
//
//  Data lives in a free Upstash Redis database. The Vercel Upstash
//  integration injects the connection details as env vars.
//
//  Keys per room code:
//    wcc:room:<CODE>    → the current word/clue/round (+ firstSolvedAt)
//    wcc:scores:<CODE>  → hash, ONE field per student PER ROUND
//                         (field = "<studentId>:<round>") so points
//                         accumulate across words instead of being
//                         overwritten each new word.
//    wcc:ping:<CODE>    → hash, student presence heartbeats
//                         (powers the live "N racing" counter)
// ════════════════════════════════════════════════════════════
import { Redis } from '@upstash/redis';

// Vercel's Upstash integration injects keys as KV_REST_API_*; @upstash/redis'
// fromEnv() looks for UPSTASH_REDIS_REST_*. Support whichever is present.
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const CODE_RE   = /^[A-Z0-9]{3,6}$/;    // room codes are short + alphanumeric
const ROOM_TTL  = 60 * 60 * 24;         // rooms/scores auto-expire after 24h
const PING_TTL  = 60 * 10;              // presence records live ~10 min
const PING_FRESH_MS = 12000;            // "racing" = a heartbeat in the last 12s

const roomKey   = (code) => 'wcc:room:'   + code;
const scoresKey = (code) => 'wcc:scores:' + code;
const pingKey   = (code) => 'wcc:ping:'   + code;

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
      return res.status(200).json({ created: result === 'OK' || result === true });
    }

    // ── Student / board looks up the current word by code ──
    if (action === 'getRoom') {
      if (!CODE_RE.test(code)) return res.status(200).json({ room: null });
      const room = await redis.get(roomKey(code));
      return res.status(200).json({ room: room || null });
    }

    // ── Teacher advances to the NEXT word on the same code ──
    //    New word, new round; scores are kept (they live in a separate key).
    if (action === 'nextWord') {
      if (!CODE_RE.test(code)) return res.status(400).json({ error: 'bad code' });
      const room = sanitizeRoom(body.room);   // firstSolvedAt reset to null here
      if (!room) return res.status(400).json({ error: 'bad room' });
      await redis.set(roomKey(code), room, { ex: ROOM_TTL });
      return res.status(200).json({ ok: true, round: room.round });
    }

    // ── Student saves their result (one field per student PER ROUND) ──
    if (action === 'putScore') {
      if (!CODE_RE.test(code)) return res.status(400).json({ error: 'bad code' });
      const sid = String(body.studentId || '').slice(0, 40);
      if (!sid) return res.status(400).json({ error: 'bad student' });
      const entry = sanitizeEntry(body.entry, sid);
      if (!entry) return res.status(400).json({ error: 'bad entry' });

      const field = sid + ':' + entry.round;
      await redis.hset(scoresKey(code), { [field]: entry });
      await redis.expire(scoresKey(code), ROOM_TTL);

      // On the FIRST correct answer of a round, stamp the room so EVERY device
      // shares one countdown window and knows who cracked it first.
      if (entry.solved) {
        const room = await redis.get(roomKey(code));
        if (room && (room.round || 1) === entry.round && !room.firstSolvedAt) {
          room.firstSolvedAt = entry.at;
          room.firstSolver = entry.name || '';
          await redis.set(roomKey(code), room, { ex: ROOM_TTL });
        }
      }
      return res.status(200).json({ ok: true });
    }

    // ── Anyone reads the whole leaderboard (all rounds) in ONE request ──
    if (action === 'getScores') {
      if (!CODE_RE.test(code)) return res.status(200).json({ scores: [] });
      const all = await redis.hgetall(scoresKey(code)); // { "sid:round": entry }
      const scores = all ? Object.values(all) : [];
      return res.status(200).json({ scores });
    }

    // ── Teacher resets the board for a room ──
    if (action === 'resetScores') {
      if (!CODE_RE.test(code)) return res.status(400).json({ error: 'bad code' });
      await redis.del(scoresKey(code));
      await redis.del(pingKey(code));
      return res.status(200).json({ ok: true });
    }

    // ── Student heartbeat: "I'm here working on this round" ──
    //    Powers the board's live "N racing" counter.
    if (action === 'ping') {
      if (!CODE_RE.test(code)) return res.status(200).json({ ok: false });
      const sid = String(body.studentId || '').slice(0, 40);
      if (!sid) return res.status(200).json({ ok: false });
      let round = parseInt(body.round, 10); if (!(round >= 1 && round <= 9999)) round = 1;
      const rec = { name: String(body.name || '').slice(0, 24), round, at: Date.now() };
      await redis.hset(pingKey(code), { [sid]: rec });
      await redis.expire(pingKey(code), PING_TTL);
      return res.status(200).json({ ok: true });
    }

    // ── Board reads who is currently active (fresh heartbeats only) ──
    if (action === 'getPings') {
      if (!CODE_RE.test(code)) return res.status(200).json({ pings: [] });
      const all = await redis.hgetall(pingKey(code));
      const now = Date.now();
      const pings = all
        ? Object.entries(all)
            .map(([sid, r]) => ({ studentId: sid, name: r && r.name, round: (r && r.round) || 1, at: (r && r.at) || 0 }))
            .filter(p => now - p.at <= PING_FRESH_MS)
        : [];
      return res.status(200).json({ pings });
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
  let round = parseInt(r.round, 10);
  if (!(round >= 1 && round <= 9999)) round = 1;
  if (target.length < 3) return null;
  // A brand-new word always starts with a clean (empty) countdown.
  return { target, clue, maxGuesses: mg, round, firstSolvedAt: null, firstSolver: '', createdAt: Date.now() };
}

function sanitizeEntry(e, sid) {
  if (!e || typeof e !== 'object') return null;
  let round = parseInt(e.round, 10);
  if (!(round >= 1 && round <= 9999)) round = 1;
  return {
    studentId: sid,
    name: String(e.name || '').slice(0, 24),
    solved: !!e.solved,
    guesses: Math.max(0, Math.min(99, parseInt(e.guesses, 10) || 0)),
    timeMs: Math.max(0, Math.min(1e9, parseInt(e.timeMs, 10) || 0)),
    hintUsed: !!e.hintUsed,
    round,
    at: Date.now()   // server-stamped → reliable ordering across devices
  };
}
