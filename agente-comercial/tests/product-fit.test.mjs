import test from 'node:test';
import assert from 'node:assert/strict';
import {automotiveBusiness,completeProductFor} from '../server/product-fit.js';

const products=[{id:'nfse',name:'NFS-e',salesUrl:'https://commandweb.net/nota-fiscal-de-servico'},{id:'oficina',name:'Oficina',salesUrl:'https://commandweb.net/oficina'},{id:'contador',name:'Contador',salesUrl:'https://commandweb.net/contador'},{id:'cte',name:'CT-e',salesUrl:'https://commandweb.net/cte'}];
const nfse=products[0];

test('ramo automotivo é reconhecido pelas falas do cliente',()=>{
 assert.ok(automotiveBusiness(['Sou prestador de serviço ramo automotivo.','Por ora nf serviço.']));
 for(const s of ['Tenho uma oficina mecânica','sou mecânico','Auto Center Rota','faço funilaria e pintura','borracharia do Zé','Retífica de motores','auto elétrica'])assert.ok(automotiveBusiness([s]),s);
 for(const s of ['Sou contador','vendo embalagens','presto serviço de limpeza','não sou oficina, vendo peças'])assert.ok(!automotiveBusiness([s]),s);
});

test('oficina que pediu só nota de serviço recebe a página de oficina',()=>{
 const r=completeProductFor(products,nfse,['Sou prestador de serviço ramo automotivo.','Por ora nf serviço.']);
 assert.equal(r.product.id,'oficina');assert.equal(r.upgraded,true);assert.equal(r.from,'nfse');
 assert.equal(completeProductFor(products,null,['tenho uma oficina']).product.id,'oficina','sem produto pedido também vai para oficina');
});

test('não troca quando não é do ramo, quando o produto não é parcial ou sem página de oficina',()=>{
 assert.equal(completeProductFor(products,nfse,['presto serviço de limpeza']).product.id,'nfse');
 assert.equal(completeProductFor(products,products[2],['sou contador, atendo oficinas']).product.id,'contador');
 assert.equal(completeProductFor(products,products[3],['transporto peças de oficina']).product.id,'cte');
 assert.equal(completeProductFor([nfse,{id:'oficina',enabled:false,salesUrl:'https://x.y'}],nfse,['oficina']).product.id,'nfse');
});
