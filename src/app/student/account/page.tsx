"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, User } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function StudentAccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ordersCount, setOrdersCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // PIN form state
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  useEffect(() => {
    const ustr = localStorage.getItem("user");
    if (!ustr) { router.push("/login"); return; }
    const u = JSON.parse(ustr);
    if (u.role !== "student") { router.push("/login"); return; }
    setUser(u);
    (async () => {
      try {
        // Refresh user record
        const { data: urow, error: uerr } = await supabase
          .from("users")
          .select("id, name, email, wallet_balance, pin, created_at")
          .eq("id", u.id)
          .single();
        if (uerr) throw uerr;
        if (urow) {
          const merged = { ...u, ...urow } as User;
          setUser(merged);
          localStorage.setItem("user", JSON.stringify(merged));
        }
        // Count orders
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", u.id);
        if (typeof count === 'number') setOrdersCount(count);
      } catch (e: any) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const joinedDate = useMemo(() => {
    if (!user?.created_at) return null;
    try { return new Date(user.created_at).toLocaleString(); } catch { return String(user.created_at); }
  }, [user?.created_at]);

  const validatePin = (): string | null => {
    if (!user) return "Not authenticated";
    if (!currentPin) return "Enter your current PIN";
    if (currentPin !== user.pin) return "Current PIN is incorrect";
    if (!newPin) return "Enter a new PIN";
    if (!/^\d{4,6}$/.test(newPin)) return "PIN must be 4-6 digits";
    if (newPin === currentPin) return "New PIN must be different";
    if (confirmPin !== newPin) return "Confirmation does not match";
    return null;
  };

  const handlePinUpdate = async () => {
    setError(null); setOk(null);
    const v = validatePin();
    if (v) { setError(v); return; }
    if (!user) return;
    setSaving(true);
    try {
      const { error: uerr } = await supabase
        .from("users")
        .update({ pin: newPin })
        .eq("id", user.id);
      if (uerr) throw uerr;
      const updated = { ...user, pin: newPin };
      setUser(updated);
      localStorage.setItem("user", JSON.stringify(updated));
      setOk("PIN updated successfully");
      setCurrentPin(""); setNewPin(""); setConfirmPin("");
    } catch (e: any) {
      setError(e?.message || "Failed to update PIN");
    } finally {
      setSaving(false);
    }
  };

  if (!user || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Card className="p-6 glass-card glow-border">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold glow-text">Account Settings</h1>
              <p className="text-sm text-muted-foreground">Manage your PIN and view your account details</p>
            </div>
            <Button variant="ghost" onClick={() => router.push("/student")}>Back</Button>
          </div>
        </Card>

        {/* Account info */}
        <Card className="p-6 glass-card glow-border">
          <h2 className="text-lg font-semibold mb-3">Your Info</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{user.name}</span></div>
            <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{user.email}</span></div>
            <div><span className="text-muted-foreground">Wallet:</span> <span className="font-medium">Rp {user.wallet_balance.toLocaleString('id-ID')}</span></div>
            <div><span className="text-muted-foreground">Joined:</span> <span className="font-medium">{joinedDate || '-'}</span></div>
            <div><span className="text-muted-foreground">Orders:</span> <span className="font-medium">{ordersCount ?? '-'}</span></div>
          </div>
        </Card>

        {/* PIN change */}
        <Card className="p-6 glass-card glow-border space-y-3">
          <h2 className="text-lg font-semibold">Change PIN</h2>
          <p className="text-xs text-muted-foreground">Your PIN controls purchases. Use 4–6 digits.</p>
          <div className="grid gap-3">
            <input
              type="password"
              inputMode="numeric"
              pattern="\\d*"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              className="w-full h-10 rounded bg-secondary/30 border border-primary/20 px-3"
              placeholder="Current PIN"
            />
            <input
              type="password"
              inputMode="numeric"
              pattern="\\d*"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              className="w-full h-10 rounded bg-secondary/30 border border-primary/20 px-3"
              placeholder="New PIN (4–6 digits)"
            />
            <input
              type="password"
              inputMode="numeric"
              pattern="\\d*"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              className="w-full h-10 rounded bg-secondary/30 border border-primary/20 px-3"
              placeholder="Confirm new PIN"
            />
          </div>
          {error && <div className="text-destructive text-sm">{error}</div>}
          {ok && <div className="text-emerald-600 text-sm">{ok}</div>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => router.push('/student')}>Cancel</Button>
            <Button className="flex-1 glow-border" onClick={handlePinUpdate} disabled={saving}>
              {saving ? 'Saving…' : 'Update PIN'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
