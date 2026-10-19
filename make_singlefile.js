const fs = require("fs");

const src = fs.readFileSync("t2/butter_cooked.lua", "latin1");

// pick a long-bracket level that cannot appear in the payload
let level = 0;
const re = /\]=+\]/g;
let m;
while ((m = re.exec(src))) level = Math.max(level, m[0].length - 2);
const L = "=".repeat(level + 1);
console.log("longest ]]-style run:", level, "-> using level", level + 1);

// sanity: the payload must not contain the closing bracket we chose
const close = "]" + L + "]";
if (src.includes(close)) { console.log("ERROR: closing bracket appears in source"); process.exit(1); }

const header = `--[[
===============================================================================
  BUTTER  -  Build A Boat For Treasure  (game.PlaceId 537413528)
  Single-file, self-contained, runnable drop-in.
  Paste this whole file into any Roblox executor.  No HTTP fetch required.

  This file embeds the original protected script verbatim so that it behaves
  exactly like:   loadstring(game:HttpGet(".../ButterCooked.lua"))()

  Editable surface (everything before the embedded blob):
    * the key gate below
    * anything you want to run before / after the cheat
  To re-obfuscate or re-package, see README.md in this folder.
===============================================================================
]]

-- Optional key gate.  The upstream script reads its key from
--   getgenv().LDKey / getgenv().LD_KEY / script_key
-- Leave KEY empty to skip the gate entirely.
local KEY = ""

if KEY ~= "" then
  getgenv().LDKey = KEY
  getgenv().LD_KEY = KEY
end

-- The protected script, inlined verbatim.
local PROTECTED = [${L}[
`;

const footer = `
]` + L + `]

-- Run it.  Chunk name is set to "ButterCooked.lua" so anything that inspects
-- it (debug libraries, error traces) sees the original name.
local chunk, err = loadstring(PROTECTED, "ButterCooked.lua")
if not chunk then
  error("Butter (BABFT): failed to load embedded script -> " .. tostring(err))
end
return chunk()
`;

const out = header + src + footer;
fs.writeFileSync("deobfuscated/Butter_BABFT/Butter_BABFT_singlefile.lua", out, "latin1");
console.log("wrote deobfuscated/Butter_BABFT/Butter_BABFT_singlefile.lua", out.length, "bytes");
