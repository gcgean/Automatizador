const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-settings-'));
async function launch(){
  const app=await electron.launch({args:[path.join(__dirname,'..')],env:{...process.env,NEXO_TEST_PROFILE:profile}});
  const page=await app.firstWindow();page.setDefaultTimeout(15000);
  await page.getByRole('heading',{name:'O que vamos fazer?'}).waitFor();
  return {app,page};
}
(async()=>{
  let instance;
  const fakeKey='nexo-test-credential-not-a-real-api-key';
  try{
    instance=await launch();
    await instance.page.evaluate(key=>window.nexo.config({key,model:'persistence-test-model'}),fakeKey);
    const serialized=fs.readFileSync(path.join(profile,'settings.json'),'utf8');
    assert.ok(!serialized.includes(fakeKey));assert.ok(JSON.parse(serialized).encryptedKey);
    await instance.app.close();instance=null;
    instance=await launch();
    let config=await instance.page.evaluate(()=>window.nexo.getConfig());
    assert.equal(config.hasKey,true);assert.equal(config.model,'persistence-test-model');assert.equal('key' in config,false);
    assert.equal(await instance.app.evaluate(async({safeStorage},{encryptedKey,expected})=>
      (await safeStorage.decryptStringAsync(Buffer.from(encryptedKey,'base64'))).result===expected,
      {encryptedKey:JSON.parse(serialized).encryptedKey,expected:fakeKey}),true);
    await instance.page.getByRole('button',{name:'Configurações'}).click();
    await instance.page.getByText('Chave salva e carregada. Pronta para uso.',{exact:true}).waitFor();
    assert.equal(await instance.page.getByLabel('Chave da API').inputValue(),'');
    await instance.page.getByLabel('Modelo',{exact:true}).fill('updated-test-model');
    await instance.page.getByRole('button',{name:'Salvar configuração'}).click();
    await instance.page.getByRole('dialog').waitFor({state:'hidden'});
    await instance.app.close();instance=null;
    instance=await launch();
    config=await instance.page.evaluate(()=>window.nexo.getConfig());
    assert.equal(config.hasKey,true);assert.equal(config.model,'updated-test-model');
    await instance.page.evaluate(()=>window.nexo.config({provider:'ollama',key:'',model:'qwen2.5:3b',baseURL:'http://localhost:11434/v1'}));
    await instance.app.close();instance=null;
    instance=await launch();
    config=await instance.page.evaluate(()=>window.nexo.getConfig());
    assert.equal(config.provider,'ollama');assert.equal(config.model,'qwen2.5:3b');assert.equal(config.hasKey,true);assert.equal(config.deepseekModel,'updated-test-model');
    await instance.page.evaluate(()=>window.nexo.config({provider:'deepseek',key:'',model:'updated-test-model'}));
    await instance.page.getByRole('button',{name:'Configurações'}).click();
    await instance.page.getByRole('button',{name:'Remover chave salva'}).click();
    await instance.page.getByRole('dialog').waitFor({state:'hidden'});
    await instance.app.close();instance=null;
    instance=await launch();
    config=await instance.page.evaluate(()=>window.nexo.getConfig());assert.equal(config.hasKey,false);
    await instance.app.close();instance=null;
    fs.writeFileSync(path.join(profile,'settings.json'),'invalid-settings-file');
    instance=await launch();
    config=await instance.page.evaluate(()=>window.nexo.getConfig());assert.equal(config.hasKey,false);assert.match(config.error,/Não foi possível carregar/);
    assert.equal(fs.readFileSync(path.join(profile,'settings.json'),'utf8'),'invalid-settings-file');
    console.log('PASS: chave criptografada, restauração após reiniciar, modelo e provedor persistidos, chave preservada ao alternar, remoção e recuperação de arquivo inválido.');
  }finally{if(instance)await instance.app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
