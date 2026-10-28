export function nickname(value){
 if(typeof value!=='string')throw Error('Přezdívka musí mít 1 až 60 znaků.');
 const name=value.normalize('NFKC').trim().replace(/\s+/gu,' ');
 if(!name||name.length>60||/[\p{Cc}\p{Cf}]/u.test(name))throw Error('Přezdívka musí mít 1 až 60 znaků a nesmí obsahovat skryté znaky.');
 return {name,nicknameKey:name.toLocaleLowerCase('cs')};
}
export async function availableNickname(db,value,id){
 const result=nickname(value),rows=await db.prepare('SELECT id,name FROM patrac_auth_user').all();
 if(rows.results.some(u=>u.id!==id&&nickname(u.name).nicknameKey===result.nicknameKey))throw Error('Tato přezdívka je už obsazená. Zvolte jinou.');
 return result;
}
