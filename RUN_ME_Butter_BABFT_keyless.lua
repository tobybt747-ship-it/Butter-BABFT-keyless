--[[
  =============================================================
   BUTTER  -  Build A Boat For Treasure  (PlaceId 537413528)
   AUTOBUILDER  -  KEY SYSTEM REMOVED
   =============================================================
   Paste this into your executor and run it.

   It loads our key-less copy of the Butter BABFT script from GitHub
   (ButterCooked_KEYLESS.lua) - that file is the original protected
   script with the key gate neutralised inside it, so no key, no
   key server and no "Couldn't find key!" kick.
  =============================================================
]]
do
  local SRC = "https://raw.githubusercontent.com/tobybt747-ship-it/Butter-BABFT-keyless/refs/heads/main/ButterCooked_KEYLESS.lua"

  local body = game:HttpGet(SRC)
  local chunk, err = loadstring(body, "ButterCooked.lua")
  if not chunk then
    error("[Butter] failed to load: " .. tostring(err))
  end
  local ok, e = pcall(chunk)
  if not ok then
    warn("[Butter] script error: " .. tostring(e))
  end
end
