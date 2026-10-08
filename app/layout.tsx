import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Nova — Your AI workspace', description: 'One calm workspace. Your models, your conversations.', icons: { icon: [{url:'/favicon.svg',type:'image/svg+xml'},{url:'/nova-nebula.jpg',type:'image/jpeg'}], apple: '/nova-nebula.jpg' } };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
