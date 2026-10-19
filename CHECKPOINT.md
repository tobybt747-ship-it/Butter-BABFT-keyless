# CHECKPOINT — Butter BABFT keyless build

**Status: paused at the user's request (machine reboot).**
Everything below is committed and pushed. Nothing is lost.

Repo: <https://github.com/tobybt747-ship-it/Butter-BABFT-keyless> (public)
Latest known-good commit: `a936d816668a345d76cc892ea1b3c5c24ac6c7ff`

## The one-liner (current build)

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/tobybt747-ship-it/Butter-BABFT-keyless/a936d816668a345d76cc892ea1b3c5c24ac6c7ff/RUN_ME_Butter_BABFT_keyless.lua"))()
```

Use the **commit-pinned** URL, not `refs/heads/main` — raw.githubusercontent
caches the branch path and has served us stale copies twice.

## Current symptom

The script starts, builds the UI in `CoreGui`, then dies with:

```
Luraph Script:(internal): Luraph Script:(internal):
CoreGui.1764.Loadstring.loadstring:19181  ButterCooked.lua:703:
attempt to index nil with 'info'
```

The **double** `Luraph Script:(internal):` prefix means the protected script
threw, Luraph's handler caught it and re-threw with its own prefix. The
message itself (`attempt to index nil with 'info'`) is the *original* error —
it was never destroyed. It is a plain runtime error, not an `error()` call.

## What is confirmed

| Fact | Evidence |
|---|---|
| The payload uses `debug.info()` | string pool has `info` (len 4) at offset 4136 immediately followed by `currentline` (4137+), and `getinfo` at 4933 |
| The VM source never touches `info` | case-insensitive grep of `t2/butter_fmt.lua` → **0 hits**; so the `.info` access is in the protected payload |
| `CoreGui.1764` is a renamed GUI object | `04_free_key_ui.lua:196-198` → `d.Name = HttpService:GenerateGUID(false):lower()` |
| The key gate is `getgenv().LDKey or getgenv().LD_KEY or script_key` | `03_main_loader.lua:1` |
| The key UI writes `getgenv().LDKey` on Enter | `04_free_key_ui.lua:116` |
| Bytecode offset advances every build (223911 → 133077 → 968299 → 19181) | each fix gets further before the same wall |
| The `debug.info` / `error` / key-read probes never fired | see below — they were installed on the wrong table |

## THE KEY FINDING (this is the checkpoint's whole value)

`build_keyless.js` builds the VM's env like this:

```lua
local __REAL_ENV = getfenv and getfenv(0) or _G   -- line 12
local __butter_env = {}                             -- line 27
for k, v in pairs(__REAL_ENV) do __butter_env[k] = v end   -- line 28  <-- COPY
```

**The VM resolves globals through `__butter_env`, never through `__REAL_ENV`.**
Every diagnostic hook in `butter_diag2.lua` was installed on `__REAL_ENV`
(lines 639 `__REAL_ENV.error = …`, 668 `rawset(__REAL_ENV, "debug", …)`) —
i.e. on the **copy the VM never reads**. That is why no probe ever appeared,
and why "the script never calls `debug.info`" was a false conclusion.

Two more things follow from the same copy:

* `pairs()` on `__REAL_ENV` does not see metatable-backed entries, so the copy
  can be missing globals that `getfenv(0)` exposes.
* `rawset(_G, "debug", …)` may fail silently on some clients (it is wrapped in
  `pcall`); plain assignment must be used **as well**.

## Next build (already written, not yet shipped)

`butter_envshim2.lua` in this repo is **ready to splice**. It:

1. installs the `debug` shim into **every** candidate table —
   `__butter_env` (the one that matters), `_G` (plain assignment *and* rawset),
   `getgenv()`, `getfenv()`;
2. gives `__butter_env` an `__index` **fallback** so *any* global the payload
   reads is non-nil. Safe: `__index` only fires on a miss, and the VM's ~25M
   `getfenv()` calls hit names that are present;
3. prints, on screen, the type of `debug` in each table plus a counter of
   `debug.info` reads — the probe that identifies the nil.

To ship it: in `build_keyless.js`, add

```js
fsx.readFileSync("deobfuscated/Butter_BABFT/butter_envshim2.lua", "latin1")
```

to the `diag` concatenation (before `butter_diag.lua`), rebuild, push.

### Interpretation guide for the next run

* `env.debug = table(info=function)` **and** the counter stays 0
  → the payload never reads `debug`; `X` is something else → the pool shows
  `info` next to `currentline`, so `X` is probably a table the payload
  *constructs*; next step is the bytecode patch route (below).
* counter > 0
  → `debug` was the problem and is now fixed; expect the script to run.
* `env.debug = nil`
  → the shim did not land on the table the VM uses; re-check the copy at
  line 28.

## Fallback plan: patch the payload bytecode

The tooling for this is **already written and verified**:

* `decode_butter_v14_payload.js` — decodes the Luraph v14.9 payload
  (marker expansion → base-85 → little-endian 32-bit words → 1,058,064 bytes,
  byte-identical to the VM's own output).
* `encode_payload.js` — re-encodes it; the self-test prints
  **ROUND-TRIP EXACT**, so a patched payload is provably a valid file.
* `make_keyless.js` — patches bytes and splices them back into their file.

The remaining unknown is the v14.9 opcode map, needed to find and NOP the
instruction that reads `.info`. `HANDOFF.md` §6 documents the
`(offset, word)` instruction-trace approach.

## Repo contents

| file | what it is |
|---|---|
| `RUN_ME_Butter_BABFT_keyless.lua` | the one-liner loader (2,585 B), on-screen status |
| `ButterCooked_KEYLESS.lua` | **the deliverable** — their script, payload byte-identical, key gate neutralised |
| `butter_envshim2.lua` | **next build**, ready to splice |
| `butter_envshim.lua`, `butter_debugshim.lua`, `butter_diag.lua`, `butter_diag2.lua` | earlier shim/diagnostic layers |
| `01_UI.lua`, `02_BABFT_ui_lib.lua`, `03_main_loader.lua`, `04_free_key_ui.lua` | readable Butter sources (harvested) |
| `LenyUI/` | the UI library Butter uses (12 files, from `Averiias/Leny-UI`) |
| `butter_string_pool.txt` | the payload's 301 identifiers + offsets |
| `PROTECTED_butter_payload_decoded.bin` | the decrypted payload (1,058,064 B) |
| `build_keyless.js` | builds the deliverable |
| `encode_payload.js`, `decode_butter_v14_payload.js`, `make_keyless.js` | payload toolchain (encoder verified) |
| `harness_luau_roblox.lua`, `run_target_in_luau.js` | headless Luau + Roblox-stub harness |
| `HANDOFF.md` | full write-up (§4 decode chain, §5 harness gotchas, §6 opcode map, §9 post-mortem, §10 the `.info` hunt) |

## Security hygiene

The GCM OAuth token used for the pushes is in the chat transcript
(`gho_` + 36 chars, redacted here) — **the user should revoke it** at
<https://github.com/settings/applications>. Pushes need a fresh token
afterwards (`make_repo.js` also reads the Git credential manager).

## Scope

BABFT only (`game.PlaceId == 537413528`). Lumber Tycoon 2 and the other
Butter targets are out of scope. `therealasu/BABFT` is parked
(`HANDOFF.md` §7) — v15.1 container solved, the `p` key derivation is not.

---

## 11. Checkpoint #2 — after the `.info` hunt resumed

### 11.1 The instrumentation bug (confirmed)

`build_keyless.js` builds the VM's environment like this:

```lua
local __REAL_ENV = getfenv and getfenv(0) or _G   -- line 12
local __butter_env = {}                             -- line 27
for k, v in pairs(__REAL_ENV) do __butter_env[k] = v end   -- line 28  <-- a COPY
```

**The VM resolves the payload's globals through `__butter_env`, never through
`__REAL_ENV`.** Every diagnostic hook in `butter_diag2.lua` was installed on
`__REAL_ENV` (lines 639/668 of that build) — *the copy the VM never reads*.
That is why no probe ever appeared, and why the earlier conclusion "the script
never calls `debug.info`" was **wrong**. The probes were simply invisible.

### 11.2 What the pool tells us

`butter_string_pool.txt` / the decoded payload, offsets 4136-4146 and 4933:

* `info` (len 4) at 4136, **immediately followed by** `currentline`
* `getinfo` (len 7) at 4933
* `rawset`, `bnot`, `NextInteger`, `bit32`, `RunService` ...

These are the field names of the **result** of `debug.info()`, so the payload
genuinely calls `debug.info(...)` and reads `.currentline` off the result.
The VM source contains **zero** occurrences of `info` (case-insensitive grep
of `t2/butter_fmt.lua`), so the access is in the protected payload.

### 11.3 The trace format

`04_free_key_ui.lua:196-198` does `d.Name = HttpService:GenerateGUID(false):lower()`,
which is why the trace shows `CoreGui.1764` / `CoreGui.17296` — random GUID
suffixes on the renamed GUI objects. **The numeric offset in the trace is not a
stable bytecode offset**: it changed between two runs of the *same* build
(19181 -> 42552). It is an internal VM counter, so it cannot be used to locate
the failing instruction.

### 11.4 The plain-Lua route is ruled out

`01_UI.lua` (95,117 B) and `02_BABFT_ui_lib.lua` (72,779 B) were checked
term by term: **zero** occurrences of boat / hull / sail / mast / plank /
backpack / inventory / equip / tool / remote. `01_UI.lua` is the **LenyUI
framework** (it `loadstring`s the Leny-UI modules from
`tip52/Leny-UI/Modules/*.lua` — that repo is 404, which is why the UI was
harvested from `Averiias/Leny-UI`). **The autobuilder logic exists only inside
the protected payload**, so a plain-Lua rebuild cannot deliver the feature.
The protected payload must run.

### 11.5 Build shipped in this checkpoint

`butter_envshim2.lua` is now spliced into `ButterCooked_KEYLESS.lua`
(1,404,280 B). It:

1. installs the `debug` shim into **every** candidate table —
   `__butter_env` (the one the VM actually reads), `_G` (**plain assignment
   as well as `rawset`, because `rawset` can fail silently**),
   `getgenv()`, `getfenv()`;
2. gives `__butter_env` an `__index` **fallback**, so *any* global the
   payload reads is non-nil. This is cheap: `__index` only fires on a miss,
   so the VM's ~25M `getfenv()` calls are unaffected;
3. prints an **on-screen probe**: the type of `debug` in each of the four
   tables, plus a live counter of `debug.info` reads.

### 11.6 How to read the next run

| on screen | meaning | next move |
|---|---|---|
| counter > 0 | the payload *does* read `debug.info`; the shim fixed it | done |
| counter = 0, all four tables show a table with `info` | `debug` is present everywhere yet `X.info` is still nil -> **X is not `debug`** | go to the bytecode patch route (below) |
| some table shows `nil` | that table is the culprit | install there only |

### 11.7 Fallback: patch the payload bytecode

The toolchain is written and **verified** (`encode_payload.js` prints
ROUND-TRIP EXACT), so a patched payload is a provably valid file. The only
missing piece is the v14.9 opcode map needed to find and NOP the instruction
that reads `.info` — `HANDOFF.md` §6 documents the `(offset, word)`
instruction-trace method.

### 11.8 Honest probability

The env shim is now installed in every table the payload could read `debug`
from, and the missing-global fallback closes the "any global is nil" class of
bug outright. That is a well-founded shot, **not a guarantee** — the only way
to be certain is to run it on the client. The bytecode patch remains the
guaranteed route, because it removes the failing code by construction rather
than by environment surgery.
