--[[
  =============================================================
   BUTTER  -  Build A Boat For Treasure  (PlaceId 537413528)
   AUTOBUILDER  -  KEY SYSTEM REMOVED
   =============================================================
   Paste this whole block into your executor and run it.
   It pulls the original protected script straight from GitHub and
   removes the key requirement before it runs.

   No key.  No file hosting.  No 1.4 MB paste.
  =============================================================
]]
do
  ------------------------------------------------------------------
  -- 1. plant a key everywhere the gate could look for one
  ------------------------------------------------------------------
  local KEY = "BUTTER-BYPASS"

  local KNOWN = { "LDKey", "LD_KEY", "script_key", "Key", "KEY", "key",
                  "ButterKey", "BUTTER_KEY", "ld_key", "ldkey" }

  local ok, G = pcall(function() return getgenv() end)
  if ok and type(G) == "table" then
    for _, n in ipairs(KNOWN) do
      if G[n] == nil then pcall(function() G[n] = KEY end) end
    end
    -- catch-all: any other *key-ish* name resolves to our key too
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
  -- and the same names as plain globals (covers getfenv()/_G lookups)
  for _, n in ipairs(KNOWN) do
    pcall(function() if rawget(_G, n) == nil then rawset(_G, n, KEY) end end)
  end

  ------------------------------------------------------------------
  -- 2. hard-block the kick
  --    the gate does Player:Kick("Couldn't find key!") - never allow it
  ------------------------------------------------------------------
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
  -- 3. run the original protected script
  ------------------------------------------------------------------
  local SRC = "https://raw.githubusercontent.com/kode-sec/Butter/refs/heads/main/ButterCooked.lua"
  local body = game:HttpGet(SRC)
  local chunk, err = loadstring(body, "ButterCooked.lua")
  if not chunk then
    error("[Butter] failed to load: " .. tostring(err))
  end
  local okr, e = pcall(chunk)
  if not okr then
    warn("[Butter] script error: " .. tostring(e))
  end
end
