import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fontBase64 from './legalPdfFont.mjs';
export function validTermsAttachment(terms){
 return terms&&typeof terms.version==='string'&&/^[a-zA-Z0-9._-]{1,80}$/.test(terms.version)&&typeof terms.text==='string'&&terms.text.trim().length>0&&terms.text.length<=30000;
}
export async function purchaseMailAttachments(terms){
 if(!validTermsAttachment(terms))throw Error('Invalid accepted terms');
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const font=await pdf.embedFont(Buffer.from(fontBase64,'base64'),{subset:true});
 pdf.setTitle('Obchodní podmínky – Pátrač – '+terms.version);pdf.setAuthor('Lukáš Bednařík');pdf.setLanguage('cs-CZ');
 const width=595.28,height=841.89,margin=48,lineHeight=15,bodySize=10.5;
 let page,y;
 function newPage(){page=pdf.addPage([width,height]);y=height-margin;page.drawText('PÁTRAČ • Obchodní podmínky',{x:margin,y,size:15,font,color:rgb(.08,.14,.32)});y-=24;page.drawText('Verze přijatá při objednávce: '+terms.version,{x:margin,y,size:9,font});y-=30;}
 function draw(line,size=bodySize){if(y<margin+30)newPage();page.drawText(line,{x:margin,y,size,font,color:rgb(.08,.12,.22)});y-=lineHeight;}
 function wrap(text,size){
  const lines=[];let line='';
  for(const word of text.split(/\s+/)){
   if(font.widthOfTextAtSize(line?line+' '+word:word,size)<=width-2*margin){line=line?line+' '+word:word;continue;}
   if(line){lines.push(line);line='';}
   // Long URLs are broken safely without clipping the right margin.
   for(const char of word){if(font.widthOfTextAtSize(line+char,size)>width-2*margin){lines.push(line);line='';}line+=char;}
  }
  if(line)lines.push(line);return lines;
 }
 newPage();
 for(const section of terms.text.replace(/\r\n?/g,'\n').split('\n\n')){
  const paragraphs=section.split('\n');
  const heading=paragraphs.length>1;
  if(heading&&y<margin+85)newPage();
  for(let i=0;i<paragraphs.length;i++){
   const size=heading&&i===0?12:bodySize;
   for(const line of wrap(paragraphs[i],size))draw(line,size);
   if(heading&&i===0)y-=5;
  }
  y-=11;
 }
 const pages=pdf.getPages();pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}`,{x:width-margin-35,y:28,size:9,font,color:rgb(.35,.4,.5)}));
 const content=Buffer.from(await pdf.save());
 return [{filename:`Patrac-obchodni-podminky-${terms.version}.pdf`,content,contentType:'application/pdf',contentDisposition:'attachment'}];
}
