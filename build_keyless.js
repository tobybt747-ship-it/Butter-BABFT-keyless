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

-- The real global table.  On some clients getfenv(0) is a sandbox
-- without the standard library, which makes the protected script
-- silently do nothing (a stubbed task.spawn never runs its function).
local __butter_globals = {}
pcall(function()
  if type(_G) == "table" then
    for k, v in pairs(_G) do __butter_globals[k] = v end
  end
end)

-- The executor's shared environment (getgenv) and the script environment
-- (getrenv).  On some clients THAT is where game / workspace / Instance /
-- task live, and getfenv(0) does not have them.
local __butter_genv = nil
pcall(function()
  if type(getgenv) == "function" then
    local ok, g = pcall(getgenv)
    if ok and type(g) == "table" then __butter_genv = g end
  end
end)
local __butter_renv = nil
pcall(function()
  if type(getrenv) == "function" then
    local ok, g = pcall(getrenv)
    if ok and type(g) == "table" then __butter_renv = g end
  end
end)
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
-- FILL MISSING ONLY, so the first source that HAS a name wins and a
-- sandbox that lacks the standard library can never overwrite it:
--     _G  ->  getfenv(0)  ->  getgenv()  ->  getrenv()
local __butter_env = {}
local function __butter_merge(dst, src)
  if type(src) ~= "table" then return end
  for k, v in pairs(src) do
    if dst[k] == nil and v ~= nil then dst[k] = v end
  end
end
__butter_merge(__butter_env, __butter_globals)
__butter_merge(__butter_env, __REAL_ENV)
__butter_merge(__butter_env, __butter_genv)
__butter_merge(__butter_env, __butter_renv)

-- Indexed lookup across every source.  pairs() cannot see metatable
-- backed members (Roblox locks some tables), so the names that matter
-- are looked up one by one.
local __butter_sources = { __butter_globals, __REAL_ENV, __butter_genv, __butter_renv }
local function __butter_pick(name)
  for _, src in ipairs(__butter_sources) do
    if type(src) == "table" then
      local ok, v = pcall(function() return src[name] end)
      if ok and v ~= nil then return v end
    end
  end
  return nil
end

do
  local important = {
    "game", "workspace", "Instance", "task", "coroutine", "Enum", "UDim2", "UDim",
    "Vector2", "Vector3", "CFrame", "Color3", "BrickColor", "Random", "Path2D",
    "Path2DControlPoint", "NumberSequence", "TweenInfo", "Font", "Region3", "Ray",
    "utf8", "bit32", "buffer", "os", "string", "table", "math", "select", "type",
    "typeof", "tostring", "tonumber", "pcall", "xpcall", "error", "assert", "unpack",
    "pack", "next", "rawget", "rawset", "setmetatable", "getmetatable", "loadstring",
    "load", "require", "getfenv", "setfenv", "getgenv", "getrenv", "wait", "spawn",
    "delay", "defer", "tick", "print", "warn", "identifyexecutor", "debug",
    "getcallingscript", "queue_on_teleport", "setclipboard", "newproxy", "http",
    "request", "syn", "shared", "cloneref", "isfile", "readfile", "writefile",
    "makefolder", "isfolder", "settings", "Drawing", "plugin", "HttpService",
  }
  for _, name in ipairs(important) do
    local v = __butter_pick(name)
    if v ~= nil then __butter_env[name] = v end
  end
end

-- the key the gate reads
for _, k in ipairs({ "LDKey", "LD_KEY", "script_key", "Key", "KEY", "key",
                     "ButterKey", "BUTTER_KEY", "ld_key", "ldkey" }) do
  __butter_env[k] = __butter_key
end

