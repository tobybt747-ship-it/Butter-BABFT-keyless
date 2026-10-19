-- ------------------------------------------------------------------
-- Diagnostics round 2
--   * hook `error` so the ORIGINAL error message (before Luraph's
--     reporter destroys it) is shown on screen
--   * log every debug.info()/debug.getinfo() call so we can prove
--     whether the protected script is reaching for `debug` at all
--   * log the key-name reads the gate performs
-- ------------------------------------------------------------------
do
  local function __butter_shown(title, body)
    pcall(function()
      local SG = Instance.new("ScreenGui")
      SG.Name = "ButterDiagnostics"
      SG.DisplayOrder = 99999
      SG.IgnoreGuiInset = true
      SG.ResetOnSpawn = false
      local L = Instance.new("TextLabel")
      L.Size = UDim2.new(1, -60, 0, 320)
      L.Position = UDim2.new(0, 30, 0, 30)
      L.BackgroundColor3 = Color3.fromRGB(18, 18, 20)
      L.BackgroundTransparency = 0.1
      L.TextColor3 = Color3.fromRGB(255, 190, 120)
      L.TextSize = 16
      L.TextWrapped = true
      L.TextXAlignment = Enum.TextXAlignment.Left
      L.TextYAlignment = Enum.TextYAlignment.Top
      L.Text = tostring(title) .. "\n" .. tostring(body)
      L.Parent = SG
      SG.Parent = game:GetService("CoreGui")
    end)
  end

  -- 1. the original error message
  pcall(function()
    local real_error = __REAL_ENV.error
    if type(real_error) == "function" then
      __REAL_ENV.error = function(msg, level)
        __butter_shown("[Butter] original error", tostring(msg))
        return real_error(msg, level)
      end
    end
  end)

  -- 2. did the script actually call debug.info?
  pcall(function()
    local real = __REAL_ENV.debug
    if type(real) == "table" then
      local d = setmetatable({}, {
        __index = function(_, k)
          local v = real[k]
          if (k == "info" or k == "getinfo") then
            return function(...)
              __butter_shown("[Butter] debug." .. k .. " called", "args: " .. tostring((...)))
              local r = v(...)
              if type(r) ~= "table" then
                __butter_shown("[Butter] debug." .. k .. " returned", tostring(r))
              end
              return r
            end
          end
          if v ~= nil then return v end
          return function() return nil end
        end,
      })
      rawset(__REAL_ENV, "debug", d)
      pcall(function() rawset(_G, "debug", d) end)
      pcall(function()
        if type(getgenv) == "function" then rawset(getgenv(), "debug", d) end
      end)
    end
  end)

  -- 3. the key names the gate reads
  pcall(function()
    if type(getgenv) ~= "function" then return end
    local real_getgenv = getgenv
    local g = real_getgenv()
    if type(g) ~= "table" then return end
    setmetatable(g, {
      __index = function(t, k)
        local v = rawget(t, k)
        if v ~= nil then return v end
        if type(k) == "string" and k:lower():find("key") then
          __butter_shown("[Butter] gate read key", k)
          return "LD12345678999999"
        end
        return nil
      end,
    })
  end)
end

