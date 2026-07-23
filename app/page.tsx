'use client';

import dynamic from 'next/dynamic';
import AuthGate from './components/AuthGate';

const Map = dynamic(() => import('./components/Map'), { ssr: false });

export default function Home() {
  return (
    <AuthGate>
      <Map />
    </AuthGate>
  );
}