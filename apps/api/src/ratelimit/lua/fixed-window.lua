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
