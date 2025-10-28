"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, ShoppingCart } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
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

  // Calculate total price of all items in cart
  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const canAfford = userBalance >= totalPrice;

  const handleCheckout = async () => {
    if (!canAfford) {
      alert("Insufficient balance. Please top up your wallet.");
      return;
    }

    if (items.length === 0) {
      alert("Your cart is empty!");
      return;
    }

    setLoading(true);
    
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");

      // Create order in database
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert([
          {
            user_id: user.id,
            items: items,
            total_price: totalPrice,
            status: "processing",
          },
        ])
        .select()
        .single();

      if (orderError) throw orderError;

      // Deduct from wallet balance
      const newBalance = userBalance - totalPrice;
      const { error: balanceError } = await supabase
        .from("users")
        .update({ wallet_balance: newBalance })
        .eq("id", user.id);

      if (balanceError) throw balanceError;

      // Decrease stock for each item
      for (const item of items) {
        const { data: menuItem } = await supabase
          .from("menu_items")
          .select("stock")
          .eq("id", item.id)
          .single();

        if (menuItem) {
          await supabase
            .from("menu_items")
            .update({ stock: menuItem.stock - item.quantity })
            .eq("id", item.id);
        }
      }

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

      alert("Order placed successfully! 🎉");
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
              <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => onDecrementQty?.(item.id)}>-</Button>
              <span className="w-6 text-center">{item.quantity}</span>
              <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => onIncrementQty?.(item.id)}>+</Button>
            </div>
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

        {!canAfford && (
          <div className="p-2 rounded bg-destructive/20 text-destructive text-sm">
            Insufficient balance
          </div>
        )}

        <Button
          onClick={handleCheckout}
          disabled={!canAfford || loading}
          className="w-full glow-border hover:glow-pulse"
        >
          {loading ? "Processing..." : "Checkout"}
        </Button>
      </div>
    </Card>
  );
}