-- The gate also reads the key through getgenv() - which is the executor's shared
-- global table, NOT the VM's environment.  Wrap it so the key is always there.
-- (Without this the script sits in a "repeat task.wait() until the key is set"
--  loop forever, which looks like "nothing happened".)
do
  local real_getgenv = __REAL_ENV.getgenv
  if type(real_getgenv) == "function" then
    local __butter_genv_cache = nil
    __REAL_ENV.getgenv = function()
      if __butter_genv_cache then return __butter_genv_cache end
      local ok, g = pcall(real_getgenv)
      if not ok or type(g) ~= "table" then g = {} end
      for _, k in ipairs({ "LDKey", "LD_KEY", "script_key", "Key", "KEY", "key",
                           "ButterKey", "BUTTER_KEY", "ld_key", "ldkey" }) do
        if g[k] == nil then pcall(function() g[k] = __butter_key end) end
      end
      __butter_genv_cache = g
      return g
    end
  end
end

-- Standard library names must NEVER be stubbed: a stub returns nil,
-- and a nil loadstring() is exactly what makes the protected script
-- die with "attempt to index nil with 'info'".
local __butter_never_stub = {
  load = true, loadstring = true, require = true, getfenv = true, setfenv = true,
  getgenv = true, getrenv = true, getcallingscript = true, newproxy = true,
  setclipboard = true, identifyexecutor = true, queue_on_teleport = true,
  debug = true, getinfo = true, traceback = true, error = true, pcall = true,
  xpcall = true, type = true, typeof = true, tostring = true, tonumber = true,
  select = true, assert = true, rawget = true, rawset = true, getmetatable = true,
  setmetatable = true, unpack = true, pack = true, coroutine = true, task = true,
  bit32 = true, utf8 = true, buffer = true, os = true, string = true, table = true,
  math = true, script = true, game = true, workspace = true, _G = true,
}

-- load / loadstring fall back to the executor's real implementations
local __butter_real_load = _G.load or __REAL_ENV.load
local __butter_real_loadstring = _G.loadstring or __REAL_ENV.loadstring
if type(__butter_real_loadstring) == "function" then
  __butter_env.loadstring = __butter_real_loadstring
end
if type(__butter_real_load) == "function" then
  __butter_env.load = __butter_real_load
elseif type(__butter_env.loadstring) == "function" then
  __butter_env.load = __butter_env.loadstring
end

