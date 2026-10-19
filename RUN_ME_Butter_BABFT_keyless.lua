--[[
  =============================================================
   BUTTER  -  Build A Boat For Treasure  (PlaceId 537413528)
   AUTOBUILDER  -  KEY SYSTEM REMOVED
   =============================================================
   Paste this into your executor (Xeno works) and run it.

   It loads our key-less copy of the Butter BABFT script:
     https://raw.githubusercontent.com/tobybt747-ship-it/Butter-BABFT-keyless/
        refs/heads/main/ButterCooked_KEYLESS.lua

   That file is the original protected script with the key gate neutralised:
     * the key the gate looks for is always present
     * the key server's answer is always a valid one
     * the gate can never kick you

   Xeno has no console, so everything is reported ON SCREEN as a
   notification in the top-left corner:
     "loaded"          -> the script chunk was fetched and started
     "script started" -> it ran without throwing
     "script error: " -> it threw, the message is the real problem
     anything else    -> printed by the script itself
  =============================================================
]]
do
  local function say(title, body)
    pcall(function()
      local SG = Instance.new("ScreenGui")
      SG.Name = "ButterLoader"
      SG.DisplayOrder = 99999
      SG.IgnoreGuiInset = true
      SG.ResetOnSpawn = false
      local L = Instance.new("TextLabel")
      L.Size = UDim2.new(1, -60, 0, 300)
      L.Position = UDim2.new(0, 30, 0, 30)
      L.BackgroundColor3 = Color3.fromRGB(18, 18, 20)
      L.BackgroundTransparency = 0.1
      L.TextColor3 = Color3.fromRGB(120, 220, 140)
      L.TextSize = 16
      L.TextWrapped = true
      L.TextXAlignment = Enum.TextXAlignment.Left
      L.TextYAlignment = Enum.TextYAlignment.Top
      L.Text = tostring(title) .. "\n" .. tostring(body)
      L.Parent = SG
      SG.Parent = game:GetService("CoreGui")
    end)
  end

  local SRC = "https://raw.githubusercontent.com/tobybt747-ship-it/Butter-BABFT-keyless/refs/heads/main/ButterCooked_KEYLESS.lua"

  say("[Butter] loading...", SRC)
  local okHttp, body = pcall(function() return game:HttpGet(SRC) end)
  if not okHttp or type(body) ~= "string" then
    say("[Butter] HTTP FAILED", tostring(body))
    return
  end
  say("[Butter] loaded", (#body) .. " bytes")

  local chunk, err = loadstring(body, "ButterCooked.lua")
  if not chunk then
    say("[Butter] loadstring FAILED", tostring(err))
    return
  end

  local ok, e = pcall(chunk)
  if ok then
    say("[Butter] script started", "no error thrown")
  else
    say("[Butter] script error", tostring(e))
  end
end
