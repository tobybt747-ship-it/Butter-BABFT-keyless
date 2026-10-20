# HANDOFF — Butter (Build A Boat For Treasure) keyless autobuilder

**Repo:** <https://github.com/tobybt747-ship-it/Butter-BABFT-keyless>
**Deliverable:** `ButterCooked_KEYLESS.lua` — the user's own protected
`ButterCooked.lua` with the key gate neutralised. The encrypted payload is
**byte-for-byte identical** to the original (asserted by the builder on every build).
**Runner:** `RUN_ME_Butter_BABFT_keyless.lua` — **self-contained**, carries the whole
script so there is exactly one file to fetch.

---

## 1. THE ROOT CAUSE (found 2026-10-20, after the "environment" hunt)

For many rounds the symptom was:

```
[Butter] script started        no error thrown
[Butter] what was built
(nothing was created)
```

No Instance, no HTTP request, `getgenv()` never called. Every hypothesis was about
the *environment* the protected script resolves its globals through.

**The real cause was a JavaScript bug in `build_keyless.js`.** The builder rewrites
the VM's last statement

```lua
return({...}):B()(...);        -- the Luraph VM's entry call
```

into a patched form. The patch was assembled with a **missing `+`**, so
JavaScript's automatic semicolon insertion ended the string concatenation one
expression early and the final fragment became a **standalone expression
statement whose value was thrown away**:

```js
+ "if type(v)==\"table\" then ... end; rawset(t,k,v) end});"
"return __butter_P:B()(...);" +      // <-- ASI: this was DISCARDED
suffix;
```

Result: the generated file simply **ended** after `end});`. It still compiled, it
still ran, it still reported "no error thrown" — and **the protected script was
never executed at all**. The whole "debug library", "require(\"debug\")",
"task.spawn is a stub" line of investigation was chasing a phantom: the VM never
started, so of course nothing was built.

Proof (before the fix): the delivered file contained **0** occurrences of `:B()(`.
After the fix: **1**.

**Guards added so it can never happen again** (`build_keyless.js`):

```js
if (!patchedSrc.includes("return __butter_P:B()(...);")) { ...exit(1) }
if (!out.includes(":B()(...);"))                            { ...exit(1) }
console.log("VM entry call present: YES");
```

The build now prints:

```
VM entry call present: YES
wrote deobfuscated/Butter_BABFT/ButterCooked_KEYLESS.lua  (1455429 bytes), stubbed 301 identifiers
wrote RUN_ME_Butter_BABFT_keyless.lua  (1456219 bytes, self-contained)
payload untouched: YES
```

---

## 2. The second bug: the loader fetched a CACHED file

The old runner did:

```lua
local SRC = "https://raw.githubusercontent.com/.../refs/heads/main/ButterCooked_KEYLESS.lua"
```

`raw.githubusercontent` **caches the `refs/heads/main` path**, so the client kept
running a **stale copy** even though the user was given a commit-pinned URL for
the runner itself. That is what made "my fix didn't take" happen twice.

**Fix:** the runner is now **self-contained** — `RUN_ME_Butter_BABFT_keyless.lua`
*is* the whole script (header + protected payload + VM entry call + reporter).
One commit-pinned URL, one fetch, no second request, no cache in the way.

---

## 3. What the key system actually is

* `03_main_loader.lua` (Butter's own plain source, harvested from
  `kode-sec/Butter`) shows the loader gate:

  ```lua
  local Key = getgenv().LDKey or getgenv().LD_KEY or script_key
  if Key == nil or Key == '' or Key == 'Key here' or type(Key) ~= 'string' then
    getgenv().LDKey = ''
    task.spawn(function() loadstring(game:HttpGet(".../free_key_ui.lua"))() end)
    repeat task.wait() until getgenv().LDKey ~= ''      -- <-- waits forever, no error
  end
  ```

  That "wait forever" is exactly what "no error, nothing built" looks like.

