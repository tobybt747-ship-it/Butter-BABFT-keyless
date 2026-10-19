--[[
  Butter (BABFT) - key-gate bypass loader
  Pulls the original protected script straight from GitHub and removes the
  key requirement before it runs.

  Paste this into your executor - no need to host anything.
]]
do
  local KEY = "BUTTER-BYPASS"   -- any non-empty string satisfies the gate
  local SRC = "https://raw.githubusercontent.com/kode-sec/Butter/refs/heads/main/ButterCooked.lua"

  ------------------------------------------------------------------
  -- 1. plant a key
  ------------------------------------------------------------------
  -- the upstream loader uses getgenv().LDKey / .LD_KEY / script_key
  local KNOWN = { "LDKey", "LD_KEY", "script_key", "Key", "KEY", "key",
                  "ButterKey", "BUTTER_KEY", "ld_key", "ldkey" }

  local ok, G = pcall(function() return getgenv() end)
  if ok and type(G) == "table" then
    for _, n in ipairs(KNOWN) do
      if G[n] == nil then pcall(function() G[n] = KEY end) end
    end
    -- catch-all: any *other* key-ish name the gate might use also resolves
    pcall(function()
      setmetatable(G, {
        __index = function(t, k)
          if type(k) == "string" and k:lower():find("key") then
            rawset(t, k, KEY)
            return KEY
          end
          return nil
        end,
      })
    end)
  end
  -- and the same names as plain globals
  for _, n in ipairs(KNOWN) do
    pcall(function() if rawget(_G, n) == nil then rawset(_G, n, KEY) end end)
  end
  pcall(function()
    if rawget(_G, "script_key") == nil then rawset(_G, "script_key", KEY) end
  end)

  ------------------------------------------------------------------
  -- 2. hard-block the kick
  ------------------------------------------------------------------
  -- the gate does Player:Kick("Couldn't find key!") - never let that land
  local ok2, Players = pcall(function() return game:GetService("Players") end)
  if ok2 and Players then
    local ok3, lp = pcall(function() return Players.LocalPlayer end)
    if ok3 and lp then
      pcall(function()
        lp.Kick = function(self, ...)
          warn("[Butter] kick suppressed: " .. tostring((select(2, ...))))
        end
      end)
    end
  end

  ------------------------------------------------------------------
  -- 3. run the original script
  ------------------------------------------------------------------
  local body = game:HttpGet(SRC)
  local chunk, err = loadstring(body, "ButterCooked.lua")
  if not chunk then
    error("[Butter] failed to load: " .. tostring(err))
  end
  local okr, e = pcall(chunk)
  if not okr then warn("[Butter] script error: " .. tostring(e)) end
end
