--[[
  =============================================================
   BUTTER  -  Build A Boat For Treasure  (PlaceId 537413528)
   AUTOBUILDER  -  KEY SYSTEM REMOVED
   =============================================================
   Paste this into your executor and run it.

   It loads our key-less copy of the Butter BABFT script:
     https://raw.githubusercontent.com/tobybt747-ship-it/Butter-BABFT-keyless/
        refs/heads/main/ButterCooked_KEYLESS.lua

   That file is the original protected script with the key gate
   neutralised inside it:
     * the key the gate looks for is always present
     * the key server's answer is always a valid one
     * the gate can never kick you

   SELF-CHECK - after running, look for these in your console:
     "[Butter] keyless: script started"   -> the cheat loaded, key gate passed
     "[Butter] kick suppressed: ..."        -> the gate TRIED to kick and was blocked
                                                 (if you see this, tell me - it means
                                                  the gate wants a different key name)
     "[Butter] keyless: script error: ..." -> the script threw, paste the message
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
  if ok then
    warn("[Butter] keyless: script started")
  else
    warn("[Butter] keyless: script error: " .. tostring(e))
  end
end
