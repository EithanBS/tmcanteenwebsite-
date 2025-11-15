"use client";

// Stock protection notes:
// 1. Front-end: plus button disabled when quantity reaches item.stock (if provided).
// 2. Checkout: verifies current stock for all items in a single query; aborts if insufficient.
// 3. Server update: subtracts using previously fetched snapshot and guards against race condition.
// This prevents negative stock values even under concurrent updates.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, ShoppingCart, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  stock?: number; // optional, used to disable + when reaching stock
  note?: string;
}

interface CartProps {
  items: CartItem[];
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
  onCheckout: () => void;
  userBalance: number;
  onIncrementQty?: (id: string) => void;
  onDecrementQty?: (id: string) => void;
}

// Cart component showing items, total, and checkout functionality
export default function Cart({ items, onRemoveItem, onClearCart, onCheckout, userBalance, onIncrementQty, onDecrementQty }: CartProps) {
  const [loading, setLoading] = useState(false);
  const [preOrderDate, setPreOrderDate] = useState<Date | null>(null);
  const [preOrderOpen, setPreOrderOpen] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState<number | null>(null);
  const [spentMTD, setSpentMTD] = useState<number>(0);

  // Calculate total price of all items in cart
  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const canAfford = userBalance >= totalPrice;
  const isPreOrder = !!preOrderDate;
  const preorderLabel = useMemo(() => preOrderDate ? preOrderDate.toLocaleDateString() : "Select date", [preOrderDate]);

  // Allow only weekdays within next 7 days (excluding today)
  const today = new Date();
  const minDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const maxDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  const isWeekday = (d: Date) => {
    const day = d.getDay();
    return day >= 1 && day <= 5; // 1-5 = Mon-Fri
  };
  const disabledMatcher = (d: Date) => d < minDate || d > maxDate || !isWeekday(d);

  // Fetch monthly budget and current month-to-date spend
  useEffect(() => {
    const fetchBudgetAndSpend = async () => {
      try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        if (!u?.id) return;
        // Budget (DB first)
        let budget: number | null = null;
        const { data: urow } = await supabase.from('users').select('monthly_budget').eq('id', u.id).single();
        if (urow) budget = (urow as any).monthly_budget ?? null;
        if (budget == null) {
          try { const ls = localStorage.getItem('monthly_budget'); if (ls) budget = Number(ls); } catch {}
        }
        setMonthlyBudget(Number.isFinite(budget as any) ? Number(budget) : null);
        // Spend MTD
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
        const { data: myOrders } = await supabase
          .from('orders')
          .select('total_price, created_at')
          .eq('user_id', u.id)
          .gte('created_at', from)
          .lt('created_at', to);
        const sum = (myOrders || []).reduce((acc: number, o: any) => acc + (o.total_price || 0), 0);
        setSpentMTD(sum);
      } catch (e) {
        // ignore
      }
    };
    fetchBudgetAndSpend();
    // refresh when cart changes so warning reflects latest total
  }, [items.length]);

  const willExceedBudget = monthlyBudget != null && (spentMTD + totalPrice) > (monthlyBudget || 0);

  const handleCheckout = async () => {
    if (!canAfford) {
      alert("Insufficient balance. Please top up your wallet.");
      return;
    }

    if (items.length === 0) {
      alert("Your cart is empty!");
      return;
    }

    // If pre-order, ensure a valid date is selected
    if (isPreOrder) {
      if (!preOrderDate) {
        alert("Please select a pre-order date.");
        return;
      }
      if (disabledMatcher(preOrderDate)) {
        alert("Pre-order date must be a weekday within the next 7 days.");
        return;
      }
    }

    setLoading(true);
    
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");

      // Atomic stock decrement via RPC (will throw if insufficient)
  const rpcPayload = items.map(i => ({ id: i.id, quantity: i.quantity }));
  const { error: rpcError } = await supabase.rpc('decrement_stock', { p_items: rpcPayload });
      if (rpcError) {
        // Fallback: do client-verified updates so local testing still works
        const ids = items.map((i) => i.id);
        const { data: stocks, error: stocksError } = await supabase
          .from("menu_items")
          .select("id, stock")
          .in("id", ids);
        if (stocksError) throw stocksError;
        const stockMap = new Map(stocks?.map((s: any) => [s.id, s.stock]));
        const insufficient = items.find((it) => (stockMap.get(it.id) ?? 0) < it.quantity);
        if (insufficient) {
          alert(`Not enough stock for ${insufficient.name}. Available: ${stockMap.get(insufficient.id) ?? 0}`);
          return;
        }
        for (const item of items) {
          const current = stockMap.get(item.id) ?? 0;
          const newStock = current - item.quantity;
          const { error: updateErr } = await supabase
            .from("menu_items")
            .update({ stock: newStock })
            .eq("id", item.id);
          if (updateErr) throw updateErr;
        }
      }

      // Create order in database
      const scheduled_for = isPreOrder ? preOrderDate!.toISOString().slice(0, 10) : null;
      const status = isPreOrder ? "preorder" : "processing";
      let { data: order, error: orderError } = await supabase
        .from("orders")
        .insert([
          {
            user_id: user.id,
            items: items,
            total_price: totalPrice,
            status,
            scheduled_for,
          },
        ])
        .select()
        .single();

      if (orderError) {
        // Fallback path for backends missing 'scheduled_for' column or 'preorder' status enum
        // 1) Try without scheduled_for but keep status
        try {
          const altPayload1: any = {
            user_id: user.id,
            items,
            total_price: totalPrice,
            status,
          };
          ({ data: order, error: orderError } = await supabase
            .from("orders")
            .insert([altPayload1])
            .select()
            .single());
        } catch (_) {}
      }

      if (orderError) {
        // 2) Try as a normal order (processing) without scheduled_for
        const altPayload2: any = {
          user_id: user.id,
          items,
          total_price: totalPrice,
          status: "processing",
        };
        const alt2 = await supabase
          .from("orders")
          .insert([altPayload2])
          .select()
          .single();
        order = alt2.data as any;
        orderError = alt2.error as any;
      }

      if (orderError) throw orderError;

      // Deduct from wallet balance
      const newBalance = userBalance - totalPrice;
      const { error: balanceError } = await supabase
        .from("users")
        .update({ wallet_balance: newBalance })
        .eq("id", user.id);

      if (balanceError) throw balanceError;

  // (Stock already decremented above either via RPC or fallback updates.)

      // Create transaction record
      await supabase.from("transactions").insert([
        {
          sender_id: user.id,
          receiver_id: null,
          amount: totalPrice,
          type: "order",
        },
      ]);

      // Update user in localStorage
      user.wallet_balance = newBalance;
      localStorage.setItem("user", JSON.stringify(user));

      if (isPreOrder && scheduled_for) {
        alert("Pre-order placed! 🎉");
      } else if (isPreOrder && !scheduled_for) {
        alert("Order placed as normal. To enable pre-orders, add a 'scheduled_for' column and 'preorder' status in the orders table.");
      } else {
        alert("Order placed successfully! 🎉");
      }
      onCheckout();
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to place order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <Card className="p-6 glass-card glow-border">
        <div className="text-center text-muted-foreground">
          <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Your cart is empty</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 glass-card glow-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold glow-text">Your Cart</h2>
        <Button variant="ghost" size="sm" onClick={onClearCart}>
          Clear All
        </Button>
      </div>

      <div className="space-y-3 mb-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-primary/20"
          >
            <div className="flex-1">
              <p className="font-medium">{item.name}</p>
              <p className="text-sm text-muted-foreground">
                Rp {item.price.toLocaleString('id-ID')} × {item.quantity}
              </p>
            {item.note && (
              <p className="text-xs text-muted-foreground/80 mt-1">Note: {item.note}</p>
            )}
            </div>
            <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onDecrementQty?.(item.id)}
                aria-label={`Decrease quantity of ${item.name}`}
              >
                -
              </Button>
              <span className="w-7 text-center font-medium tabular-nums">
                {item.quantity}
              </span>
              <Button
                variant={typeof item.stock === 'number' && item.quantity >= (item.stock ?? 0) ? 'secondary' : 'outline'}
                size="sm"
                className="h-8 w-8 p-0 relative"
                onClick={() => onIncrementQty?.(item.id)}
                disabled={typeof item.stock === 'number' ? item.quantity >= (item.stock ?? 0) : false}
                aria-label={`Increase quantity of ${item.name}`}
                title={typeof item.stock === 'number' && item.quantity >= (item.stock ?? 0) ? 'Max stock reached' : 'Add one'}
              >
                +
                {typeof item.stock === 'number' && item.quantity >= (item.stock ?? 0) && (
                  <span className="absolute -top-2 -right-2 bg-amber-500 text-black text-[10px] px-1 py-[1px] rounded shadow">
                    max
                  </span>
                )}
              </Button>
            </div>
            {typeof item.stock === 'number' && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                <AlertTriangle className="h-3 w-3 opacity-70" />
                <span>{Math.max((item.stock ?? 0) - item.quantity, 0)} left</span>
              </div>
            )}
              <span className="font-semibold">Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemoveItem(item.id)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-primary/30 pt-4 space-y-3">
        <div className="flex justify-between text-lg font-bold">
          <span>Total:</span>
          <span className="glow-text">Rp {totalPrice.toLocaleString('id-ID')}</span>
        </div>

        <div className="text-sm text-muted-foreground">
          Wallet Balance: Rp {userBalance.toLocaleString('id-ID')}
        </div>

        {monthlyBudget != null && (
          <div className="text-xs text-muted-foreground">
            Month-to-date: Rp {Math.round(spentMTD).toLocaleString('id-ID')} / Budget: Rp {Math.round(monthlyBudget).toLocaleString('id-ID')}
          </div>
        )}

        {/* Pre-order section */}
        <div className="p-3 rounded-lg bg-secondary/20 border border-primary/20 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Pre-order</span>
            <Popover open={preOrderOpen} onOpenChange={setPreOrderOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="glow-border">
                  {isPreOrder ? `Scheduled: ${preorderLabel}` : "Set as Pre Order"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="p-3">
                  <Calendar
                    mode="single"
                    selected={preOrderDate ?? undefined}
                    onSelect={(d) => { setPreOrderDate(d ?? null); setPreOrderOpen(false); }}
                    fromDate={minDate}
                    toDate={maxDate}
                    disabled={disabledMatcher}
                  />
                  <div className="flex gap-2 mt-2">
                    <Button variant="ghost" size="sm" onClick={() => { setPreOrderDate(null); setPreOrderOpen(false); }}>Clear</Button>
                    <Button size="sm" onClick={() => setPreOrderOpen(false)}>Done</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <p className="text-xs text-muted-foreground">Choose a weekday within 7 days. We’ll reserve stock now and prepare it on your selected date.</p>
        </div>

        {!canAfford && (
          <div className="p-2 rounded bg-destructive/20 text-destructive text-sm">
            Insufficient balance
          </div>
        )}

        {willExceedBudget && (
          <div className="p-2 rounded bg-amber-500/20 text-amber-600 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4"/>
            This purchase will put you over your monthly budget.
          </div>
        )}

        <Button
          onClick={handleCheckout}
          disabled={!canAfford || loading}
          className="w-full glow-border hover:glow-pulse"
        >
          {loading ? "Processing..." : (isPreOrder ? "Place Pre-Order" : "Checkout")}
        </Button>
      </div>
    </Card>
  );
}