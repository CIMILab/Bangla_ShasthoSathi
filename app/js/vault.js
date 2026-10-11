// Report history kept only in this browser, encrypted with a passphrase (WebCrypto: PBKDF2-SHA256 -> AES-GCM).
// Pseudonymised: the original report text and the patient's name are never stored. A person is identified by a keyed
// hash (HMAC-SHA256) of the name, so reports of the same person group together without the name being saved.
import { idbGet, idbPut, idbDel, idbAll, idbClear } from "./store.js";

const enc = new TextEncoder(), dec = new TextDecoder();
const ITER = 310000;
let aesKey = null, macKey = null;

const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pass, salt, usage) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  const alg = usage === "mac" ? { name: "HMAC", hash: "SHA-256", length: 256 } : { name: "AES-GCM", length: 256 };
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base, alg, false,
    usage === "mac" ? ["sign"] : ["encrypt", "decrypt"]);
}

async function seal(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}
async function open(box) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, aesKey, unb64(box.ct));
  return JSON.parse(dec.decode(pt));
}

export const exists = async () => !!(await idbGet("meta", "vault"));
export const unlocked = () => !!aesKey;
export function lock() { aesKey = macKey = null; }

export async function create(pass) {
  const s1 = crypto.getRandomValues(new Uint8Array(16)), s2 = crypto.getRandomValues(new Uint8Array(16));
  aesKey = await derive(pass, s1, "enc"); macKey = await derive(pass, s2, "mac");
  await idbPut("meta", "vault", { s1: b64(s1), s2: b64(s2), check: await seal({ ok: true }), iter: ITER });
}

export async function unlock(pass) {
  const m = await idbGet("meta", "vault");
  aesKey = await derive(pass, unb64(m.s1), "enc"); macKey = await derive(pass, unb64(m.s2), "mac");
  try { await open(m.check); return true; } catch { lock(); return false; }
}

/** Keyed pseudonym for a person: same name -> same id, but the id reveals nothing without the passphrase. */
export async function personId(name) {
  const norm = name.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  const sig = await crypto.subtle.sign("HMAC", macKey, enc.encode("person:" + norm));
  return "P-" + Array.from(new Uint8Array(sig).slice(0, 6), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const newReportId = () => "R-" + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

export async function save(record) { await idbPut("vault", record.id, await seal(record)); }
export async function remove(id) { await idbDel("vault", id); }
export async function all() {
  const out = [];
  for (const box of await idbAll("vault")) { try { out.push(await open(box)); } catch { /* other passphrase */ } }
  return out.sort((a, b) => (a.reportDate < b.reportDate ? -1 : 1));
}
export async function destroy() { await idbClear("vault"); await idbDel("meta", "vault"); lock(); }
