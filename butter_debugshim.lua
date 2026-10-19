-- ------------------------------------------------------------------
-- The protected script (and Luraph's own error reporter) reach for
-- debug.info / debug.getinfo.  Roblox's Luau has debug.info, but not every
-- client does - and when it is missing the error is swallowed and the
-- script appears to "do nothing".  Guarantee it.
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

  local function __butter_fix_debug(tbl)
    if type(tbl) ~= "table" then return end
    local real = tbl.debug
    if type(real) == "table" and real.info ~= nil then return end
    if type(real) ~= "table" then
      real = { traceback = function() return "" end }
    end
    tbl.debug = setmetatable({}, {
      __index = function(_, k)
        if k == "info" or k == "getinfo" then return __butter_debug_info end
        local v = real[k]
        if v ~= nil then return v end
        return function() return nil end
      end,
    })
  end

  __butter_fix_debug(__butter_env)
  pcall(function() __butter_fix_debug(__REAL_ENV) end)
end

