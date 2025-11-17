"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, MenuItem, User } from "@/lib/supabase";
import MenuItemCard from "@/components/MenuItemCard";
import Cart from "@/components/Cart";
import OrderHistory from "@/components/OrderHistory";
import PreOrderList from "@/components/PreOrderList";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, ShoppingBag, History, LogOut, UtensilsCrossed, Coffee, User as UserIcon, BarChart3, Bell, QrCode } from "lucide-react";
import Link from "next/link";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  stock: number; // snapshot of stock when added; refreshed on menu fetch
  note?: string;
}

type CategoryFilter = "all" | "food" | "drink";

export default function StudentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Simple toast helper available to handlers below
  const quickToast = (message: string, warn = false) => {
    const toastDiv = document.createElement('div');
    toastDiv.textContent = message;
    toastDiv.className = `fixed top-4 left-1/2 -translate-x-1/2 z-50 ${warn ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'} px-4 py-2 rounded shadow glow-border text-sm`;
    document.body.appendChild(toastDiv);
    setTimeout(() => toastDiv.remove(), 1700);
  };

  // Load persisted cart on mount and expire after 1 hour
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cart_v1");
      if (raw) {
        const parsed = JSON.parse(raw) as { items: CartItem[]; savedAt: number };
        if (parsed && Array.isArray(parsed.items) && typeof parsed.savedAt === "number") {
          const ageMs = Date.now() - parsed.savedAt;
          if (ageMs < 60 * 60 * 1000) {
            setCart(parsed.items);
          } else {
            localStorage.removeItem("cart_v1");
          }
        }
      }
    } catch {}
  }, []);

  // Persist cart whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem("cart_v1", JSON.stringify({ items: cart, savedAt: Date.now() }));
    } catch {}
  }, [cart]);

  // Check if user is logged in and load data
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      router.push("/login");
      return;
    }

    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "student") {
      router.push("/login");
      return;
    }

    setUser(parsedUser);
    fetchMenuItems();
    fetchUserBalance(parsedUser.id);
  fetchUnread(parsedUser.id);

    // Set up real-time subscription for menu items
    const channel = supabase
      .channel("menu_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "menu_items",
        },
        () => {
          fetchMenuItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  // Fetch unread notifications count
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

  // Fetch menu items from database
  const fetchMenuItems = async () => {
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setMenuItems(data || []);
      // Sync cart stocks and clamp quantities if stock decreased
      if (data) {
        setCart((prev) => prev.map((ci) => {
          const mi = data.find((d) => d.id === ci.id);
          if (!mi) return ci;
          const clampedQty = Math.min(ci.quantity, mi.stock);
          return { ...ci, stock: mi.stock, quantity: clampedQty };
        }));
      }
    } catch (error) {
      console.error("Error fetching menu items:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch updated user balance
  const fetchUserBalance = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("wallet_balance")
        .eq("id", userId)
        .single();

      if (error) throw error;
      if (data && user) {
        const updatedUser = { ...user, wallet_balance: data.wallet_balance };
        setUser(updatedUser);
        localStorage.setItem("user", JSON.stringify(updatedUser));
      }
    } catch (error) {
      console.error("Error fetching balance:", error);
    }
  };

  // Filter menu items by category
  const filteredMenuItems = menuItems.filter((item) => {
    const normalized = (item.category as any)?.toString().trim().toLowerCase();
    if (categoryFilter === "all") return true;
    return normalized === categoryFilter;
  });

  // Add item to cart
  const handleAddToCart = (item: MenuItem, note?: string) => {
    // Add item to cart with stock guard
    if (item.stock <= 0) {
      quickToast(`Item out of stock: ${item.name}`, true);
      return;
    }
    setCart((prevCart) => {
      const existingItem = prevCart.find((cartItem) => cartItem.id === item.id);
      if (existingItem) {
        if (existingItem.quantity >= existingItem.stock) {
          quickToast(`Max stock reached for ${item.name}`, true);
          return prevCart;
        }
        return prevCart.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1, note: note ?? cartItem.note }
            : cartItem
        );
      }
      return [...prevCart, { id: item.id, name: item.name, price: item.price, quantity: 1, stock: item.stock, note }];
    });
    quickToast(`Added to cart: ${item.name}`);
  };

  const incrementQty = (id: string) => {
    setCart((prev) => prev.map((ci) => {
      if (ci.id !== id) return ci;
      if (ci.quantity >= ci.stock) {
        quickToast(`Stock limit reached for ${ci.name}`, true);
        return ci;
      }
      return { ...ci, quantity: ci.quantity + 1 };
    }));
  };

  const decrementQty = (id: string) => {
    setCart((prev) => prev.map((ci) => (ci.id === id ? { ...ci, quantity: Math.max(1, ci.quantity - 1) } : ci)));
  };

  // Remove item from cart
  const handleRemoveFromCart = (id: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id));
  };

  // Clear entire cart
  const handleClearCart = () => {
    setCart([]);
    try { localStorage.removeItem("cart_v1"); } catch {}
  };

  // Handle successful checkout
  const handleCheckout = () => {
    setCart([]);
    try { localStorage.removeItem("cart_v1"); } catch {}
    if (user) {
      fetchUserBalance(user.id);
    }
    fetchMenuItems();
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/login");
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
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <Card className="p-6 glass-card glow-border">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold glow-text">🍱 Student Portal</h1>
              <p className="text-muted-foreground mt-1">Welcome back, {user.name}!</p>
            </div>
            <div className="flex items-center gap-3 md:gap-4 overflow-x-auto md:overflow-visible w-full md:w-auto -mx-2 px-2 py-1 whitespace-nowrap scrollbar-none snap-x md:snap-none">
              <Link href="/student/report">
                <Button variant="outline" className="glow-border shrink-0 snap-start">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Report
                </Button>
              </Link>
              <Link href="/student/qr">
                <Button variant="outline" className="glow-border shrink-0 snap-start">
                  <QrCode className="mr-2 h-4 w-4" />
                  My QR
                </Button>
              </Link>
              <Link href="/student/notifications">
                <Button variant="outline" className="glow-border relative shrink-0 snap-start">
                  <Bell className="mr-2 h-4 w-4" />
                  Notifications
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] rounded-full px-1">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </Link>
              <Link href="/student/account">
                <Button variant="outline" className="glow-border shrink-0 snap-start">
                  <UserIcon className="mr-2 h-4 w-4" />
                  Account
                </Button>
              </Link>
              <Link href="/wallet">
                <Button variant="outline" className="glow-border shrink-0 snap-start">
                  <Wallet className="mr-2 h-4 w-4" />
                  Rp {user.wallet_balance.toLocaleString('id-ID')}
                </Button>
              </Link>
              <Link href="/student/scan">
                <Button className="glow-border shrink-0 snap-start">
                  Scan to Pay
                </Button>
              </Link>
              <Button variant="ghost" className="shrink-0 snap-start" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto">
        <Tabs defaultValue="menu" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 max-w-xl mx-auto glass-card">
            <TabsTrigger value="menu">
              <ShoppingBag className="mr-2 h-4 w-4" />
              Menu
            </TabsTrigger>
            <TabsTrigger value="cart">
              <ShoppingBag className="mr-2 h-4 w-4" />
              Cart ({cart.length})
            </TabsTrigger>
            <TabsTrigger value="orders">
              <History className="mr-2 h-4 w-4" />
              Orders
            </TabsTrigger>
            <TabsTrigger value="preorders">
              <History className="mr-2 h-4 w-4" />
              Pre-Orders
            </TabsTrigger>
          </TabsList>

          {/* Menu Tab */}
          <TabsContent value="menu" className="space-y-6">
            {/* Category Filter */}
            <Card className="p-4 glass-card glow-border">
              <div className="flex flex-wrap gap-3 justify-center">
                <Button
                  variant={categoryFilter === "all" ? "default" : "outline"}
                  onClick={() => setCategoryFilter("all")}
                  className={categoryFilter === "all" ? "glow-border" : ""}
                >
                  All Items
                </Button>
                <Button
                  variant={categoryFilter === "food" ? "default" : "outline"}
                  onClick={() => setCategoryFilter("food")}
                  className={categoryFilter === "food" ? "glow-border" : ""}
                >
                  <UtensilsCrossed className="mr-2 h-4 w-4" />
                  Food
                </Button>
                <Button
                  variant={categoryFilter === "drink" ? "default" : "outline"}
                  onClick={() => setCategoryFilter("drink")}
                  className={categoryFilter === "drink" ? "glow-border" : ""}
                >
                  <Coffee className="mr-2 h-4 w-4" />
                  Drinks
                </Button>
              </div>
            </Card>

            {loading ? (
              <Card className="p-12 glass-card glow-border text-center">
                <p className="text-muted-foreground">Loading menu...</p>
              </Card>
            ) : filteredMenuItems.length === 0 ? (
              <Card className="p-12 glass-card glow-border text-center">
                <p className="text-muted-foreground">No menu items available</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredMenuItems.map((item) => (
                  <MenuItemCard key={item.id} item={item} onAddToCart={handleAddToCart} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Cart Tab */}
          <TabsContent value="cart">
            <Cart
              items={cart}
              onRemoveItem={handleRemoveFromCart}
              onClearCart={handleClearCart}
              onCheckout={handleCheckout}
              userBalance={user.wallet_balance}
              onIncrementQty={incrementQty}
              onDecrementQty={decrementQty}
            />
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            <OrderHistory userId={user.id} />
          </TabsContent>

          {/* Pre-Orders Tab */}
          <TabsContent value="preorders">
            <PreOrderList userId={user.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}