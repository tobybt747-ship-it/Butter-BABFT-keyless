-- Harness for Luraph-protected scripts (Roblox/Luau target)
local realprint = print
local OCONCAT = table.concat
local OSELECT = select
local OTOSTRING = tostring
local OTYPE = type
local OFMT = string.format
local ORIGLOAD = loadstring

local function w(...)
  local n = OSELECT("#", ...)
  local t = {}
  for i = 1, n do t[i] = OTOSTRING((OSELECT(i, ...))) end
  realprint(OCONCAT(t, "\t"))
end

-- NOTE: getfenv(0) in Luau returns the READ-ONLY global table, so new globals
-- (Instance, Enum, task, ...) can never be added to it.  Build a fresh table.
local env = {}
for k, v in pairs(_G) do
  if env[k] == nil then env[k] = v end
end

-- Luau 0.743 lacks some stdlib the Luraph VM expects
local XP = function(f, handler, ...)
  local r = { pcall(f, ...) }
  if not r[1] then
    if type(handler) == "function" then error(handler(r[2])) end
    error(r[2])
  end
  return unpack(r, 1, #r)
end
env.xpcall = XP
if env.unpack == nil then env.unpack = unpack end
if env.loadstring == nil then env.loadstring = loadstring end

------------------------------------------------------------------
-- Roblox globals
------------------------------------------------------------------
local function newproxy(name)
  local t = {}
  local mt = {}
  mt.__index = function(tt, k)
    if k == "__name" then return name end
    if k == "new" then return function(...) return newproxy(name .. ".new") end end
    return function(...) return newproxy(name .. "." .. tostring(k)) end
  end
  mt.__call = function(self, ...) return newproxy(name .. "()") end
  mt.__tostring = function() return name end
  mt.__concat = function(a, b) return OTOSTRING(a) .. OTOSTRING(b) end
  mt.__len = function() return 0 end
  return setmetatable(t, mt)
end

local function makeClass(name, extra)
  local c = {}
  c.__index = c
  c.__name = name
  c.__tostring = function() return name end
  c.__call = function(self, ...) return setmetatable({}, c) end
  -- every class gets a .new (Luraph's VM table does e.g. H[98]=Color3.new)
  c.new = function(...) return setmetatable({}, c) end
  for k, v in pairs(extra or {}) do c[k] = v end
  return c
end

local function enumSet(names)
  local t = {}
  for _, n in ipairs(names) do
    local e = {}
    for _, m in ipairs({ "Default", "Bold", "Regular", "Medium", "Italic", "BoldItalic", "Quart", "Quint", "Cubic",
                         "Sine", "Expo", "Circ", "Back", "Elastic", "Bounce", "In", "Out", "InOut", "Left", "Right",
                         "Center", "Top", "Bottom", "Fit", "Stretch", "Crop", "None", "X", "Y", "XY", "Ascending",
                         "Descending", "LayoutOrder", "Name", "Enum", "Classic", "Force", "Perspective", "Orthographic" }) do
      e[m] = m
    end
    t[n] = e
  end
  return t
end

env.Instance = makeClass("Instance", { new = function(...) return newproxy("Instance") end })
env.Vector3 = makeClass("Vector3", {
  new = function(x, y, z) return setmetatable({ x = x or 0, y = y or 0, z = z or 0 }, env.Vector3) end,
  zero = setmetatable({ x = 0, y = 0, z = 0 }, makeClass("Vector3")),
  one = setmetatable({ x = 1, y = 1, z = 1 }, makeClass("Vector3")),
})
env.Vector2 = makeClass("Vector2", { new = function(x, y) return setmetatable({ X = x or 0, Y = y or 0 }, env.Vector2) end })
env.CFrame = makeClass("CFrame", { new = function(...) return setmetatable({}, env.CFrame) end })
env.Color3 = makeClass("Color3", {
  fromRGB = function(r, g, b) return setmetatable({ R = r or 0, G = g or 0, B = b or 0 }, env.Color3) end,
  fromHSV = function(h, s, v) return setmetatable({ R = 0, G = 0, B = 0 }, env.Color3) end,
  fromHex = function(h) return setmetatable({ R = 0, G = 0, B = 0 }, env.Color3) end,
})
env.UDim2 = makeClass("UDim2", { new = function(...) return setmetatable({}, env.UDim2) end })
env.UDim = makeClass("UDim", { new = function(...) return setmetatable({}, env.UDim) end })
env.Enum = makeClass("Enum")
for k, v in pairs(enumSet({ "FontWeight", "EasingStyle", "EasingDirection", "ScaleType", "TextXAlignment",
                             "TextYAlignment", "HorizontalAlignment", "VerticalAlignment", "AutomaticSize",
                             "Font", "SortOrder", "FillDirection", "ZIndexBehavior", "SizeConstraint",
                             "ApplyStrokeMode", "CameraType", "RenderingMode", "ThroatType", "CollisionType",
                             "Material", "PartType", "RigidbodyType", "Enum" })) do env.Enum[k] = v end
env.NumberSequence = makeClass("NumberSequence")
env.Path2DControlPoint = makeClass("Path2DControlPoint", {
  new = function(...) return setmetatable({}, env.Path2DControlPoint) end,
})
env.Path2D = makeClass("Path2D", {
  new = function(...) return setmetatable({}, env.Path2D) end,
})
env.NumberRange = makeClass("NumberRange", { new = function(...) return setmetatable({}, env.NumberRange) end })
env.ColorSequence = makeClass("ColorSequence")
env.ColorSequenceKeypoint = makeClass("ColorSequenceKeypoint")
env.Gradient = makeClass("Gradient")
env.DateTime = makeClass("DateTime")
env.Faces = makeClass("Faces")
env.Axes = makeClass("Axes")
env.RenderPriority = makeClass("RenderPriority")
env.NumberSequenceKeypoint = makeClass("NumberSequenceKeypoint", {
  new = function(...) return setmetatable({}, env.NumberSequenceKeypoint) end,
})
env.TweenInfo = makeClass("TweenInfo")
env.Random = makeClass("Random", { new = function(...) return setmetatable({}, env.Random) end })
env.BrickColor = makeClass("BrickColor")
env.Ray = makeClass("Ray")
env.Rect = makeClass("Rect")
env.Region3 = makeClass("Region3")
env.PhysicalProperties = makeClass("PhysicalProperties")
env.Font = makeClass("Font")
env.Coin = makeClass("Coin")
env.PhysicsService = newproxy("PhysicsService")
env.HttpService = {
  JSONEncode = function(t) return "{}" end,
  JSONDecode = function(s) return {} end,
  GenerateGUID = function() return "00000000-0000-0000-0000-000000000000" end,
}
env.Part = makeClass("Part")
env.Script = makeClass("Script")
env.LocalScript = makeClass("LocalScript")
env.ModuleScript = makeClass("ModuleScript")
env.Camera = makeClass("Camera")
env.Players = newproxy("Players")
env.Workspace = newproxy("Workspace")
env.Lighting = newproxy("Lighting")
env.Teams = newproxy("Teams")
env.CollectionService = newproxy("CollectionService")
env.UserInputService = newproxy("UserInputService")
env.RunService = newproxy("RunService")
env.TweenService = newproxy("TweenService")
env.ReplicatedStorage = newproxy("ReplicatedStorage")
env.ServerStorage = newproxy("ServerStorage")
env.StarterGui = newproxy("StarterGui")
env.StarterPack = newproxy("StarterPack")
env.SoundService = newproxy("SoundService")
env.ContextActionService = newproxy("ContextActionService")
env.VirtualInputManager = newproxy("VirtualInputManager")
env.TextService = newproxy("TextService")
env.TeleportService = newproxy("TeleportService")
env.Players.LocalPlayer = newproxy("LocalPlayer")
env.game = newproxy("game")
env.workspace = newproxy("workspace")
env.script = newproxy("script")
env.__genv = env.__genv or {}
env.getgenv = function() return env.__genv end
env.getrenv = function() return env.__genv end
env.cloneref = function(x) return x end
env.setreadonly = function(t) return t end
env.getreadonly = function(t) return t end
env.isreadonly = function() return false end
env.newcclosure = function(f) return f end
env.hookfunction = function() return function() end end
env.hookmetamethod = function() return function() end end
env.gethwid = function() return "0123456789ABCDEF0123456789ABCDEF" end
env.setclipboard = function(s) end
env.getcallingscript = function() return newproxy("script") end
env.request = function() return { StatusCode = 200, Body = "{}" } end
env.http_request = env.request
env.http = { request = env.request }
env.syn = { request = env.request }
env.task = { spawn = function(f, ...) return f(...) end, defer = function(f, ...) end, wait = function() end, delay = function(f, ...) end, cancel = function() end }
env.wait = function() end
env.spawn = function(f, ...) return f(...) end
env.delay = function(_, f) return f end
env.tick = function() return 0 end
env.settings = { Loading = false }
env.makefolder = function() end
env.isfile = function() return false end
env.readfile = function() return "" end
env.writefile = function() end
env.delfile = function() end
env.appendfile = function() end
env.listfiles = function() return {} end
env.getgenv().LDKey = "x"

------------------------------------------------------------------
-- Instrument the string/bit libraries that Luraph's VM embeds
------------------------------------------------------------------
local envStr = {}
local seen = {}
local strcalls = 0
local maxlen = 0
local charbuf = {}
local charcount = 0
local ring = {}
for k, v in pairs(string) do envStr[k] = v end
local function RING(x)
  ring[#ring + 1] = x
  if #ring > 120 then table.remove(ring, 1) end
end
local function noteStr(s)
  if OTYPE(s) == "string" then
    if #s > maxlen then maxlen = #s end
    RING((#s > 60) and ("<str " .. #s .. ">") or s)
    if #s > 300 and not seen[s] then
      seen[s] = true
      w("[[[STR-BEGIN:" .. #s .. "]]]")
      w(s)
      w("[[[STR-END]]]")
    end
  end
end
for _, k in ipairs({ "sub", "byte", "gsub", "match", "find", "rep", "reverse", "len", "format", "gmatch" }) do
  local orig = envStr[k]
  if OTYPE(orig) == "function" then
    envStr[k] = function(...)
      strcalls = strcalls + 1
      local a = OSELECT(1, ...)
      if OTYPE(a) == "string" then noteStr(a) end
      local res = table.pack(orig(...))
      if k == "gsub" and OTYPE(res[1]) == "string" and #res[1] > 1000 and not seen["GSUB:" .. #res[1]] then
        seen["GSUB:" .. #res[1]] = true
        w("[[[GSUB-BEGIN:" .. #res[1] .. "]]]")
        w(res[1])
        w("[[[GSUB-END]]]")
      end
      return table.unpack(res, 1, res.n)
    end
  end
end
local origchar = envStr.char
envStr.char = function(...)
  strcalls = strcalls + 1
  local n = OSELECT("#", ...)
  for i = 1, n do
    charcount = charcount + 1
    charbuf[charcount] = OSELECT(i, ...)
  end
  local r = origchar(...)
  if charcount > 2000 then
    w("[[[CHARBUF:" .. charcount .. "]]]")
    charbuf = {}
    charcount = 0
  end
  return r
end
env.string = envStr

-- hook table.concat (Luraph may assemble the payload that way)
local envTable = {}
for k, v in pairs(env.table) do envTable[k] = v end
local origconcat = envTable.concat
envTable.concat = function(...)
  local r = origconcat(...)
  if OTYPE(r) == "string" and #r > 300 then
    w("[[[CONCAT:" .. #r .. "]]]")
    w(r)
    w("[[[CONCAT-END]]]")
  end
  return r
end
env.table = envTable

local envBit = {}
if env.bit32 then
  for k, v in pairs(env.bit32) do envBit[k] = v end
else
  envBit = { band = function() end, bor = function() end, bxor = function() end, bnot = function() end,
             lshift = function() end, rshift = function() end, arshift = function() end }
end
env.bit32 = envBit

------------------------------------------------------------------
-- loadstring capture
------------------------------------------------------------------
local captured = 0
env.__CAPTURED = {}
local function capture(s, name)
  captured = captured + 1
  local n = OFMT("cap_%02d", captured)
  w("[[[CAPTURE-BEGIN:" .. n .. ":" .. OTOSTRING(#OTOSTRING(s)) .. "]]]")
  w(OTOSTRING(s))
  w("[[[CAPTURE-END]]]")
  return function(...) return nil end
end
env.loadstring = function(s, name) return capture(s, name) end
env.load = function(s, name) return capture(s, name) end
env.print = function(...) w("[PRINT]", ...) end


-- Roblox GUI classes (the protected script builds its whole UI with these)
do
  local GUI = {
    Frame = true, TextButton = true, TextLabel = true, ScrollingFrame = true,
    ImageLabel = true, ImageButton = true, TextBox = true, ViewportFrame = true,
    ScreenGui = true, Folder = true, CanvasGroup = true, UIListLayout = true,
    UIPadding = true, UICorner = true, UIStroke = true, UIGradient = true,
    UIScale = true, UITextSizeConstraint = true, UIAspectRatioConstraint = true,
    UISizeConstraint = true, UIStroke = true, UIGradient = true, VideoFrame = true,
    ParticleEmitter = true, SoundService = true, Lighting = true, TweenService = true,
    RunService = true, Players = true, UserInputService = true, ContextActionService = true,
    TextService = true, HttpService = true, Workspace = true, ReplicatedStorage = true,
    StarterGui = true, Sound = true, LayerCollector = true, PlayerGui = true,
  }
  for name in pairs(GUI) do
    if env[name] == nil then
      local c = makeClass(name, {
        new = function(...)
          local o = setmetatable({}, { __index = function(_, k)
            if k == "Name" then return name end
            if k == "Visible" then return true end
            if k == "Parent" then return nil end
            if k == "AbsoluteSize" then return { X = 0, Y = 0 } end
            if k == "Size" then return { X = 0, Y = 0 } end
            if k == "Position" then return { X = 0, Y = 0 } end
            if k == "GetChildren" then return function() return {} end end
            if k == "FindFirstChild" then return function() return nil end end
            if k == "FindFirstChildOfClass" then return function() return nil end end
            if k == "WaitForChild" then return function() return nil end end
            if k == "IsA" then return function(_, cls) return cls == name end end
            if k == "Connect" then return function() return { Disconnect = function() end } end end
            if k == "Disconnect" then return function() end end
            if k == "Destroy" then return function() end end
            if k == "Clone" then return function() return setmetatable({}, getmetatable(o)) end end
            if k == "GetService" then return function() return nil end end
            return function(...) return nil end
          end })
          return o
        end,
      })
      env[name] = c
    end
  end
end

w("[HARNESS] roblox+luraph ready")

-- trace every byte the VM pulls out of the payload buffer
do
  local bn = 0
  local bytes = {}
  local realbuf = buffer
  local patched = {}
  for k, v in pairs(realbuf) do patched[k] = v end
  local function wrapbuf(t, tag)
    return setmetatable({}, {
      __index = function(_, k)
        local f = realbuf[k]
        if type(f) == "function" then
          return function(b, off, ...)
            if tag == "read" and type(off) == "number" then
              bn = bn + 1
              if bn <= 60000 then bytes[#bytes + 1] = string.format("%d:%02x", off, string.byte(realbuf.tostring(b), off + 1)) end
            end
            return f(b, off, ...)
          end
        end
        return f
      end,
    })
  end
  env.__patchedbuf = patched
end

-- report any global the protected script looks up but we don't provide
do
  local miss = {}
  setmetatable(env, {
    __index = function(t, k)
      if OTYPE(k) == "string" then
        if not miss[k] then
          miss[k] = true
          w("[MISSING] " .. k)
        end
      end
      return nil
    end,
  })
end

-- _G must point at our sandbox env (Luau's real _G is read-only and has no Roblox globals)
env._G = env
env.getfenv = function(...) return env end
env.setfenv = function() end

local chunk, err = ORIGLOAD(SRC, "target.lua")
if not chunk then
  w("[HARNESS] LOAD ERROR: " .. OTOSTRING(err))
  return
end
setfenv(chunk, env)
local ok, e = XP(chunk, function(err)
  local tb = ""
  if debug and debug.traceback then tb = debug.traceback(tostring(err), 2) end
  return OTOSTRING(err) .. "\n" .. tb
end)

-- ------------------------------------------------------------------
-- Deep trace: log every Instance.new class, string literal and call
-- ------------------------------------------------------------------
do
  local out = {}
  local function T(...)
    local t = { ... }
    local p = {}
    for i = 1, #t do p[i] = tostring(t[i]) end
    out[#out + 1] = table.concat(p, " ")
    if #out > 200000 then out = {} end
  end
  env.__T = T
  env.__TOUT = out

  -- Instance.new("Frame") etc.
  local realNew = env.Instance.new
  env.Instance.new = function(class, ...)
    T("[Instance.new] " .. tostring(class))
    local o = realNew(class, ...)
    return o
  end
  for _, cls in ipairs({ "Frame", "TextButton", "TextLabel", "ScrollingFrame", "UIListLayout", "UIPadding",
                         "UICorner", "UIStroke", "UIGradient", "UIScale", "UITextSizeConstraint",
                         "ImageLabel", "ImageButton", "TextBox", "ViewportFrame", "ScreenGui", "Folder",
                         "CanvasGroup", "UIGradient", "UIStroke" }) do
    if env[cls] and env[cls].new then
      local rn = env[cls].new
      env[cls].new = function(...)
        T("[" .. cls .. ".new]")
        return rn(...)
      end
    end
  end
  -- log string arguments passed to any env function
  for k, v in pairs(env) do
    if type(v) == "function" and k ~= "print" and k ~= "w" then
      env[k] = function(...)
        for i = 1, select("#", ...) do
          local a = select(i, ...)
          if type(a) == "string" and #a > 2 then T("[" .. k .. "] " .. a) end
        end
        return v(...)
      end
    end
  end
end

w("[HARNESS] done ok=" .. OTOSTRING(ok) .. " err=" .. OTOSTRING(e))
if env.__TOUT and #env.__TOUT > 0 then
  w("[[[TRACE-BEGIN:" .. #env.__TOUT .. "]]]")
  for i = 1, #env.__TOUT do w(env.__TOUT[i]) end
  w("[[[TRACE-END]]]")
end
if #ring > 0 then
  w("[HARNESS] last string calls:")
  for i = 1, #ring do w("  [R" .. i .. "] " .. OTOSTRING(ring[i])) end
end
w("[HARNESS] string calls=" .. OTOSTRING(strcalls) .. " maxlen=" .. OTOSTRING(maxlen) ..
  " captures=" .. OTOSTRING(captured))
if charcount > 0 then
  w("[[[CHARBUF-FINAL:" .. charcount .. "]]]")
end