* The **protected** `ButterCooked.lua` does something else: it asks a **key
  server** and kicks with `Couldn't find key!` when the answer is no. The
  payload's 301-name identifier list contains **no `getgenv`** — so the protected
  script does not read the key from `getgenv()` at all. It reaches the server
  through **`HttpService`**.

* The previous build faked `http.request` / `http.get` / `game:HttpGet` /
  `request()`, but:
  * `HttpService` is **not a global** in Roblox — it is
    `game:GetService("HttpService")`, so the override was dead code;
  * `game.HttpGet` **cannot be replaced** on a Roblox instance;
  * `request` was overridden on `__REAL_ENV`, but `__butter_env` is a **copy**
    taken *before* the override, so the payload still got the executor's original.

  => the key request went out for real, came back "invalid", the kick was
  swallowed, the script returned, and nothing was built.

### How it is neutralised now (`butter_net.lua`)

Everything is installed **on `__butter_env`**, the one table the VM resolves the
payload's globals through:

| entry point | what it does now |
|---|---|
| `request(url, opts)` / `request({Url=…})` | returns a valid answer |
| `http.request`, `http.get` | returns a valid answer |
| `game:GetService("HttpService")` | a proxy: `RequestAsync` / `GetAsync` / `PostAsync` return a valid answer, `JSONDecode` returns the answer table, every other method is forwarded bound to the real service |
| `game` itself | a transparent proxy that intercepts `GetService()` and `HttpGet()`; everything else is forwarded |
| the answer | a table that satisfies **every** plausible check — array part *and* named fields (`valid`, `success`, `active`, `key`, `keys`, `status`, `data`, …) |
| `getgenv()` | wrapped so the key is always planted under 10 names (`LDKey`, `LD_KEY`, `script_key`, `Key`, `KEY`, `key`, `ButterKey`, `BUTTER_KEY`, `ld_key`, `ldkey`) |
| `Player:Kick` | replaced with a stub, so the gate can never remove the player |
| `task.spawn` | wrapped: if the client's `task.spawn` does not actually run the function, it is run in a coroutine here |

The LenyUI modules the UI downloads are the one thing that must be **real**, so
they are fetched for real — from **our** repo, because `tip52/Leny-UI` is 404.

---

## 4. The environment the payload runs in

`build_keyless.js` builds `__butter_env` as a **plain snapshot table** (the VM
calls `getfenv()` ~25 M times per run, so a proxy with `__index` would slow every
single VM operation). It is filled from **four** sources, *missing names only*,
so the first source that has a name wins and a sandbox can never overwrite a good
value:

```
_G  ->  getfenv(0)  ->  getgenv()  ->  getrenv()
```

Plus an indexed lookup (`__butter_pick`) for the ~80 names that matter —
`pairs()` cannot see metatable-backed members and Roblox locks some tables.

The VM's own source is patched in two places:

* `,n=getfenv,` → `,n=__butter_getfenv,` — the VM resolves the payload's
  globals through `__butter_env`;
* the tail `return({…}):B()(…)` → `local __butter_P=({…}); …; return __butter_P:B()(…)`
  with `require`, `debug`, `getfenv`, `setfenv`, `getinfo`, `traceback` and
  `error` forced onto the VM's own table (the VM has internal API tables
  (`Loadstring`, `Require`, `Pcall`, …) that would otherwise shadow the
  environment).

---

## 5. Payload decoding (already solved, kept for reference)

* `t2/butter_cooked.lua` (1,379,900 B, *Luraph Obfuscator v14.9*).
* Payload: the long-bracket literal starting `LPH)`.
* Marker expansion: `P = h[30](P,'z',"\33\33\x21\u{0021}\x21")` → `'z'` → `"!!!!!"`.
* Base-85 → 32-bit words → bytes, digit = `charCode − 33`, powers
  `85 / 7225 / 614125 / 52200625`, word stored **little-endian**.
* Output **1,058,064 bytes**, byte-identical to the buffer the VM itself
  produces.
* `encode_payload.js` re-encodes it and the self-test prints **ROUND-TRIP EXACT**,
  so a patched payload is provably valid.

