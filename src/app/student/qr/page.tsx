"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, QrCode } from 'lucide-react';

export default function StudentQRPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) { router.push('/login'); return; }
    const u = JSON.parse(raw);
    if (u.role !== 'student') { router.push('/login'); return; }
    setUser(u);
  }, [router]);

  useEffect(() => {
    const gen = async () => {
      if (!user) return;
      const { default: QRCode } = await import('qrcode');
      const payload = JSON.stringify({ t: 'student', id: user.id, n: user.name });
      const url = await QRCode.toDataURL(payload, { width: 280, margin: 2 });
      setQrDataUrl(url);
    };
    gen();
  }, [user]);

  if (!user) return <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 p-4 md:p-8">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={()=>router.push('/student')}><ArrowLeft className="h-4 w-4 mr-1"/>Back</Button>
        </div>
        <Card className="p-8 glass-card glow-border text-center space-y-4">
          <div className="flex items-center justify-center gap-2"><QrCode className="h-5 w-5"/><h1 className="text-xl font-bold glow-text">My Student QR</h1></div>
          <div className="text-sm text-muted-foreground">Show this to canteen owner to pay using your wallet.</div>
          <div className="w-72 h-72 bg-white rounded-lg grid place-items-center mx-auto">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Student QR" className="block w-64 h-64" />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center text-muted-foreground">Generating…</div>
            )}
          </div>
          <div className="text-sm">
            <div className="font-semibold">{user.name}</div>
            <div className="text-muted-foreground text-xs">ID: {user.id}</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
