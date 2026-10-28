'use client';
import { useCallback, useEffect, useState } from 'react';
import { agentRefill, agentStatus, createAgent, forgetAgent, revealSeed, storedAgent, type StoredAgent } from '@/lib/agent';
import { taz } from '@/lib/api';
import type { AgentStatus } from '@/lib/types';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// The player's agent wallet: created here with a passkey, funded by the house, used to sign moves.
export default function AgentCard({ name, avatar, enabled, onChange }: { name: string; avatar: string; enabled: boolean; onChange: (a: StoredAgent | null) => void }) {
  const [agent, setAgent] = useState<StoredAgent | null>(null);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [step, setStep] = useState('');
  const [err, setErr] = useState('');
  const [seed, setSeed] = useState('');

  useEffect(() => {
    const a = storedAgent();
    setAgent(a);
    onChange(a);
  }, [onChange]);

  const refresh = useCallback(async (a: StoredAgent) => {
    try {
      setStatus(await agentStatus(a));
    } catch (e) {
      setErr(message(e));
    }
  }, []);

  useEffect(() => {
    if (!agent) return;
    refresh(agent);
    const t = setInterval(() => refresh(agent), 15_000);
    return () => clearInterval(t);
  }, [agent, refresh]);

  async function create() {
    setErr('');
    try {
      const a = await createAgent(name, avatar, setStep);
      setAgent(a);
      onChange(a);
    } catch (e) {
      setErr(message(e));
    }
    setStep('');
  }

  async function act(fn: () => Promise<unknown>) {
    setErr('');
    try {
      await fn();
      if (agent) refresh(agent);
    } catch (e) {
      setErr(message(e));
    }
  }

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">
        <h3 className="font-display font-semibold text-ink">Agent wallet</h3>
        <p className="mt-1">On-chain moves need the testnet server with its transaction builder running.</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="rounded-2xl border border-zec/60 bg-zec-soft/50 p-4">
        <h3 className="font-display font-semibold">Give your agent a wallet</h3>
        <p className="mt-1 text-sm text-muted">
          A shielded testnet wallet that lives in this browser, locked by a passkey. In head-to-head matches every move becomes a
          shielded transaction you sign. The house funds your first {24} moves.
        </p>
        <button onClick={create} disabled={!!step} className="mt-3 w-full rounded-xl bg-ink py-2.5 text-sm font-semibold text-paper disabled:opacity-60">
          {step || 'Create agent with a passkey'}
        </button>
        {err && <p className="mt-2 text-xs text-alert">{err}</p>}
      </div>
    );
  }

  const refill = status?.refill;
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display font-semibold">Agent wallet</h3>
        <span className="font-mono text-[11px] text-ok">passkey-locked</span>
      </div>
      {status ? (
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-2xl font-bold">{status.movesFunded}</span>
          <span className="text-sm text-muted">on-chain moves funded · {taz(status.spendableZat)}</span>
        </div>
      ) : (
        <p className="mt-2 font-mono text-xs text-faint">Syncing your wallet…</p>
      )}
      {refill?.status === 'sending' && <p className="mt-1 text-xs text-zec-deep">The house is sending your moves…</p>}
      {refill?.status === 'sent' && status && status.movesFunded === 0 && <p className="mt-1 text-xs text-zec-deep">Funds sent. Spendable after one block (about 75 seconds).</p>}
      {refill?.status === 'failed' && <p className="mt-1 text-xs text-alert">{refill.error}</p>}
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <button onClick={() => act(() => agentRefill(agent))} className="rounded-lg border border-line px-3 py-1.5 font-medium hover:border-faint">
          Refill
        </button>
        <button onClick={() => act(async () => setSeed(seed ? '' : await revealSeed(agent)))} className="rounded-lg border border-line px-3 py-1.5 font-medium hover:border-faint">
          {seed ? 'Hide seed phrase' : 'Show seed phrase'}
        </button>
        <button
          onClick={() => {
            if (confirm('Forget this agent on this device? Without its seed phrase, its funds are lost.')) {
              forgetAgent();
              setAgent(null);
              setStatus(null);
              onChange(null);
            }
          }}
          className="ml-auto rounded-lg px-2 py-1.5 text-faint hover:text-alert"
        >
          Forget
        </button>
      </div>
      {seed && <p className="mt-3 rounded-lg bg-paper-2 p-3 font-mono text-xs leading-relaxed">{seed}</p>}
      {err && <p className="mt-2 text-xs text-alert">{err}</p>}
    </div>
  );
}
