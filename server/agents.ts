// Player agent wallets. The seed never leaves the player's browser (it is wrapped under
// their passkey there); this registry holds only what the builder needs (the view-only
// key) and the public key that signs their moves.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type Agent = {
  id: string;
  tokenHash: string;
  name: string;
  avatar?: string;
  ufvk: string;
  seedFingerprint: string;
  accountIndex: number;
  // Ed25519 public key (base64) for verifying signed move memos.
  orderPub: string;
  createdAt: number;
  refill?: { status: 'sending' | 'sent' | 'failed'; txid?: string; error?: string; at: number };
};

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export class AgentStore {
  private file: string;
  private agents: Map<string, Agent>;

  constructor(file: string) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      this.agents = new Map((JSON.parse(fs.readFileSync(file, 'utf8')) as Agent[]).map((a) => [a.id, a]));
    } catch {
      this.agents = new Map();
    }
  }

  save() {
    fs.writeFileSync(this.file + '.tmp', JSON.stringify([...this.agents.values()]));
    fs.renameSync(this.file + '.tmp', this.file);
  }

  create(fields: Omit<Agent, 'id' | 'tokenHash' | 'createdAt'>): { agent: Agent; token: string } {
    const id = 'ag-' + crypto.randomBytes(8).toString('hex');
    const token = crypto.randomBytes(24).toString('hex');
    const agent: Agent = { ...fields, id, tokenHash: hash(token), createdAt: Date.now() };
    this.agents.set(id, agent);
    this.save();
    return { agent, token };
  }

  // The agent token proves this browser created the agent; it can't spend anything.
  auth(id: unknown, token: unknown): Agent {
    const agent = typeof id === 'string' ? this.agents.get(id) : undefined;
    if (!agent || typeof token !== 'string' || hash(token) !== agent.tokenHash) {
      throw Object.assign(new Error('unknown agent'), { status: 403 });
    }
    return agent;
  }

  get(id: string | undefined): Agent | undefined {
    return id ? this.agents.get(id) : undefined;
  }
}
