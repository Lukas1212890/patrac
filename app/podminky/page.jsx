import LegalPage from '../components/LegalPage';
import {terms} from '../../shared/legal.mjs';
export const metadata={title:'Obchodní podmínky | Pátrač'};
export default function Page(){return <LegalPage title="Obchodní podmínky" sections={terms}/>;}
