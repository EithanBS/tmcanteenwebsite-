"use client";
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Order, MenuItem, User } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, TrendingUp, Package, Coins, BarChart3, Clock, ArrowLeft } from 'lucide-react';

type AggregatedItem = { id: string; name: string; quantity: number; revenue: number; };

export default function OwnerMonthlyReportPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [month, setMonth] = useState<number>(new Date().getMonth());
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ustr = localStorage.getItem('user');
    if (!ustr) { router.push('/login'); return; }
    const u = JSON.parse(ustr);
    if (u.role !== 'owner') { router.push('/login'); return; }
    setUser(u);
  }, [router]);

  useEffect(() => { if (user) fetchData(); }, [user, month, year]);

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
        .gte('created_at', fromISO)
        .lt('created_at', toISO)
        .order('created_at', { ascending: false });
      if (oerr) throw oerr;
      const { data: myItems, error: merr } = await supabase
        .from('menu_items')
        .select('*')
        .eq('owner_id', user.id);
      if (merr) throw merr;
      setOrders(ords || []);
      setMenuItems(myItems || []);
    } catch (e: any) {
      console.error(e); setError(e?.message || 'Failed to load data');
    } finally { setLoading(false); }
  };

  const ownerItemIds = useMemo(() => new Set(menuItems.map(mi => mi.id)), [menuItems]);

  // Filter orders to portion belonging to owner (only count items the owner owns)
  const filteredOrders = useMemo(() => {
    return orders.map(o => ({
      ...o,
      items: o.items.filter(it => ownerItemIds.has(it.id))
    })).filter(o => o.items.length > 0);
  }, [orders, ownerItemIds]);

  const stats = useMemo(() => {
    const res = { totalOrders: filteredOrders.length, totalRevenue: 0, avgOrderValue: 0, preorderCount: 0 };
    for (const o of filteredOrders) {
      res.totalRevenue += o.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
      if (o.status === 'preorder') res.preorderCount++;
    }
    res.avgOrderValue = res.totalOrders ? res.totalRevenue / res.totalOrders : 0;
    return res;
  }, [filteredOrders]);

  const aggregatedItems: AggregatedItem[] = useMemo(() => {
    const map = new Map<string, AggregatedItem>();
    for (const o of filteredOrders) {
      for (const it of o.items) {
        const existing = map.get(it.id);
        const revenueAdd = it.price * it.quantity;
        if (existing) {
          existing.quantity += it.quantity;
          existing.revenue += revenueAdd;
        } else {
          map.set(it.id, { id: it.id, name: it.name, quantity: it.quantity, revenue: revenueAdd });
        }
      }
    }
    return Array.from(map.values()).sort((a,b) => b.quantity - a.quantity);
  }, [filteredOrders]);

  const topByQuantity = aggregatedItems.slice(0,5);
  const topByRevenue = [...aggregatedItems].sort((a,b)=> b.revenue - a.revenue).slice(0,5);

  const dailyBreakdown = useMemo(() => {
    const dayMap = new Map<string, { orders: number; revenue: number }>();
    for (const o of filteredOrders) {
      const day = new Date(o.created_at).toISOString().slice(0,10);
      const d = dayMap.get(day) || { orders:0, revenue:0 };
      d.orders += 1;
      d.revenue += o.items.reduce((sum,it)=> sum + it.price * it.quantity,0);
      dayMap.set(day,d);
    }
    return Array.from(dayMap.entries()).sort(([a],[b]) => a.localeCompare(b));
  }, [filteredOrders]);

  const lowStockHotItems = useMemo(() => {
    const set = new Set(aggregatedItems.map(i => i.id));
    return menuItems.filter(mi => set.has(mi.id) && mi.stock <= 5)
      .map(mi => ({ id: mi.id, name: mi.name, stock: mi.stock }))
      .slice(0,5);
  }, [aggregatedItems, menuItems]);

  const monthOptions = Array.from({ length: 12 }, (_, i) => i);
  const yearOptions = [year-1, year, year+1];

  if (!user) return <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <Card className="p-6 glass-card glow-border flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold glow-text">📊 My Monthly Report</h1>
            <p className="text-sm text-muted-foreground">Item performance for {new Date(year, month, 1).toLocaleString('default',{ month:'long', year:'numeric'})}</p>
          </div>
          <Button variant="outline" onClick={()=>router.push('/owner')}><ArrowLeft className="h-4 w-4 mr-1"/>Dashboard</Button>
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

        {loading ? (
          <Card className="p-12 glass-card glow-border text-center"><p className="text-muted-foreground">Loading report...</p></Card>
        ) : filteredOrders.length === 0 ? (
          <Card className="p-12 glass-card glow-border text-center"><p className="text-muted-foreground">No item sales for this period</p></Card>
        ) : (
          <div className="space-y-8">
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <Card className="p-4 glass-card glow-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Package className="h-4 w-4"/>Orders (with my items)</div>
                <p className="text-2xl font-bold glow-text mt-1">{stats.totalOrders}</p>
              </Card>
              <Card className="p-4 glass-card glow-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Coins className="h-4 w-4"/>Revenue</div>
                <p className="text-2xl font-bold glow-text mt-1">Rp {stats.totalRevenue.toLocaleString('id-ID')}</p>
              </Card>
              <Card className="p-4 glass-card glow-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-4 w-4"/>Avg Order (mine)</div>
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
                      <span>Rp {it.revenue.toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-6 glass-card glow-border">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4"/>Top Items by Revenue</h2>
                <div className="space-y-2">
                  {topByRevenue.map(it => (
                    <div key={it.id} className="flex justify-between text-sm bg-secondary/30 border border-primary/20 rounded px-3 py-2">
                      <span>{it.name}</span>
                      <span>Rp {it.revenue.toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card className="p-6 glass-card glow-border">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Clock className="h-4 w-4"/>Daily Breakdown</h2>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {dailyBreakdown.map(([day, val]) => (
                  <div key={day} className="p-3 rounded bg-secondary/30 border border-primary/20 text-xs flex justify-between">
                    <span>{new Date(day + 'T00:00:00').toLocaleDateString()}</span>
                    <span>{val.orders} orders · Rp {val.revenue.toLocaleString('id-ID')}</span>
                  </div>
                ))}
              </div>
            </Card>

            {lowStockHotItems.length > 0 && (
              <Card className="p-6 glass-card glow-border">
                <h2 className="text-lg font-semibold mb-4">🔥 Hot Sellers Low on Stock</h2>
                <div className="space-y-2">
                  {lowStockHotItems.map(mi => (
                    <div key={mi.id} className="flex justify-between text-sm bg-secondary/30 border border-primary/20 rounded px-3 py-2">
                      <span>{mi.name}</span>
                      <span className={mi.stock === 0 ? 'text-destructive font-semibold' : ''}>{mi.stock} left</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}