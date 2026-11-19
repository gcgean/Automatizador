import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCompanyDocument,validCompanyDocument} from '../shared/company-document.js';
test('documentos: normaliza máscaras, valida CPF/CNPJ e rejeita adulterações',()=>{
 for(const value of ['529.982.247-25','11.222.333/0001-81','12.ABC.345/01DE-35'])assert.equal(validCompanyDocument(value),true);
 assert.equal(normalizeCompanyDocument(' 12.abc.345/01de-35 '),'12ABC34501DE35');
 for(const value of ['',null,123,'11111111111','00000000000000','52998224724','11222333000180','12ABC34501DE34','52998224725!','A52998224725'])assert.equal(validCompanyDocument(value),false,String(value));
});
