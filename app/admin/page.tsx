import type { Metadata } from 'next';
import AccountAdmin from '../components/AccountAdmin';
export const metadata: Metadata = { title: 'Správa účtů – Pátrač', manifest:'/admin-manifest.webmanifest', icons:{icon:'/patrac-admin-icon-192.png',apple:'/patrac-admin-icon-180.png'}, appleWebApp:{capable:true,statusBarStyle:'black-translucent',title:'Pátrač admin'}, robots: { index: false, follow: false } };
export default function AdminPage() { return <AccountAdmin/>; }
