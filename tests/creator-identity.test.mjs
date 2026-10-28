import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedCreator } from '../app/lib/creatorIdentity.mjs';
const confirmed = { id: '12345678-1234-1234-1234-123456789abc', email:'author@example.test', email_confirmed_at:'2026-01-01', user_metadata:{nickname:'Autor'} };
test('only a confirmed non-anonymous Auth identity becomes a creator', () => {
 assert.deepEqual(verifiedCreator(confirmed),{id:confirmed.id,email:confirmed.email,name:'Autor'});
 for (const user of [null, {}, {...confirmed,id:'bad'}, {...confirmed,email_confirmed_at:null}, {...confirmed,is_anonymous:true}]) assert.equal(verifiedCreator(user),null);
});
test('editable metadata cannot supply identity or authorization', () => {
 const value = verifiedCreator({...confirmed,user_metadata:{nickname:'Jméno',role:'admin',id:'another-id'}});
 assert.equal(value.id,confirmed.id); assert.equal(value.role,undefined);
 assert.equal(verifiedCreator({user_metadata:confirmed}),null);
});
