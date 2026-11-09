import fs from 'node:fs/promises';
import path from 'node:path';

// Armazenamento simples em arquivos JSON. Cada cliente tem um arquivo de conversa
// (histórico completo enviado ao Claude, sempre só acrescentado) e um registro de lead.
export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.convDir = path.join(dataDir, 'conversas');
    this.leadsFile = path.join(dataDir, 'leads.json');
    this.writes = Promise.resolve();
    this.eventWrites = Promise.resolve();
    this.settingsWrites = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.convDir, {recursive: true});
  }

  loadInbox() { return this.readJson(path.join(this.dataDir, 'inbox.json'), {}); }
  saveInbox(jobs) { return this.writeJson(path.join(this.dataDir, 'inbox.json'), jobs); }

  convPath(phone) {
    return path.join(this.convDir, `${phone.replace(/\D/g, '')}.json`);
  }

  async readJson(file, fallback) {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return fallback;
      throw error;
    }
  }

  async writeJson(file, value) {
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tmp, file);
  }

  updateEvents(change) {
    const operation = this.eventWrites.then(async () => {
      const file = path.join(this.dataDir, 'events.json');
      const events = await this.readJson(file, {timeline: [], deliveries: {}});
      const result = change(events);
      await this.writeJson(file, events);
      return result;
    });
    this.eventWrites = operation.catch(() => {});
    return operation;
  }

  async getEvents(phone) {
    const events = await this.readJson(path.join(this.dataDir, 'events.json'), {timeline: [], deliveries: {}});
    return events.timeline.filter(event => event.phone === phone).map(event => ({
      ...event,
      delivery: event.messageId ? events.deliveries[event.messageId] : undefined,
    }));
  }

  recordEvent(event) {
    return this.updateEvents(events => {
      const existing = events.timeline.find(item => item.id === event.id);
      if (existing) Object.assign(existing, event);
      else events.timeline.push({...event, at: event.at || new Date().toISOString()});
    });
  }

  recordDelivery(status) {
    return this.updateEvents(events => {
      const current = events.deliveries[status.id];
      const rank = {sent: 1, failed: 2, delivered: 3, read: 4};
      if (!current || rank[status.status] > rank[current.status]) {
        events.deliveries[status.id] = status;
      }
    });
  }

  async getConversation(phone) {
    const conv = await this.readJson(this.convPath(phone), {phone, histories: {}, processedIds: []});
    conv.histories ??= {};
    if (Array.isArray(conv.messages)) { // formato antigo, só Claude
      conv.histories.claude ??= conv.messages;
      delete conv.messages;
    }
    return conv;
  }

  // Preferências alteradas em tempo de execução (ex.: IA escolhida em POST /config).
  async getSettings() {
    return this.readJson(path.join(this.dataDir, 'config.json'), {});
  }

  saveSettings(patch) {
    const operation = this.settingsWrites.then(async () => {
      const next = {...(await this.getSettings()), ...patch, atualizadoEm: new Date().toISOString()};
      await this.writeJson(path.join(this.dataDir, 'config.json'), next);
      return next;
    });
    this.settingsWrites = operation.catch(() => {});
    return operation;
  }

  async saveConversation(conv) {
    conv.processedIds = conv.processedIds.slice(-200);
    await this.writeJson(this.convPath(conv.phone), conv);
  }

  async listLeads() {
    return this.readJson(this.leadsFile, {});
  }

  // Serializa gravações no leads.json para evitar perder atualizações simultâneas.
  updateLead(phone, patch) {
    const run = this.writes.then(async () => {
      const leads = await this.listLeads();
      const now = new Date().toISOString();
      const current = leads[phone] ?? {telefone: phone, criadoEm: now, status: 'em_conversa'};
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null && v !== undefined && v !== ''));
      leads[phone] = {...current, ...clean, atualizadoEm: now};
      await this.writeJson(this.leadsFile, leads);
      return leads[phone];
    });
    this.writes = run.catch(() => {});
    return run;
  }
}
