import ContactDetails from '../components/ContactDetails';
export const metadata={title:'Kontakt | Pátrač'};
export default function Page(){
 return <main className="p-legal"><a href="/">← Zpět do Pátrače</a><h1>Kontakt</h1>
 <ContactDetails/>
 </main>;
}
