"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  // Role is fixed to student for self-registration
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Handle user registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validate PIN is 6 digits
    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
      setError("PIN must be exactly 6 digits");
      setLoading(false);
      return;
    }

    try {
      // Check if email already exists
      const { data: existingUser } = await supabase
        .from("users")
        .select("email")
        .eq("email", email)
        .single();

      if (existingUser) {
        setError("Email already registered");
        setLoading(false);
        return;
      }

      // Insert new user into database
      const { data, error: insertError } = await supabase
        .from("users")
        .insert([
          {
            name,
            email,
            password,
            pin,
            role: "student",
            wallet_balance: 0, // Start with zero balance
          },
        ])
        .select()
        .single();

      if (insertError) {
        setError("Registration failed. Please try again.");
        console.error(insertError);
        setLoading(false);
        return;
      }

      // Store user info and redirect to login
      alert("Registration successful! Please login.");
      router.push("/login");
    } catch (err) {
      setError("An error occurred during registration");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/10">
      <Card className="w-full max-w-md p-8 glass-card glow-border">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold glow-text mb-2">🍱 Create Account</h1>
          <p className="text-muted-foreground">Join our canteen system</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="bg-secondary/50 border-primary/30"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="student@school.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-secondary/50 border-primary/30"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="bg-secondary/50 border-primary/30"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin">6-Digit PIN (for wallet transactions)</Label>
            <Input
              id="pin"
              type="password"
              placeholder="123456"
              value={pin}
              onChange={(e) => setPin(e.target.value.slice(0, 6))}
              required
              maxLength={6}
              className="bg-secondary/50 border-primary/30"
            />
          </div>

          {/* Role is not selectable; new users are students by default */}

          {error && (
            <div className="p-3 rounded-lg bg-destructive/20 border border-destructive/50 text-destructive text-sm">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full glow-border hover:glow-pulse"
            disabled={loading}
          >
            {loading ? "Creating account..." : "Register"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm">
          <p className="text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline glow-text">
              Sign in
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
