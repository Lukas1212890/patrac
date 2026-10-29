import {LEGAL_VERSION} from '../../shared/legal.mjs';
export default function LegalPage({title,sections}){
 return <main className="p-legal"><a href="/">← Zpět do Pátrače</a><h1>{title}</h1><p>Verze {LEGAL_VERSION} · Pátrač</p><p>Dokument lze uložit nebo vytisknout pomocí nabídky prohlížeče.</p>{sections.map(([heading,text],i)=><section key={heading}><h2>{i+1}. {heading}</h2><p>{text}</p></section>)}<nav aria-label="Právní informace"><a href="/podminky">Obchodní podmínky</a> · <a href="/soukromi">Ochrana osobních údajů</a></nav></main>;
}
