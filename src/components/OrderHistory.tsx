"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase, Order } from "@/lib/supabase";
import { ClipboardList, CalendarDays } from "lucide-react";

interface OrderHistoryProps {
  userId: string;
}

// Component to display user's past orders with real-time updates
export default function OrderHistory({ userId }: OrderHistoryProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch orders from database
  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    // Set up real-time subscription for order updates
    const channel = supabase
      .channel("orders_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (loading) {
    return (
      <Card className="p-6 glass-card glow-border">
        <p className="text-center text-muted-foreground">Loading orders...</p>
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <Card className="p-6 glass-card glow-border">
        <div className="text-center text-muted-foreground">
          <ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No orders yet</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <Card key={order.id} className="p-4 glass-card glow-border">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-sm text-muted-foreground">
                {new Date(order.created_at).toLocaleString()}
              </p>
              <p className="font-semibold text-lg glow-text">
                Rp {order.total_price.toLocaleString('id-ID')}
              </p>
            </div>
            {order.status === "preorder" ? (
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-500/20 status-preorder">
                🔵 Pre-order
              </span>
            ) : (
              <span
                className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  order.status === "processing"
                    ? "bg-yellow-500/20 status-processing"
                    : "bg-green-500/20 status-ready"
                }`}
              >
                {order.status === "processing" ? "🟡 Processing" : "🟢 Ready"}
              </span>
            )}
          </div>

          <div className="space-y-2">
            {order.items.map((item, index) => (
              <div
                key={index}
                className="flex justify-between text-sm bg-secondary/20 p-2 rounded"
              >
                <span>
                  {item.name} × {item.quantity}
                </span>
                <span>Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
              </div>
            ))}
          </div>
          {order.status === 'preorder' && order.scheduled_for && (
            <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              <span>Scheduled for: {new Date(order.scheduled_for + 'T00:00:00').toLocaleDateString()}</span>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}