const fs = require("fs");
const path = require("path");

/**
 * Build `ButterCooked_KEYLESS.lua` - the ORIGINAL Butter BABFT script with the
 * key system removed, as ONE standalone file (no loader, no wrapper).
 *
 * The Luraph VM resolves the protected script's environment through `getfenv()`,
 * and it calls that for EVERY operation (~25M calls in a full run), so the
 * replacement must be a plain table - a proxy with an __index metamethod would
 * add a metamethod call to every single VM operation.
 *
 * So we build a snapshot table:
 *   - every real global is copied in
 *   - the key names resolve to a usable key
 *   - the identifiers the script references (the 301 names in the payload's
 *     string pool) get a harmless stub, so the script can never die with
 *     "attempt to index nil with 'new'"
 *   - the key server's answer is always a valid one
 *   - the kick is blocked, so the gate can never remove the player
 *
 * The encrypted payload itself is byte-for-byte identical to the original.
 */
const fsx = require("fs");
const src = fsx.readFileSync("t2/butter_cooked.lua", "latin1");

// ---- the identifiers the protected script references (from the payload pool) ----
const poolNames = fsx.existsSync("pool_names.lua")
  ? (function () {
      const txt = fsx.readFileSync("pool_names.lua", "utf8");
      return [...txt.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    })()
  : [];

// ---- the VM takes its environment from `getfenv` (exactly one occurrence) ----
const needle = ",n=getfenv,";
const count = src.split(needle).length - 1;
if (count !== 1) {
  console.error("expected exactly one '" + needle + "', found " + count);
  process.exit(1);
}

const stubList = poolNames.map((n) => '    "' + n + '",').join("\n");

const header = `--[[
  Butter  -  Build A Boat For Treasure  (PlaceId 537413528)
  BUTTER_HUB - key system removed.

  This is the original protected script with the key gate neutralised:
    * the key the gate looks for is always present
    * the key server's reply is always a valid one
    * the gate can never kick you
  The encrypted payload is byte-for-byte identical to the original.
]]

local __REAL_ENV = getfenv and getfenv(0) or _G
local __butter_key = "LD12345678999999"

local function __butter_stub(name)
  return setmetatable({}, {
    __index = function(_, k)
      if k == "new" then return function(...) return __butter_stub(name .. ".new") end end
      return function(...) return nil end
    end,
    __call = function() return nil end,
    __tostring = function() return tostring(name) end,
  })
end

-- plain snapshot: no metamethod on the hot path
local __butter_env = {}
for k, v in pairs(__REAL_ENV) do __butter_env[k] = v end

-- the key the gate reads
for _, k in ipairs({ "LDKey", "LD_KEY", "script_key", "Key", "KEY", "key",
                     "ButterKey", "BUTTER_KEY", "ld_key", "ldkey" }) do
  __butter_env[k] = __butter_key
end

-- names the script references that this environment does not provide
for _, k in ipairs({
${stubList}
}) do
  if __butter_env[k] == nil then __butter_env[k] = __butter_stub(k) end
end

-- optional trace hook (off in Roblox, used by the offline test harness)
local __butter_log = __REAL_ENV.__BUTTER_LOG
local function __butter_trace(msg)
  if type(__butter_log) == "function" then pcall(function() __butter_log(msg) end) end
end

-- the key is checked against a server: always answer "valid"
local __butter_valid_body = '{"valid":true,"success":true,"status":"valid","active":true,"authorized":true,"verified":true,"key":"' .. __butter_key .. '","hwid":"1","expires":0,"code":200,"message":"ok","data":{"valid":true,"active":true}}'

do
  local h = __REAL_ENV.http
  if type(h) == "table" then
    h.request = function(url, opts, cb)
      __butter_trace("http.request -> " .. tostring(url))
      local body = __butter_valid_body
      if type(opts) == "function" then cb = opts end
      local res = {
        StatusCode = 200, Status = 200, Body = body, body = body,
        Success = true, ok = true, Headers = { ["content-type"] = "application/json" },
        GetService = function() return { StatusCode = 200, Body = body, body = body, Success = true } end,
      }
      if cb then pcall(function() cb(res) end) end
      return res
    end
    if type(h.get) == "function" then
      h.get = function(url, cb)
        __butter_trace("http.get -> " .. tostring(url))
        if cb then pcall(function() cb(__butter_valid_body) end) end
        return __butter_valid_body
      end
    end
  end

  local HS = __REAL_ENV.HttpService
  if type(HS) == "table" then
    HS.RequestAsync = function(_, url)
      __butter_trace("HttpService.RequestAsync -> " .. tostring(url))
      return { StatusCode = 200, Body = __butter_valid_body, body = __butter_valid_body,
               Success = true, ok = true, Headers = { ["content-type"] = "application/json" } }
    end
    if type(HS.GetAsync) == "function" then
      HS.GetAsync = function(_, url) __butter_trace("HttpService.GetAsync -> " .. tostring(url)); return __butter_valid_body end
    end
    if type(HS.PostAsync) == "function" then
      HS.PostAsync = function(_, url) __butter_trace("HttpService.PostAsync -> " .. tostring(url)); return __butter_valid_body end
    end
  end

  if type(__REAL_ENV.game) == "table" then
    __REAL_ENV.game.HttpGet = function(_, url) __butter_trace("game:HttpGet -> " .. tostring(url)); return __butter_valid_body end
  end

  if type(__REAL_ENV.request) == "function" then
    __REAL_ENV.request = function(url, opts)
      __butter_trace("request() -> " .. tostring(url))
      return { StatusCode = 200, Body = __butter_valid_body, body = __butter_valid_body, Success = true }
    end
  end
  if type(__REAL_ENV.syn) == "table" and type(__REAL_ENV.syn.request) == "function" then
    __REAL_ENV.syn.request = __REAL_ENV.request
  end
end

-- the gate may kick.  It never may.
do
  local ok, Players = pcall(function() return __REAL_ENV.game:GetService("Players") end)
  if ok and Players then
    local ok2, lp = pcall(function() return Players.LocalPlayer end)
    if ok2 and lp then
      pcall(function()
        lp.Kick = function(self, ...)
          __butter_trace("KICK SUPPRESSED: " .. tostring((select(2, ...))))
          if type(warn) == "function" then warn("[Butter] kick suppressed: " .. tostring((select(2, ...)))) end
        end
      end)
    end
  end
end

local function __butter_getfenv()
  return __butter_env
end

`;

const out = header + src.replace(needle, ",n=__butter_getfenv,");
const dest = "deobfuscated/Butter_BABFT/ButterCooked_KEYLESS.lua";
fsx.writeFileSync(dest, out, "latin1");
console.log("wrote " + dest + "  (" + out.length + " bytes), stubbed " + poolNames.length + " identifiers");

// the payload must be untouched
const re = /\[(=*)\[([\s\S]{200,}?)\]\1\]/g;
let m, a = null, b = null;
while ((m = re.exec(src))) if (m[2].startsWith("LPH")) { a = m[2]; break; }
re.lastIndex = 0;
while ((m = re.exec(out))) if (m[2].startsWith("LPH")) { b = m[2]; break; }
console.log("payload untouched:", a && b && a === b ? "YES" : "NO");
