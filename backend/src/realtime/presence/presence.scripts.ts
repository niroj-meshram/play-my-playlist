/**
 * Lua scripts: each presence transition is a single atomic Redis operation, so concurrent
 * connects, disconnects and sweeps on different instances cannot interleave.
 *
 * Shared argument layout: KEYS = [sockets hash, presence hash, timers zset],
 * ARGV[1] = playerId, ARGV[2] = roomId.
 */

/** ARGV[3] = socketId. Returns { previousSocketId | '', previousPresence | '' }. */
export const CONNECT_SCRIPT = `
local prevSocket = redis.call('HGET', KEYS[1], ARGV[1])
local prevPresence = redis.call('HGET', KEYS[2], ARGV[1])
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('HSET', KEYS[2], ARGV[1], 'ONLINE')
redis.call('ZREM', KEYS[3], 'reconnecting:' .. ARGV[2] .. ':' .. ARGV[1], 'away:' .. ARGV[2] .. ':' .. ARGV[1])
return { prevSocket or '', prevPresence or '' }
`;

/**
 * Compare-and-delete: only the socket that currently owns the player may disconnect it,
 * so a tab that was replaced cannot mark the player offline.
 * ARGV[3] = socketId, ARGV[4] = reconnecting due time, ARGV[5] = away due time. Returns 1 if applied.
 */
export const DISCONNECT_SCRIPT = `
if redis.call('HGET', KEYS[1], ARGV[1]) ~= ARGV[3] then return 0 end
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('ZADD', KEYS[3], ARGV[4], 'reconnecting:' .. ARGV[2] .. ':' .. ARGV[1])
redis.call('ZADD', KEYS[3], ARGV[5], 'away:' .. ARGV[2] .. ':' .. ARGV[1])
return 1
`;

/**
 * A REST join counts as online with the grace timers already running: the client's socket
 * subscribes within moments and cancels them; a client that never connects becomes AWAY.
 * ARGV[3] = reconnecting due time, ARGV[4] = away due time.
 */
export const JOIN_SCRIPT = `
redis.call('HSET', KEYS[2], ARGV[1], 'ONLINE')
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 0 end
redis.call('ZADD', KEYS[3], ARGV[3], 'reconnecting:' .. ARGV[2] .. ':' .. ARGV[1])
redis.call('ZADD', KEYS[3], ARGV[4], 'away:' .. ARGV[2] .. ':' .. ARGV[1])
return 1
`;

/**
 * Applies an expired timer. A no-op if the player reconnected, left (no presence entry),
 * or is already in that state or AWAY. ARGV[3] = new presence. Returns 1 if changed.
 */
export const EXPIRE_SCRIPT = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 0 end
local current = redis.call('HGET', KEYS[2], ARGV[1])
if not current or current == ARGV[3] or current == 'AWAY' then return 0 end
redis.call('HSET', KEYS[2], ARGV[1], ARGV[3])
return 1
`;

/** Removes every trace of a player who left the room. Returns the socket that owned them, or ''. */
export const REMOVE_SCRIPT = `
local socket = redis.call('HGET', KEYS[1], ARGV[1])
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('HDEL', KEYS[2], ARGV[1])
redis.call('ZREM', KEYS[3], 'reconnecting:' .. ARGV[2] .. ':' .. ARGV[1], 'away:' .. ARGV[2] .. ':' .. ARGV[1])
return socket or ''
`;
