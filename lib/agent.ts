'use client';
// The player's agent wallet, held in this browser.
//
// - A passkey (Touch ID, Face ID, a security key) guards it. Its WebAuthn PRF output never
//   leaves the browser and derives the key that wraps the 24-word seed.
// - Only the wrapped seed is stored (in localStorage). The server gets the view-only key
//   and the public key that verifies move signatures; it can build transactions but not spend.
// - Unlocking prompts for the passkey once; the seed then lives in memory for this tab only.
// - Every move transaction the server builds is decoded and checked here, by the Wasm
//   signer, before it is signed.
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { ed25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import init, * as signer from './wasm/signer/zebfin_signer';
import { api } from './api';
import { fromB64, memoBody, signMemo, toB64 } from './moves';
import type { AgentStatus, OrdersInput, Seat } from './types';

export type StoredAgent = {
  id: string;
  token: string;
  name: string;
  credentialId: string; // base64 passkey raw id
  wrapped: string; // base64 nonce || ciphertext of the seed phrase
  orderPub: string;
  createdAt: number;
};

// These storage keys and key-derivation labels predate the Zonar name. Changing them would
// strand every existing agent wallet, so they stay.
const STORE_KEY = 'deaddrop:agent';
const te = new TextEncoder();
const td = new TextDecoder();
// Fixed PRF input: the passkey answers it with the same 32 secret bytes every time.
const PRF_SALT = sha256(te.encode('deaddrop/prf/v1'));

let unlocked: { id: string; mnemonic: string; orderKey: Uint8Array } | null = null;
let ready: Promise<unknown> | null = null;
const loadSigner = () => (ready ??= init({ module_or_path: '/signer/zebfin_signer_bg.wasm' }));

export class PrfUnsupportedError extends Error {
  constructor() {
    super("This passkey provider can't protect a wallet (it lacks the WebAuthn PRF extension). Try Chrome or Safari with iCloud Keychain or Google Password Manager.");
  }
}

export function storedAgent(): StoredAgent | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as StoredAgent) : null;
  } catch {
    return null;
  }
}

export function forgetAgent() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {}
  unlocked = null;
}

export const isUnlocked = (a: StoredAgent | null) => !!a && unlocked?.id === a.id;

// ---------- keys ----------
const wrapKey = (prf: Uint8Array, id: string) => hkdf(sha256, prf, te.encode('deaddrop/seed-wrap'), te.encode(id), 32);
// The order-signing key comes from the seed, so restoring the seed restores it.
const orderKeyFor = (mnemonic: string) => hkdf(sha256, te.encode(mnemonic), te.encode('deaddrop'), te.encode('order-key/v1'), 32);

function wrap(prf: Uint8Array, id: string, mnemonic: string): string {
  const nonce = randomBytes(24);
  const sealed = xchacha20poly1305(wrapKey(prf, id), nonce, te.encode(id)).encrypt(te.encode(mnemonic));
  return toB64(new Uint8Array([...nonce, ...sealed]));
}

function unwrap(prf: Uint8Array, id: string, wrapped: string): string {
  const bytes = fromB64(wrapped);
  return td.decode(xchacha20poly1305(wrapKey(prf, id), bytes.slice(0, 24), te.encode(id)).decrypt(bytes.slice(24)));
}

// ---------- passkeys ----------
type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };
const prfOutput = (cred: PublicKeyCredential) => {
  const first = (cred.getClientExtensionResults() as PrfResults).prf?.results?.first;
  return first ? new Uint8Array(first) : null;
};

async function passkeyPrf(credentialId: Uint8Array): Promise<Uint8Array> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32) as BufferSource,
      allowCredentials: [{ type: 'public-key', id: credentialId as BufferSource }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: PRF_SALT as BufferSource } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey prompt was cancelled');
  const prf = prfOutput(cred);
  if (!prf) throw new PrfUnsupportedError();
  return prf;
}

