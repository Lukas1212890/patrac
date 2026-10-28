import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
test('identity migration preserves existing games and stops before schema changes on old nickname collisions',()=>{
 const db=new DatabaseSync(':memory:');
 for(const f of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql'])db.exec(readFileSync('drizzle/'+f,'utf8'));
 const insert=db.prepare('INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,0,0)');insert.run('a','Vlci','a@example.com');insert.run('b',' vlci ','b@example.com');
 const sql=readFileSync('drizzle/0009_player_accounts.sql','utf8');assert.throws(()=>db.exec(sql),/UNIQUE/);
 assert.equal(db.prepare('PRAGMA table_info(patrac_auth_user)').all().some(c=>c.name==='nicknameKey'),false);
 db.prepare('UPDATE patrac_auth_user SET name=? WHERE id=?').run('Jiný hráč','b');db.exec(sql);
 assert.equal(db.prepare('SELECT nicknameKey FROM patrac_auth_user WHERE id=?').get('a').nicknameKey,'vlci');
 assert.throws(()=>insert.run('c','VLCI','c@example.com'),/UNIQUE/);db.close();
});
