"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Notification, User } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, CheckCheck, Trash2, ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default function OwnerNotificationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) { router.push('/login'); return; }
    const u = JSON.parse(raw);
    if (u.role !== 'owner') { router.push('/login'); return; }
    setUser(u);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true); setError(null);
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) { setError('Notifications are not available. Run the notifications migration.'); setNotifications([] as any); }
      else { setNotifications((data as any) || []); }
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel('owner_notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })) as any);
  };
  const clearAll = async () => {
    if (!user) return; if (!confirm('Clear all notifications?')) return;
    await supabase.from('notifications').delete().eq('user_id', user.id);
    setNotifications([] as any);
  };
  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? ({ ...n, read: true }) as any : n) as any);
  };

  if (!user) return <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="p-6 glass-card glow-border flex items-center justify-between">
          <div className="flex items-center gap-2"><Bell className="h-5 w-5"/><h1 className="text-xl font-bold glow-text">Notifications</h1></div>
          <div className="flex gap-2">
            <Link href="/owner"><Button variant="ghost"><ArrowLeft className="h-4 w-4 mr-1"/>Back</Button></Link>
            <Button variant="outline" onClick={markAllRead}><CheckCheck className="h-4 w-4 mr-2"/>Mark all read</Button>
            <Button variant="destructive" onClick={clearAll}><Trash2 className="h-4 w-4 mr-2"/>Clear</Button>
          </div>
        </Card>

        {loading ? (
          <Card className="p-12 glass-card glow-border text-center"><p className="text-muted-foreground">Loading...</p></Card>
        ) : notifications.length === 0 ? (
          <Card className="p-12 glass-card glow-border text-center"><p className="text-muted-foreground">{error ?? 'No notifications'}</p></Card>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => (
              <Card key={n.id} className={`p-4 glass-card glow-border ${n.read ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold">{n.title}</div>
                    {n.message && <div className="text-sm text-muted-foreground">{n.message}</div>}
                    <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {n.link && <Link href={n.link}><Button variant="outline" size="sm"><ExternalLink className="h-3 w-3 mr-1"/>Open</Button></Link>}
                    {!n.read && <Button size="sm" onClick={()=>markRead(n.id)}>Mark read</Button>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
