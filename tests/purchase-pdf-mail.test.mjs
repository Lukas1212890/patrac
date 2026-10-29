import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {writeFile,mkdir,unlink} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import nodemailer from 'nodemailer';
import {termsText} from '../shared/legal.mjs';
import {PDFDocument} from 'pdf-lib';
import {purchaseMailAttachments} from '../app/lib/purchaseMail.mjs';
test('signed relay builds a real MIME PDF attachment from the accepted snapshot',async()=>{
 const dir=process.cwd()+'/tmp/pdfs';await mkdir(dir,{recursive:true});
 const file=process.cwd()+'/tests/.pdf-relay-test.mjs';
 const built=await build({entryPoints:['app/api/internal/account-mail/route.ts'],bundle:true,format:'esm',platform:'node',packages:'external',write:false,logLevel:'silent'});
 await writeFile(file,built.outputFiles[0].text);
 const real=nodemailer.createTransport,oldSecret=process.env.PATRAC_AUTH_SECRET,oldPassword=process.env.PATRAC_SMTP_PASSWORD;
 const secret='pdf-local-test-secret-not-production-12345';process.env.PATRAC_AUTH_SECRET=secret;process.env.PATRAC_SMTP_PASSWORD='local-test-not-smtp';
 let message,calls=0;
 nodemailer.createTransport=()=>({sendMail:async options=>{calls++;const result=await real({streamTransport:true,buffer:true,newline:'unix'}).sendMail(options);message=result.message;},close(){}});
 try{
  const {POST}=await import(file);
  const snapshot='ARCHIVOVANÁ VERZE – Příliš žluťoučký kůň úpěl ďábelské ódy.\n\n'+termsText;
  const body=JSON.stringify({to:'test@example.com',subject:'Potvrzení platby – Pátrač',text:'Testovací doklad\nObchodní podmínky včetně poučení a formuláře pro odstoupení najdete v přiloženém PDF.',terms:{version:'archiv-2026-10-01',text:snapshot}});
  const timestamp=String(Date.now()),signature=createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex');
  const request=sig=>new Request('http://localhost/api/internal/account-mail',{method:'POST',headers:{'X-Patrac-Timestamp':timestamp,'X-Patrac-Signature':sig},body});
  assert.equal((await POST(request('0'.repeat(64)))).status,403);assert.equal(calls,0);
  assert.equal((await POST(request(signature))).status,200);assert.equal(calls,1);
  await writeFile(dir+'/purchase.eml',message);await writeFile(dir+'/expected.txt',snapshot);
  assert.match(message.toString(),/Content-Type: application\/pdf/);assert.match(message.toString(),/Content-Disposition: attachment/);assert.match(message.toString(),/Patrac-obchodni-podminky-archiv-2026-10-01.pdf/);
  const attachments=await purchaseMailAttachments({version:'archiv-2026-10-01',text:snapshot});const pdf=await PDFDocument.load(attachments[0].content);assert.ok(pdf.getPageCount()>1);assert.match(pdf.getTitle(),/archiv-2026-10-01/);
 }finally{nodemailer.createTransport=real;if(oldSecret===undefined)delete process.env.PATRAC_AUTH_SECRET;else process.env.PATRAC_AUTH_SECRET=oldSecret;if(oldPassword===undefined)delete process.env.PATRAC_SMTP_PASSWORD;else process.env.PATRAC_SMTP_PASSWORD=oldPassword;await unlink(file);}
});
