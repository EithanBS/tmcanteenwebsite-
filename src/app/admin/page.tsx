"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, User, MenuItem, Order, Transaction } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut, Users, Package, History, Trash2, Plus, Edit2, Check } from "lucide-react";
import Image from "next/image";

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [owners, setOwners] = useState<User[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit menu item state
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [editMenuName, setEditMenuName] = useState("");
  const [editMenuPrice, setEditMenuPrice] = useState("");
  const [editMenuStock, setEditMenuStock] = useState("");
  const [editMenuImage, setEditMenuImage] = useState("");
  const [editMenuCategory, setEditMenuCategory] = useState<"food" | "drink">("food");
  const [editMenuOwnerId, setEditMenuOwnerId] = useState("");

  // Add menu item state
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [newMenuName, setNewMenuName] = useState("");
  const [newMenuPrice, setNewMenuPrice] = useState("");
  const [newMenuStock, setNewMenuStock] = useState("");
  const [newMenuImage, setNewMenuImage] = useState("");
  const [newMenuCategory, setNewMenuCategory] = useState<"food" | "drink">("food");
  const [newMenuOwnerId, setNewMenuOwnerId] = useState("");

  // Edit user balance state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState("");

  // Check if user is logged in as admin
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      router.push("/login");
      return;
    }

    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "admin") {
      router.push("/login");
      return;
    }

    setUser(parsedUser);
    fetchAllData();
  }, [router]);

  // Fetch all data
  const fetchAllData = async () => {
    try {
      await Promise.all([
        fetchUsers(),
        fetchMenuItems(),
        fetchOrders(),
        fetchTransactions(),
      ]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch all users
  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUsers(data || []);
      
      // Filter owners for menu assignment
      const ownerUsers = (data || []).filter(u => u.role === "owner");
      setOwners(ownerUsers);
      
      // Set default owner if available
      if (ownerUsers.length > 0 && !newMenuOwnerId) {
        setNewMenuOwnerId(ownerUsers[0].id);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  // Fetch menu items
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
    }
  };

  // Fetch all orders
  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error("Error fetching orders:", error);
    }
  };

  // Fetch all transactions
  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(50);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    }
  };

  // Start editing a menu item
  const startEditMenuItem = (item: MenuItem) => {
    setEditingMenuId(item.id);
    setEditMenuName(item.name);
    setEditMenuPrice(item.price.toString());
    setEditMenuStock(item.stock.toString());
    // Support either image_url or image column
    const currentImage = (item as any).image_url ?? (item as any).image ?? "";
    setEditMenuImage(currentImage);
    setEditMenuCategory(item.category);
    setEditMenuOwnerId(item.owner_id);
  };

  const cancelEditMenuItem = () => {
    setEditingMenuId(null);
    setEditMenuName("");
    setEditMenuPrice("");
    setEditMenuStock("");
    setEditMenuImage("");
    setEditMenuCategory("food");
    setEditMenuOwnerId("");
  };

  // Save edited menu item
  const saveEditMenuItem = async () => {
    if (!editingMenuId) return;

    const price = parseFloat(editMenuPrice);
    const stock = parseInt(editMenuStock);

    if (!editMenuName || isNaN(price) || price < 0 || isNaN(stock) || stock < 0 || !editMenuOwnerId) {
      alert("Please provide valid item details");
      return;
    }

    try {
      // Try updating with image_url; also include image for compatibility
      const updatePayload: any = {
        name: editMenuName,
        price,
        stock,
        owner_id: editMenuOwnerId,
        category: editMenuCategory,
        image_url: editMenuImage,
        image: editMenuImage,
      };

      const { error } = await supabase
        .from("menu_items")
        .update(updatePayload)
        .eq("id", editingMenuId);

      if (error) throw error;

      alert("Menu item updated!");
      cancelEditMenuItem();
      fetchMenuItems();
    } catch (error) {
      console.error("Error updating menu item:", error);
      alert("Failed to update menu item");
    }
  };

  // Delete user
  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;

    try {
      const { error } = await supabase.from("users").delete().eq("id", userId);

      if (error) throw error;

      alert("User deleted successfully!");
      fetchUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Failed to delete user");
    }
  };

  // Update user balance
  const handleUpdateBalance = async (userId: string) => {
    const balance = parseFloat(editBalance);

    if (isNaN(balance) || balance < 0) {
      alert("Please enter a valid balance");
      return;
    }

    try {
      const { error } = await supabase
        .from("users")
        .update({ wallet_balance: balance })
        .eq("id", userId);

      if (error) throw error;

      alert("Balance updated successfully!");
      setEditingUserId(null);
      setEditBalance("");
      fetchUsers();
    } catch (error) {
      console.error("Error updating balance:", error);
      alert("Failed to update balance");
    }
  };

  // Add menu item
  const handleAddMenuItem = async () => {
    if (!newMenuName || !newMenuPrice || !newMenuStock || !newMenuImage || !newMenuOwnerId) {
      alert("Please fill in all fields");
      return;
    }

    const price = parseFloat(newMenuPrice);
    const stock = parseInt(newMenuStock);

    if (isNaN(price) || price < 0) {
      alert("Please enter a valid price");
      return;
    }

    if (isNaN(stock) || stock < 0) {
      alert("Please enter a valid stock quantity");
      return;
    }

    try {
      const payload: any = {
        name: newMenuName,
        price: price,
        stock: stock,
        owner_id: newMenuOwnerId,
        category: newMenuCategory,
        image_url: newMenuImage,
        image: newMenuImage,
      };
      const { error } = await supabase.from("menu_items").insert([payload]);

      if (error) throw error;

      alert("Menu item added successfully! 🎉");
      setShowAddMenu(false);
      setNewMenuName("");
      setNewMenuPrice("");
      setNewMenuStock("");
      setNewMenuImage("");
      setNewMenuCategory("food");
      fetchMenuItems();
    } catch (error) {
      console.error("Error adding menu item:", error);
      alert("Failed to add menu item");
    }
  };

  // Delete menu item
  const handleDeleteMenuItem = async (itemId: string) => {
    if (!confirm("Are you sure you want to delete this menu item?")) return;

    try {
      const { error } = await supabase.from("menu_items").delete().eq("id", itemId);

      if (error) throw error;

      alert("Menu item deleted successfully!");
      fetchMenuItems();
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

  // Get owner name by ID
  const getOwnerName = (ownerId: string) => {
    const owner = owners.find(o => o.id === ownerId);
    return owner ? owner.name : "Unknown Owner";
  };

  // Group menu items by owner
  const menuByOwner = menuItems.reduce((acc, item) => {
    if (!acc[item.owner_id]) {
      acc[item.owner_id] = [];
    }
    acc[item.owner_id].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

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
              <h1 className="text-3xl font-bold glow-text">🛡️ Admin Dashboard</h1>
              <p className="text-muted-foreground mt-1">System Management Portal</p>
            </div>
            <Button variant="ghost" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </Card>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto">
        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 glass-card">
            <TabsTrigger value="users">
              <Users className="mr-2 h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="menu">
              <Package className="mr-2 h-4 w-4" />
              Menu
            </TabsTrigger>
            <TabsTrigger value="orders">
              <History className="mr-2 h-4 w-4" />
              Orders
            </TabsTrigger>
            <TabsTrigger value="transactions">
              <History className="mr-2 h-4 w-4" />
              Transactions
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            {loading ? (
              <Card className="p-12 glass-card glow-border text-center">
                <p className="text-muted-foreground">Loading users...</p>
              </Card>
            ) : (
              <div className="grid gap-4">
                {users.map((u) => (
                  <Card key={u.id} className="p-6 glass-card glow-border">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold">{u.name}</h3>
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              u.role === "admin"
                                ? "bg-red-500/20 text-red-500"
                                : u.role === "owner"
                                ? "bg-blue-500/20 text-blue-500"
                                : "bg-green-500/20 text-green-500"
                            }`}
                          >
                            {u.role.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{u.email}</p>

                        {editingUserId === u.id ? (
                          <div className="flex items-center gap-2 max-w-md">
                            <div className="flex-1">
                              <Label htmlFor={`balance-${u.id}`}>Wallet Balance</Label>
                              <Input
                                id={`balance-${u.id}`}
                                type="number"
                                step="0.01"
                                value={editBalance}
                                onChange={(e) => setEditBalance(e.target.value)}
                                className="bg-secondary/50 border-primary/30"
                              />
                            </div>
                            <div className="flex gap-2 mt-6">
                              <Button
                                size="sm"
                                onClick={() => handleUpdateBalance(u.id)}
                                className="glow-border"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingUserId(null);
                                  setEditBalance("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-lg bg-secondary/30 border border-primary/20">
                              <p className="text-xs text-muted-foreground mb-1">Wallet Balance</p>
                              <p className="text-lg font-bold glow-text">
                                Rp {u.wallet_balance.toLocaleString('id-ID')}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingUserId(u.id);
                                setEditBalance(u.wallet_balance.toString());
                              }}
                              className="glow-border"
                            >
                              <Edit2 className="mr-2 h-4 w-4" />
                              Edit Balance
                            </Button>
                          </div>
                        )}
                      </div>

                      {u.id !== user.id && (
                        <div className="flex items-center">
                          <Button
                            variant="destructive"
                            onClick={() => handleDeleteUser(u.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Add this to your existing user card component */}
                    {user.role === "admin" && (
                      <div className="flex items-center gap-2">
                        <Select 
                          value={u.role}
                          onValueChange={async (newRole) => {
                            try {
                              const { error } = await supabase
                                .from("users")
                                .update({ role: newRole })
                                .eq("id", u.id);
                              
                              if (error) throw error;
                              fetchUsers(); // Refresh user list
                            } catch (error) {
                              console.error("Error updating role:", error);
                              alert("Failed to update role");
                            }
                          }}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="student">Student</SelectItem>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Menu Tab */}
          <TabsContent value="menu">
            <div className="space-y-6">
              {/* Add Menu Item Form */}
              {showAddMenu ? (
                <Card className="p-6 glass-card glow-border">
                  <h2 className="text-xl font-bold mb-4 glow-text">Add New Menu Item</h2>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="menu-name">Name</Label>
                      <Input
                        id="menu-name"
                        value={newMenuName}
                        onChange={(e) => setNewMenuName(e.target.value)}
                        placeholder="e.g., Nasi Goreng"
                        className="bg-secondary/50 border-primary/30"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="menu-category">Category</Label>
                        <Select value={newMenuCategory} onValueChange={(value: "food" | "drink") => setNewMenuCategory(value)}>
                          <SelectTrigger className="bg-secondary/50 border-primary/30">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="food">🍛 Food</SelectItem>
                            <SelectItem value="drink">☕ Drink</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="menu-owner">Owner</Label>
                        <Select value={newMenuOwnerId} onValueChange={setNewMenuOwnerId}>
                          <SelectTrigger className="bg-secondary/50 border-primary/30">
                            <SelectValue placeholder="Select owner" />
                          </SelectTrigger>
                          <SelectContent>
                            {owners.map(owner => (
                              <SelectItem key={owner.id} value={owner.id}>
                                {owner.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="menu-price">Price (Rp)</Label>
                        <Input
                          id="menu-price"
                          type="number"
                          step="0.01"
                          value={newMenuPrice}
                          onChange={(e) => setNewMenuPrice(e.target.value)}
                          placeholder="0.00"
                          className="bg-secondary/50 border-primary/30"
                        />
                      </div>
                      <div>
                        <Label htmlFor="menu-stock">Stock</Label>
                        <Input
                          id="menu-stock"
                          type="number"
                          value={newMenuStock}
                          onChange={(e) => setNewMenuStock(e.target.value)}
                          placeholder="0"
                          className="bg-secondary/50 border-primary/30"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="menu-image">Image URL</Label>
                      <Input
                        id="menu-image"
                        value={newMenuImage}
                        onChange={(e) => setNewMenuImage(e.target.value)}
                        placeholder="https://images.unsplash.com/..."
                        className="bg-secondary/50 border-primary/30"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleAddMenuItem}
                        className="flex-1 glow-border hover:glow-pulse"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Item
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowAddMenu(false)}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </Card>
              ) : (
                <Button
                  onClick={() => setShowAddMenu(true)}
                  className="w-full glow-border hover:glow-pulse"
                  disabled={owners.length === 0}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {owners.length === 0 ? "No owners available - create owner accounts first" : "Add New Menu Item"}
                </Button>
              )}

              {/* Menu Items List - Grouped by Owner */}
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
                  {Object.entries(menuByOwner).map(([ownerId, items]) => (
                    <div key={ownerId}>
                      <h2 className="text-2xl font-bold mb-4 glow-text">
                        👨‍🍳 {getOwnerName(ownerId)}'s Menu ({items.length} items)
                      </h2>
                      <div className="grid gap-4">
                        {items.map((item) => (
                          <Card key={item.id} className="p-6 glass-card glow-border">
                            <div className="flex flex-col md:flex-row gap-6">
                              <div className="w-full md:w-32 h-32 relative rounded-lg overflow-hidden bg-secondary/30">
                                <Image
                                  src={(item as any).image_url ?? (item as any).image ?? ""}
                                  alt={item.name}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>

                              <div className="flex-1">
                                {editingMenuId === item.id ? (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <Label htmlFor={`edit-name-${item.id}`}>Name</Label>
                                        <Input id={`edit-name-${item.id}`} value={editMenuName} onChange={(e) => setEditMenuName(e.target.value)} />
                                      </div>
                                      <div>
                                        <Label htmlFor={`edit-category-${item.id}`}>Category</Label>
                                        <Select value={editMenuCategory} onValueChange={(v: "food" | "drink") => setEditMenuCategory(v)}>
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="food">Food</SelectItem>
                                            <SelectItem value="drink">Drink</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <Label htmlFor={`edit-price-${item.id}`}>Price (Rp)</Label>
                                        <Input id={`edit-price-${item.id}`} type="number" step="0.01" value={editMenuPrice} onChange={(e) => setEditMenuPrice(e.target.value)} />
                                      </div>
                                      <div>
                                        <Label htmlFor={`edit-stock-${item.id}`}>Stock</Label>
                                        <Input id={`edit-stock-${item.id}`} type="number" value={editMenuStock} onChange={(e) => setEditMenuStock(e.target.value)} />
                                      </div>
                                    </div>
                                    <div>
                                      <Label htmlFor={`edit-image-${item.id}`}>Image URL</Label>
                                      <Input id={`edit-image-${item.id}`} value={editMenuImage} onChange={(e) => setEditMenuImage(e.target.value)} />
                                    </div>
                                    <div>
                                      <Label htmlFor={`edit-owner-${item.id}`}>Owner</Label>
                                      <Select value={editMenuOwnerId} onValueChange={setEditMenuOwnerId}>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {owners.map(o => (
                                            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button onClick={saveEditMenuItem} className="flex-1">
                                        <Check className="mr-2 h-4 w-4" /> Save
                                      </Button>
                                      <Button variant="outline" onClick={cancelEditMenuItem} className="flex-1">Cancel</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2 mb-3">
                                      <h3 className="text-xl font-bold">{item.name}</h3>
                                      <span className={`text-xs px-2 py-1 rounded font-semibold ${
                                        item.category === "food" 
                                          ? "bg-primary/20 text-primary" 
                                          : "bg-blue-500/20 text-blue-400"
                                      }`}>
                                        {item.category === "food" ? "🍛 FOOD" : "☕ DRINK"}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-4 mb-4">
                                      <div className="p-3 rounded-lg bg-secondary/30 border border-primary/20">
                                        <p className="text-xs text-muted-foreground">Price</p>
                                        <p className="text-lg font-bold glow-text">Rp {item.price.toLocaleString('id-ID')}</p>
                                      </div>
                                      <div className="p-3 rounded-lg bg-secondary/30 border border-primary/20">
                                        <p className="text-xs text-muted-foreground">Stock</p>
                                        <p className={`text-lg font-bold ${item.stock === 0 ? 'text-destructive' : ''}`}>{item.stock}</p>
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button variant="outline" size="sm" onClick={() => startEditMenuItem(item)}>
                                        <Edit2 className="mr-2 h-4 w-4" /> Edit
                                      </Button>
                                      <Button variant="destructive" size="sm" onClick={() => handleDeleteMenuItem(item.id)}>
                                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                                      </Button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            {loading ? (
              <Card className="p-12 glass-card glow-border text-center">
                <p className="text-muted-foreground">Loading orders...</p>
              </Card>
            ) : orders.length === 0 ? (
              <Card className="p-12 glass-card glow-border text-center">
                <p className="text-muted-foreground">No orders found</p>
              </Card>
            ) : (
              <div className="grid gap-4">
                {orders.map((order) => (
                  <Card key={order.id} className="p-6 glass-card glow-border">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Order ID: {order.id.slice(0, 8)}...
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold glow-text">
                          Rp {order.total_price.toLocaleString('id-ID')}
                        </p>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            order.status === "processing"
                              ? "bg-yellow-500/20 status-processing"
                              : "bg-green-500/20 status-ready"
                          }`}
                        >
                          {order.status === "processing" ? "🟡 Processing" : "🟢 Ready"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {order.items.map((item, index) => (
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
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions">
            {loading ? (
              <Card className="p-12 glass-card glow-border text-center">
                <p className="text-muted-foreground">Loading transactions...</p>
              </Card>
            ) : transactions.length === 0 ? (
              <Card className="p-12 glass-card glow-border text-center">
                <p className="text-muted-foreground">No transactions found</p>
              </Card>
            ) : (
              <div className="grid gap-3">
                {transactions.map((transaction) => (
                  <Card key={transaction.id} className="p-4 glass-card glow-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          {transaction.type === "topup"
                            ? "Top Up"
                            : transaction.type === "order"
                            ? "Order Payment"
                            : "Transfer"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(transaction.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold glow-text">
                          Rp {transaction.amount.toLocaleString('id-ID')}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {transaction.type}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}