-- ------------------------------------------------------------------
-- Network + runtime layer.  THIS IS THE LAYER THAT WAS MISSING.
--
-- WHY
--   The protected script does NOT read the key from getgenv() - the
--   payload's identifier list (301 names) has no "getgenv" in it.  It
--   asks a key SERVER and kicks with "Couldn't find key!" when the
--   answer is no.  The server answer is reached through
--   HttpService, i.e.
--       game:GetService("HttpService"):RequestAsync(url, ...)
--   and the previous build never intercepted that:
--     * "HttpService" is not a global in Roblox, so the override on
--       the global table was dead code;
--     * "game.HttpGet" cannot be replaced on a Roblox instance;
--     * "request" was overridden on __REAL_ENV, but __butter_env is a
--       COPY taken before the override, so the payload still got the
--       executor's original "request".
--   => the key request went out for real, came back "invalid", the
--      kick was swallowed, the script returned, and NOTHING was built.
--      That is exactly the symptom that was chased for hours.
--
-- WHAT THIS DOES
--   1. Installs the whole network layer on __butter_env - the ONE
--      table the VM resolves the payload's globals through:
--        request(), http.request, http.get, HttpService (RequestAsync /
--        GetAsync / PostAsync / JSONDecode) and a transparent `game`
--        proxy that intercepts GetService() and HttpGet().
--   2. Answers the key server with a table that satisfies EVERY
--      plausible check (array part AND named fields), so the gate
--      cannot fail whatever shape it expects.
--   3. Plants the key under every name the gate might use, in
--      getgenv(), in _G and in the environment snapshot.
--   4. Repairs task.spawn: if the client's task.spawn does not
--      actually run the function, it is run here.
--   5. Counts what the payload does, so we can tell "the script never
--      started" from "the script started and then failed".
-- ------------------------------------------------------------------