// The passkey is only a local key-wrapping device: no server ever verifies it.
async function createPasskey(label: string): Promise<{ id: Uint8Array; prf: Uint8Array }> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32) as BufferSource,
      rp: { name: 'Zonar' },
      user: { id: randomBytes(16) as BufferSource, name: label, displayName: label },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      extensions: { prf: { eval: { first: PRF_SALT as BufferSource } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey creation was cancelled');
  if ((cred.getClientExtensionResults() as PrfResults).prf?.enabled === false) throw new PrfUnsupportedError();
  const id = new Uint8Array(cred.rawId);
  // Some providers only return PRF output on `get`.
  return { id, prf: prfOutput(cred) ?? (await passkeyPrf(id)) };
}

// ---------- lifecycle ----------
export async function createAgent(name: string, avatar: string, onStep: (s: string) => void = () => {}): Promise<StoredAgent> {
  if (!window.PublicKeyCredential) throw new Error('This browser has no passkey support.');
  onStep('Creating your passkey…');
  const passkey = await createPasskey(name || 'Zonar agent');
  onStep('Generating your wallet…');
  await loadSigner();
  const acct = JSON.parse(signer.generateSeed(0)) as { mnemonic: string; ufvk: string; seed_fingerprint: string; account_index: number };
  const orderKey = orderKeyFor(acct.mnemonic);
  onStep('Registering the view-only key…');
  const { agentId, agentToken } = await api<{ agentId: string; agentToken: string }>('/api/agents', {
    name,
    avatar,
    ufvk: acct.ufvk,
    seedFingerprint: acct.seed_fingerprint,
    accountIndex: acct.account_index,
    orderPub: toB64(ed25519.getPublicKey(orderKey)),
  });
  const agent: StoredAgent = {
    id: agentId,
    token: agentToken,
    name,
    credentialId: toB64(passkey.id),
    wrapped: wrap(passkey.prf, agentId, acct.mnemonic),
    orderPub: toB64(ed25519.getPublicKey(orderKey)),
    createdAt: Date.now(),
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(agent));
  unlocked = { id: agentId, mnemonic: acct.mnemonic, orderKey };
  return agent;
}

export async function unlock(agent: StoredAgent): Promise<void> {
  if (isUnlocked(agent)) return;
  const mnemonic = unwrap(await passkeyPrf(fromB64(agent.credentialId)), agent.id, agent.wrapped);
  unlocked = { id: agent.id, mnemonic, orderKey: orderKeyFor(mnemonic) };
}

// Shown only after a fresh passkey check, never cached for this purpose.
export async function revealSeed(agent: StoredAgent): Promise<string> {
  return unwrap(await passkeyPrf(fromB64(agent.credentialId)), agent.id, agent.wrapped);
}

export const agentStatus = (a: StoredAgent) => api<AgentStatus>('/api/agents/status', { agentId: a.id, agentToken: a.token });
export const agentRefill = (a: StoredAgent) => api('/api/agents/refill', { agentId: a.id, agentToken: a.token });
export const agentAddress = (a: StoredAgent) => api<{ address: string }>('/api/agents/address', { agentId: a.id, agentToken: a.token }).then((r) => r.address);

// ---------- moves ----------
type PcztSummary = {
  sapling_spends: number;
  sapling_outputs: number;
  transparent_inputs: number;
  transparent_outputs: number;
  spent_zats: number;
  payments: { pool: string; address: string | null; value_zats: number }[];
  change_zats: number;
  fee_zats: number;
};

const MAX_MOVE_FEE = 15_000;

// Seals one move on-chain: sign the memo, have the server build the transaction, check it
// here (it must pay only a zero-value note to this match's vault and a normal fee), sign, submit.
export async function sealOnchain(
  agent: StoredAgent,
  session: { matchId: string; token: string },
  turn: number,
  seat: Seat,
  orders: OrdersInput,
  onStep: (s: string) => void = () => {},
): Promise<string> {
  await unlock(agent);
  const keys = unlocked!;
  await loadSigner();
  const memo = signMemo(memoBody(session.matchId, turn, seat, orders), keys.orderKey);
  onStep('Building your transaction…');
  const built = await api<{ buildId: string; pczt: string; vault: string; turn: number }>('/api/moves/build', { ...session, orders, memo });
  const pczt = fromB64(built.pczt);
  const s = JSON.parse(signer.summarize(pczt)) as PcztSummary;
  const ok =
    s.payments.length === 1 &&
    s.payments[0].address === built.vault &&
    s.payments[0].value_zats === 0 &&
    s.sapling_spends + s.sapling_outputs + s.transparent_inputs + s.transparent_outputs === 0 &&
    s.fee_zats <= MAX_MOVE_FEE &&
    s.spent_zats === s.fee_zats + s.change_zats;
  if (!ok) {
    throw new Error(`Refusing to sign: the server's transaction isn't just your move (${JSON.stringify({ payments: s.payments, fee: s.fee_zats })}).`);
  }
  onStep('Signing…');
  const signed = signer.sign(keys.mnemonic, 0, pczt);
  onStep('Broadcasting…');
  const { txid } = await api<{ txid: string }>('/api/moves/submit', { ...session, buildId: built.buildId, signed: toB64(signed) });
  return txid;
}
