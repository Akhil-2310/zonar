'use client';
import { useCallback, useEffect, useState } from 'react';
import { agentRefill, agentStatus, createAgent, forgetAgent, revealSeed, storedAgent, type StoredAgent } from '@/lib/agent';
import { taz } from '@/lib/api';
import { Icon } from './Pixel';
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
      <div className="toy rounded-2xl bg-card p-4 text-sm text-muted">
        <h3 className="font-display text-lg font-bold text-ink">Agent wallet</h3>
        <p className="mt-1">On-chain moves need the testnet server with its transaction builder running.</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="toy rounded-2xl bg-butter p-4">
        <div className="flex items-center gap-2">
          <Icon name="lock" size={22} />
          <h3 className="font-display text-lg font-bold">Give your agent a wallet</h3>
        </div>
        <p className="mt-1 text-sm text-muted">
          A shielded testnet wallet that lives in this browser, locked by a passkey. In head-to-head matches every move becomes a
          shielded transaction you sign. The house funds your first {24} moves.
        </p>
        <button onClick={create} disabled={!!step} className="toy-sm press mt-3 w-full rounded-xl bg-ink py-2.5 font-bold text-paper disabled:opacity-60">
          {step || 'Create agent with a passkey'}
        </button>
        {err && <p className="mt-2 text-xs text-alert">{err}</p>}
      </div>
    );
  }

  const refill = status?.refill;
  return (
    <div className="toy rounded-2xl bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg font-bold">Agent wallet</h3>
        <span className="toy-sm rounded-full bg-mint px-2 font-tiny text-[10px]">passkey-locked</span>
      </div>
      {status ? (
        <div className="lcd mt-3 flex items-center gap-3 rounded-xl border-2 border-ink px-3 py-2 text-lcd-ink">
          <Icon name="coin" size={26} />
          <span data-testid="moves-funded" className="font-tiny text-3xl leading-none">{status.movesFunded}</span>
          <span className="text-[13px] leading-tight">on-chain moves funded<br />{taz(status.spendableZat)}</span>
        </div>
      ) : (
        <p className="mt-2 font-tiny text-[11px] text-faint">Syncing your wallet…</p>
      )}
      {refill?.status === 'sending' && <p className="mt-1 text-xs text-zec-deep">The house is sending your moves…</p>}
      {refill?.status === 'sent' && status && status.movesFunded === 0 && <p className="mt-1 text-xs text-zec-deep">Funds sent. Spendable after one block (about 75 seconds).</p>}
      {refill?.status === 'failed' && <p className="mt-1 text-xs text-alert">{refill.error}</p>}
      <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
        <button onClick={() => act(() => agentRefill(agent))} className="toy-sm press rounded-lg bg-butter px-3 py-1 font-bold">
          Refill
        </button>
        <button onClick={() => act(async () => setSeed(seed ? '' : await revealSeed(agent)))} className="toy-sm press rounded-lg bg-lilac px-3 py-1 font-bold">
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
          className="ml-auto rounded-lg px-2 py-1 font-tiny text-[10px] uppercase text-faint hover:text-alert"
        >
          Forget
        </button>
      </div>
      {seed && <p className="toy-sm mt-3 rounded-lg bg-paper p-3 font-mono text-xs leading-relaxed">{seed}</p>}
      {err && <p className="mt-2 text-xs text-alert">{err}</p>}
    </div>
  );
}
