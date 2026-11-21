const fail=message=>Object.assign(new Error(message),{status:400});
export async function validateConnectionDepartments(store,companyId,body){
 const ids=body.departmentIds,primary=body.primaryDepartmentId;
 if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string'||!/^[-a-f0-9]{36}$/i.test(id))||typeof primary!=='string'||!ids.includes(primary))throw fail('Informe o setor principal e os setores permitidos da conexão.');
 const unique=[...new Set(ids)];const {rows}=await store.pool.query('SELECT id FROM departments WHERE company_id=$1 AND active AND id=ANY($2::uuid[]) FOR SHARE',[companyId,unique]);
 if(rows.length!==unique.length)throw fail('Escolha somente setores ativos desta empresa.');return unique;
}
export async function defaultConnectionDepartment(store){
 const {rows}=await store.pool.query('SELECT d.id,c.primary_department_id FROM whatsapp_connections c JOIN department_connections dc ON dc.connection_id=c.id JOIN departments d ON d.id=dc.department_id AND d.company_id=c.company_id AND d.active WHERE c.id=$1',[store.connectionId]);
 return rows.find(d=>d.id===d.primary_department_id)?.id||(rows.length===1?rows[0].id:false);
}
