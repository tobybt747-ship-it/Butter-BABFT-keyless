-- ------------------------------------------------------------------
-- Visible diagnostics.
-- The Luraph VM swallows the protected script's errors (its own error
-- reporter can fail too), and Xeno has no console - so surface anything
-- the script prints or warns about as an on-screen notification.
-- ------------------------------------------------------------------
local function __butter_notify(title, body)
  pcall(function()
    local SG = Instance.new("ScreenGui")
    SG.Name = "ButterDiagnostics"
    SG.DisplayOrder = 99999
    SG.IgnoreGuiInset = true
    SG.ResetOnSpawn = false
    local L = Instance.new("TextLabel")
    L.Size = UDim2.new(1, -60, 0, 300)
    L.Position = UDim2.new(0, 30, 0, 30)
    L.BackgroundColor3 = Color3.fromRGB(18, 18, 20)
    L.BackgroundTransparency = 0.1
    L.TextColor3 = Color3.fromRGB(255, 120, 120)
    L.TextSize = 16
    L.TextWrapped = true
    L.TextXAlignment = Enum.TextXAlignment.Left
    L.TextYAlignment = Enum.TextYAlignment.Top
    L.Text = tostring(title) .. "\n" .. tostring(body)
    L.Parent = SG
    SG.Parent = game:GetService("CoreGui")
  end)
end

do
  local real_print = __REAL_ENV.print
  local real_warn = __REAL_ENV.warn
  __REAL_ENV.print = function(...)
    local t = {}
    for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end
    local msg = table.concat(t, " ")
    pcall(function() real_print(msg) end)
    __butter_notify("[Butter print]", msg)
  end
  __REAL_ENV.warn = function(...)
    local t = {}
    for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end
    local msg = table.concat(t, " ")
    pcall(function() real_warn(msg) end)
    __butter_notify("[Butter warn]", msg)
  end
end

