"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, User, Transaction } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Wallet, Send, Download, History } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function WalletPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  // Top-up state
  const [topupAmount, setTopupAmount] = useState("");
  const [showQRIS, setShowQRIS] = useState(false);

  // Send money state
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendPin, setSendPin] = useState("");

  // Request money state
  const [requestEmail, setRequestEmail] = useState("");
  const [requestAmount, setRequestAmount] = useState("");

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      router.push("/login");
      return;
    }

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    fetchTransactions(parsedUser.id);
    fetchUserBalance(parsedUser.id);

    // Set up real-time subscription for balance updates
    const channel = supabase
      .channel("user_balance")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
          filter: `id=eq.${parsedUser.id}`,
        },
        () => {
          fetchUserBalance(parsedUser.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  // Fetch user balance
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

  // Fetch transaction history
  const fetchTransactions = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order("timestamp", { ascending: false })
        .limit(20);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    }
  };

  // Handle top-up confirmation
  const handleTopup = async () => {
    if (!user || !topupAmount) return;

    const amount = parseFloat(topupAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    setLoading(true);
    try {
      const newBalance = user.wallet_balance + amount;

      // Update user balance
      const { error: updateError } = await supabase
        .from("users")
        .update({ wallet_balance: newBalance })
        .eq("id", user.id);

      if (updateError) throw updateError;

      // Create transaction record
      await supabase.from("transactions").insert([
        {
          sender_id: user.id,
          receiver_id: null,
          amount: amount,
          type: "topup",
        },
      ]);

      // Update local state
      const updatedUser = { ...user, wallet_balance: newBalance };
      setUser(updatedUser);
      localStorage.setItem("user", JSON.stringify(updatedUser));

      alert(`Successfully topped up Rp ${amount.toLocaleString('id-ID')}! 🎉`);
      setTopupAmount("");
      setShowQRIS(false);
      fetchTransactions(user.id);
    } catch (error) {
      console.error("Topup error:", error);
      alert("Failed to top up. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Handle send money
  const handleSendMoney = async () => {
    if (!user || !recipientEmail || !sendAmount || !sendPin) {
      alert("Please fill in all fields");
      return;
    }

    const amount = parseFloat(sendAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    if (user.wallet_balance < amount) {
      alert("Insufficient balance");
      return;
    }

    // Verify PIN
    if (sendPin !== user.pin) {
      alert("Incorrect PIN");
      return;
    }

    setLoading(true);
    try {
      // Find recipient
      const { data: recipient, error: recipientError } = await supabase
        .from("users")
        .select("*")
        .eq("email", recipientEmail)
        .single();

      if (recipientError || !recipient) {
        alert("Recipient not found");
        setLoading(false);
        return;
      }

      if (recipient.id === user.id) {
        alert("You cannot send money to yourself");
        setLoading(false);
        return;
      }

      // Update sender balance
      const senderNewBalance = user.wallet_balance - amount;
      await supabase
        .from("users")
        .update({ wallet_balance: senderNewBalance })
        .eq("id", user.id);

      // Update recipient balance
      const recipientNewBalance = recipient.wallet_balance + amount;
      await supabase
        .from("users")
        .update({ wallet_balance: recipientNewBalance })
        .eq("id", recipient.id);

      // Create transaction record
      await supabase.from("transactions").insert([
        {
          sender_id: user.id,
          receiver_id: recipient.id,
          amount: amount,
          type: "transfer",
        },
      ]);

      // Create notification for recipient
      try {
        await supabase.from('notifications').insert([
          {
            user_id: recipient.id,
            role: 'student',
            type: 'money_received',
            title: 'Money received',
            message: `${user.name} sent you Rp ${amount.toLocaleString('id-ID')}`,
            link: '/wallet',
            meta: { from: user.id, amount }
          }
        ]);
      } catch {}

      // Update local state
      const updatedUser = { ...user, wallet_balance: senderNewBalance };
      setUser(updatedUser);
      localStorage.setItem("user", JSON.stringify(updatedUser));

      alert(`Successfully sent Rp ${amount.toLocaleString('id-ID')} to ${recipient.name}! 💸`);
      setRecipientEmail("");
      setSendAmount("");
      setSendPin("");
      fetchTransactions(user.id);
    } catch (error) {
      console.error("Send money error:", error);
      alert("Failed to send money. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Handle request money
  const handleRequestMoney = async () => {
    if (!requestEmail || !requestAmount) {
      alert("Please fill in all fields");
      return;
    }

    const amount = parseFloat(requestAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    setLoading(true);
    try {
      // Find user to request from
      const { data: requestedUser, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", requestEmail)
        .single();

      if (error || !requestedUser) {
        alert("User not found");
        setLoading(false);
        return;
      }

      // Create a notification for the requested user
      try {
        await supabase.from('notifications').insert([
          {
            user_id: requestedUser.id,
            role: 'student',
            type: 'money_request',
            title: 'Money request',
            message: `${user?.name || 'A student'} requested Rp ${amount.toLocaleString('id-ID')} from you`,
            link: '/wallet',
            meta: { from: user?.id, amount }
          }
        ]);
      } catch {}

      alert(`Request sent to ${requestedUser.name} for Rp ${amount.toLocaleString('id-ID')}!`);
      setRequestEmail("");
      setRequestAmount("");
    } catch (error) {
      console.error("Request money error:", error);
      alert("Failed to send request. Please try again.");
    } finally {
      setLoading(false);
    }
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
      <div className="max-w-4xl mx-auto mb-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href={user.role === "student" ? "/student" : "/"}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>

        <Card className="p-8 glass-card glow-border text-center">
          <Wallet className="w-16 h-16 mx-auto mb-4 text-primary" />
          <h1 className="text-2xl font-bold glow-text mb-2">Wallet Balance</h1>
          <p className="text-5xl font-bold glow-text mb-2">
            Rp {user.wallet_balance.toLocaleString('id-ID')}
          </p>
          <p className="text-muted-foreground">{user.name}</p>
        </Card>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto">
        <Tabs defaultValue="topup" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 glass-card">
            <TabsTrigger value="topup">
              <Download className="mr-2 h-4 w-4" />
              Top Up
            </TabsTrigger>
            <TabsTrigger value="send">
              <Send className="mr-2 h-4 w-4" />
              Send
            </TabsTrigger>
            <TabsTrigger value="request">
              <Download className="mr-2 h-4 w-4 rotate-180" />
              Request
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="mr-2 h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          {/* Top Up Tab */}
          <TabsContent value="topup">
            <Card className="p-6 glass-card glow-border">
              <h2 className="text-xl font-bold mb-4 glow-text">Top Up Wallet</h2>
              
              {!showQRIS ? (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="topup-amount">Amount</Label>
                    <Input
                      id="topup-amount"
                      type="text"
                      placeholder="0.00"
                      value={topupAmount}
                      inputMode="numeric"
                      min={0}
                      step={1 as any}
                      onChange={(e) => {
                        // Allow digits only
                        let v = e.target.value.replace(/[^0-9]/g, "");
                        // Normalize leading zeros
                        if (v.startsWith("00")) v = v.replace(/^0+/, "0");
                        setTopupAmount(v);
                      }}
                      className="bg-secondary/50 border-primary/30"
                    />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    {[30000, 150000, 300000].map((amount) => (
                      <Button
                        key={amount}
                        variant="outline"
                        onClick={() => setTopupAmount(amount.toString())}
                        className="glow-border"
                      >
                        Rp {amount.toLocaleString('id-ID')}
                      </Button>
                    ))}
                  </div>

                  <Button
                    onClick={() => setShowQRIS(true)}
                    disabled={!topupAmount || parseFloat(topupAmount) <= 0}
                    className="w-full glow-border hover:glow-pulse"
                  >
                    Generate QRIS Code
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white p-8 rounded-lg">
                    <Image
                      src="https://images.unsplash.com/photo-1600089548034-c66c863c56c9?w=400"
                      alt="QRIS Code"
                      width={300}
                      height={300}
                      className="mx-auto"
                      unoptimized
                    />
                  </div>
                  <p className="text-center text-sm text-muted-foreground">
                    Scan this QR code with your banking app
                  </p>
                  <p className="text-center text-2xl font-bold glow-text">
                    Rp {parseFloat(topupAmount).toLocaleString('id-ID')}
                  </p>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowQRIS(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleTopup}
                      disabled={loading}
                      className="flex-1 glow-border hover:glow-pulse"
                    >
                      {loading ? "Processing..." : "Confirm Payment"}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Send Money Tab */}
          <TabsContent value="send">
            <Card className="p-6 glass-card glow-border">
              <h2 className="text-xl font-bold mb-4 glow-text">Send Money</h2>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="recipient">Recipient Email</Label>
                  <Input
                    id="recipient"
                    type="email"
                    placeholder="student@school.com"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    className="bg-secondary/50 border-primary/30"
                  />
                </div>

                <div>
                  <Label htmlFor="send-amount">Amount</Label>
                  <Input
                    id="send-amount"
                    type="text"
                    placeholder="0.00"
                    value={sendAmount}
                    inputMode="numeric"
                    min={0}
                    step={1 as any}
                    onChange={(e) => {
                      let v = e.target.value.replace(/[^0-9]/g, "");
                      if (v.startsWith("00")) v = v.replace(/^0+/, "0");
                      setSendAmount(v);
                    }}
                    className="bg-secondary/50 border-primary/30"
                  />
                </div>

                <div>
                  <Label htmlFor="pin">6-Digit PIN</Label>
                  <Input
                    id="pin"
                    type="password"
                    placeholder="••••••"
                    value={sendPin}
                    onChange={(e) => setSendPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    maxLength={6}
                    className="bg-secondary/50 border-primary/30"
                  />
                </div>

                <div className="p-3 rounded-lg bg-secondary/30 border border-primary/20">
                  <p className="text-sm text-muted-foreground">
                    Available Balance: <span className="font-semibold text-foreground">Rp {user.wallet_balance.toLocaleString('id-ID')}</span>
                  </p>
                </div>

                <Button
                  onClick={handleSendMoney}
                  disabled={loading || !recipientEmail || !sendAmount || !sendPin}
                  className="w-full glow-border hover:glow-pulse"
                >
                  {loading ? "Sending..." : "Send Money"}
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* Request Money Tab */}
          <TabsContent value="request">
            <Card className="p-6 glass-card glow-border">
              <h2 className="text-xl font-bold mb-4 glow-text">Request Money</h2>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="request-from">Request From (Email)</Label>
                  <Input
                    id="request-from"
                    type="email"
                    placeholder="friend@school.com"
                    value={requestEmail}
                    onChange={(e) => setRequestEmail(e.target.value)}
                    className="bg-secondary/50 border-primary/30"
                  />
                </div>

                <div>
                  <Label htmlFor="request-amount">Amount</Label>
                  <Input
                    id="request-amount"
                    type="text"
                    placeholder="0.00"
                    value={requestAmount}
                    inputMode="numeric"
                    min={0}
                    step={1 as any}
                    onChange={(e) => {
                      let v = e.target.value.replace(/[^0-9]/g, "");
                      if (v.startsWith("00")) v = v.replace(/^0+/, "0");
                      setRequestAmount(v);
                    }}
                    className="bg-secondary/50 border-primary/30"
                  />
                </div>

                <div className="p-3 rounded-lg bg-secondary/30 border border-primary/20">
                  <p className="text-xs text-muted-foreground">
                    💡 The recipient will receive a notification and can approve or reject your request.
                  </p>
                </div>

                <Button
                  onClick={handleRequestMoney}
                  disabled={loading || !requestEmail || !requestAmount}
                  className="w-full glow-border hover:glow-pulse"
                >
                  {loading ? "Sending Request..." : "Send Request"}
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* Transaction History Tab */}
          <TabsContent value="history">
            <Card className="p-6 glass-card glow-border">
              <h2 className="text-xl font-bold mb-4 glow-text">Transaction History</h2>
              
              {transactions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No transactions yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transactions.map((transaction) => {
                    const isIncoming = transaction.receiver_id === user.id;
                    const isOutgoing = transaction.sender_id === user.id && transaction.receiver_id !== null;
                    
                    return (
                      <div
                        key={transaction.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 border border-primary/20"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            transaction.type === "topup" ? "bg-green-500/20" :
                            isIncoming ? "bg-blue-500/20" : "bg-purple-500/20"
                          }`}>
                            {transaction.type === "topup" ? (
                              <Download className="h-5 w-5 text-green-500" />
                            ) : isIncoming ? (
                              <Download className="h-5 w-5 text-blue-500 rotate-180" />
                            ) : (
                              <Send className="h-5 w-5 text-purple-500" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">
                              {transaction.type === "topup" ? "Top Up" :
                               transaction.type === "order" ? "Order Payment" :
                               isIncoming ? "Received Money" : "Sent Money"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(transaction.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className={`font-bold ${
                          isIncoming || transaction.type === "topup" ? "text-green-500" : "text-red-500"
                        }`}>
                          {isIncoming || transaction.type === "topup" ? "+" : "-"}
                          Rp {transaction.amount.toLocaleString('id-ID')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}