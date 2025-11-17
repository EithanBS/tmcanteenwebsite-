"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, User, MenuItem } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import BarcodeScanner from '@/components/BarcodeScanner';
import { ArrowLeft, QrCode, User as UserIcon, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function OwnerScanStudentPage() {
  const router = useRouter();
  const [owner, setOwner] = useState<User | null>(null);
  const [scanning, setScanning] = useState<boolean>(true);
  const [student, setStudent] = useState<User | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<Array<{ id: string; name: string; price: number; quantity: number; stock: number }>>([]);

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) { router.push('/login'); return; }
    const u = JSON.parse(raw);
    if (u.role !== 'owner') { router.push('/login'); return; }
    setOwner(u);
    // Load owner's items
    (async () => {
      const { data } = await supabase.from('menu_items').select('*').eq('owner_id', u.id).order('name', { ascending: true });
      setMenuItems((data as any) || []);
    })();
    const ch = supabase
      .channel('owner_items_scan')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items', filter: `owner_id=eq.${u.id}` }, async () => {
        const { data } = await supabase.from('menu_items').select('*').eq('owner_id', u.id).order('name', { ascending: true });
        setMenuItems((data as any) || []);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [router]);

  const handleScan = async (code: string) => {
    try {
      setError(null);
      setScanning(false);
      // Accept either raw id or JSON payload { t:'student', id, n }
      let id = code.trim();
      try { const parsed = JSON.parse(code); if (parsed && parsed.id) id = String(parsed.id); } catch {}
      const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
      if (!isUUID(id)) { setError('Invalid student QR'); setScanning(true); return; }
      const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
      if (error || !data) { setError('Student not found'); setScanning(true); return; }
      if ((data as any).role !== 'student') { setError('QR does not belong to a student'); setScanning(true); return; }
      setStudent(data as any);
    } catch (e:any) {
      setError(e?.message || 'Failed to parse QR');
      setScanning(true);
    }
  };

  const cancelScan = () => { setScanning(true); setStudent(null); setError(null); };

  const confirmCharge = async () => {
    if (!student) return;
    // If items selected, compute amount from cart; else use manual amount
    const computedTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    const amt = computedTotal > 0 ? computedTotal : Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { alert('Enter a valid amount'); return; }
    if (!pin || pin.length < 4) { alert('Enter the student\'s PIN'); return; }
    setLoading(true);
    try {
      // Verify pin fresh from DB
      const { data: fresh } = await supabase.from('users').select('pin,wallet_balance').eq('id', student.id).single();
      const currentBalance = (fresh as any)?.wallet_balance ?? student.wallet_balance;
      const correctPin = pin === ((fresh as any)?.pin ?? student.pin);
      if (!correctPin) { alert('Incorrect PIN'); setLoading(false); return; }
      if (currentBalance < amt) { alert('Student has insufficient balance'); setLoading(false); return; }

      // If cart has items, handle stock decrement and order insertion
      let orderId: string | null = null;
      if (cart.length > 0) {
        // Pre-verify and atomic decrement via RPC with fallback
        const ids = cart.map(i => i.id);
        const { data: beforeRows, error: bErr } = await supabase.from('menu_items').select('id, stock').in('id', ids);
        if (bErr) throw bErr as any;
        const stockMap = new Map((beforeRows || []).map((r: any) => [r.id, r.stock]));
        const insufficient = cart.find(i => (stockMap.get(i.id) ?? 0) < i.quantity);
        if (insufficient) { alert(`Not enough stock for ${insufficient.name}`); setLoading(false); return; }
        // Try RPC first
        const rpcPayload = cart.map(i => ({ id: i.id, quantity: i.quantity }));
        const { error: rpcError } = await supabase.rpc('decrement_stock', { p_items: rpcPayload });
        if (rpcError) {
          // Fallback: client-side updates
          for (const item of cart) {
            const cur = stockMap.get(item.id) ?? 0;
            const newStock = cur - item.quantity;
            const { error: upErr } = await supabase.from('menu_items').update({ stock: newStock }).eq('id', item.id);
            if (upErr) throw upErr as any;
          }
        }
        // Create order record
        const orderItems = cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity }));
        const { data: orderRow, error: orderErr } = await supabase
          .from('orders')
          .insert([{ user_id: student.id, items: orderItems, total_price: amt, status: 'processing' }])
          .select()
          .single();
        if (orderErr) throw orderErr as any;
        orderId = (orderRow as any)?.id || null;
      }

      // Deduct wallet
      const newBalance = currentBalance - amt;
      const { error: uerr } = await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', student.id);
      if (uerr) throw uerr;
      // Record transaction as order payment
      await supabase.from('transactions').insert([{ sender_id: student.id, receiver_id: null, amount: amt, type: 'order' }]);

      alert('Payment successful');
      setStudent({ ...student, wallet_balance: newBalance });
      setCart([]);
      setAmount(''); setPin('');
      setScanning(true);
    } catch (e:any) {
      console.error(e);
      alert('Failed to charge');
    } finally { setLoading(false); }
  };

  if (!owner) return <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={()=>router.push('/owner')}><ArrowLeft className="h-4 w-4 mr-1"/>Back</Button>
        </div>
        <Card className="p-6 glass-card glow-border space-y-4">
          <div className="flex items-center gap-2"><QrCode className="h-5 w-5"/><h1 className="text-xl font-bold glow-text">Scan Student QR</h1></div>
          {scanning ? (
            <BarcodeScanner onScan={handleScan} onCancel={()=>router.push('/owner')} />
          ) : student ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary/40 flex items-center justify-center"><UserIcon className="h-5 w-5"/></div>
                <div>
                  <div className="font-semibold">{student.name}</div>
                  <div className="text-xs text-muted-foreground">Balance: Rp {student.wallet_balance.toLocaleString('id-ID')}</div>
                </div>
                <Button variant="ghost" className="ml-auto" onClick={cancelScan}>Scan another</Button>
              </div>
              {/* Item selection (owner's items) */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Select Items</div>
                <div className="grid gap-2 max-h-64 overflow-auto">
                  {menuItems.map(mi => {
                    const inCart = cart.find(c => c.id === mi.id);
                    return (
                      <div key={mi.id} className="flex items-center justify-between p-2 bg-secondary/30 rounded border border-primary/20">
                        <div className="text-sm">
                          <div className="font-medium">{mi.name}</div>
                          <div className="text-xs text-muted-foreground">Rp {mi.price.toLocaleString('id-ID')} · Stock {mi.stock}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCart(prev => {
                                const ex = prev.find(p => p.id === mi.id);
                                if (!ex) return prev;
                                const qty = Math.max(0, ex.quantity - 1);
                                if (qty === 0) return prev.filter(p => p.id !== mi.id);
                                return prev.map(p => p.id === mi.id ? { ...p, quantity: qty } : p);
                              });
                            }}
                          >-</Button>
                          <span className="w-6 text-center text-sm">{inCart?.quantity || 0}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCart(prev => {
                                const ex = prev.find(p => p.id === mi.id);
                                if (ex) {
                                  if (ex.quantity >= mi.stock) return prev;
                                  return prev.map(p => p.id === mi.id ? { ...p, quantity: p.quantity + 1 } : p);
                                }
                                if (mi.stock <= 0) return prev;
                                return [...prev, { id: mi.id, name: mi.name, price: mi.price, quantity: 1, stock: mi.stock }];
                              });
                            }}
                          >+</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {cart.length > 0 && (
                <div className="p-3 rounded bg-secondary/30 border border-primary/20">
                  <div className="flex justify-between text-sm">
                    <span>Items total</span>
                    <span className="font-semibold">Rp {cart.reduce((s,i)=>s+i.price*i.quantity,0).toLocaleString('id-ID')}</span>
                  </div>
                </div>
              )}

              <div className="grid gap-3">
                {/* If no items are selected, allow a manual amount; otherwise amount is computed */}
                {cart.length === 0 && (
                  <div>
                    <Label htmlFor="amount">Amount (Rp)</Label>
                    <Input
                      id="amount"
                      type="text"
                      inputMode="numeric"
                      value={amount}
                      onChange={(e)=>{
                        let v = e.target.value.replace(/[^0-9]/g, '');
                        if (v.startsWith('00')) v = v.replace(/^0+/, '0');
                        setAmount(v);
                      }}
                    />
                  </div>
                )}
                <div className="text-sm font-semibold">
                  Amount to charge: Rp {((cart.length>0?cart.reduce((s,i)=>s+i.price*i.quantity,0):Number(amount)||0)).toLocaleString('id-ID')}
                </div>
                <div>
                  <Label htmlFor="pin">Student PIN</Label>
                  <Input id="pin" type="password" value={pin} onChange={(e)=>setPin(e.target.value.slice(0,6))} maxLength={6} />
                </div>
                <Button onClick={confirmCharge} disabled={loading} className="glow-border">{loading ? 'Processing…' : 'Confirm Charge'}</Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-destructive">{error || 'Invalid code'}</div>
          )}
        </Card>
      </div>
    </div>
  );
}
