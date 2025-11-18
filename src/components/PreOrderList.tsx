"use client";
// Pre-orders list: shows upcoming orders (status=preorder) with realtime refresh.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase, Order } from "@/lib/supabase";
import { CalendarDays, ClipboardList } from "lucide-react";

interface PreOrderListProps {
  userId: string;
}

export default function PreOrderList({ userId }: PreOrderListProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Load user's pre-orders from the database sorted by scheduled date
  const fetchPreorders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "preorder")
        .order("scheduled_for", { ascending: true, nullsFirst: false });
      if (error) throw error;
      setOrders(data || []);
    } catch (e) {
      console.error("Error fetching preorders:", e);
    } finally {
      setLoading(false);
    }
  };

  // Refresh on mount and subscribe to any changes to the user's orders
  useEffect(() => {
    fetchPreorders();
    const channel = supabase
      .channel("preorders_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${userId}` },
        () => fetchPreorders()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  if (loading) {
    return (
      <Card className="p-6 glass-card glow-border">
        <p className="text-center text-muted-foreground">Loading pre-orders...</p>
      </Card>
    );
  }

  if (!orders.length) {
    return (
      <Card className="p-6 glass-card glow-border">
        <div className="text-center text-muted-foreground">
          <ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No pre-orders yet</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <Card key={order.id} className="p-4 glass-card glow-border">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span>
                Scheduled for: {order.scheduled_for ? new Date(order.scheduled_for + 'T00:00:00').toLocaleDateString() : '-'}
              </span>
            </div>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-500/20 status-preorder">🔵 Pre-order</span>
          </div>

          <div className="space-y-2">
            {order.items.map((item, index) => (
              <div key={index} className="flex justify-between text-sm bg-secondary/20 p-2 rounded">
                <span>{item.name} × {item.quantity}</span>
                <span>Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex justify-between text-sm">
            <span className="text-muted-foreground">Created</span>
            <span>{new Date(order.created_at).toLocaleString()}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span className="glow-text">Rp {order.total_price.toLocaleString('id-ID')}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}
