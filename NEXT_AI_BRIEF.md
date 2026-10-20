# BRIEF FOR THE NEXT AI — Butter BABFT keyless

Short version. `HANDOFF.md` (70 KB) is the full research log; `CHECKPOINT.md` has the
history of dead ends. **Read this first, then only look at HANDOFF.md if you need to
go deeper.**

---

## 1. The goal

Deliver **Butter's Build A Boat For Treasure autobuilder with the key system
removed**, as one file on the user's own GitHub repo, runnable via a single line:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/tobybt747-ship-it/Butter-BABFT-keyless/<COMMIT>/RUN_ME_Butter_BABFT_keyless.lua"))()
```

- Executor: **Xeno** (no console → all diagnostics must be on screen).
- Game: BABFT, `PlaceId 537413528`. Nothing else (no Lumber Tycoon 2).
- The user wants **Butter's own UI**, with the key system gone.
- The user wants **their** code, not a rewrite. The delivered file *is* their
  protected `ButterCooked.lua` with the payload byte-identical.

## 2. Where everything is

Repo: **https://github.com/tobybt747-ship-it/Butter-BABFT-keyless** (public, 38 files).
Everything is pushed continuously — **always use a commit-pinned raw URL**; the
`refs/heads/main` path is cached by raw.githubusercontent and will hand out stale copies.

| file | what it is |
|---|---|
| `ButterCooked_KEYLESS.lua` | **the deliverable** — their script + our header; payload byte-identical |
| `RUN_ME_Butter_BABFT_keyless.lua` | the one-liner loader (on-screen status + X button) |
| `build_keyless.js` | **builds the deliverable**; prints `payload untouched: YES` |
| `make_repo.js`, `push3.js` | push everything (GH token, or the git credential manager) |
| `butter_*.lua` | the shim/diagnostic layers spliced into the header |
| `butter_string_pool.txt` | the payload's 805 string-table entries with offsets |
| `PROTECTED_butter_payload_decoded.bin` | the decoded payload (1,058,064 B) |
| `decode_butter_v14_payload.js`, `encode_payload.js`, `make_keyless.js` | payload toolchain; the encoder self-tests **ROUND-TRIP EXACT** |
| `LenyUI/Modules/*.lua` | LenyUI modules (Butter's UI needs them; the original repo is 404) |
| `01_UI.lua`, `02_BABFT_ui_lib.lua`, `03_main_loader.lua`, `04_free_key_ui.lua` | Butter's plain sources, harvested from their repo |

Build + verify:

```
node build_keyless.js                       # must print "payload untouched: YES"
luau\luau-compile.exe --binary deobfuscated\Butter_BABFT\ButterCooked_KEYLESS.lua
node push3.js <token>                       # prints the new COMMIT
```

## 3. What is already solved

- **Payload decoded.** Luraph v14.9: marker expansion → base‑85 → little-endian
  32-bit words → 1,058,064 bytes, byte-identical to the VM's own output.
  Encoder verified `ROUND-TRIP EXACT`, so a patched payload is provably valid.
- **Key system neutralised** in the delivered file: the key is planted under 10
  names, `getgenv()` is wrapped, the key server's reply is faked, `Player:Kick`
  is blocked.
- **The payload embeds a NESTED Luraph runtime.** That is why errors carried a
  *double* `Luraph Script:(internal):` prefix, and why the pool's first ~7,400
  bytes are the runtime's standard-library vocabulary (`debug`, `info`,
  `currentline`, `getfenv`, `setfenv`, `getinfo`, `traceback`, …).
- **Butter's UI depends on `tip52/Leny-UI`, which is 404.** We publish those
  11 modules in our repo and the payload's requests are rewritten to them.

## 4. Where it is stuck RIGHT NOW

The script now runs **with no error** but builds **nothing**:

```
[Butter] script started / no error thrown
[Butter] what was built
(nothing was created)
```

No `Instance` is created, no HTTP request is made, `getgenv()` is never called.
So the protected script's main body **never runs**.

### Diagnosis so far

Xeno's `getfenv(0)` returns a **sandbox without the standard library** — the
probe showed `load = nil`, `require = nil`. If `task` is missing too, then
`task.spawn(...)` resolves to a stub that **does nothing**, so the payload's
deferred main never executes. The script "succeeds" and builds nothing.

**The newest build merges `_G` (the real global table) into the VM's environment**
(`__butter_env`), because the VM resolves the payload's globals through that
snapshot (the VM's own `,n=getfenv,` is patched to `__butter_getfenv`).

**→ Ask the user to run the newest build first. If the Butter UI appears, the job
is done: strip the diagnostics and ship a clean file.**

If it still builds nothing, the new **`[Butter] missing globals`** box lists
exactly which of the script's 301 names this client does not provide — install
those.

## 5. Dead ends — do not repeat these

1. **`rawget` on Roblox's locked tables returns nil even when the member
   exists** (`rawget(_G.debug,"info")` → nil while `debug.info` works). Roblox's
   `debug` is locked with metatable-backed members. Always probe with **indexed
   access**. This cost hours and produced two wrong conclusions.
2. **A metatable's `__index` only fires for MISSING keys.** Guarding a table
   that already has the field does nothing — that is why several "hook the VM's
   API" attempts never fired. Wrap fields **eagerly**, or patch the source.
3. **The VM captures globals (`rawset`, `pcall`, `error`, `loadstring`) as local
   references when it starts.** Replacing them in the environment does **not**
   affect the VM's own code. Only a **source patch** reaches it (that is why
   the original `,n=getfenv,` patch always worked).
4. **Luraph freezes its tables** → writing to them raises
   `attempt to modify a readonly table`; `setreadonly` may not exist on the
   client.
5. **Luraph's own error path destroys the original error.** Make `error()`
   non-fatal inside the VM (`butter_nonfatal.lua`) to see the real message.
   (The loader's own `pcall` is separate and still reports "script started".)
6. **Overriding the global `error` also silences the loader** — keep the
   loader's `pcall(chunk)` and report from there.
7. **`build_keyless.js` writes the header as a JS template literal.** A Lua
   `"\n"` must appear as `"\\n"` in the .js file, otherwise JS turns it into a
   real newline and the build fails to compile. Use `string.char(10)` to be safe.
8. **The payload's code section is encrypted and its strings are referenced by
   hash** (a word-aligned search for the pool offsets finds zero hits). Patching
   the bytecode needs the VM's decryption key → not viable. Environment work is
   the only route.
9. **The headless harness is too slow** — the VM needs 30+ minutes in Luau.
   Don't build a local test loop on it; the user's client is the oracle.

## 6. Diagnostics that work

Everything lands in **one** dismissible panel (top-left, red **X**):

| box | what it tells you |
|---|---|
| `env probe 2` | types of `loadstring / load / require / getfenv / debug / error` in the VM's env |
| `key libraries` | types of `task / task.spawn / coroutine / Instance / game / workspace / script / getgenv` |
| `missing globals` | the exact list of the script's names this client lacks |
| `getgenv read` | every key the script reads from `getgenv()` (the key gate) |
| `what was built` | instance counts by class + what is in CoreGui |
| `net` | every URL the script requests, with redirects and sizes |
| `VM.<name> error` | the original error + `debug.traceback` from inside the VM |

The loader itself reports `loaded` / `script started` / `script error: …`.

## 7. Next steps, in order

1. **Run the newest build** (the `_G` merge). If the UI appears → strip the
   diagnostics, ship the clean file, done.
2. If not: read `[Butter] missing globals` and install those names in the env
   (or provide the missing libraries).
3. If the payload still doesn't run: confirm whether the VM's entry point
   (`:B()`) is invoking the payload at all — the VM's last statement is
   `return({...}):B()(...)`, and `build_keyless.js` rewrites it to
   `local __butter_P=({...}); …; return __butter_P:B()(...);`.
4. Consider **testing on a different executor** (Synapse / Delta usually expose a
   fuller global environment). The missing globals are a *client capability*
   issue, not a Butter bug — if a fuller client works, that proves it and the
   fix is to provide those names.
5. If everything is exhausted on the client, fall back to the **bytecode route**
   (tooling ready, encoder verified) — but that needs the VM's decryption key
   first, so it is a last resort.

## 8. Housekeeping

- The GitHub token is in the chat transcript — the user should revoke it at
  <https://github.com/settings/applications> and give a fresh one for pushes.
- `make_repo.js` also reads the Git credential manager, so pushes may work
  without an explicit token.
- Keep `HANDOFF.md` updated as you learn things; the user reads it when
  handing over.
