const fs = require("fs");

/**
 * Re-encode a decoded Luraph v14.9 payload back into the original LPH) blob.
 *
 * Encoding (inverse of the VM's own decoder):
 *   1. bytes -> groups of 4
 *   2. each group -> 5 base-85 digits, digit = charCode - 33, big-endian
 *      (85^5 > 2^32, so only the low 32 bits are kept)
 *   3. a group of four zero bytes is emitted as the single marker char 'z'
 *      (the VM expands 'z' back to "!!!!!", i.e. five zero digits)
 *   4. prefix the 4-byte magic "LPH)"
 *
 * If this reproduces the original blob byte-for-byte, a patched payload is
 * guaranteed to be a valid one.
 */
function encodePayload(bytes) {
  const out = [];
  for (let i = 0; i + 4 <= bytes.length; i += 4) {
    if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 0) {
      out.push("z");
      continue;
    }
    // the payload stores each 32-bit word LITTLE-endian (buffer.writeu32)
    let v = (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0;
    // digits LSB-first ...
    const g = new Array(5);
    for (let j = 0; j < 5; j++) { g[j] = v % 85; v = Math.floor(v / 85); }
    // ... but the VM's formula weights the FIRST char highest, so reverse
    g.reverse();
    for (let j = 0; j < 5; j++) out.push(String.fromCharCode(g[j] + 33));
  }
  return "LPH)" + out.join("");
}

const decoded = fs.readFileSync("dec_butter_cooked.lua.bin");
const enc = encodePayload(decoded);
fs.writeFileSync("butter_payload_reencoded.txt", enc, "latin1");

// self-test: does it reproduce the ORIGINAL blob?
// (v14.9 has no "tW=" prefix - find the long-bracket literal that starts with LPH)
const orig = fs.readFileSync("t2/butter_cooked.lua", "latin1");
let original = null;
const re = /\[(=*)\[([\s\S]{200,}?)\]\1\]/g;
let m;
while ((m = re.exec(orig))) if (m[2].startsWith("LPH")) { original = m[2]; break; }
if (!original) { console.log("could not locate the original blob"); process.exit(1); }
console.log("original blob len:", original.length);
console.log("re-encoded len  :", enc.length);
if (original === enc) {
  console.log("*** ROUND-TRIP EXACT: encoder verified byte-for-byte ***");
} else {
  let d = -1;
  for (let i = 0; i < Math.min(original.length, enc.length); i++) if (original[i] !== enc[i]) { d = i; break; }
  console.log("MISMATCH at", d, JSON.stringify(original.slice(Math.max(0, d - 20), d + 20)), "vs", JSON.stringify(enc.slice(Math.max(0, d - 20), d + 20)));
}
