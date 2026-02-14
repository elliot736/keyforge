// ─── Lua Scripts for Rate Limiting ──────────────────────────────────────────
// Embedded as template literals to avoid filesystem reads at runtime.
// Each script is atomic — executed in a single Redis EVALSHA call.

export const FIXED_WINDOW_LUA = `
-- Fixed window rate limiter
-- KEYS[1] = rate limit key
-- ARGV[1] = window size in ms
-- ARGV[2] = max requests in window
-- ARGV[3] = current timestamp in ms

local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local windowId = math.floor(now / window)
local windowKey = key .. ":" .. windowId

local current = tonumber(redis.call("GET", windowKey) or "0")

if current >= limit then
  local ttl = redis.call("PTTL", windowKey)
  local reset = now + (ttl > 0 and ttl or window)
  return {0, limit, 0, reset}
end

current = redis.call("INCR", windowKey)
if current == 1 then
  redis.call("PEXPIRE", windowKey, window)
end

local remaining = math.max(0, limit - current)
local ttl = redis.call("PTTL", windowKey)
local reset = now + (ttl > 0 and ttl or window)

if current > limit then
  return {0, limit, 0, reset}
end

return {1, limit, remaining, reset}
`;

export const SLIDING_WINDOW_LUA = `
-- Sliding window rate limiter (weighted average of two fixed windows)
-- KEYS[1] = rate limit key
-- ARGV[1] = window size in ms
-- ARGV[2] = max requests in window
-- ARGV[3] = current timestamp in ms

local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local currentWindowId = math.floor(now / window)
local previousWindowId = currentWindowId - 1

local currentKey = key .. ":" .. currentWindowId
local previousKey = key .. ":" .. previousWindowId

local currentCount = tonumber(redis.call("GET", currentKey) or "0")
local previousCount = tonumber(redis.call("GET", previousKey) or "0")

-- Weight of previous window based on how far we are into current window
local elapsed = now - (currentWindowId * window)
local weight = 1 - (elapsed / window)

local estimatedCount = math.floor(previousCount * weight) + currentCount

if estimatedCount >= limit then
  local reset = (currentWindowId + 1) * window
  return {0, limit, 0, reset}
end

-- Increment current window
currentCount = redis.call("INCR", currentKey)
if currentCount == 1 then
  redis.call("PEXPIRE", currentKey, window * 2) -- Keep for 2 windows
end

estimatedCount = math.floor(previousCount * weight) + currentCount
local remaining = math.max(0, limit - estimatedCount)
local reset = (currentWindowId + 1) * window

if estimatedCount > limit then
  return {0, limit, 0, reset}
end

return {1, limit, remaining, reset}
`;

export const TOKEN_BUCKET_LUA = `
-- Token bucket rate limiter
-- KEYS[1] = bucket key
-- ARGV[1] = max tokens (burst limit)
-- ARGV[2] = refill rate (tokens per second)
-- ARGV[3] = current timestamp in ms
-- ARGV[4] = tokens to consume (default 1)

local key = KEYS[1]
local maxTokens = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local consume = tonumber(ARGV[4]) or 1

local bucket = redis.call("HMGET", key, "tokens", "lastRefill")
local tokens = tonumber(bucket[1])
local lastRefill = tonumber(bucket[2])

if tokens == nil then
  -- First request, initialize bucket
  tokens = maxTokens
  lastRefill = now
end

-- Refill tokens based on elapsed time
local elapsed = (now - lastRefill) / 1000  -- convert to seconds
local refill = math.floor(elapsed * refillRate)

if refill > 0 then
  tokens = math.min(maxTokens, tokens + refill)
  lastRefill = now
end

local allowed = 0
local remaining = tokens

if tokens >= consume then
  tokens = tokens - consume
  remaining = tokens
  allowed = 1
end

-- Store updated bucket
redis.call("HMSET", key, "tokens", tokens, "lastRefill", lastRefill)
redis.call("PEXPIRE", key, 86400000) -- 24h TTL as safety

-- Calculate reset time (when bucket will be full again)
local deficit = maxTokens - tokens
local resetMs = 0
if deficit > 0 and refillRate > 0 then
  resetMs = math.ceil(deficit / refillRate * 1000)
end
local reset = now + resetMs

return {allowed, maxTokens, remaining, reset}
`;
