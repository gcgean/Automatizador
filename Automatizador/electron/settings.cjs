const fs = require('node:fs');
const path = require('node:path');
const {LOCAL_BASE,LOCAL_MODEL,normalizeLocalBase}=require('./providers.cjs');

const DEFAULT_MODEL = 'deepseek-flash';
function createSettingsStore(profile, safeStorage) {
  const filename = path.join(profile, 'settings.json');
  async function encryptionReady() {
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('A proteção de credenciais do sistema não está disponível. A chave não foi gravada.');
  }
  async function save({key,model,provider='deepseek',localModel=LOCAL_MODEL,baseURL=LOCAL_BASE}) {
    let encryptedKey = null;
    if (key) {
      await encryptionReady();
      encryptedKey = (await safeStorage.encryptStringAsync(key)).toString('base64');
    }
    const data = JSON.stringify({version:1,model,encryptedKey,provider,localModel,baseURL:normalizeLocalBase(baseURL)},null,2);
    // Never write the plaintext key, including to the temporary file.
    fs.writeFileSync(`${filename}.tmp`,data,{mode:0o600});
    fs.renameSync(`${filename}.tmp`,filename);
  }
  async function load() {
    if (!fs.existsSync(filename)) return {key:'',model:DEFAULT_MODEL,provider:'deepseek',localModel:LOCAL_MODEL,baseURL:LOCAL_BASE};
    try {
      const data = JSON.parse(fs.readFileSync(filename,'utf8'));
      if (data.version !== 1 || typeof data.model !== 'string' || !data.model.trim() || data.model.length > 120 ||
          (data.encryptedKey !== null && (typeof data.encryptedKey !== 'string' || !data.encryptedKey))) throw new Error('Formato inválido');
      let key = '';
      const provider=data.provider ?? 'deepseek';
      const localModel=data.localModel ?? LOCAL_MODEL;
      const baseURL=normalizeLocalBase(data.baseURL ?? LOCAL_BASE);
      if(!['deepseek','ollama'].includes(provider) || typeof localModel !== 'string' || !localModel.trim() || localModel.length>120) throw new Error('Provedor inválido');
      if (data.encryptedKey) {
        await encryptionReady();
        const decrypted = await safeStorage.decryptStringAsync(Buffer.from(data.encryptedKey,'base64'));
        if (typeof decrypted.result !== 'string' || !decrypted.result.trim()) throw new Error('Credencial inválida');
        key = decrypted.result;
        if (decrypted.shouldReEncrypt) await save({key,model:data.model,provider,localModel,baseURL});
      }
      return {key,model:data.model,provider,localModel,baseURL};
    } catch {
      throw new Error('Não foi possível carregar a configuração salva. Informe a chave novamente e salve para substituir a configuração.');
    }
  }
  return {load,save};
}
module.exports = {createSettingsStore,DEFAULT_MODEL};
