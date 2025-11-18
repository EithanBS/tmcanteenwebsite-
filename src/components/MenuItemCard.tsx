"use client";
// Menu item card: shows image, price, stock badge, and optional note input for drinks.

import { MenuItem } from "@/lib/supabase";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Image from "next/image";

interface MenuItemCardProps {
  item: MenuItem;
  onAddToCart: (item: MenuItem, note?: string) => void;
}

// Component to display a single menu item with image, name, price, stock
export default function MenuItemCard({ item, onAddToCart }: MenuItemCardProps) {
  const isOutOfStock = item.stock === 0;
  const normalizedCategory = (item.category as any)?.toString().trim().toLowerCase();
  const isFood = normalizedCategory === "food";
  const [note, setNote] = useState("");
  const lowStock = !isOutOfStock && item.stock <= 5;

  return (
    <Card className="overflow-hidden glass-card glow-border transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl hover:glow-pulse relative">
  {/* Subtle gradient ring */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--primary)/15%,transparent_60%)]" />
      <div className="aspect-square relative bg-secondary/30 group">
        <Image
          src={(item as any).image_url ?? (item as any).image ?? ""}
          alt={item.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          unoptimized
        />
        {isOutOfStock && (
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-black/80 backdrop-blur-[2px] flex items-center justify-center">
            <span className="text-destructive font-bold text-lg tracking-wide">OUT OF STOCK</span>
          </div>
        )}
        {/* Category Badge */}
        <div className="absolute top-2 right-2 flex gap-2">
          {lowStock && (
            <span className="text-[10px] px-2 py-1 rounded-full font-semibold bg-amber-500/90 text-black shadow-sm">
              Low stock: {item.stock}
            </span>
          )}
          <span
            className={`text-xs px-2 py-1 rounded-full font-semibold backdrop-blur-sm shadow-sm ${
              isFood
                ? "bg-primary/80 text-primary-foreground"
                : "bg-blue-500/80 text-white"
            }`}
          >
            {isFood ? "🍛 FOOD" : "☕ DRINK"}
          </span>
        </div>
      </div>
      
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-lg tracking-tight">{item.name}</h3>
          <div className="flex items-center justify-between mt-2">
            <span className="text-2xl font-bold glow-text">
              <span className="text-primary/80">Rp</span> {item.price.toLocaleString('id-ID')}
            </span>
            <span
              className={`text-xs px-2 py-1 rounded-full border ${
                isOutOfStock
                  ? 'bg-destructive/15 text-destructive border-destructive/30'
                  : lowStock
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                  : 'bg-secondary/40 text-foreground/80 border-primary/10'
              }`}
              title={`${item.stock} in stock`}
            >
              {isOutOfStock ? 'Out' : `${item.stock} left`}
            </span>
          </div>
        </div>
        {/* Simple note field for drinks (e.g., less ice) */}
        {!isFood && (
          <div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., less ice"
              className="w-full h-9 rounded bg-secondary/30 border border-primary/20 px-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 transition"
            />
          </div>
        )}
        
        <Button
          onClick={() => onAddToCart(item, isFood ? undefined : (note.trim() || undefined))}
          disabled={isOutOfStock}
          className="w-full glow-border transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
          title={isOutOfStock ? 'No stock available' : undefined}
        >
          {isOutOfStock ? "Out of Stock" : "Add to Cart"}
        </Button>
      </div>
    </Card>
  );
}