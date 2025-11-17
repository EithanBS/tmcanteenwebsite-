"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import BarcodeScanner from '@/components/BarcodeScanner';
import { supabase, MenuItem, User } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ScanToPayPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [item, setItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [pinPrompt, setPinPrompt] = useState(false);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ustr = localStorage.getItem('user');
    if (!ustr) { router.push('/login'); return; }
    const u = JSON.parse(ustr);
    if (u.role !== 'student') { router.push('/login'); return; }
    setUser(u);
  }, [router]);

  useEffect(() => {
    const findItem = async () => {
      if (!scannedCode) return;
      setError(null);
      const raw = scannedCode.trim();
      let lookedUp: MenuItem | null = null;
      const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

      // Try: QR payload as JSON { type: 'item', id }
      try {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.id || parsed.item_id || parsed.menu_item_id)) {
          const id = String(parsed.id || parsed.item_id || parsed.menu_item_id);
          if (isUUID(id)) {
            const { data, error } = await supabase
              .from('menu_items')
              .select('*')
              .eq('id', id)
              .single();
            if (!error && data) lookedUp = data as any;
          }
        }
      } catch (_) {
        // not JSON, continue
      }

      // Try: direct barcode match
      if (!lookedUp) {
        const { data, error } = await supabase
          .from('menu_items')
          .select('*')
          .eq('barcode_value', raw)
          .single();
        if (!error && data) lookedUp = data as any;
      }

      // Try: id equals raw (if QR encodes item id directly)
      if (!lookedUp && isUUID(raw)) {
        const { data, error } = await supabase
          .from('menu_items')
          .select('*')
          .eq('id', raw)
          .single();
        if (!error && data) lookedUp = data as any;
      }

      if (!lookedUp) {
        setItem(null);
        setError('No item found for this code');
        return;
      }
      setItem(lookedUp);
      setQuantity(1);
    };
    findItem();
  }, [scannedCode]);

  const total = useMemo(() => {
    if (!item) return 0;
    return (item.price || 0) * quantity;
  }, [item, quantity]);

  const canAfford = useMemo(() => {
    if (!user) return false;
    return user.wallet_balance >= total;
  }, [user, total]);

  const startPayment = () => {
    setPin('');
    setPinPrompt(true);
  };

  const handleConfirm = async () => {
    if (!user || !item) return;
    if (pin.trim() !== user.pin) { alert('Incorrect PIN'); return; }
    if (quantity <= 0) { alert('Quantity must be at least 1'); return; }
    if (item.stock < quantity) { alert('Insufficient stock'); return; }
    if (!canAfford) { alert('Insufficient balance'); return; }

    setLoading(true);
    try {
      // Atomic stock decrement (or fallback inside Cart.tsx pattern if RPC missing)
      const { error: rpcError } = await supabase.rpc('decrement_stock', {
        p_items: [{ id: item.id, quantity }],
      });
      if (rpcError) throw rpcError;

      // Create order
      const orderItems = [{ id: item.id, name: item.name, price: item.price, quantity }];
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([{ user_id: user.id, items: orderItems, total_price: total, status: 'processing' }])
        .select()
        .single();
      if (orderError) throw orderError;

      // Update wallet
      const newBalance = user.wallet_balance - total;
      const { error: balanceError } = await supabase
        .from('users')
        .update({ wallet_balance: newBalance })
        .eq('id', user.id);
      if (balanceError) throw balanceError;

      // Record transaction
      await supabase.from('transactions').insert([
        { sender_id: user.id, receiver_id: null, amount: total, type: 'order' },
      ]);

      // Persist user update locally and navigate back
      const u2 = { ...user, wallet_balance: newBalance };
      setUser(u2);
      localStorage.setItem('user', JSON.stringify(u2));
      alert('Payment successful!');
      router.push('/student');
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Payment failed');
    } finally {
      setLoading(false);
      setPinPrompt(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Card className="p-4 glass-card glow-border">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold glow-text">Scan to Pay</h1>
            <Button variant="ghost" onClick={() => router.push('/student')}>Back</Button>
          </div>
        </Card>

        {!item && (
          <BarcodeScanner onScan={setScannedCode} onCancel={() => router.push('/student')} />
        )}

        {item && (
          <Card className="p-6 glass-card glow-border space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">{item.name}</h2>
                <p className="text-sm text-muted-foreground">Price: Rp {item.price.toLocaleString('id-ID')}</p>
                <p className="text-xs text-muted-foreground">Stock: {item.stock}</p>
              </div>
              {item.barcode_image_url && (
                <img src={item.barcode_image_url} alt="Barcode" className="h-16 w-16 object-contain rounded bg-secondary/40" />
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setQuantity(q => Math.max(1, q - 1))}>-</Button>
              <span className="px-3 text-lg font-semibold">{quantity}</span>
              <Button variant="outline" onClick={() => setQuantity(q => Math.min(item.stock, q + 1))}>+</Button>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-lg font-bold glow-text">Total: Rp {total.toLocaleString('id-ID')}</div>
              {!canAfford && <span className="text-sm text-destructive">Insufficient balance</span>}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setItem(null); setScannedCode(null); }}>Rescan</Button>
              <Button className="flex-1 glow-border" onClick={startPayment} disabled={!canAfford || quantity <= 0 || quantity > item.stock || loading}>
                {loading ? 'Processing...' : 'Pay'}
              </Button>
            </div>
          </Card>
        )}

        {error && (
          <Card className="p-3 glass-card glow-border text-destructive text-sm">{error}</Card>
        )}
      </div>

      {pinPrompt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="p-6 w-[90%] max-w-sm space-y-4 glass-card glow-border">
            <h3 className="text-lg font-semibold">Enter PIN</h3>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full h-10 rounded bg-secondary/30 border border-primary/20 px-3"
              placeholder="Your 4-6 digit PIN"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPinPrompt(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleConfirm} disabled={loading}>Confirm</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}