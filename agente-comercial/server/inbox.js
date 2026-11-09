import path from 'node:path';
import {requestsOptOut} from './consent.js';

// One server process owns this durable inbox. Processing interrupted by a crash
// requires human review because an external send may already have happened.
export class DurableInbox {
  constructor({store, agent, log = console}) {
    this.store = store;
    this.agent = agent;
    this.log = log;
    this.file = path.join(store.dataDir, 'inbox.json');
    this.jobs = {};
    this.writes = Promise.resolve();
    this.queues = new Map();
  }

  async init() {
    this.jobs = await this.store.loadInbox();
    for (const job of Object.values(this.jobs)) {
      if (job.status === 'processing') {
        job.status = 'attention';
        job.error = 'Execução interrompida. Confira se houve envio antes de retomar.';
      }
    }
    await this.store.saveInbox(this.jobs);
  }

  update(change) {
    const operation = this.writes.then(async () => {
      const next = structuredClone(this.jobs);
      const result = change(next);
      await this.store.saveInbox(next);
      this.jobs = next;
      return result;
    });
    this.writes = operation.catch(() => {});
    return operation;
  }

  async accept(message) {
    if (typeof message.id !== 'string' || !message.id || !/^\d+$/.test(message.from || '')) {
      throw new Error('Mensagem recebida sem identificação válida.');
    }
    const key = Buffer.from(message.id).toString('base64url');
    if (!message.manual && requestsOptOut(message.text)) {
      await this.store.updateLead(message.from, {optedOut: true, status: 'bloqueado', optedOutAt: new Date().toISOString()});
    }
    const added = await this.update(jobs => {
      if (Object.hasOwn(jobs, key)) return false;
      jobs[key] = {message, status: 'queued', receivedAt: new Date().toISOString()};
      return true;
    });
    if (added) this.schedule(key);
  }

  resume() {
    for (const [key, job] of Object.entries(this.jobs)) {
      if (job.status === 'queued') this.schedule(key);
    }
  }

  schedule(key) {
    const phone = this.jobs[key].message.from;
    const previous = this.queues.get(phone) || Promise.resolve();
    const next = previous.then(async () => {
      const blocked = Object.values(this.jobs).some(job => job.message.from === phone && job.status === 'attention');
      if (blocked || this.jobs[key].status !== 'queued') return;
      await this.update(jobs => { jobs[key].status = 'processing'; });
      try {
        await this.agent.enqueue(this.jobs[key].message);
        await this.update(jobs => { jobs[key].status = 'done'; });
      } catch (error) {
        await this.update(jobs => {
          jobs[key].status = 'attention';
          jobs[key].error = String(error.message);
        });
      }
    }).catch(error => this.log.error('[fila persistente]', error.message));
    this.queues.set(phone, next);
    next.then(() => { if (this.queues.get(phone) === next) this.queues.delete(phone); });
  }

  async drain() {
    await Promise.all([...this.queues.values()]);
  }
}
