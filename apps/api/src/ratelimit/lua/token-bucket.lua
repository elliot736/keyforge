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
