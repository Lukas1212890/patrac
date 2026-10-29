import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseConfirmationText} from '../worker/lib/purchaseConfirmation.mjs';
import {termsText} from '../shared/legal.mjs';
test('receipt includes requested details, original terms and actual line breaks for all plans',()=>{
 const accepted={version:'original-version',terms_snapshot:termsText};
 for(const environment of ['test','live'])for(const months of [3,6,12]){
 const order={environment,id:'order-123',months,amount:months===3?19900:months===6?34900:59900,paid_at:Date.UTC(2026,9,29,8,24),access_until:Date.UTC(2027,0,29,8,24)};
 const body=purchaseConfirmationText(order,accepted,Date.UTC(2026,9,29,8,25));
 for(const text of ['Potvrzení objednávky a doklad o zaplacení','Číslo objednávky: order-123','Datum platby: 29. 10. 2026 9:24:00','Datum vystavení dokladu: 29. 10. 2026 9:25:00','Služba: Placený přístup do aplikace Pátrač',`Zakoupená délka: ${months===3?'3 měsíce':months+' měsíců'}`,`Zaplacená částka: ${order.amount/100},00 Kč`,'Stav: Zaplaceno','Datum konce přístupu: 29. 1. 2027 9:24:00','Poskytovatel: Lukáš Bednařík','IČO: 14286467','Sídlo: Hovězí 731, 756 01 Hovězí','Poskytovatel není plátcem DPH','Kontakt: patrac@stopik.cz','podmínky verze original-version','výslovně požádali o zahájení služby ihned po zaplacení',termsText])assert.ok(body.includes(text),text);
 assert.equal(body.includes('\\'),false);assert.ok(body.split('\n').length>20);
 assert.equal(body.startsWith('*** TESTOVACÍ PLATBA ***'),environment==='test');
 if(environment==='live')assert.equal(/testovací/i.test(body),false);
 assert.ok(body.indexOf('Poskytovatel:')<body.indexOf(termsText));
 assert.ok(body.length<12000);assert.ok(Buffer.byteLength(JSON.stringify({to:'test@example.com',subject:'Potvrzení platby – Pátrač',text:body}))<16000);
 }
});
