# Feature Catalog (Accurate as of Current Code)

## Student Role

### Dashboard (`/student`)
- Swipeable tabs: Menu, Cart, Orders, Pre-Orders.
- Wallet balance display (Rp formatting) with post-checkout refresh.
- Realtime unread notifications badge (Supabase channel).
- Responsive horizontal action ribbon (no button cut-offs on mobile).
- Category filter (all / food / drink).
- Cart persistence (localStorage, 1h expiry) + stock synchronization & clamping.
- Toast feedback for cart actions & stock limits.

### Cart / Checkout
- Stock integrity: pre-check + RPC `decrement_stock` with fallback client updates.
- Negative stock prevention under concurrency.
- Pre-order scheduling (weekday within next 7 days) via calendar popover.
- Graceful fallback if `scheduled_for` or enum value missing.
- Low/out-of-stock notifications to owners (threshold crossing detection after order).
- Monthly budget awareness (fetch budget + month-to-date spend; warning if exceeded).
- Owner order notifications (new, pre-order or normal) inserted after successful order creation.

### Scan & Pay (`/student/scan`)
- html5-qrcode scanner with guarded start/stop transitions.
- Multi-format decoding (QR + multiple barcode formats + BarcodeDetector when available).
- Payload parsing priority: JSON → `barcode_value` → raw UUID.
- UUID validation for DB safety.
- Payment flow: RPC stock decrement → order insert → wallet deduction → transaction record → owner notification.
- Dynamic qrbox sizing + resize adaptive restart.
- Rescan & camera selection UI.
- Race condition mitigation (transition flag + retries).

### Order History
- Active vs Completed segmentation.
- Pre-order badge & scheduled date display.
- Bilateral pickup confirmation (student side) with owner prompt notification when only one party has confirmed.
- Fallback completion if status enum missing but flags set.
- Realtime subscription refreshing list.

### Pre-Orders Tab
- Lists pre-orders (if present) via shared component logic.
- Same item serialization as normal orders.

### Notifications (`/student/notifications`)
- List, mark one, mark all read, clear all.
- Optimistic UI updates.
- Realtime subscription for incoming notifications.

### Student QR (`/student/qr`)
- Dynamic QR generation `{ t:'student', id, n }`.
- Owner scan compatibility.

## Owner Role

### Owner Dashboard (`/owner`)
- Tabs: Orders, My Menu.
- Filter to only fully owned orders (all items belong to owner).
- Sections: Processing, Ready, Completed with counts in tab label.
- Status transitions (processing → ready) guarded by ownership.
- Bilateral pickup confirmation (owner side) with student prompt notification.
- Optimistic completion fallback if enum not updated.
- Realtime subscriptions: orders, menu items, notifications badge.
- Menu management: add/edit/delete items, price/stock adjustments, per-item QR generation & persistence.
- Stock=0 highlighting.
- Responsive action rows (prevent button clipping).

### Scan Student (`/owner/scan-student`)
- Scan student QR (JSON or raw UUID) with validation.
- Owner selects items (their own menu) or enters manual amount if no items.
- PIN verification (student PIN) + wallet balance check.
- Atomic stock decrement for selected items (RPC + fallback) → order insertion → balance deduction → transaction log.

### Notifications (`/owner/notifications`)
- Same capabilities as student notifications (read, mark all, clear).
- Realtime updates.

## Admin Role

### Admin Dashboard (`/admin`)
- Tabs: Users, Menu, Orders, Transactions.
- Users: role change, wallet balance editing, delete (except self), owner filter for menu assignment, auto-select first owner when adding.
- Menu: add/edit/delete items; supports both `image_url` & `image` columns; barcode value/image fields; dynamic QR generation; grouped by owner.
- Orders: all system orders (processing/pre-order/ready/ completed if present) with itemization and truncated ID display.
- Transactions: latest 50, heuristic order matching (same user + amount ±10min) to show itemization; topup/order/transfer labeling.

### Monthly Report (`/admin/report`)
- Month/year picker.
- KPIs: Total Orders, Revenue, Avg Order Value, Pre-Orders, Processing/Ready counts, Distinct Items.
- Top Items by Quantity & Revenue (top 5 each).
- Daily breakdown (orders & revenue per day).
- Hot sellers low on stock (≤5 remaining, intersect sold items).
- Loading/empty/error fallback UX.

## Shared Systems
- Supabase integration: tables (users, menu_items, orders, transactions, notifications); RPC `decrement_stock` (uuid casting fix applied).
- Realtime channels: menu_items, orders, notifications.
- Barcode/QR: per-item & per-student generation; multi-format scanning; resilient container clearing.
- Notifications taxonomy: stock_low, stock_out, pickup_prompt, order_update, etc.
- Pickup flags & completion derivation: `student_picked_up`, `owner_picked_up`, `completed_at`.
- Optimistic UI patterns: notifications & pickup confirmations.
- Responsive UI: glass aesthetic, glow borders, mobile swipe navigation, horizontal scroll ribbons.

## Error Resilience & Fallbacks
- Scanner race avoidance with transition guard + retry.
- Fallback stock decrement path if RPC missing or fails.
- Order insertion fallback paths for missing columns / enum values.
- Completion derived from flags even if enum lacks 'completed'.
- Graceful handling of absent cameras / permissions with friendly messages.

## Newly Added (This Revision)
- Owner notifications on student cart checkout & scan-to-pay orders (type: order_update).
- Extended Admin KPI grid showing Processing / Ready counts & Distinct Items.

## Potential Future Enhancements
- Server-side auth & RLS (currently client-side role gating).
- Export /admin/report as CSV/PDF.
- Owner-specific revenue slice in report.
- Automatic recurring low stock alerts (scheduled).
- Dedicated new-order notifications for mixed-owner orders (currently per impacted owners only).
- Test suite (unit + integration).

---
Generated to reflect current codebase state after implementing KPI extensions and owner order notifications.
