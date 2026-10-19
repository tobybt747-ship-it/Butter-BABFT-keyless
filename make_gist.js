/**
 * Publish the Butter BABFT keyless loader (and optionally the full single-file
 * build) to a GitHub GIST, and print the raw URL to loadstring().
 *
 * USAGE (PowerShell):
 *   $env:GH_TOKEN = "ghp_xxxxxxxxxxxx"      # a PAT with the "gist" scope
 *   node make_gist.js
 *
 * Or let it prompt:  node make_gist.js --interactive
 *
 * The token needs only the "gist" scope.  It is never written to disk.
 */
const https = require("https");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execFileSync } = require("child_process");

// Pull a github.com credential out of Git Credential Manager / the Windows
// credential store, so an already-signed-in git works with no extra setup.
function fromGitCredential() {
  try {
    const out = execFileSync("git", ["credential", "fill"], {
      input: "protocol=https\nhost=github.com\n\n",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeout: 30000,
      encoding: "utf8",
    });
    const m = /^password=(.*)$/m.exec(out);
    return m ? m[1].trim() : null;
  } catch (e) {
    return null;
  }
}

const FILES = [
  ["deobfuscated/Butter_BABFT/RUN_ME_Butter_BABFT_keyless.lua", "RUN_ME_Butter_BABFT_keyless.lua"],
  ["deobfuscated/Butter_BABFT/Butter_BABFT_singlefile.lua", "Butter_BABFT_singlefile.lua"],
  ["deobfuscated/Butter_BABFT/Butter_BABFT_keyless_loader.lua", "Butter_BABFT_keyless_loader.lua"],
  ["deobfuscated/Butter_BABFT/01_UI.lua", "01_UI.lua"],
  ["deobfuscated/Butter_BABFT/02_BABFT_ui_lib.lua", "02_BABFT_ui_lib.lua"],
  ["deobfuscated/Butter_BABFT/03_main_loader.lua", "03_main_loader.lua"],
  ["deobfuscated/Butter_BABFT/properties.json", "properties.json"],
  ["deobfuscated/Butter_BABFT/HANDOFF.md", "HANDOFF.md"],
];

function api(token, path_, method, payload) {
  return new Promise((resolve, reject) => {
    const data = payload ? Buffer.from(payload, "utf8") : null;
    const req = https.request(
      { hostname: "api.github.com", path: path_, method, headers: {
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "User-Agent": "opencode-butter-publisher",
        "Content-Type": "application/json",
        "Content-Length": data ? data.length : 0,
      } },
      (res) => { const c = []; res.on("data", (d) => c.push(d)); res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(c).toString("utf8") })); }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    token = fromGitCredential();
    if (token) console.log("(using the Git Credential Manager credential)");
  }
  if (!token && process.argv.includes("--interactive")) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    token = await new Promise((r) => rl.question("GitHub PAT (gist scope): ", (a) => { rl.close(); r(a.trim()); }));
  }
  if (!token) {
    console.log("No GH_TOKEN set.\n");
    console.log("PowerShell:\n");
    console.log('  $env:GH_TOKEN = "ghp_xxxxxxxx"   # PAT with the "gist" scope');
    console.log("  node make_gist.js\n");
    console.log("Create a token at https://github.com/settings/tokens (classic, gist scope)");
    console.log("or use the fine-grained equivalent: https://github.com/settings/personal-access-tokens");
    return;
  }

  // 1) who am I
  const me = await api(token, "/user", "GET");
  if (me.status !== 200) { console.log("token rejected (" + me.status + "): " + me.body.slice(0, 300)); return; }
  const user = JSON.parse(me.body).login;
  console.log("authenticated as " + user);

  // 2) build the gist payload
  const files = {};
  for (const [src, name] of FILES) {
    if (!fs.existsSync(src)) { console.log("  skip (missing): " + src); continue; }
    files[name] = { content: fs.readFileSync(src, "latin1") };
    console.log("  + " + name + "  (" + fs.statSync(src).size + " B)");
  }

  const payload = JSON.stringify({
    description: "Butter - Build A Boat For Treasure (PlaceId 537413528) - keyless loader",
    public: false,
    files,
  });

  // If a gist id is given, PATCH it (update in place) instead of creating a new one.
  const gistId = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
  let res;
  if (gistId) {
    console.log("updating gist " + gistId);
    res = await api(token, "/gists/" + gistId, "PATCH", payload);
    if (res.status !== 200) { console.log("patch failed (" + res.status + "): " + res.body.slice(0, 400)); return; }
  } else {
    res = await api(token, "/gists", "POST", payload);
    if (res.status !== 201) { console.log("gist failed (" + res.status + "): " + res.body.slice(0, 400)); return; }
  }
  const g = JSON.parse(res.body);
  const loader = g.files["RUN_ME_Butter_BABFT_keyless.lua"];
  const raw = loader.raw_url;

  console.log("\n======================================================");
  console.log(" gist page : " + g.html_url);
  console.log(" raw URL   : " + raw);
  console.log("======================================================\n");
  console.log("Paste this into your executor:\n");
  console.log('loadstring(game:HttpGet("' + raw + '"))()');
  console.log("\n(or without loadstring, just run the URL content)");
  fs.writeFileSync("gist_url.txt", raw);
})();
