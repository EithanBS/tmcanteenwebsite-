"use client";
// Owner dashboard: manage own menu, track orders for items you own,
// confirm pickups, and generate QR/barcodes for items.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, Order, MenuItem, User } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, ShoppingBag, Package, Edit2, Check, BarChart3, Bell, QrCode, XCircle, CalendarDays } from "lucide-react";
import Image from "next/image";

export default function OwnerDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editStock, setEditStock] = useState("");
  const [editBarcodeValue, setEditBarcodeValue] = useState("");
  const [editBarcodeImage, setEditBarcodeImage] = useState("");
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [canceledIds, setCanceledIds] = useState<string[]>([]);

  // Add new menu item state
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<"food" | "drink">("food");
  const [newPrice, setNewPrice] = useState("");
  const [newStock, setNewStock] = useState("");
  const [newImage, setNewImage] = useState("");
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);

  // Check if user is logged in as owner
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      router.push("/login");
      return;
    }

    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "owner") {
      router.push("/login");
      return;
    }

  setUser(parsedUser);
  fetchOrders();
  fetchMenuItems(parsedUser.id);
  fetchUnread(parsedUser.id);

  // Set up real-time subscriptions
    const ordersChannel = supabase
      .channel("orders_owner")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    const menuChannel = supabase
      .channel("menu_owner")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "menu_items",
        },
        () => {
          fetchMenuItems(parsedUser.id);
        }
      )
      .subscribe();

    // Realtime for notifications badge
    const notifChan = supabase
      .channel('owner_unread_watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${parsedUser.id}` }, () => fetchUnread(parsedUser.id))
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(menuChannel);
      supabase.removeChannel(notifChan);
    };
  }, [router]);

  // Fetch unread notification count for badge
  const fetchUnread = async (userId: string) => {
    try {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false);
      setUnreadCount(count || 0);
    } catch {}
  };

  // Fetch all orders (we'll filter client-side to only show orders fully owned by this owner)
  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch user details for each order
      const ordersWithUserDetails = await Promise.all(
        (data || []).map(async (order) => {
          const { data: userData } = await supabase
            .from("users")
            .select("name, email")
            .eq("id", order.user_id)
            .single();

          return {
            ...order,
            user_name: userData?.name || "Unknown",
            user_email: userData?.email || "",
          };
        })
      );

      setOrders(ordersWithUserDetails as any);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch menu items only for this owner
  const fetchMenuItems = async (ownerId: string) => {
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("owner_id", ownerId)
        .order("name", { ascending: true });

      if (error) throw error;
      setMenuItems(data || []);
    } catch (error) {
      console.error("Error fetching menu items:", error);
    }
  };

  const ownerItemIds = useMemo(() => new Set(menuItems.map((mi) => mi.id)), [menuItems]);

  // Update order status (guard: only allow if ALL items in the order belong to this owner)
  const handleUpdateOrderStatus = async (orderId: string, newStatus: "processing" | "ready") => {
    try {
      // Fetch order to verify ownership of all items
      const { data: ord, error: oerr } = await supabase.from("orders").select("*").eq("id", orderId).single();
      if (oerr) throw oerr as any;
      const allMine = (ord?.items || []).every((it: any) => ownerItemIds.has(it.id));
      if (!allMine) {
        alert("You can only update status for orders that contain only your items.");
        return;
      }
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);

      if (error) throw error;

      alert(`Order status updated to ${newStatus}! 🎉`);
      fetchOrders();
    } catch (error) {
      console.error("Error updating order:", error);
      alert("Failed to update order status");
    }
  };

  // Owner cancels an order: refund student wallet, restore stock, set status to 'canceled', notify student
  const handleCancelOrder = async (order: any) => {
    if (cancelingOrderId) return;
    try {
      // Verify this order is fully owned by this owner
      const allMine = (order?.items || []).every((it: any) => ownerItemIds.has(it.id));
      if (!allMine) {
        alert("You can only cancel orders that contain only your items.");
        return;
      }
      if (order.status === 'completed') {
        alert('Cannot cancel a completed order');
        return;
      }

      setCancelingOrderId(order.id);

      // 1) Restore stock for each item in the order
      for (const it of (order.items || [])) {
        try {
          const { data: itemRow, error: itemErr } = await supabase
            .from('menu_items')
            .select('stock')
            .eq('id', it.id)
            .single();
          if (itemErr) throw itemErr as any;
          const newStock = (itemRow?.stock || 0) + (it.quantity || 0);
          const { error: updErr } = await supabase
            .from('menu_items')
            .update({ stock: newStock })
            .eq('id', it.id);
          if (updErr) console.warn('Stock restore failed for item', it.id, updErr);
        } catch (e) {
          console.warn('Stock restore exception for item', it?.id, e);
        }
      }

      // 2) Refund the student
      const { data: stu, error: stuErr } = await supabase
        .from('users')
        .select('wallet_balance')
        .eq('id', order.user_id)
        .single();
      if (stuErr) throw stuErr as any;
      const refundAmount = order.total_price || 0;
      const newBal = (stu?.wallet_balance || 0) + refundAmount;
      const { error: balErr } = await supabase
        .from('users')
        .update({ wallet_balance: newBal })
        .eq('id', order.user_id);
      if (balErr) throw balErr as any;

      // 3) Add a transaction record (refund)
      try {
        await supabase.from('transactions').insert([
          { sender_id: null, receiver_id: order.user_id, amount: refundAmount, type: 'refund' }
        ] as any);
      } catch {}

      // 4) Update order status to 'canceled'
      try {
        const { error: ordErr } = await supabase
          .from('orders')
          .update({ status: 'canceled', canceled_at: new Date().toISOString() })
          .eq('id', order.id);
        if (ordErr) console.warn('Setting status canceled failed:', ordErr);
      } catch (e) {
        console.warn('Order status cancel exception:', e);
      }

      // 5) Notify the student
      try {
        await supabase.from('notifications').insert([
          {
            user_id: order.user_id,
            role: 'student',
            type: 'order_canceled',
            title: 'Order canceled',
            message: 'Your order has been canceled by the canteen. A refund has been issued.',
            link: '/student',
            meta: { order_id: order.id, amount: refundAmount }
          }
        ] as any);
      } catch {}

      alert('Order canceled and refund issued.');
  // Optimistically mark locally as canceled to hide from lists immediately
  setCanceledIds((prev) => (prev.includes(order.id) ? prev : [...prev, order.id]));
  setOrders(prev => prev.map(o => (o.id === order.id ? ({ ...o, status: 'canceled' } as any) : o)) as any);
  fetchOrders();
    } catch (e) {
      console.error('Cancel order failed', e);
      alert('Failed to cancel order.');
    } finally {
      setCancelingOrderId(null);
    }
  };

  // Owner confirms pickup; if student already confirmed, complete order. Otherwise, notify student.
  const handleOwnerPickedUp = async (order: any) => {
    try {
      // Verify this order is fully owned by this owner
      const allMine = (order?.items || []).every((it: any) => ownerItemIds.has(it.id));
      if (!allMine) {
        alert("You can only confirm pickup for orders that contain only your items.");
        return;
      }

      const { data: updated, error } = await supabase
        .from('orders')
        .update({ owner_picked_up: true })
        .eq('id', order.id)
        .select()
        .single();
      if (error) throw error as any;

      if (updated.student_picked_up) {
        const { error: e2 } = await supabase
          .from('orders')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', order.id);
        if (e2) {
          console.warn('Status update to completed failed, proceeding with flags only:', e2);
        }
        // Optimistically reflect completion
        setOrders(prev => prev.map(o => (o.id === order.id ? ({ ...o, owner_picked_up: true, status: 'completed' } as any) : o)) as any);
      } else {
        // Notify student to confirm pickup
        await supabase.from('notifications').insert([
          {
            user_id: order.user_id,
            role: 'student',
            type: 'pickup_prompt',
            title: 'Pickup confirmation needed',
            message: 'Canteen confirmed pickup. Please tap Picked Up to complete the order.',
            link: '/student',
            meta: { order_id: order.id }
          }
        ] as any);
        setOrders(prev => prev.map(o => (o.id === order.id ? ({ ...o, owner_picked_up: true } as any) : o)) as any);
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
    }
  };

  // Start editing menu item
  const startEditing = (item: MenuItem) => {
    setEditingItem(item.id);
    setEditPrice(item.price.toString());
    setEditStock(item.stock.toString());
    setEditBarcodeValue((item as any).barcode_value ?? "");
    setEditBarcodeImage((item as any).barcode_image_url ?? "");
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingItem(null);
    setEditPrice("");
    setEditStock("");
  };

  // Save edited menu item
  const saveMenuItem = async (itemId: string) => {
    const price = parseFloat(editPrice);
    const stock = parseInt(editStock);

    if (isNaN(price) || price < 0) {
      alert("Please enter a valid price");
      return;
    }

    if (isNaN(stock) || stock < 0) {
      alert("Please enter a valid stock quantity");
      return;
    }

    try {
      const { error } = await supabase
        .from("menu_items")
        .update({ price, stock, barcode_value: editBarcodeValue || null, barcode_image_url: editBarcodeImage || null })
        .eq("id", itemId);
      if (error) throw error as any;

      alert("Menu item updated successfully! 🎉");
      cancelEditing();
      if (user) fetchMenuItems(user.id);
    } catch (error: any) {
      console.error("Error updating menu item:", error);
      alert(`Failed to update menu item${error?.message ? `: ${error.message}` : ''}`);
    }
  };

  // Add new menu item for this owner
  const addMenuItem = async () => {
    if (!user) return;

    if (!newName || !newPrice || !newStock || !newImage) {
      alert("Please fill in all fields");
      return;
    }

    const price = parseFloat(newPrice);
    const stock = parseInt(newStock);
    if (isNaN(price) || price < 0 || isNaN(stock) || stock < 0) {
      alert("Please provide valid price and stock");
      return;
    }

    try {
      const payload: any = {
        name: newName,
        category: newCategory,
        price,
        stock,
        owner_id: user.id,
        image_url: newImage,
        image: newImage,
      };
      const { error } = await supabase.from("menu_items").insert([payload]);
      if (error) throw error;
      setNewName("");
      setNewCategory("food");
      setNewPrice("");
      setNewStock("");
      setNewImage("");
      fetchMenuItems(user.id);
    } catch (error) {
      console.error("Error adding menu item:", error);
      alert("Failed to add menu item");
    }
  };

  // Delete a menu item this owner owns
  const deleteMenuItem = async (itemId: string) => {
    if (!confirm("Delete this menu item?")) return;
    try {
      const { error } = await supabase.from("menu_items").delete().eq("id", itemId);
      if (error) throw error;
      if (user) fetchMenuItems(user.id);
    } catch (error) {
      console.error("Error deleting menu item:", error);
      alert("Failed to delete menu item");
    }
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  // Only show orders where all items belong to this owner (compute before any early return to keep hook order stable)
  const fullyOwnedOrders = useMemo(() => {
    return orders.filter((o: any) => Array.isArray(o.items) && o.items.length > 0 && o.items.every((it: any) => ownerItemIds.has(it.id)));
  }, [orders, ownerItemIds]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  const processingOrders = fullyOwnedOrders.filter((o) => o.status === "processing");
  const readyOrders = fullyOwnedOrders.filter((o: any) => o.status === "ready" && !(o.student_picked_up && o.owner_picked_up));
  const completedOrders = fullyOwnedOrders.filter((o: any) => o.status === 'completed' || (o.student_picked_up && o.owner_picked_up));
  const notCanceled = (o: any) => o.status !== 'canceled' && !canceledIds.includes(o.id);
  const processingOrdersSafe = processingOrders.filter(notCanceled);
  const readyOrdersSafe = readyOrders.filter(notCanceled);

  // Group menu items by category
  const foodItems = menuItems.filter((item) => item.category === "food");
  const drinkItems = menuItems.filter((item) => item.category === "drink");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <Card className="p-6 glass-card glow-border">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold glow-text">🍳 Canteen Owner Dashboard</h1>
              <p className="text-muted-foreground mt-1">Welcome back, {user.name}!</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={()=>router.push('/owner/scan-student')} className="glow-border">
                <QrCode className="mr-2 h-4 w-4" /> Scan Student QR
              </Button>
              <Button variant="outline" onClick={()=>router.push('/owner/notifications')} className="glow-border relative">
                <Bell className="mr-2 h-4 w-4" />
                Notifications
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] rounded-full px-1">{unreadCount}</span>
                )}
              </Button>
              <Button variant="outline" onClick={()=>router.push('/owner/report')} className="glow-border">
                <BarChart3 className="mr-2 h-4 w-4" /> Report
              </Button>
              <Button variant="ghost" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto">
        <Tabs defaultValue="orders" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-lg mx-auto glass-card">
            <TabsTrigger value="orders">
              <ShoppingBag className="mr-2 h-4 w-4" />
              Orders ({processingOrders.length})
            </TabsTrigger>
            <TabsTrigger value="menu">
              <Package className="mr-2 h-4 w-4" />
              My Menu ({menuItems.length})
            </TabsTrigger>
            <TabsTrigger value="preorders">
              <CalendarDays className="mr-2 h-4 w-4" />
              Pre-Orders
            </TabsTrigger>
          </TabsList>

          {/* Orders Tab */}
          <TabsContent value="orders">
            <div className="space-y-6">
              {/* Processing Orders */}
              <div>
                <h2 className="text-xl font-bold mb-4 glow-text">🟡 Processing Orders</h2>
                {processingOrdersSafe.length === 0 ? (
                  <Card className="p-12 glass-card glow-border text-center">
                    <p className="text-muted-foreground">No processing orders</p>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {processingOrdersSafe.map((order: any) => (
                      <Card key={order.id} className="p-6 glass-card glow-border">
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="font-semibold text-lg">{order.user_name}</p>
                                <p className="text-sm text-muted-foreground">{order.user_email}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-bold glow-text">
                                  Rp {order.total_price.toLocaleString('id-ID')}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(order.created_at).toLocaleString()}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-2 mt-4">
                              <p className="text-sm font-semibold text-muted-foreground">Order Items:</p>
                              {order.items.map((item: any, index: number) => (
                                <div
                                  key={index}
                                  className="flex justify-between p-3 rounded-lg bg-secondary/30 border border-primary/20"
                                >
                                  <span>
                                    {item.name} × {item.quantity}
                                  </span>
                                  <span>Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-col justify-center gap-2 md:w-48">
                            <Button
                              onClick={() => handleUpdateOrderStatus(order.id, "ready")}
                              className="w-full glow-border hover:glow-pulse"
                            >
                              <Check className="mr-2 h-4 w-4" />
                              Mark as Ready
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleCancelOrder(order)}
                              disabled={cancelingOrderId === order.id}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              {cancelingOrderId === order.id ? 'Canceling…' : 'Cancel Order'}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Ready Orders */}
              <div>
                <h2 className="text-xl font-bold mb-4 status-ready">🟢 Ready Orders</h2>
                {readyOrdersSafe.length === 0 ? (
                  <Card className="p-12 glass-card glow-border text-center">
                    <p className="text-muted-foreground">No ready orders</p>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {readyOrdersSafe.map((order: any) => (
                      <Card key={order.id} className="p-6 glass-card glow-border opacity-75">
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="font-semibold text-lg">{order.user_name}</p>
                                <p className="text-sm text-muted-foreground">{order.user_email}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-bold status-ready">
                                  Rp {order.total_price.toLocaleString('id-ID')}
                                </p>
                                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-green-500/20 status-ready">
                                  Ready for Pickup
                                </span>
                              </div>
                            </div>

                            <div className="space-y-2 mt-4">
                              {order.items.map((item: any, index: number) => (
                                <div
                                  key={index}
                                  className="flex justify-between p-2 rounded bg-secondary/20 text-sm"
                                >
                                  <span>
                                    {item.name} × {item.quantity}
                                  </span>
                                  <span>Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-col justify-center gap-2 md:w-56">
                            {order.owner_picked_up ? (
                              <div className="text-sm text-muted-foreground">Waiting for student to confirm pickup…</div>
                            ) : (
                              <Button
                                onClick={() => handleOwnerPickedUp(order)}
                                className="w-full glow-border hover:glow-pulse"
                              >
                                <Check className="mr-2 h-4 w-4" />
                                Picked Up
                              </Button>
                            )}
                            <Button
                              variant="destructive"
                              onClick={() => handleCancelOrder(order)}
                              disabled={cancelingOrderId === order.id}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              {cancelingOrderId === order.id ? 'Canceling…' : 'Cancel Order'}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Completed Orders */}
              <div>
                <h2 className="text-xl font-bold mb-4 glow-text">✅ Completed Orders</h2>
                {completedOrders.length === 0 ? (
                  <Card className="p-12 glass-card glow-border text-center">
                    <p className="text-muted-foreground">No completed orders</p>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {completedOrders.map((order: any) => (
                      <Card key={order.id} className="p-6 glass-card glow-border opacity-75">
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="font-semibold text-lg">{order.user_name}</p>
                                <p className="text-sm text-muted-foreground">{order.user_email}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-bold glow-text">
                                  Rp {order.total_price.toLocaleString('id-ID')}
                                </p>
                                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-emerald-500/20">Completed</span>
                              </div>
                            </div>

                            <div className="space-y-2 mt-4">
                              {order.items.map((item: any, index: number) => (
                                <div
                                  key={index}
                                  className="flex justify-between p-2 rounded bg-secondary/20 text-sm"
                                >
                                  <span>
                                    {item.name} × {item.quantity}
                                  </span>
                                  <span>Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Menu Management Tab */}
          <TabsContent value="menu">
            {loading ? (
              <Card className="p-12 glass-card glow-border text-center">
                <p className="text-muted-foreground">Loading menu...</p>
              </Card>
            ) : menuItems.length === 0 ? (
              <Card className="p-12 glass-card glow-border text-center">
                <p className="text-muted-foreground">No menu items available</p>
              </Card>
            ) : (
              <div className="space-y-8">
                {/* Food Section */}
                {foodItems.length > 0 && (
                  <div>
                    <h2 className="text-2xl font-bold mb-4 glow-text">🍛 Food Items</h2>
                    <div className="grid gap-4">
                      {foodItems.map((item) => (
                        <Card key={item.id} className="p-6 glass-card glow-border">
                          <div className="flex flex-col md:flex-row gap-6">
                            {/* Item Image */}
                            <div className="w-full md:w-48 h-48 relative rounded-lg overflow-hidden bg-secondary/30">
                              <Image
                                src={(item as any).image_url ?? (item as any).image ?? ""}
                                alt={item.name}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>

                            {/* Item Details */}
                            <div className="flex-1 min-w-0 space-y-4">
                              <div>
                                <h3 className="text-xl font-bold">{item.name}</h3>
                                <span className="text-xs px-2 py-1 rounded bg-primary/20 text-primary">
                                  FOOD
                                </span>
                              </div>

                              {editingItem === item.id ? (
                                // Edit Mode
                                <div className="space-y-4">
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <Label htmlFor={`price-${item.id}`}>Price (Rp)</Label>
                                        <Input
                                          id={`price-${item.id}`}
                                          type="number"
                                          step="0.01"
                                          value={editPrice}
                                          onChange={(e) => setEditPrice(e.target.value)}
                                          className="bg-secondary/50 border-primary/30"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor={`stock-${item.id}`}>Stock</Label>
                                        <Input
                                          id={`stock-${item.id}`}
                                          type="number"
                                          value={editStock}
                                          onChange={(e) => setEditStock(e.target.value)}
                                          className="bg-secondary/50 border-primary/30"
                                        />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <Label htmlFor={`barcode-${item.id}`}>Barcode Value</Label>
                                        <Input id={`barcode-${item.id}`} value={editBarcodeValue} onChange={(e) => setEditBarcodeValue(e.target.value)} />
                                      </div>
                                      <div>
                                        <Label htmlFor={`barcode-img-${item.id}`}>Barcode Image URL</Label>
                                        <Input id={`barcode-img-${item.id}`} value={editBarcodeImage} onChange={(e) => setEditBarcodeImage(e.target.value)} />
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={async () => {
                                          const { default: QRCode } = await import('qrcode');
                                          const value = editBarcodeValue || item.id?.toString();
                                          try {
                                            const dataUrl = await QRCode.toDataURL(value, { width: 256, margin: 1 });
                                            setEditBarcodeImage(dataUrl);
                                            if (!editBarcodeValue) setEditBarcodeValue(value);
                                          } catch (e) {
                                            alert('Failed to generate QR');
                                          }
                                        }}
                                      >
                                        Generate QR
                                      </Button>
                                      {editBarcodeImage && (
                                        <img src={editBarcodeImage} alt="Barcode" className="h-12 w-12 object-contain rounded bg-secondary/40" />
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex gap-2">
                                    <Button
                                      onClick={() => saveMenuItem(item.id)}
                                      className="flex-1 glow-border hover:glow-pulse"
                                    >
                                      <Check className="mr-2 h-4 w-4" />
                                      Save Changes
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={cancelEditing}
                                      className="flex-1"
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                // View Mode
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-lg bg-secondary/30 border border-primary/20">
                                      <p className="text-sm text-muted-foreground mb-1">Price</p>
                                      <p className="text-2xl font-bold glow-text">
                                        Rp {item.price.toLocaleString('id-ID')}
                                      </p>
                                    </div>
                                    <div className="p-4 rounded-lg bg-secondary/30 border border-primary/20">
                                      <p className="text-sm text-muted-foreground mb-1">Stock</p>
                                      <p className={`text-2xl font-bold ${item.stock === 0 ? 'text-destructive' : ''}`}>
                                        {item.stock}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <Label htmlFor={`barcode-${item.id}`}>Barcode Value</Label>
                                        <Input id={`barcode-${item.id}`} value={(item as any).barcode_value || ''} readOnly />
                                      </div>
                                      <div>
                                        <Label htmlFor={`barcode-img-${item.id}`}>Barcode Image URL</Label>
                                        <Input id={`barcode-img-${item.id}`} value={(item as any).barcode_image_url || ''} readOnly />
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={async () => {
                                          const { default: QRCode } = await import('qrcode');
                                          const value = (item as any).barcode_value || item.id?.toString();
                                          if (!value) { alert('Missing item id'); return; }
                                          try {
                                            const dataUrl = await QRCode.toDataURL(value, { width: 256, margin: 1 });
                                            const { error } = await supabase
                                              .from('menu_items')
                                              .update({ barcode_value: value, barcode_image_url: dataUrl })
                                              .eq('id', item.id);
                                            if (error) throw error as any;
                                            if (user) fetchMenuItems(user.id);
                                          } catch (e) {
                                            alert('Failed to generate QR');
                                          }
                                        }}
                                      >
                                        Generate QR
                                      </Button>
                                      {(item as any).barcode_image_url && (
                                        <img src={(item as any).barcode_image_url} alt="Barcode" className="h-12 w-12 object-contain rounded bg-secondary/40" />
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex gap-2 flex-col sm:flex-row sm:flex-wrap">
                                    <Button
                                    onClick={() => startEditing(item)}
                                    variant="outline"
                                      className="w-full sm:flex-1 sm:w-auto glow-border"
                                  >
                                    <Edit2 className="mr-2 h-4 w-4" />
                                    <span className="md:inline hidden">Edit Price & Stock</span>
                                    <span className="md:hidden inline">Edit</span>
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      className="w-full sm:flex-1 sm:w-auto"
                                      onClick={() => deleteMenuItem(item.id)}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Drinks Section */}
                {drinkItems.length > 0 && (
                  <div>
                    <h2 className="text-2xl font-bold mb-4 glow-text">☕ Drinks</h2>
                    <div className="grid gap-4">
                      {drinkItems.map((item) => (
                        <Card key={item.id} className="p-6 glass-card glow-border">
                          <div className="flex flex-col md:flex-row gap-6">
                            {/* Item Image */}
                            <div className="w-full md:w-48 h-48 relative rounded-lg overflow-hidden bg-secondary/30">
                              <Image
                                src={(item as any).image_url ?? (item as any).image ?? ""}
                                alt={item.name}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>

                            {/* Item Details */}
                            <div className="flex-1 min-w-0 space-y-4">
                              <div>
                                <h3 className="text-xl font-bold">{item.name}</h3>
                                <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400">
                                  DRINK
                                </span>
                              </div>

                              {editingItem === item.id ? (
                                // Edit Mode
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <Label htmlFor={`price-${item.id}`}>Price (Rp)</Label>
                                      <Input
                                        id={`price-${item.id}`}
                                        type="number"
                                        step="0.01"
                                        value={editPrice}
                                        onChange={(e) => setEditPrice(e.target.value)}
                                        className="bg-secondary/50 border-primary/30"
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor={`stock-${item.id}`}>Stock</Label>
                                      <Input
                                        id={`stock-${item.id}`}
                                        type="number"
                                        value={editStock}
                                        onChange={(e) => setEditStock(e.target.value)}
                                        className="bg-secondary/50 border-primary/30"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <Label htmlFor={`barcode-${item.id}`}>Barcode Value</Label>
                                      <Input id={`barcode-${item.id}`} value={editBarcodeValue} onChange={(e) => setEditBarcodeValue(e.target.value)} />
                                    </div>
                                    <div>
                                      <Label htmlFor={`barcode-img-${item.id}`}>Barcode Image URL</Label>
                                      <Input id={`barcode-img-${item.id}`} value={editBarcodeImage} onChange={(e) => setEditBarcodeImage(e.target.value)} />
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={async () => {
                                        const { default: QRCode } = await import('qrcode');
                                        const value = editBarcodeValue || item.id?.toString();
                                        try {
                                          const dataUrl = await QRCode.toDataURL(value, { width: 256, margin: 1 });
                                          setEditBarcodeImage(dataUrl);
                                          if (!editBarcodeValue) setEditBarcodeValue(value);
                                        } catch (e) {
                                          alert('Failed to generate QR');
                                        }
                                      }}
                                    >
                                      Generate QR
                                    </Button>
                                    {editBarcodeImage && (
                                      <img src={editBarcodeImage} alt="Barcode" className="h-12 w-12 object-contain rounded bg-secondary/40" />
                                    )}
                                  </div>

                                  <div className="flex gap-2">
                                    <Button
                                      onClick={() => saveMenuItem(item.id)}
                                      className="flex-1 glow-border hover:glow-pulse"
                                    >
                                      <Check className="mr-2 h-4 w-4" />
                                      Save Changes
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={cancelEditing}
                                      className="flex-1"
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                // View Mode
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-lg bg-secondary/30 border border-primary/20">
                                      <p className="text-sm text-muted-foreground mb-1">Price</p>
                                      <p className="text-2xl font-bold glow-text">
                                        Rp {item.price.toLocaleString('id-ID')}
                                      </p>
                                    </div>
                                    <div className="p-4 rounded-lg bg-secondary/30 border border-primary/20">
                                      <p className="text-sm text-muted-foreground mb-1">Stock</p>
                                      <p className={`text-2xl font-bold ${item.stock === 0 ? 'text-destructive' : ''}`}>
                                        {item.stock}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <Label htmlFor={`barcode-${item.id}`}>Barcode Value</Label>
                                        <Input id={`barcode-${item.id}`} value={(item as any).barcode_value || ''} readOnly />
                                      </div>
                                      <div>
                                        <Label htmlFor={`barcode-img-${item.id}`}>Barcode Image URL</Label>
                                        <Input id={`barcode-img-${item.id}`} value={(item as any).barcode_image_url || ''} readOnly />
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={async () => {
                                          const { default: QRCode } = await import('qrcode');
                                          const value = (item as any).barcode_value || item.id?.toString();
                                          if (!value) { alert('Missing item id'); return; }
                                          try {
                                            const dataUrl = await QRCode.toDataURL(value, { width: 256, margin: 1 });
                                            const { error } = await supabase
                                              .from('menu_items')
                                              .update({ barcode_value: value, barcode_image_url: dataUrl })
                                              .eq('id', item.id);
                                            if (error) throw error as any;
                                            if (user) fetchMenuItems(user.id);
                                          } catch (e) {
                                            alert('Failed to generate QR');
                                          }
                                        }}
                                      >
                                        Generate QR
                                      </Button>
                                      {(item as any).barcode_image_url && (
                                        <img src={(item as any).barcode_image_url} alt="Barcode" className="h-12 w-12 object-contain rounded bg-secondary/40" />
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex gap-2 flex-col sm:flex-row sm:flex-wrap">
                                    <Button
                                    onClick={() => startEditing(item)}
                                    variant="outline"
                                      className="w-full sm:flex-1 sm:w-auto glow-border"
                                  >
                                    <Edit2 className="mr-2 h-4 w-4" />
                                    <span className="md:inline hidden">Edit Price & Stock</span>
                                    <span className="md:hidden inline">Edit</span>
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      className="w-full sm:flex-1 sm:w-auto"
                                      onClick={() => deleteMenuItem(item.id)}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
                {/* Add new item form */}
                <Card className="p-6 glass-card glow-border">
                  <h3 className="text-lg font-bold mb-4">Add New Item</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="new-name">Name</Label>
                      <Input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="new-category">Category</Label>
                      <select
                        id="new-category"
                        className="w-full h-10 rounded border bg-secondary/50 border-primary/30 px-3"
                        value={newCategory}
                        onChange={(e) => setNewCategory((e.target.value as "food" | "drink") || "food")}
                      >
                        <option value="food">Food</option>
                        <option value="drink">Drink</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="new-price">Price (Rp)</Label>
                      <Input id="new-price" type="number" step="0.01" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="new-stock">Stock</Label>
                      <Input id="new-stock" type="number" value={newStock} onChange={(e) => setNewStock(e.target.value)} />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="new-image">Image URL</Label>
                      <Input id="new-image" value={newImage} onChange={(e) => setNewImage(e.target.value)} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button onClick={addMenuItem} className="w-full glow-border">Add Item</Button>
                  </div>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Pre-Orders Tab */}
          <TabsContent value="preorders">
            <OwnerPreOrders ownerId={user.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Pre-Orders tab content for Owner
function OwnerPreOrders({ ownerId }: { ownerId: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPreorders = async () => {
    try {
      // fetch orders that are status=preorder and contain only this owner's items
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'preorder')
        .order('scheduled_for', { ascending: true, nullsFirst: false });
      if (error) throw error as any;
      const base = (data || [])
        .filter((o: any) => Array.isArray(o.items) && o.items.length > 0);
      // Attach user name/email similar to main orders fetch
      const withUser = await Promise.all(base.map(async (order: any) => {
        try {
          const { data: u } = await supabase
            .from('users')
            .select('name, email')
            .eq('id', order.user_id)
            .single();
          return { ...order, user_name: u?.name || 'Unknown', user_email: u?.email || '' };
        } catch {
          return { ...order };
        }
      }));
      // Filter to only orders fully owned by this owner if items include owner_id
      const mine = withUser.filter((o: any) => o.items.every((it: any) => (it.owner_id ? it.owner_id === ownerId : true)));
      setOrders(mine);
    } catch (e) {
      console.error('fetchPreorders owner', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreorders();
    const ch = supabase
      .channel('owner_preorders_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchPreorders)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ownerId]);

  if (loading) {
    return (
      <Card className="p-12 glass-card glow-border text-center">
        <p className="text-muted-foreground">Loading pre-orders...</p>
      </Card>
    );
  }

  if (!orders.length) {
    return (
      <Card className="p-12 glass-card glow-border text-center">
        <p className="text-muted-foreground">No pre-orders found</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <Card key={order.id} className="p-6 glass-card glow-border">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Who:</span> {order.user_name || order.user_id}
            </div>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-500/20">Pre-Order</span>
          </div>
          <div className="text-sm text-muted-foreground mb-2">
            <span className="font-medium">When:</span> {order.scheduled_for ? new Date(order.scheduled_for + 'T00:00:00').toLocaleDateString() : '-'}
          </div>
          <div className="space-y-2">
            {order.items.map((it: any, idx: number) => (
              <div key={idx} className="flex justify-between p-2 rounded bg-secondary/20 text-sm">
                <span>{it.name} × {it.quantity}</span>
                <span>Rp {(it.price * it.quantity).toLocaleString('id-ID')}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="glow-text font-semibold">Rp {order.total_price.toLocaleString('id-ID')}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}