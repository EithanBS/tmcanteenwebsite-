"use client";
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Order, User } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, TrendingUp, Package, Coins, BarChart3, Clock, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function StudentMonthlyReportPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [month, setMonth] = useState<number>(new Date().getMonth());
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [budgetDraft, setBudgetDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ustr = localStorage.getItem('user');
    if (!ustr) { router.push('/login'); return; }
    const u = JSON.parse(ustr);
    if (u.role !== 'student') { router.push('/login'); return; }
    setUser(u);
  }, [router]);

  useEffect(() => { if (user) { fetchData(); } }, [user, month, year]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const from = new Date(year, month, 1);
      const to = new Date(year, month + 1, 1);
      const fromISO = from.toISOString();
      const toISO = to.toISOString();
      const { data: ords, error: oerr } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', fromISO)
        .lt('created_at', toISO)
        .order('created_at', { ascending: false });
      if (oerr) throw oerr;
      setOrders(ords || []);
      // Budget: try DB first
      const { data: urow, error: uerr } = await supabase
        .from('users')
        .select('monthly_budget')
        .eq('id', user.id)
        .single();
      let b: number | null = null;
      if (!uerr && urow) {
        b = (urow as any).monthly_budget ?? null;
      } else {
        // fallback localStorage
        try {
          const ls = localStorage.getItem('monthly_budget');
          if (ls) b = Number(ls);
        } catch {}
      }
      setBudget(Number.isFinite(b as any) ? Number(b) : null);
      setBudgetDraft(b != null ? String(b) : "");
    } catch (e: any) {
      console.error(e); setError(e?.message || 'Failed to load data');
    } finally { setLoading(false); }
  };

  const stats = useMemo(() => {
    const res = { totalOrders: orders.length, totalSpent: 0, avgOrderValue: 0, preorderCount: 0 };
    for (const o of orders) {
      res.totalSpent += o.total_price || 0;
      if (o.status === 'preorder') res.preorderCount++;
    }
    res.avgOrderValue = res.totalOrders ? res.totalSpent / res.totalOrders : 0;
    return res;
  }, [orders]);

  type AggItem = { id: string; name: string; quantity: number; spend: number };
  const aggregatedItems: AggItem[] = useMemo(() => {
    const map = new Map<string, AggItem>();
    for (const o of orders) {
      for (const it of o.items) {
        const existing = map.get(it.id);
        const spendAdd = it.price * it.quantity;
        if (existing) { existing.quantity += it.quantity; existing.spend += spendAdd; }
        else { map.set(it.id, { id: it.id, name: it.name, quantity: it.quantity, spend: spendAdd }); }
      }
    }
    return Array.from(map.values());
  }, [orders]);

  const topByQuantity = useMemo(() => aggregatedItems.sort((a,b)=> b.quantity - a.quantity).slice(0,5), [aggregatedItems]);
  const topBySpend = useMemo(() => [...aggregatedItems].sort((a,b)=> b.spend - a.spend).slice(0,5), [aggregatedItems]);

  const dailyBreakdown = useMemo(() => {
    const dayMap = new Map<string, { orders: number; spend: number }>();
    for (const o of orders) {
      const day = new Date(o.created_at).toISOString().slice(0,10);
      const d = dayMap.get(day) || { orders:0, spend:0 };
      d.orders += 1;
      d.spend += o.total_price || 0;
      dayMap.set(day,d);
    }
    return Array.from(dayMap.entries()).sort(([a],[b]) => a.localeCompare(b));
  }, [orders]);

  const overBudget = budget != null && stats.totalSpent > (budget || 0);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i);
  const yearOptions = [year-1, year, year+1];

  const saveBudget = async () => {
    if (!user) return;
    const num = budgetDraft.trim() === '' ? null : Number(budgetDraft);
    if (num != null && (!Number.isFinite(num) || num < 0)) { alert('Enter a valid non-negative number'); return; }
    setSaving(true);
    try {
      let ok = true;
      const { error } = await supabase.from('users').update({ monthly_budget: num }).eq('id', user.id);
      if (error) ok = false;
      if (!ok) {
        // fallback to localStorage if DB update not available
        try { localStorage.setItem('monthly_budget', num == null ? '' : String(num)); } catch {}
      }
      setBudget(num);
      alert('Budget saved');
    } catch (e) {
      console.error(e);
      try { localStorage.setItem('monthly_budget', num == null ? '' : String(num)); alert('Saved locally'); } catch {}
    } finally { setSaving(false); }
  };

  if (!user) return <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <Card className="p-6 glass-card glow-border flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold glow-text">📊 My Monthly Spending</h1>
            <p className="text-sm text-muted-foreground">Summary for {new Date(year, month, 1).toLocaleString('default',{ month:'long', year:'numeric'})}</p>
          </div>
          <Button variant="outline" onClick={()=>router.push('/student')}><ArrowLeft className="h-4 w-4 mr-1"/>Back</Button>
        </Card>

        <Card className="p-4 glass-card glow-border flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Month</span>
            <Select value={String(month)} onValueChange={(v)=>setMonth(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map(m => (
                  <SelectItem key={m} value={String(m)}>{new Date(2024,m,1).toLocaleString('default',{month:'long'})}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Year</span>
            <Select value={String(year)} onValueChange={(v)=>setYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </Card>

        {/* Budget card */}
        <Card className="p-6 glass-card glow-border space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Monthly Budget</h2>
              <p className="text-xs text-muted-foreground">Set a limit for this month. We’ll warn you if you go over.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3 items-end">
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Budget (Rp)</label>
              <Input value={budgetDraft} onChange={(e)=>setBudgetDraft(e.target.value)} placeholder="e.g. 200000" />
            </div>
            <Button onClick={saveBudget} disabled={saving} className="md:w-auto w-full glow-border">{saving ? 'Saving...' : 'Save Budget'}</Button>
          </div>
          <div className="mt-2 text-sm">
            <div className="flex justify-between">
              <span>Spent MTD</span>
              <span className="font-semibold">Rp {Math.round(stats.totalSpent).toLocaleString('id-ID')}</span>
            </div>
            {budget != null && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Budget</span>
                <span>Rp {Math.round(budget).toLocaleString('id-ID')}</span>
              </div>
            )}
            {budget != null && (
              <div className="mt-2 h-2 bg-secondary/40 rounded">
                {(() => {
                  const pct = Math.min(100, Math.round((stats.totalSpent / (budget || 1)) * 100));
                  return <div className={`h-2 rounded ${pct >= 100 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                })()}
              </div>
            )}
            {overBudget && (
              <div className="mt-2 text-destructive text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4"/>You’ve exceeded your budget this month.</div>
            )}
          </div>
        </Card>

        {loading ? (
          <Card className="p-12 glass-card glow-border text-center"><p className="text-muted-foreground">Loading report...</p></Card>
        ) : orders.length === 0 ? (
          <Card className="p-12 glass-card glow-border text-center"><p className="text-muted-foreground">No orders for this period</p></Card>
        ) : (
          <div className="space-y-8">
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <Card className="p-4 glass-card glow-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Package className="h-4 w-4"/>Orders</div>
                <p className="text-2xl font-bold glow-text mt-1">{stats.totalOrders}</p>
              </Card>
              <Card className="p-4 glass-card glow-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Coins className="h-4 w-4"/>Spent</div>
                <p className="text-2xl font-bold glow-text mt-1">Rp {Math.round(stats.totalSpent).toLocaleString('id-ID')}</p>
              </Card>
              <Card className="p-4 glass-card glow-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-4 w-4"/>Avg Order</div>
                <p className="text-2xl font-bold glow-text mt-1">Rp {Math.round(stats.avgOrderValue).toLocaleString('id-ID')}</p>
              </Card>
              <Card className="p-4 glass-card glow-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4"/>Pre-Orders</div>
                <p className="text-2xl font-bold glow-text mt-1">{stats.preorderCount}</p>
              </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6 glass-card glow-border">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4"/>Top Items by Quantity</h2>
                <div className="space-y-2">
                  {topByQuantity.map(it => (
                    <div key={it.id} className="flex justify-between text-sm bg-secondary/30 border border-primary/20 rounded px-3 py-2">
                      <span>{it.name} × {it.quantity}</span>
                      <span>Rp {Math.round(it.spend).toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-6 glass-card glow-border">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4"/>Top Items by Spend</h2>
                <div className="space-y-2">
                  {topBySpend.map(it => (
                    <div key={it.id} className="flex justify-between text-sm bg-secondary/30 border border-primary/20 rounded px-3 py-2">
                      <span>{it.name}</span>
                      <span>Rp {Math.round(it.spend).toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card className="p-6 glass-card glow-border">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Clock className="h-4 w-4"/>Daily Spend</h2>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {dailyBreakdown.map(([day, val]) => (
                  <div key={day} className="p-3 rounded bg-secondary/30 border border-primary/20 text-xs flex justify-between">
                    <span>{new Date(day + 'T00:00:00').toLocaleDateString()}</span>
                    <span>{val.orders} orders · Rp {Math.round(val.spend).toLocaleString('id-ID')}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
