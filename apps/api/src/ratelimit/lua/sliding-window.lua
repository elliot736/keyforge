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
