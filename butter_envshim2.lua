-- ------------------------------------------------------------------
-- NEXT BUILD (ready to splice, NOT yet in the shipped file)
--
-- WHY THIS EXISTS
--   The current build's diagnostics were installed on `__REAL_ENV`,
--   but the Luraph VM never reads that table: `__butter_env` is a
--   COPY of it (build lines 27-28):
--       local __butter_env = {}
--       for k, v in pairs(__REAL_ENV) do __butter_env[k] = v end
--   So every hook placed on __REAL_ENV was invisible to the payload,
--   which is exactly why "debug.info called" / "original error" /
--   "gate read key" never appeared.
--
-- WHAT THIS DOES
--   1. installs the debug shim into EVERY table the payload could
--      read `debug` from:  __butter_env, _G, getgenv(), getfenv()
--      (plain assignment as well as rawset - rawset alone can fail)
--   2. gives __butter_env an __index FALLBACK, so *any* global the
--      payload looks up is non-nil.  The fallback only fires for names
--      that are missing from the snapshot, so the VM's ~25M getfenv()
--      calls stay cheap (the metatable is consulted on miss only).
--   3. reports, ON SCREEN, the type of `debug` in each candidate table
--      and whether the payload read `debug.info` - this is the probe
--      that identifies the nil.
-- ------------------------------------------------------------------
do
  local function __butter_shown2(title, body)
    pcall(function()
      local SG = Instance.new("ScreenGui")
      SG.Name = "ButterDiag2"
      SG.DisplayOrder = 99999
      SG.IgnoreGuiInset = true
      SG.ResetOnSpawn = false
      local L = Instance.new("TextLabel")
      L.Size = UDim2.new(1, -60, 0, 260)
      L.Position = UDim2.new(0, 30, 0, 380)
      L.BackgroundColor3 = Color3.fromRGB(18, 18, 20)
      L.BackgroundTransparency = 0.1
      L.TextColor3 = Color3.fromRGB(120, 220, 255)
      L.TextSize = 15
      L.TextWrapped = true
      L.TextXAlignment = Enum.TextXAlignment.Left
      L.TextYAlignment = Enum.TextYAlignment.Top
      L.Text = tostring(title) .. "\n" .. tostring(body)
      L.Parent = SG
      SG.Parent = game:GetService("CoreGui")
    end)
  end

  local function __butter_info(level, what, options)
    return {
      source = "@ButterCooked.lua", short_src = "ButterCooked.lua",
      currentline = 1, linedefined = 0, lastlinedefined = 0,
      name = "what", namewhat = "local",
      nups = 0, nparams = 0, isvararg = false,
      func = function() end,
    }
  end

  local __butter_debug_reads = 0

  -- the debug table the payload will actually see
  local function __butter_make_debug(real)
    if type(real) == "table" and type(real.info) == "function" and type(real.getinfo) == "function" then return real end
    if type(real) ~= "table" then real = {} end
    return setmetatable({}, {
      __index = function(_, k)
        if k == "info" or k == "getinfo" then
          return function(...)
            __butter_debug_reads = __butter_debug_reads + 1
            if __butter_debug_reads <= 3 then
              __butter_shown2("[Butter] debug." .. k .. " called",
                "call #" .. __butter_debug_reads .. "  level=" .. tostring((...)))
            end
            local r = __butter_info(...)
            if type(r) ~= "table" then return __butter_info(...) end
            return r
          end
        end
        local v = real[k]
        if v ~= nil then return v end
        return function() return nil end
      end,
    })
  end

  local __butter_dbg = __butter_make_debug((type(_G) == "table" and _G.debug) or nil)

  -- 1a. the table the VM resolves globals from  (THE IMPORTANT ONE)
  pcall(function() rawset(__butter_env, "debug", __butter_dbg) end)
  __butter_env.debug = __butter_dbg

  -- 1b. the real global table (plain assignment + rawset)
  pcall(function() _G.debug = __butter_dbg end)
  pcall(function() rawset(_G, "debug", __butter_dbg) end)

  -- 1c. getgenv()
  pcall(function()
    if type(getgenv) == "function" then
      local g = getgenv()
      if type(g) == "table" then
        g.debug = __butter_dbg
        pcall(function() rawset(g, "debug", __butter_dbg) end)
      end
    end
  end)

  -- 1d. getfenv()
  pcall(function()
    if type(getfenv) == "function" then
      local g = getfenv()
      if type(g) == "table" then
        g.debug = __butter_dbg
        pcall(function() rawset(g, "debug", __butter_dbg) end)
      end
    end
  end)

  -- 2. universal fallback for ANY missing global in the VM's env
  pcall(function()
    local mt = getmetatable(__butter_env)
    if mt == nil then
      setmetatable(__butter_env, {
        __index = function(t, k)
          if type(k) == "string" then
            if k == "debug" then return __butter_dbg end
            if k:lower():find("key") then return __butter_key end
          end
          return __butter_stub(tostring(k))
        end,
      })
    end
  end)

  -- 3. report what is where, on screen
  local function __butter_typeof(v)
    if type(v) == "table" then
      local i = v.info
      return "table(info=" .. tostring(type(i)) .. ")"
    end
    return type(v)
  end
  local __butter_report = {}
  __butter_report[#__butter_report + 1] = "env.debug   = " .. __butter_typeof(__butter_env.debug)
  __butter_report[#__butter_report + 1] = "_G.debug    = " .. __butter_typeof(type(_G) == "table" and _G.debug or nil)
  pcall(function()
    if type(getgenv) == "function" then
      local g = getgenv()
      __butter_report[#__butter_report + 1] = "genv.debug  = " .. __butter_typeof(type(g) == "table" and g.debug or nil)
    end
  end)
  pcall(function()
    if type(getfenv) == "function" then
      local g = getfenv()
      __butter_report[#__butter_report + 1] = "fenv.debug  = " .. __butter_typeof(type(g) == "table" and g.debug or nil)
    end
  end)
  __butter_report[#__butter_report + 1] = "debug reads so far: " .. tostring(__butter_debug_reads)
  __butter_shown2("[Butter] env probe", table.concat(__butter_report, "\n"))
end

