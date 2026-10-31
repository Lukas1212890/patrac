import {deletedAccount} from './accountDeletion.mjs';
export async function sendPurchaseConfirmation(db,orderId,sendMail){
 if(!sendMail)return;
 // Older orders have no legal acceptance; do not send them new contractual text.
 const schema=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_legal_acceptance'").first();
 if(!schema)return;
 const accepted=await db.prepare("SELECT version,terms_snapshot FROM patrac_legal_acceptance WHERE kind='purchase-immediate' AND reference=? ORDER BY accepted_at DESC LIMIT 1").bind(orderId).first();
 if(!accepted)return;
 await db.prepare('CREATE TABLE IF NOT EXISTS patrac_purchase_mail(order_id TEXT PRIMARY KEY,sent_at INTEGER NOT NULL)').run();
 if(await db.prepare('SELECT order_id FROM patrac_purchase_mail WHERE order_id=?').bind(orderId).first())return;
 const order=await db.prepare('SELECT o.*,u.email FROM patrac_orders o JOIN patrac_auth_user u ON u.id=o.user_id WHERE o.id=? AND o.paid_at IS NOT NULL').bind(orderId).first();
 if(!order||await deletedAccount(db,order.user_id))return;
 await sendMail(order.email,'Potvrzení platby – Pátrač',purchaseConfirmationText(order,accepted,Date.now()),{version:accepted.version,text:accepted.terms_snapshot});
 // If mail fails, webhook retries delivery without extending access a second time.
 await db.prepare('INSERT OR IGNORE INTO patrac_purchase_mail(order_id,sent_at) VALUES(?,?)').bind(orderId,Date.now()).run();
}

export function purchaseConfirmationText(order,accepted,issuedAt){
 const date=stamp=>new Date(stamp).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'});
 const duration=order.months===3?'3 měsíce':`${order.months} měsíců`;
 const amount=new Intl.NumberFormat('cs-CZ',{minimumFractionDigits:2,maximumFractionDigits:2}).format(order.amount/100);
 return [
  ...(order.environment==='test'?['*** TESTOVACÍ PLATBA ***','Nebyly strženy skutečné peníze. Tento testovací doklad nepotvrzuje skutečnou úhradu.','']:[]),
  'Potvrzení objednávky a doklad o zaplacení','',
  `Číslo objednávky: ${order.id}`,
  `Datum platby: ${date(order.paid_at)}`,
  `Datum vystavení dokladu: ${date(issuedAt)}`,
  'Služba: Placený přístup do aplikace Pátrač',
  `Zakoupená délka: ${duration}`,
  `Zaplacená částka: ${amount} Kč`,
  `Stav: Zaplaceno${order.environment==='test'?' (testovací platba)':''}`,
  `Datum konce přístupu: ${date(order.access_until)}`,'',
  'Poskytovatel: Lukáš Bednařík',
  'IČO: 14286467',
  'Sídlo: Hovězí 731, 756 01 Hovězí',
  'Poskytovatel není plátcem DPH',
  'Kontakt: patrac@stopik.cz','',
  'Děkujeme za nákup přístupu do Pátrače. Přístup se automaticky neobnovuje.','',
  `Před objednávkou jste přijali podmínky verze ${accepted.version} a výslovně požádali o zahájení služby ihned po zaplacení.`,
  '','Obchodní podmínky včetně poučení a formuláře pro odstoupení najdete v přiloženém PDF.','',
  'Ochrana osobních údajů: https://patrac.stopik.cz/soukromi'
 ].join('\n');
}
