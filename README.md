# PhonePe Spoof For iPhone & Android + Integrated Telegram Selling Bot

All-in-one **TanStack Start + React + Neon PostgreSQL** project that deploys **both the app and the automated Telegram Selling Bot together on Vercel** in a single deployment (no separate Python server required).

## Vercel Deployment Steps

1. Push this project to GitHub and import it on **Vercel**.
2. Add these Environment Variables in **Vercel → Project Settings → Environment Variables**:
   - `DATABASE_URL` — Neon PostgreSQL pooled connection string
   - `ACCESS_SESSION_SECRET` — Random secret (32–64 chars)
   - `ZIMADMIN_PASSWORD` — Password for `/zimadmin`
   - `TRUSTED_PROXY` — `railway` (uses Vercel/proxy-appended client IP)
   - `BOT_TOKEN` — Telegram bot token from [@BotFather](https://t.me/BotFather)
   - `ADMIN_ID` — Your numeric Telegram user ID (comma-separated for multiple admins)
   - `PAYTM_MID` & `PAYTM_UPI` — Paytm merchant ID and UPI ID
   - Optional: `SINGLE_PRICE` (`99`), `BULK_PRICE` (`59`), `BULK_MIN` (`10`), `KEY_DAYS` (`0` = Lifetime), `CRON_SECRET`
3. Deploy on Vercel.
4. Open **`https://your-vercel-domain.vercel.app/zimadmin`** → **Settings** → tap **Activate Bot Webhook**.
   - This automatically registers `https://your-vercel-domain.vercel.app/api/telegram/webhook` with Telegram and syncs your bot link to the login page.
5. *(Optional for automatic hands-free payment checks without tapping "Check Payment Status")*:
   - Point any free cron service (such as `cron-job.org` every 1 minute) to:
     `https://your-vercel-domain.vercel.app/api/telegram/poll?secret=YOUR_CRON_SECRET`

## Integrated Selling Bot Features

- **Direct Instant Checkout (No Channels / No Web App Links):**
  - `/start buy_1` → sends Single Key UPI QR immediately
  - `/start bulk_<QTY>` → sends Bulk Keys UPI QR immediately
  - Direct Neon key generation into `public.access_keys` (keys appear instantly in `/zimadmin` and work immediately)
- **Admin Control Panel (`👑 Admin Control Panel` or `/admin`):**
  - **📊 Detailed Stats:** Total Users, Total Buyers, Conversion %, Orders, Keys Sold, 24h & All-Time Revenue
  - **📢 Broadcast:** Send any text/photo/video/document to all users with Total, Completed & Failed report
  - **🔗 Seller / Team Referral Links:** Name & generate individual seller links (`?start=ref_<CODE>`) with separate Users, Buyers, Keys, Revenue & Buyers List per link
  - **🧾 Orders:** Filter All/Pending/Paid, inspect orders, Paytm Check, Manual Approve & Deliver
