"use client";

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

  return (
    <Card className="overflow-hidden glass-card glow-border transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl hover:glow-pulse">
      <div className="aspect-square relative bg-secondary/30 group">
        <Image
          src={(item as any).image_url ?? (item as any).image ?? ""}
          alt={item.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          unoptimized
        />
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <span className="text-destructive font-bold text-lg">OUT OF STOCK</span>
          </div>
        )}
        {/* Category Badge */}
        <div className="absolute top-2 right-2">
          <span className={`text-xs px-2 py-1 rounded-full font-semibold backdrop-blur-sm ${
            isFood 
              ? "bg-primary/80 text-primary-foreground" 
              : "bg-blue-500/80 text-white"
          }`}>
            {isFood ? "🍛 FOOD" : "☕ DRINK"}
          </span>
        </div>
      </div>
      
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-lg">{item.name}</h3>
          <div className="flex items-center justify-between mt-2">
            <span className="text-2xl font-bold glow-text">Rp {item.price.toLocaleString('id-ID')}</span>
            <span className={`text-sm ${isOutOfStock ? 'text-destructive' : 'text-muted-foreground'}`}>
              Stock: {item.stock}
            </span>
          </div>
        </div>
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
        >
          {isOutOfStock ? "Out of Stock" : "Add to Cart"}
        </Button>
      </div>
    </Card>
  );
}