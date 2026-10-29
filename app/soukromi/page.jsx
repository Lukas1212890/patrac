import LegalPage from '../components/LegalPage';
import {privacy} from '../../shared/legal.mjs';
export const metadata={title:'Ochrana osobních údajů | Pátrač'};
export default function Page(){return <LegalPage title="Ochrana osobních údajů" sections={privacy}/>;}
