"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase, Order } from "@/lib/supabase";
import { ClipboardList, CalendarDays, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OrderHistoryProps {
  userId: string;
}

// Component to display user's past orders with real-time updates
export default function OrderHistory({ userId }: OrderHistoryProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  const handleStudentPickedUp = async (order: any) => {
    try {
      setUpdatingId(order.id);
      // Mark student's confirmation
      const { data: updated, error } = await supabase
        .from('orders')
        .update({ student_picked_up: true })
        .eq('id', order.id)
        .select()
        .single();
      if (error) throw error;

      // If owner already confirmed, complete the order
      if (updated.owner_picked_up) {
        const { error: e2 } = await supabase
          .from('orders')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', order.id);
        // If status update fails due to enum constraints or missing column, ignore and still treat as completed client-side
        if (e2) {
          console.warn('Status update to completed failed, proceeding with flags only:', e2);
        }
        // Optimistically reflect completion
        setOrders(prev => prev.map(o => o.id === order.id ? ({ ...o, student_picked_up: true, status: 'completed' } as any) : o));
      } else {
        // Notify owners to confirm pickup
        const { data: owners } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'owner');
        const notes = (owners || []).map((o: any) => ({
          user_id: o.id,
          role: 'owner',
          type: 'pickup_prompt',
          title: 'Pickup confirmation needed',
          message: 'Student confirmed pickup. Please tap Picked Up to complete the order.',
          link: '/owner',
          meta: { order_id: order.id }
        }));
        if (notes.length) await supabase.from('notifications').insert(notes);
        // Optimistically mark student's side
        setOrders(prev => prev.map(o => o.id === order.id ? ({ ...o, student_picked_up: true } as any) : o));
      }
      // Ensure latest data is fetched (covers realtime gaps)
      fetchOrders();
    } catch (e) {
      console.error(e);
      const msg = (e as any)?.message || String(e);
      if (/column .* does not exist/i.test(msg)) {
        alert('Failed to confirm pickup: missing columns. Please apply migration 0007_pickup_flags.sql to your database.');
      } else if (/invalid input value for enum/i.test(msg)) {
        alert('Failed to set status completed (enum). Flags were set; order will complete when both confirm.');
      } else {
        alert('Failed to confirm pickup: ' + msg);
      }
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <Card className="p-6 glass-card glow-border">
        <p className="text-center text-muted-foreground">Loading orders...</p>
      </Card>
    );
  }

  const isCompleted = (o: any) => o.status === 'completed' || (o.student_picked_up && o.owner_picked_up);
  const completedOrders = orders.filter(isCompleted);
  const activeOrders = orders.filter((o) => !isCompleted(o));

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
    <div className="space-y-6">
      {/* Active Orders */}
      {activeOrders.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold glow-text">Active Orders</h3>
          {activeOrders.map((order) => (
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
                  // Compute completed status from flags OR explicit status
                  (() => {
                    const completed = (order as any).status === 'completed' || ((order as any).student_picked_up && (order as any).owner_picked_up);
                    const processing = (order as any).status === 'processing';
                    return (
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      processing
                        ? "bg-yellow-500/20 status-processing"
                        : completed ? "bg-emerald-500/20" : "bg-green-500/20 status-ready"
                    }`}
                  >
                    {processing ? "🟡 Processing" : completed ? "✅ Completed" : "🟢 Ready"}
                  </span>
                    );
                  })()
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

              {/* Pickup confirmation actions for ready orders */}
              {(((order as any).status === 'ready') && !((order as any).student_picked_up && (order as any).owner_picked_up)) && (
                <div className="mt-4">
                  {(order as any).student_picked_up ? (
                    <div className="text-sm text-muted-foreground">Waiting for canteen to confirm pickup…</div>
                  ) : (
                    <Button
                      onClick={() => handleStudentPickedUp(order)}
                      className="w-full glow-border hover:glow-pulse"
                      disabled={updatingId === order.id}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Picked Up
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Completed Orders */}
      {completedOrders.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold glow-text">Completed Orders</h3>
          {completedOrders.map((order) => (
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
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-emerald-500/20">✅ Completed</span>
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
      )}
    </div>
  );
}