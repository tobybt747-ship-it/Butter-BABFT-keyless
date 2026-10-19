const fs = require("fs");
const { execSync } = require("child_process");
const target = process.argv[2];
const tag = process.argv[3] || "x";
const src = fs.readFileSync(target);
let level = 0;
const mk = (l) => ["[" + "=".repeat(l) + "[", "]" + "=".repeat(l) + "]"];
while (src.includes(Buffer.from(mk(level)[1]))) level++;
const [open, close] = mk(level);
if (src.includes(Buffer.from(close))) { console.error("close delimiter in source!"); process.exit(1); }
const a = Buffer.concat([Buffer.from("local SRC = " + open + "\n"), src, Buffer.from("\n" + close + "\n")]);
let b = fs.readFileSync("harness_luraph.lua");
let out = Buffer.concat([a, Buffer.from("\n"), b]);
if (out[0] === 0xef) out = out.slice(3);
fs.writeFileSync("run_luraph.luau", out);

try {
  execSync(`luau\\luau.exe run_luraph.luau > outL_${tag}.log 2>&1`, { stdio: "inherit", shell: "cmd.exe" });
} catch (e) { console.log("(luau exited non-zero; log still written)"); }
const log = fs.readFileSync(`outL_${tag}.log`, "latin1");
console.log("log bytes:", log.length);
for (const line of log.split(/\r?\n/)) {
  if (/^\[HARNESS\]|^\[PRINT\]|^\[\[\[(STR|CAPTURE|CHARBUF)/.test(line))
    console.log("  " + line.slice(0, 160));
}