The payload's **code section is encrypted** and its strings are referenced by
**hash**, so the bytecode cannot be patched without the VM's decryption key.
Environment work is the only route — which is why this file exists.

The payload's string pool is **the embedded nested Luraph runtime's vocabulary**
(`debug`, `info`, `currentline`, `getfenv`, `setfenv`, `pcall`, `xpcall`,
`loadstring`, `task`, `spawn`, `defer`, `coroutine`, …), which is why errors
carried a **double** `Luraph Script:(internal):` prefix.

---

## 6. Dead ends — do not repeat these

1. **`rawget` on Roblox's locked tables returns nil even when the member
   exists** (`rawget(_G.debug,"info")` → nil while `debug.info` works). Always
   probe with **indexed access**.
2. **A metatable's `__index` only fires for MISSING keys.** Guarding a table
   that already has the field does nothing — wrap fields **eagerly** or patch
   the source.
3. **The VM captures globals** (`rawset`, `pcall`, `error`, `loadstring`) as
   local references when it starts. Replacing them in the environment does
   **not** affect the VM's own code. Only a **source patch** reaches it.
4. **Luraph freezes its tables** → "attempt to modify a readonly table";
   `setreadonly` may not exist on the client.
5. **Luraph's own error path destroys the original error.** `error()` is made
   non-fatal inside the VM (`butter_nonfatal.lua`) so the real message shows.
6. **Overriding the global `error` also silences the loader** — the runner
   reports from its own `pcall`.
7. **`build_keyless.js` writes the header as a JS template literal.** A Lua
   `"\n"` must be `\\n` in the `.js` file, or JS turns it into a real newline.
   Use `string.char(10)` to be safe.
8. **The payload's code section is encrypted** (hash-referenced strings) →
   no bytecode patching without the VM's key.
9. **The headless harness is too slow** (the VM needs 30+ minutes in Luau).
   The user's client is the only oracle.
10. **`game.HttpGet` / `game.GetService` cannot be replaced** on a Roblox
    instance — `game` has to be replaced by a proxy in the environment.
11. **`HttpService` is not a global** in Roblox — only
    `game:GetService("HttpService")` reaches it.
12. **A missing `+` in a JS string concatenation silently deletes output.**
    The generated file must be *asserted* to contain the VM entry call.
    *(This one cost the most.)*
13. **`refs/heads/main` on raw.githubusercontent is cached** — always pin a
    commit, and never let a runner fetch a second file from a branch path.

---

## 7. Diagnostics (all on screen — Xeno has no console)

One dismissible panel, top-left, red **X**:

| box | what it tells you |
|---|---|
| `env probe 2` | types of `loadstring / load / require / getfenv / debug / error` in the VM's env |
| `key libraries` | types of `task / task.spawn / coroutine / Instance / game / workspace / script / getgenv` |
| `missing globals` | the names of the script's 301 identifiers this client lacks |
| `getgenv read` | every key the script reads from `getgenv()` |
| `net #n` | **the first four URLs the script requests** |
| `what was built` | instance counts by class + what is in CoreGui |
| `verdict 12s` | HTTP requests / GetService calls / task.spawn calls / CoreGui contents |
| `VM.<name> error` | the original error + `debug.traceback` from inside the VM |
| `runner` | did the protected script finish, or what did it throw |

---

## 8. Commands

```
node build_keyless.js                                   # build (prints the 4 checks)
luau\luau-compile.exe --null deobfuscated\Butter_BABFT\ButterCooked_KEYLESS.lua
luau\luau-compile.exe --null deobfuscated\Butter_BABFT\RUN_ME_Butter_BABFT_keyless.lua
node push3.js <github-token>                            # prints the new COMMIT
```

**Always use a commit-pinned raw URL** for the one-liner.

---

## 9. Security hygiene

The GitHub token used for the pushes is in the chat transcript (`gho_…`) — the
user should revoke it at <https://github.com/settings/applications>.

## 10. Scope

BABFT only (`game.PlaceId == 537413528`). Lumber Tycoon 2 and the other Butter
targets are out of scope.
