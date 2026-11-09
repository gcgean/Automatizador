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
  }

  async init() {
    await fs.mkdir(this.convDir, {recursive: true});
  }

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

  async saveSettings(patch) {
    const next = {...(await this.getSettings()), ...patch, atualizadoEm: new Date().toISOString()};
    await this.writeJson(path.join(this.dataDir, 'config.json'), next);
    return next;
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
