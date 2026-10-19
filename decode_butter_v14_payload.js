const fs = require("fs");
const path = require("path");

// Generic Luraph v14.x payload decoder.
// The v14 family embeds its own decoder in the file; we re-implement the same transform:
//   strip "LPH)" header -> expand marker char -> base85 groups of 5 -> 4-byte words
// Marker + base/offset are auto-detected.

function findPayload(src) {
  const re = /\[(=*)\[([\s\S]{100,}?)\]\1\]/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[2].startsWith("LPH")) return { body: m[2], at: m.index };
  }
  return null;
}

function tryDecode(body, markerChar, repl, base, off, le) {
  let P = body;
  if (markerChar) {
    P = body.split(markerChar).join(repl);
  }
  const n = P.length - 4;
  if (n <= 0 || n % 5 !== 0) return null;
  const g = n / 5;
  const out = Buffer.alloc(g * 4);
  for (let F = 5, i = 0; F <= n; F += 5, i++) {
    let y = 0;
    for (let j = 0; j < 5; j++) y = y * base + (P.charCodeAt(F - 1 + j) - off);
    if (le) out.writeUInt32LE(y >>> 0, i * 4); else out.writeUInt32BE(y >>> 0, i * 4);
  }
  return out;
}

function score(b) {
  // a decoded Luraph payload starts with a global-env name pool -> look for known names
  const marks = ["NextInteger", "bit32", "RunService", "Instance", "UDim2", "workspace", "math", "table", "string", "game"];
  let s = 0;
  for (const k of marks) { const i = b.indexOf(k); if (i >= 0 && i < 20000) s += 10 - Math.min(9, i / 2000); }
  let pr = 0;
  for (let i = 0; i < Math.min(b.length, 20000); i++) if (b[i] >= 32 && b[i] < 127) pr++;
  return s + pr / 20000;
}

const files = process.argv.slice(2);
for (const f of files) {
  const src = fs.readFileSync(f, "latin1");
  const pl = findPayload(src);
  if (!pl) { console.log(f.padEnd(34), "NO LPH PAYLOAD"); continue; }
  const body = pl.body;
  // distinct chars
  const set = new Set(body);
  const counts = new Map();
  for (const c of body) counts.set(c, (counts.get(c) || 0) + 1);
  let best = null;
  // candidate markers: rare chars (freq < 200) that are not part of the main alphabet
  const cands = [...counts.entries()].filter(([c, k]) => k < 300).map(([c]) => c);
  const markerList = [null, ...cands];
  const bases = [[85, 33], [85, 42], [84, 32], [85, 38], [86, 32], [83, 32], [85, 31], [87, 33], [95, 32], [94, 33], [96, 32], [90, 32], [92, 32], [93, 32], [88, 32], [89, 33], [91, 33], [85, 35], [85, 40], [85, 45], [85, 50]];
  for (const marker of markerList) {
    const repl = marker ? "!!!!!".slice(0, 5) : null;
    for (const [base, off] of bases) {
      for (const le of [false, true]) {
        const out = tryDecode(body, marker, repl, base, off, le);
        if (!out) continue;
        const s = score(out);
        if (!best || s > best.s) best = { s, marker, base, off, le, out };
      }
    }
  }
  if (best && best.s > 1.0) {
    const outName = "dec_" + path.basename(f) + ".bin";
    fs.writeFileSync(outName, best.out);
    console.log(f.padEnd(34), `DECODED ${best.out.length} B  marker=${JSON.stringify(best.marker)} base=${best.base} off=${best.off} ${best.le ? "LE" : "BE"} score=${best.s.toFixed(1)} -> ${outName}`);
  } else {
    console.log(f.padEnd(34), `no working combo (best ${best ? best.s.toFixed(2) : "n/a"}, payload ${body.length} B, distinct ${set.size})`);
  }
}
