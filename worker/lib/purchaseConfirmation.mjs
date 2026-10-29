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
 if(!order)return;
 const date=stamp=>new Date(stamp).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'});
 await sendMail(order.email,'Potvrzení platby – Pátrač',`${order.environment==='test'?'TESTOVACÍ PLATBA – nebyly strženy skutečné peníze.\n\n':''}Děkujeme za nákup přístupu do Pátrače.\nObjednávka: ${order.id}\nZaplaceno: ${order.amount/100} Kč\nVarianta: ${order.months} měsíců\nDatum potvrzení: ${date(order.paid_at)}\nPřístup do: ${date(order.access_until)}\n\nPřístup se automaticky neobnovuje. Před objednávkou jste přijali podmínky verze ${accepted.version} a výslovně požádali o zahájení služby ihned po zaplacení. Poučení a formulář pro odstoupení jsou součástí podmínek níže.\n\n${accepted.terms_snapshot}\n\nOchrana osobních údajů: https://patrac.stopik.cz/soukromi`);
 // If mail fails, webhook retries delivery without extending access a second time.
 await db.prepare('INSERT OR IGNORE INTO patrac_purchase_mail(order_id,sent_at) VALUES(?,?)').bind(orderId,Date.now()).run();
}
