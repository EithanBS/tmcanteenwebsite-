import { createClient } from '@supabase/supabase-js';

// Hardcoded Supabase credentials - replace these with your actual values
// Get these from: Supabase Dashboard → Settings → API
const supabaseUrl = "https://bsiaytpcahaoyqgkrbse.supabase.co"; // Replace with your Project URL
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzaWF5dHBjYWhhb3lxZ2tyYnNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2MjQ4MTAsImV4cCI6MjA3NzIwMDgxMH0.wMUhTMuIVt57sfJ7BiiY5FDzFnVNRZ2t5ogY5A3sXt8"; // Replace with your anon/public key

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);

// Database types for TypeScript
export type User = {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'admin' | 'owner';
  wallet_balance: number;
  pin: string;
  monthly_budget?: number | null;
  created_at?: string;
};

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  stock: number;
  image_url: string;
  owner_id: string;
  category: 'food' | 'drink';
  created_at?: string;
  barcode_image_url?: string; // optional QR/barcode image for scan mode
  barcode_value?: string; // underlying value encoded in barcode (e.g., item id or custom code)
};

export type Order = {
  id: string;
  user_id: string;
  items: { id: string; name: string; price: number; quantity: number }[];
  total_price: number;
  status: 'processing' | 'ready' | 'preorder' | 'completed';
  created_at: string;
  scheduled_for?: string | null; // ISO date (YYYY-MM-DD) when preorder should be prepared
  student_picked_up?: boolean;
  owner_picked_up?: boolean;
  completed_at?: string | null;
};

export type Transaction = {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  amount: number;
  type: 'topup' | 'transfer' | 'order';
  timestamp: string;
};

export type Notification = {
  id: string;
  user_id: string;
  role?: 'student' | 'owner' | 'admin' | null;
  type: 'money_received' | 'money_request' | 'stock_low' | 'stock_out' | 'order_update' | string;
  title: string;
  message?: string | null;
  link?: string | null;
  meta?: any;
  read: boolean;
  created_at: string;
};