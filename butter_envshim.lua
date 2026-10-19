-- ------------------------------------------------------------------
-- Environment shim - MUST run before the Luraph VM builds its tables,
-- because the VM captures globals (including `debug`) from the real
-- global table at table-construction time.
--
-- Two things are guaranteed here:
--   1. `debug.info` / `debug.getinfo` exist and return a usable table
--      (the protected script reads source / currentline / linedefined /
--       namewhat out of them, and some clients don't ship debug.info)
--   2. the key names resolve, on the real global table and on getgenv(),
--      so the key gate can never see "no key"
-- ------------------------------------------------------------------
do
  local function __butter_debug_info(level, what, options)
    return {
      source = "@ButterCooked.lua", short_src = "ButterCooked.lua",
      currentline = 1, linedefined = 0, lastlinedefined = 0,
      name = "what", namewhat = "local",
      nups = 0, nparams = 0, isvararg = false,
      func = function() end,
    }
  end

  local function __butter_make_debug(real)
    if type(real) == "table" and real.info ~= nil then return real end
    if type(real) ~= "table" then real = {} end
    return setmetatable({}, {
      __index = function(_, k)
        if k == "info" or k == "getinfo" then return __butter_debug_info end
        local v = real[k]
        if v ~= nil then return v end
        return function() return nil end
      end,
    })
  end

  local __butter_key = "LD12345678999999"
  local __butter_keynames = { "LDKey", "LD_KEY", "script_key", "Key", "KEY", "key",
                              "ButterKey", "BUTTER_KEY", "ld_key", "ldkey" }

  -- 1. the global table
  pcall(function()
    local real = _G.debug
    if type(real) == "table" and rawget(real, "info") == nil then
      rawset(_G, "debug", __butter_make_debug(real))
    elseif type(real) ~= "table" then
      rawset(_G, "debug", __butter_make_debug(nil))
    end
  end)

  -- 2. getgenv()
  pcall(function()
    if type(getgenv) == "function" then
      local g = getgenv()
      if type(g) == "table" then
        if type(g.debug) ~= "table" or rawget(g.debug, "info") == nil then
          rawset(g, "debug", __butter_make_debug(g.debug))
        end
        for _, k in ipairs(__butter_keynames) do
          if g[k] == nil then rawset(g, k, __butter_key) end
        end
      end
    end
  end)

  -- 3. plain globals, for clients that expose the key as a bare global
  pcall(function()
    for _, k in ipairs(__butter_keynames) do
      if rawget(_G, k) == nil then rawset(_G, k, __butter_key) end
    end
  end)
end