-- names the script references that this environment does not provide
__butter_stubbed = {}
for _, k in ipairs({
${stubList}
}) do
  if __butter_env[k] == nil and not __butter_never_stub[k] then
    __butter_env[k] = __butter_stub(k)
    __butter_stubbed[#__butter_stubbed + 1] = k
  end
end

-- getgenv: the key gate reads the key through it.  If the client does
-- not provide it, the gate hits "attempt to index nil with 'LDKey'",
-- the gate's own pcall swallows that, and the script exits silently
-- having built nothing.  So provide a real one.
if type(__butter_env.getgenv) ~= "function" then
  local __butter_genv_tbl = {}
  for _, k in ipairs({ "LDKey", "LD_KEY", "script_key", "Key", "KEY", "key",
                       "ButterKey", "BUTTER_KEY", "ld_key", "ldkey" }) do
    __butter_genv_tbl[k] = __butter_key
  end
  __butter_env.getgenv = function() return __butter_genv_tbl end
  __butter_env.getrenv = function() return __butter_env end
end

-- report what this client is missing

-- report what the important ones ended up being

-- optional trace hook (off in Roblox, used by the offline test harness)
local __butter_log = __REAL_ENV.__BUTTER_LOG
local function __butter_trace(msg)
  if type(__butter_log) == "function" then pcall(function() __butter_log(msg) end) end
  if type(__butter_box) == "function" then
    pcall(function() __butter_box("[Butter] net", tostring(msg), 460, Color3.fromRGB(20, 30, 50)) end)
  end
end

-- the key is checked against a server: always answer "valid"
local __butter_valid_body = '{"valid":true,"success":true,"status":"valid","active":true,"authorized":true,"verified":true,"key":"' .. __butter_key .. '","hwid":"1","expires":0,"code":200,"message":"ok","data":{"valid":true,"active":true}}'

-- A body that is valid LUA, so that loadstring() of it succeeds.
-- The payload calls loadstring() on whatever it downloads; if the body
-- is not valid Lua the VM's loadstring returns nil and the payload
-- dies with "attempt to index nil with 'info'".
local __butter_lua_body = "return setmetatable({info={source='@Butter',currentline=0,name='info'}},{__call=function(self,...) return self end})"

-- the real network functions, captured before they are replaced
local __butter_real_httpget = (type(__REAL_ENV.game) == "table" and __REAL_ENV.game.HttpGet) or nil
local __butter_real_request = __REAL_ENV.request
local __butter_real_http_request = (type(__REAL_ENV.http) == "table" and __REAL_ENV.http.request) or nil

-- The key server is faked.  Everything else is fetched for real, so the
-- script can still download the modules it actually needs.
local function __butter_is_key_url(url)
  local u = string.lower(tostring(url or ""))
  return (u:find("luadefender", 1, true) ~= nil) or (u:find("/key", 1, true) ~= nil)
end

-- Butter's UI loads the LenyUI modules from
--   https://raw.githubusercontent.com/tip52/Leny-UI/refs/heads/main/Modules/*.lua
-- and that repository is gone (404), so the UI can never be built.
-- We publish the same modules in our own repository and redirect the
-- payload's requests to them.
local __butter_repo_base = "https://raw.githubusercontent.com/tobybt747-ship-it/Butter-BABFT-keyless/refs/heads/main/LenyUI/Modules/"

local function __butter_rewrite_url(url)
  local u = tostring(url or "")
  local file = string.match(u, "Modules/([^/?%s]+%.lua)")
  if file and (string.find(u, "Leny%-UI", 1) or string.find(u, "LenyUI", 1)) then
    return __butter_repo_base .. file
  end
  return u
end

local function __butter_body_for(url)
  if __butter_is_key_url(url) then return __butter_valid_body end
  local target = __butter_rewrite_url(url)
  if target ~= tostring(url or "") then
    __butter_trace("  -> redirected to " .. target)
  end
  if type(__butter_real_httpget) == "function" then
    local ok, res = pcall(function() return __butter_real_httpget(__REAL_ENV.game, target) end)
    if ok and type(res) == "string" and #res > 0 then
      __butter_trace("  -> real file (" .. #res .. " bytes)")
      return res
    end
  end
  return __butter_lua_body
end

do
  local h = __REAL_ENV.http
  if type(h) == "table" then
    h.request = function(url, opts, cb)
      __butter_trace("http.request -> " .. tostring(url))
      local body = __butter_body_for(url)
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
        local body = __butter_body_for(url)
        if cb then pcall(function() cb(body) end) end
        return body
      end
    end
  end

  local HS = __REAL_ENV.HttpService
  if type(HS) == "table" then
    HS.RequestAsync = function(_, url)
      __butter_trace("HttpService.RequestAsync -> " .. tostring(url))
      local body = __butter_body_for(url)
      return { StatusCode = 200, Body = body, body = body,
               Success = true, ok = true, Headers = { ["content-type"] = "application/json" } }
    end
    if type(HS.GetAsync) == "function" then
      HS.GetAsync = function(_, url) __butter_trace("HttpService.GetAsync -> " .. tostring(url)); return __butter_body_for(url) end
    end
    if type(HS.PostAsync) == "function" then
      HS.PostAsync = function(_, url) __butter_trace("HttpService.PostAsync -> " .. tostring(url)); return __butter_body_for(url) end
    end
  end

  if type(__REAL_ENV.game) == "table" then
    __REAL_ENV.game.HttpGet = function(_, url) __butter_trace("game:HttpGet -> " .. tostring(url)); return __butter_body_for(url) end
  end

  if type(__REAL_ENV.request) == "function" then
    __REAL_ENV.request = function(url, opts)
      __butter_trace("request() -> " .. tostring(url))
      local body = __butter_body_for(url)
      return { StatusCode = 200, Body = body, body = body, Success = true }
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

__BUTTER_DIAG__

local function __butter_getfenv()
  return __butter_env
end

`;

const D = "deobfuscated/Butter_BABFT/";
const diag = fsx.readFileSync(D + "butter_box.lua", "latin1") + fsx.readFileSync(D + "butter_net.lua", "latin1") + fsx.readFileSync(D + "butter_envfix.lua", "latin1") + fsx.readFileSync(D + "butter_nonfatal.lua", "latin1") + fsx.readFileSync(D + "butter_rawset.lua", "latin1") + fsx.readFileSync(D + "butter_whatbuilt.lua", "latin1") + fsx.readFileSync(D + "butter_envprobe2.lua", "latin1") + fsx.readFileSync(D + "butter_missingglobals.lua", "latin1") + fsx.readFileSync(D + "butter_genvlog.lua", "latin1") + fsx.readFileSync(D + "butter_vmhook.lua", "latin1") + fsx.readFileSync(D + "butter_requirefix.lua", "latin1") + fsx.readFileSync(D + "butter_errhook.lua", "latin1") + fsx.readFileSync(D + "butter_envshim2.lua", "latin1") + fsx.readFileSync(D + "butter_envshim.lua", "latin1") + fsx.readFileSync(D + "butter_debugshim.lua", "latin1");

// --- second patch: the VM's own table -------------------------------------
// The protected file's last statement is  return({...}):B()(...);
// i.e. the VM builds a table and then calls a method on it.  The VM's
// global table is assembled from that table's fields, so if the VM
// implements `require` itself it would shadow the environment override
// in __butter_env.  Capture the table and force `require` (and `debug`)
// onto it before the VM starts.
let patchedSrc = src.replace(needle, ",n=__butter_getfenv,");
{
  const VM_TAIL = "}):B()(...);";
  const vmTail = patchedSrc.lastIndexOf(VM_TAIL);
  const vmHead = patchedSrc.indexOf("return({");
  if (vmTail > vmHead && vmHead >= 0) {
    const suffix = patchedSrc.slice(vmTail + VM_TAIL.length);
    patchedSrc =
      patchedSrc.slice(0, vmHead) +
      "local __butter_P=({" +
      patchedSrc.slice(vmHead + "return({".length, vmTail) +
      "})__butter_P[\"require\"]=__butter_require;__butter_P[\"debug\"]=__butter_dbg;"
      + "__butter_P[\"getfenv\"]=function(...) return __butter_env end;"
      + "__butter_P[\"setfenv\"]=__butter_setfenv;"
      + "__butter_P[\"getinfo\"]=function(l,w,o) return __butter_dbginfo2(l,w,o) end;"
      + "__butter_P[\"traceback\"]=function(m,l) return tostring(m) end;"
      + "__butter_P[\"error\"]=__butter_swallow;"
      + "setmetatable(__butter_P,{__index=function(t,k) "
      + "if k==\"require\" then return __butter_require end; "
      + "if k==\"Require\" then return setmetatable({},{__index=function(_,kk) if kk==\"require\" then return __butter_require end; return nil end}) end; "
      + "if k==\"debug\" then return __butter_dbg end; "
      + "if k==\"pcall\" then return __butter_vm_pcall end; "
      + "if k==\"Pcall\" then return setmetatable({},{__index=function(_,kk) if kk==\"pcall\" then return __butter_vm_pcall end; return nil end}) end; "
      + "if k==\"xpcall\" then return __butter_vm_xpcall end; "
      + "if k==\"error\" then return __butter_swallow end; "
      + "if k==\"Error\" then return setmetatable({},{__index=function(_,kk) if kk==\"error\" then return __butter_vm_error end; return nil end}) end; "
      + "if k==\"getfenv\" then return function(...) return __butter_env end end; "
      + "if k==\"setfenv\" then return __butter_setfenv end; "
      + "if k==\"getinfo\" then return function(l,w,o) return __butter_dbginfo2(l,w,o) end end; "
      + "return nil end, "
      + "__newindex=function(t,k,v) if k==\"require\" then v=__butter_require end; "
      + "if type(v)==\"table\" then v=__butter_guard_table(v) end; rawset(t,k,v) end});"
      + "return __butter_P:B()(...);" +
      suffix;
    console.log("VM table patched: require/debug forced onto the VM table");
  } else {
    console.log("VM table NOT patched (head=" + vmHead + " tail=" + vmTail + ")");
  }
}

const out = header.replace("__BUTTER_DIAG__", diag) + patchedSrc;

// ---------------------------------------------------------------------------
// BUILD ASSERTIONS - the VM's entry call MUST be in the file.
//
// A JavaScript automatic-semicolon-insertion bug once dropped the line
//   return __butter_P:B()(...);
// out of the generated file.  The file still compiled, still ran, still
// reported "no error" - and the protected script was NEVER EXECUTED.
// That is what made this look like "the environment is wrong".
// ---------------------------------------------------------------------------
const entryNeedle = "return __butter_P:B()(...);";
if (!patchedSrc.includes(entryNeedle)) {
  console.error("FATAL: the VM entry call is missing from the patched source");
  process.exit(1);
}
if (!out.includes(":B()(...);")) {
  console.error("FATAL: the VM entry call is missing from the generated file");
  process.exit(1);
}
console.log("VM entry call present: YES");

const dest = "deobfuscated/Butter_BABFT/ButterCooked_KEYLESS.lua";
fsx.writeFileSync(dest, out, "latin1");
console.log("wrote " + dest + "  (" + out.length + " bytes), stubbed " + poolNames.length + " identifiers");

// ---------------------------------------------------------------------------
// The runner: SELF-CONTAINED.
//
// The old runner fetched ButterCooked_KEYLESS.lua from refs/heads/main.
// raw.githubusercontent CACHES that path, so the client kept running a stale
// copy and every fix "did not take".  The runner now carries the whole
// script, so the one commit-pinned URL is the only thing fetched at all.
// ---------------------------------------------------------------------------
const NL = String.fromCharCode(10);
const runnerPre = [
  "--[[",
  "  Butter  -  Build A Boat For Treasure  (PlaceId 537413528)",
  "  KEYLESS AUTOBUILDER - self-contained runner.",
  "",
  "  This file IS the original protected script (payload byte-for-byte",
  "  identical) with the key gate neutralised, wrapped in a small header",
  "  that gives the script a complete environment, answers the key server",
  "  with a valid answer, blocks the kick and reports everything ON SCREEN",
  "  (this executor has no console).",
  "]]",
  "",
  "local __butter_runner_ok, __butter_runner_err = pcall(function(...)",
  "",
].join(NL);

const runnerPost = [
  "",
  "end)",
  "",
  "if type(__butter_box) == \"function\" then",
  "  pcall(function()",
  "    if __butter_runner_ok then",
  "      __butter_box(\"[Butter] runner\", \"the protected script finished without throwing.\")",
  "    else",
  "      __butter_box(\"[Butter] runner error\", tostring(__butter_runner_err))",
  "    end",
  "  end)",
  "end",
  "",
].join(NL);

const runner = runnerPre + out + runnerPost;
fsx.writeFileSync("deobfuscated/Butter_BABFT/RUN_ME_Butter_BABFT_keyless.lua", runner, "latin1");
fsx.writeFileSync("deobfuscated/Butter_BABFT/Butter_BABFT_keyless_loader.lua", runner, "latin1");
console.log("wrote RUN_ME_Butter_BABFT_keyless.lua  (" + runner.length + " bytes, self-contained)");

// the payload must be untouched
const re = /\[(=*)\[([\s\S]{200,}?)\]\1\]/g;
let m, a = null, b = null;
while ((m = re.exec(src))) if (m[2].startsWith("LPH")) { a = m[2]; break; }
re.lastIndex = 0;
while ((m = re.exec(out))) if (m[2].startsWith("LPH")) { b = m[2]; break; }
console.log("payload untouched:", a && b && a === b ? "YES" : "NO");
