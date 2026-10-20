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

-- A stub for a name the client does not provide.
--
-- IMPORTANT: the stub is CACHED.  The VM resolves a global roughly 25 million
-- times per run, and every miss used to build a brand new table + metatable +
-- two closures.  That is millions of allocations, and it froze the client.
-- One stub per distinct name, one shared no-op function, no allocation.
local __butter_stub_cache = {}
local __butter_noop = function() return nil end
local function __butter_stub(name)
  local s = __butter_stub_cache[name]
  if s ~= nil then return s end
  s = setmetatable({}, {
    __index = function(_, k)
      if k == "new" then return __butter_stub(name .. ".new") end
      return __butter_noop
    end,
    __call = function() return nil end,
    __tostring = function() return tostring(name) end,
  })
  __butter_stub_cache[name] = s
  return s
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

-- The VM resolves the payload's globals through this function, and it calls
-- it MILLIONS of times (measured: about 150 000 per second, and the whole run
-- needs tens of millions).  So it does the absolute minimum:
--   * it returns a plain table (no proxy, no metamethod on the hot path)
--   * it yields back to Roblox every __butter_yield_every calls, so the game
--     keeps running instead of freezing for minutes while the Luraph VM
--     grinds through its bytecode
-- The yield only happens inside the runner's own coroutine, so the payload's
-- own coroutines are never disturbed.
__butter_calls = 0
__butter_yield_every = 50000
local function __butter_getfenv()
  __butter_calls = __butter_calls + 1
  if __butter_yield_every > 0 and (__butter_calls % __butter_yield_every) == 0 then
    local co = __butter_main_co
    if co and type(coroutine) == "table" and type(coroutine.running) == "function"
       and coroutine.running() == co then
      -- Luau can yield across pcall; if this particular call site cannot
      -- yield, the error is swallowed and the VM simply carries on.
      pcall(function() coroutine.yield() end)
    end
  end
  return __butter_env
end