do
  __butter_count = __butter_count or {}

  local function __butter_bump(k)
    __butter_count[k] = (__butter_count[k] or 0) + 1
  end

  local KEY = "LD12345678999999"
  local KEYNAMES = { "LDKey", "LD_KEY", "script_key", "Key", "KEY", "key",
                     "ButterKey", "BUTTER_KEY", "ld_key", "ldkey" }

  -- ------------------------------------------------------------------
  -- the answer the key server gives
  -- ------------------------------------------------------------------
  local function __butter_key_table()
    local t = {}
    t[1] = KEY
    t[2] = KEY
    t.key = KEY
    t.keys = { KEY }
    t.hwid = "1"
    t.valid = true
    t.success = true
    t.ok = true
    t.active = true
    t.activated = true
    t.authorized = true
    t.verified = true
    t.enabled = true
    t.banned = false
    t.expired = false
    t.revoked = false
    t.status = "valid"
    t.result = "valid"
    t.state = "active"
    t.message = "ok"
    t.status_message = "Key is valid"
    t.msg = "ok"
    t.code = 200
    t.statusCode = 200
    t.httpStatus = 200
    t.expires = 0
    t.expiry = "never"
    t.duration = 0
    t.script = "BUTTER_HUB"
    t.user = "user"
    t.username = "user"
    t.data = {
      key = KEY, valid = true, active = true, success = true, status = "valid",
      keys = { KEY }, data = { key = KEY, valid = true, active = true },
    }
    return t
  end

  local KEYBODY = '{"1":"' .. KEY .. '","key":"' .. KEY .. '","keys":["' .. KEY .. '"],'
    .. '"valid":true,"success":true,"ok":true,"active":true,"activated":true,'
    .. '"authorized":true,"verified":true,"enabled":true,"banned":false,"expired":false,'
    .. '"status":"valid","result":"valid","state":"active","message":"ok",'
    .. '"status_message":"Key is valid","code":200,"statusCode":200,"hwid":"1",'
    .. '"expires":0,"expiry":"never","script":"BUTTER_HUB","user":"user",'
    .. '"data":{"key":"' .. KEY .. '","valid":true,"active":true,"success":true,'
    .. '"status":"valid","keys":["' .. KEY .. '"]}}'

  -- Butter's UI loads the LenyUI modules from
  --   https://raw.githubusercontent.com/tip52/Leny-UI/refs/heads/main/Modules/*.lua
  -- and that repository is gone (404).  We publish the same modules in
  -- our own repository and redirect the payload's requests to them.
  local __butter_repo_base =
    "https://raw.githubusercontent.com/tobybt747-ship-it/Butter-BABFT-keyless/refs/heads/main/LenyUI/Modules/"

  local function __butter_is_module_url(u)
    return (u:find("Leny", 1, true) ~= nil) or (u:find("Modules/", 1, true) ~= nil)
  end

  local function __butter_rewrite_url(u)
    if not __butter_is_module_url(u) then return u end
    local file = string.match(u, "Modules/([^/?%s]+%.lua)")
    if file then return __butter_repo_base .. file end
    return u
  end

  -- ------------------------------------------------------------------
  -- the real network, captured before anything is replaced
  -- ------------------------------------------------------------------
  local __butter_real_game = __butter_env.game
  local __butter_real_httpget = nil
  pcall(function()
    if type(__butter_real_game) == "table" and type(__butter_real_game.HttpGet) == "function" then
      __butter_real_httpget = function(url) return __butter_real_game:HttpGet(url) end
    end
  end)
  if type(__butter_real_httpget) ~= "function" then
    pcall(function()
      local g = (_G and _G.game) or nil
      if type(g) == "table" and type(g.HttpGet) == "function" then
        __butter_real_httpget = function(url) return g:HttpGet(url) end
      end
    end)
  end

  -- ------------------------------------------------------------------
  -- one place that decides what a URL gets back
  -- ------------------------------------------------------------------
  local __butter_net_shown = 0
  local function __butter_body_for(url)
    local u = tostring(url or "")
    __butter_bump("http")
    local n = __butter_count.http
    if n <= 4 and type(__butter_box) == "function" then
      __butter_net_shown = __butter_net_shown + 1
      local short = u
      if #short > 96 then short = string.sub(short, 1, 96) .. "..." end
      pcall(function()
        __butter_box("[Butter] net #" .. n, short, 460, Color3.fromRGB(20, 30, 50))
      end)
    end

    -- the LenyUI modules have to be REAL, and they live in our repo now
    if __butter_is_module_url(u) then
      local target = __butter_rewrite_url(u)
      if type(__butter_real_httpget) == "function" then
        local ok, res = pcall(function() return __butter_real_httpget(target) end)
        if ok and type(res) == "string" and #res > 0 then return res end
      end
      return "return {}"
    end

    -- everything else is the key server (or something we do not know
    -- yet) -> answer "valid"
    return KEYBODY
  end

  local function __butter_http_result(body)
    return {
      Success = true, ok = true, StatusCode = 200, Status = 200,
      StatusMessage = "OK", Body = body, body = body,
      Headers = { ["content-type"] = "application/json" },
      GetService = function() return __butter_http_result(body) end,
    }
  end

  -- ------------------------------------------------------------------
  -- HttpService, reached through game:GetService("HttpService")
  -- ------------------------------------------------------------------
  local function __butter_wrap_http_service(real)
    if type(real) ~= "table" then return real end
    return setmetatable({}, {
      __index = function(_, k)
        if k == "RequestAsync" then
          return function(self, url, opts)
            return __butter_http_result(__butter_body_for(url))
          end
        end
        if k == "GetAsync" then
          return function(self, url) return __butter_body_for(url) end
        end
        if k == "PostAsync" then
          return function(self, url, body, headers)
            return __butter_http_result(__butter_body_for(url))
          end
        end
        if k == "JSONDecode" then
          return function(self, s)
            if type(s) == "string" and s == KEYBODY then return __butter_key_table() end
            local v = real[k]
            if type(v) == "function" then
              local ok, res = pcall(function() return v(real, s) end)
              if ok and res ~= nil then return res end
            end
            return __butter_key_table()
          end
        end
        local v = real[k]
        if type(v) == "function" then
          return function(self, ...) return v(real, ...) end
        end
        return v
      end,
      __newindex = function(_, k, v) pcall(function() rawset(real, k, v) end) end,
      __tostring = function() return "HttpService" end,
    })
  end

  -- ------------------------------------------------------------------
  -- `game` - a transparent proxy that intercepts GetService and HttpGet
  -- ------------------------------------------------------------------
  local __butter_http_service_proxy = nil
  local function __butter_wrap_game(real)
    if type(real) ~= "table" then return real end
    -- Bound methods are CACHED.  The proxy's __index must not allocate a new
    -- closure on every single access - the script touches `game` a lot.
    local bound = {}
    local function __butter_bind(k, v)
      local f = bound[k]
      if f == nil then
        f = function(self, ...) return v(real, ...) end
        bound[k] = f
      end
      return f
    end
    return setmetatable({}, {
      __index = function(_, k)
        if k == "GetService" then
          return function(self, name, ...)
            if name == real then
              -- called with a dot instead of a colon
              local t = table.pack(...)
              return real:GetService(t[1], table.unpack(t, 2, t.n))
            end
            __butter_bump("getservice")
            local svc = real:GetService(name, ...)
            if name == "HttpService" then
              if __butter_http_service_proxy == nil then
                __butter_http_service_proxy = __butter_wrap_http_service(svc)
              end
              svc = __butter_http_service_proxy
            end
            return svc
          end
        end
        if k == "HttpGet" then
          return function(self, url) return __butter_body_for(url) end
        end
        local v = real[k]
        if type(v) == "function" then return __butter_bind(k, v) end
        return v
      end,
      __newindex = function(_, k, v) pcall(function() rawset(real, k, v) end) end,
      __pairs = function() return pairs(real) end,
      __iter = function() return next, real, nil end,
      __tostring = function() return "game" end,
    })
  end

  -- ------------------------------------------------------------------
  -- install the network layer on __butter_env (the table the VM reads)
  -- ------------------------------------------------------------------
  do
    -- request(url, opts) and request({Url=..., Method=..., Body=...})
    local real_request = __butter_env.request
    __butter_env.request = function(a, b)
      local url = a
      if type(a) == "table" then url = a.Url or a.url or a[1] end
      return __butter_http_result(__butter_body_for(url))
    end

    -- the http table
    local real_http = __butter_env.http
    local httpw = {}
    if type(real_http) == "table" then
      for k, v in pairs(real_http) do httpw[k] = v end
    end
    httpw.request = function(url, opts, cb)
      local body = __butter_body_for(url)
      local res = __butter_http_result(body)
      if type(opts) == "function" then cb = opts end
      if type(cb) == "function" then pcall(function() cb(res) end) end
      return res
    end
    httpw.get = function(url, cb)
      local body = __butter_body_for(url)
      if type(cb) == "function" then pcall(function() cb(body) end) end
      return body
    end
    __butter_env.http = httpw

    -- HttpService, when it is a plain global
    local real_hs = __butter_env.HttpService
    if type(real_hs) == "table" then
      __butter_env.HttpService = __butter_wrap_http_service(real_hs)
    end

    -- game
    if type(__butter_real_game) == "table" then
      __butter_env.game = __butter_wrap_game(__butter_real_game)
    end
  end

  -- ------------------------------------------------------------------
  -- the key, under every name it might be read from
  -- ------------------------------------------------------------------
  do
    local function __butter_plant(t)
      if type(t) ~= "table" then return end
      for _, k in ipairs(KEYNAMES) do
        if t[k] == nil then pcall(function() t[k] = KEY end) end
      end
    end
    __butter_plant(__butter_env)
    pcall(function() __butter_plant(_G) end)
    pcall(function()
      if type(__REAL_ENV.getgenv) == "function" then
        local ok, g = pcall(__REAL_ENV.getgenv)
        if ok then __butter_plant(g) end
      end
    end)

    -- getgenv() as the payload sees it: the key is always there
    local real_genv = __butter_env.getgenv
    if type(real_genv) ~= "function" then
      real_genv = _G and _G.getgenv
    end
    if type(real_genv) == "function" then
      __butter_env.getgenv = function()
        local ok, g = pcall(real_genv)
        if not ok or type(g) ~= "table" then g = {} end
        __butter_plant(g)
        return g
      end
    end
  end

  -- ------------------------------------------------------------------
  -- task.spawn: make sure the deferred main body really runs
  -- ------------------------------------------------------------------
  do
    local real_task = __butter_env.task
    if type(real_task) == "table" then
      local t = {}
      for _, k in ipairs({ "spawn", "defer", "delay", "wait", "cancel",
                           "desynchronize", "synchronize" }) do
        if type(real_task[k]) == "function" then t[k] = real_task[k] end
      end
      local real_spawn = t.spawn
      t.spawn = function(f, ...)
        if type(f) ~= "function" then return nil end
        __butter_bump("task_spawn")
        local res = nil
        if type(real_spawn) == "function" then
          -- The client's spawn is trusted: it runs the function synchronously,
          -- so it is NOT run twice here.
          local args = table.pack(...)
          pcall(function()
            res = real_spawn(f, table.unpack(args, 1, args.n))
          end)
        else
          -- No spawn at all -> run it here.
          __butter_bump("task_spawn_rescued")
          local args = table.pack(...)
          pcall(function()
            local co = coroutine.create(f)
            local ok, err = coroutine.resume(co, table.unpack(args, 1, args.n))
            if not ok and type(__butter_box) == "function" then
              pcall(function()
                __butter_box("[Butter] task.spawn rescue error", tostring(err),
                             460, Color3.fromRGB(60, 40, 10))
              end)
            end
          end)
        end
        return res
      end
      __butter_env.task = t
    end
  end

  -- ------------------------------------------------------------------
  -- the verdict: did the protected script start at all?
  -- ------------------------------------------------------------------
  do
    local function __butter_verdict(tag)
      local lines = {}
      lines[#lines + 1] = "HTTP requests   : " .. tostring(__butter_count.http or 0)
      lines[#lines + 1] = "GetService calls: " .. tostring(__butter_count.getservice or 0)
      lines[#lines + 1] = "task.spawn calls: " .. tostring(__butter_count.task_spawn or 0)
      lines[#lines + 1] = "spawn rescued   : " .. tostring(__butter_count.task_spawn_rescued or 0)
      local okc, cg = pcall(function()
        local G = __butter_env and __butter_env.game or game
        return G:GetService("CoreGui")
      end)
      if okc and cg then
        local names = {}
        pcall(function()
          for _, child in ipairs(cg:GetChildren()) do
            names[#names + 1] = child.Name .. "[" .. child.ClassName .. "]"
          end
        end)
        lines[#lines + 1] = "CoreGui: " .. (#names > 0 and table.concat(names, ", ") or "(empty)")
      end
      if type(__butter_box) == "function" then
        pcall(function()
          __butter_box("[Butter] verdict " .. tag, table.concat(lines, "\n"),
                       460, Color3.fromRGB(20, 40, 25))
        end)
      end
    end

    pcall(function()
      local RT = task
      if type(RT) ~= "table" or type(RT.delay) ~= "function" then
        pcall(function() RT = __butter_env and __butter_env.task end)
      end
      if type(RT) == "table" and type(RT.delay) == "function" then
        RT.delay(12, function() __butter_verdict("12s") end)
      end
    end)
  end
end
