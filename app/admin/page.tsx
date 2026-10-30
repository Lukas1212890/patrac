import type { Metadata } from 'next';
import AccountAdmin from '../components/AccountAdmin';
export const metadata: Metadata = { title: 'Správa účtů – Pátrač', manifest:'/admin-manifest.webmanifest', robots: { index: false, follow: false } };
export default function AdminPage() { return <AccountAdmin/>; }