`;

// The diagnostic layers that are spliced into the header.
//
// DELIBERATELY NOT INCLUDED (they froze the client once the VM actually ran):
//   butter_nonfatal.lua  - swallows error() inside the VM; it also hid the
//                           real failure.  Errors now propagate and are shown.
//   butter_errhook.lua   - wraps pcall/xpcall with table.pack on EVERY call.
//   butter_rawset.lua    - wraps rawset.
//   butter_vmhook.lua    - walks every table the VM owns and wraps its
//                           pcall/loadstring/error in a Lua function.
const D = "deobfuscated/Butter_BABFT/";

// Two flavours of the same build:
//
//   node build_keyless.js          -> the DIAGNOSTIC build (what the user is
//                                     running now): every probe is on screen.
//   node build_keyless.js clean    -> the CLEAN build: the same key-system
//                                     removal and the same environment, but
//                                     with the probes removed.  Only the
//                                     progress panel (bottom left) and, if
//                                     something goes wrong, the error survive.
//
// The layers that are only there for diagnosis are NOT in the clean build:
//   butter_whatbuilt.lua   - patches Instance.new globally
//   butter_envprobe2.lua   - prints the environment probe
//   butter_missingglobals.lua
//   butter_genvlog.lua     - puts a metatable on the executor's getgenv() table
const DIAG_LAYERS = ["butter_box.lua", "butter_net.lua", "butter_envfix.lua",
  "butter_requirefix.lua", "butter_whatbuilt.lua", "butter_envprobe2.lua",
  "butter_missingglobals.lua", "butter_genvlog.lua", "butter_envshim2.lua",
  "butter_envshim.lua", "butter_debugshim.lua"];
const CLEAN_LAYERS = ["butter_box.lua", "butter_net.lua", "butter_envfix.lua",
  "butter_requirefix.lua", "butter_envshim2.lua", "butter_envshim.lua",
  "butter_debugshim.lua"];

const CLEAN = process.argv.includes("clean");
const layers = CLEAN ? CLEAN_LAYERS : DIAG_LAYERS;
console.log("mode: " + (CLEAN ? "CLEAN (diagnostics stripped)" : "DIAGNOSTIC"));
const diag = layers.map((f) => fsx.readFileSync(D + f, "latin1")).join("")
  + "\n__butter_diag = " + (CLEAN ? "false" : "true") + "\n";

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
      "});"
      + "__butter_P[\"require\"]=__butter_require;"
      + "__butter_P[\"debug\"]=__butter_dbg;"
      + "__butter_P[\"getfenv\"]=function(...) return __butter_env end;"
      + "__butter_P[\"setfenv\"]=__butter_setfenv;"
      // NOTE: nothing else is forced onto the VM's table, and no __newindex
      // guard is installed.  Walking the VM's own tables and wrapping its
      // pcall/error (butter_vmhook.lua) turned the VM's native calls into Lua
      // calls and froze the client - the VM resolves a global ~25 million
      // times per run.
      + "setmetatable(__butter_P,{__index=function(t,k) "
      + "if k==\"require\" then return __butter_require end; "
      + "if k==\"Require\" then return setmetatable({},{__index=function(_,kk) if kk==\"require\" then return __butter_require end; return nil end}) end; "
      + "if k==\"debug\" then return __butter_dbg end; "
      + "return nil end});"
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

const SUFFIX = CLEAN ? "_CLEAN" : "";
const dest = "deobfuscated/Butter_BABFT/ButterCooked_KEYLESS" + SUFFIX + ".lua";
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
  "",
  "  The protected script runs inside a coroutine and yields back to Roblox",
  "  every 100 000 global resolutions, so the game stays alive while the",
  "  Luraph VM works.  It is SLOW by nature - tens of millions of",
  "  resolutions - and the panel at the bottom left shows the progress.",
  "]]",
  "",
  "-- A panel drawn BEFORE the protected script starts, and updated while it",
  "-- runs.  It sits at the BOTTOM left so it never covers the Butter window",
  "-- (which opens at the top left).",
  "local __butter_runner_gui = nil",
  "local __butter_runner_label = nil",
  "__butter_runner_stop = false",
  "local function __butter_runner_panel(text)",
  "  pcall(function()",
  "    if __butter_runner_gui then",
  "      if __butter_runner_gui.Parent and __butter_runner_label then",
  "        __butter_runner_label.Text = text",
  "      end",
  "      return",
  "    end",
  "    local SG = Instance.new(\"ScreenGui\")",
  "    SG.Name = \"ButterRunner\"",
  "    SG.DisplayOrder = 99998",
  "    SG.IgnoreGuiInset = true",
  "    SG.ResetOnSpawn = false",
  "    local L = Instance.new(\"TextLabel\")",
  "    L.Size = UDim2.new(1, -60, 0, 240)",
  "    L.Position = UDim2.new(0, 30, 1, -270)",
  "    L.BackgroundColor3 = Color3.fromRGB(18, 18, 20)",
  "    L.BackgroundTransparency = 0.1",
  "    L.TextColor3 = Color3.fromRGB(120, 220, 140)",
  "    L.TextSize = 15",
  "    L.TextWrapped = true",
  "    L.TextXAlignment = Enum.TextXAlignment.Left",
  "    L.TextYAlignment = Enum.TextYAlignment.Top",
  "    L.Text = text",
  "    L.Parent = SG",
  "    do",
  "      local X = Instance.new(\"TextButton\")",
  "      X.Size = UDim2.new(0, 26, 0, 26)",
  "      X.Position = UDim2.new(1, -34, 0, 4)",
  "      X.BackgroundColor3 = Color3.fromRGB(160, 40, 40)",
  "      X.BackgroundTransparency = 0.15",
  "      X.TextColor3 = Color3.fromRGB(255, 255, 255)",
  "      X.TextSize = 18",
  "      X.Font = Enum.Font.GothamBold",
  "      X.Text = \"X\"",
  "      X.Parent = L",
  "      X.MouseButton1Click:Connect(function()",
  "        SG:Destroy()",
  "        __butter_runner_gui = nil",
  "        __butter_runner_label = nil",
  "      end)",
  "      local STOP = Instance.new(\"TextButton\")",
  "      STOP.Size = UDim2.new(0, 70, 0, 26)",
  "      STOP.Position = UDim2.new(0, 34, 0, 4)",
  "      STOP.BackgroundColor3 = Color3.fromRGB(150, 60, 40)",
  "      STOP.BackgroundTransparency = 0.15",
  "      STOP.TextColor3 = Color3.fromRGB(255, 255, 255)",
  "      STOP.TextSize = 14",
  "      STOP.Font = Enum.Font.GothamBold",
  "      STOP.Text = \"STOP\"",
  "      STOP.Parent = L",
  "      STOP.MouseButton1Click:Connect(function()",
  "        __butter_runner_stop = true",
  "        STOP.Text = \"STOPPING\"",
  "      end)",
  "    end",
  "    SG.Parent = game:GetService(\"CoreGui\")",
  "    __butter_runner_gui = SG",
  "    __butter_runner_label = L",
  "  end)",
  "end",
  "",
  "local __butter_runner_t0 = 0",
  "pcall(function() __butter_runner_t0 = os.clock() end)",
  "__butter_runner_panel(\"[Butter] starting the protected script...\")",
  "",
  "-- __butter_main_co is a GLOBAL on purpose: the header (which runs inside",
  "-- the coroutine) has to be able to see it in order to yield.",
  "__butter_main_co = coroutine.create(function(...)",
  "",
].join(NL);

const runnerPost = [
  "",
  "end)",
  "",
  "-- Drive the coroutine.  Each resume runs the VM until it yields (every",
  "-- 100 000 global resolutions), then Roblox gets a frame back.",
  "local __butter_runner_ok = false",
  "local __butter_runner_err = nil",
  "local __butter_runner_limit = 3600",
  "local __butter_RT = task",
  "if type(__butter_RT) ~= \"table\" or type(__butter_RT.wait) ~= \"function\" then",
  "  __butter_RT = { wait = function() end }",
  "end",
  "while true do",
  "  local ok, err = coroutine.resume(__butter_main_co)",
  "  if not ok then __butter_runner_err = err end",
  "  __butter_runner_ok = ok",
  "  if coroutine.status(__butter_main_co) == \"dead\" then break end",
  "  local t = 0",
  "  pcall(function() t = os.clock() - __butter_runner_t0 end)",
  "  __butter_runner_panel(string.format(",
  "    \"[Butter] protected script running...\\n%d s of CPU time, %s global resolutions\"",
  "    .. \"\\nthis is normal - the Luraph VM is heavy.  Please wait.\",",
  "    t, tostring(__butter_calls or 0)))",
  "  if t > __butter_runner_limit then",
  "    __butter_runner_err = \"the protected script did not finish within \"",
  "      .. tostring(__butter_runner_limit) .. \" seconds - it was stopped\"",
  "    break",
  "  end",
  "  if __butter_runner_stop then",
  "    __butter_runner_err = \"the protected script was stopped by the user\"",
  "    break",
  "  end",
  "  __butter_RT.wait()",
  "end",
  "",
  "-- The final report.  It goes to THREE places, because a message that is",
  "-- easy to miss is a message that is lost:",
  "--   1. the bottom-left panel (kept, not destroyed - it stays until X)",
  "--   2. the diagnostics panel at the top left",
  "--   3. a Roblox notification toast",
  "do",
  "  local lines = {}",
  "  local secs = \"?\"",
  "  pcall(function()",
  "    secs = tostring(math.floor((os.clock() - __butter_runner_t0) * 10) / 10)",
  "  end)",
  "  if __butter_runner_ok and __butter_runner_err == nil then",
  "    lines[#lines + 1] = \"FINISHED - the protected script ran to the end.\"",
  "  else",
  "    lines[#lines + 1] = \"STOPPED / FAILED:\"",
  "    lines[#lines + 1] = tostring(__butter_runner_err)",
  "  end",
  "  lines[#lines + 1] = \"CPU time: \" .. secs .. \" s\"",
  "  lines[#lines + 1] = \"global resolutions: \" .. tostring(__butter_calls or 0)",
  "  lines[#lines + 1] = \"HTTP requests: \" .. tostring((__butter_count and __butter_count.http) or 0)",
  "  local made = {}",
  "  pcall(function()",
  "    if type(__butter_made) == \"table\" then",
  "      for k, v in pairs(__butter_made) do made[#made + 1] = k .. \" x\" .. tostring(v) end",
  "    end",
  "  end)",
  "  lines[#lines + 1] = \"instances created: \" .. (#made > 0 and table.concat(made, \", \") or \"(none)\")",
  "  do",
  "    local names = {}",
  "    pcall(function()",
  "      if type(__butter_urls) == \"table\" then",
  "        for i = 1, #__butter_urls do names[#names + 1] = tostring(__butter_urls[i]) end",
  "      end",
  "    end)",
  "    if #names > 0 then",
  "      lines[#lines + 1] = \"URLs requested:\"",
  "      for i = 1, #names do lines[#lines + 1] = \"  \" .. names[i] end",
  "    end",
  "  end",
  "  local body = table.concat(lines, \"\\n\")",
  "  -- 1. the bottom-left panel (it is NOT destroyed any more)",
  "  __butter_runner_panel(\"[Butter] \" .. body)",
  "  -- 2. the diagnostics panel at the top left",
  "  if type(__butter_box) == \"function\" then",
  "    pcall(function()",
  "      __butter_box(\"[Butter] runner\", body)",
  "    end)",
  "  end",
  "  -- 3. a Roblox toast - hard to miss, even if both panels were dismissed",
  "  pcall(function()",
  "    local SG = game:GetService(\"StarterGui\")",
  "    SG:SetCore(\"SendNotification\", {",
  "      Title = \"Butter\",",
  "      Text = tostring(lines[1]) .. \"  (\" .. secs .. \" s, \" .. tostring(__butter_calls or 0) .. \" resolutions)\",",
  "      Duration = 20,",
  "    })",
  "  end)",
  "end",
  "",
].join(NL);

const runner = runnerPre + out + runnerPost;
fsx.writeFileSync("deobfuscated/Butter_BABFT/RUN_ME_Butter_BABFT_keyless" + SUFFIX + ".lua", runner, "latin1");
if (!CLEAN) fsx.writeFileSync("deobfuscated/Butter_BABFT/Butter_BABFT_keyless_loader.lua", runner, "latin1");
console.log("wrote RUN_ME_Butter_BABFT_keyless" + SUFFIX + ".lua  (" + runner.length + " bytes, self-contained)");

// the payload must be untouched
const re = /\[(=*)\[([\s\S]{200,}?)\]\1\]/g;
let m, a = null, b = null;
while ((m = re.exec(src))) if (m[2].startsWith("LPH")) { a = m[2]; break; }
re.lastIndex = 0;
while ((m = re.exec(out))) if (m[2].startsWith("LPH")) { b = m[2]; break; }
console.log("payload untouched:", a && b && a === b ? "YES" : "NO");
