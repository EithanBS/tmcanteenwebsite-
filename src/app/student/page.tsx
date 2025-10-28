"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, MenuItem, User } from "@/lib/supabase";
import MenuItemCard from "@/components/MenuItemCard";
import Cart from "@/components/Cart";
import OrderHistory from "@/components/OrderHistory";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, ShoppingBag, History, LogOut, UtensilsCrossed, Coffee } from "lucide-react";
import Link from "next/link";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

type CategoryFilter = "all" | "food" | "drink";

export default function StudentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

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

  // Fetch menu items from database
  const fetchMenuItems = async () => {
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setMenuItems(data || []);
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
  const handleAddToCart = (item: MenuItem) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((cartItem) => cartItem.id === item.id);
      if (existingItem) {
        return prevCart.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      }
      return [...prevCart, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  // Remove item from cart
  const handleRemoveFromCart = (id: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id));
  };

  // Clear entire cart
  const handleClearCart = () => {
    setCart([]);
  };

  // Handle successful checkout
  const handleCheckout = () => {
    setCart([]);
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
            <div className="flex items-center gap-4">
              <Link href="/wallet">
                <Button variant="outline" className="glow-border">
                  <Wallet className="mr-2 h-4 w-4" />
                  Rp {user.wallet_balance.toLocaleString('id-ID')}
                </Button>
              </Link>
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
        <Tabs defaultValue="menu" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto glass-card">
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
            />
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            <OrderHistory userId={user.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}