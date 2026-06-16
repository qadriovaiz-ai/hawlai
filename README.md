# 🚗 AutoPilot AI — Lead Qualification & Calling Platform

> AI-powered lead qualification for automobile dealerships. Upload leads, score them automatically, manage your call queue, book appointments, and track everything in one dashboard.

---

## 🚀 Quick Start (5 Steps)

### Step 1 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Name it `autopilot-ai`, choose your region, set a strong password
3. Wait ~2 minutes for it to provision

### Step 2 — Run the Database Migration

1. In your Supabase project, go to **SQL Editor**
2. Click **New Query**
3. Paste the entire contents of `supabase/migrations/001_schema.sql`
4. Click **Run**

You should see: "Success. No rows returned"

### Step 3 — Get Your API Keys

In Supabase → **Project Settings** → **API**:

- Copy `Project URL` → this is your `NEXT_PUBLIC_SUPABASE_URL`
- Copy `anon / public` key → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Copy `service_role` key → this is your `SUPABASE_SERVICE_ROLE_KEY`

### Step 4 — Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Push this project to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo
3. In **Environment Variables**, add:

```
NEXT_PUBLIC_SUPABASE_URL       = your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY  = your_anon_key
SUPABASE_SERVICE_ROLE_KEY      = your_service_role_key
```

4. Click **Deploy** — done in ~2 minutes!

### Step 5 — Create Your Account

1. Visit your deployed URL
2. Click **Create account**
3. Fill in your name, email, password, dealership name, and city
4. You're in! Click **Load Demo Data** to populate 50 leads

---

## 🏃 Run Locally

```bash
# Clone the repo
git clone <your-repo-url>
cd autopilot-ai

# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Fill in your Supabase keys in .env.local

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📁 Project Structure

```
autopilot-ai/
├── src/
│   ├── app/
│   │   ├── auth/
│   │   │   ├── login/page.tsx          # Login page
│   │   │   └── signup/page.tsx         # Signup + dealership setup
│   │   ├── dashboard/
│   │   │   ├── layout.tsx              # Sidebar + TopBar layout
│   │   │   ├── page.tsx                # Main dashboard with KPIs
│   │   │   ├── leads/
│   │   │   │   ├── page.tsx            # Leads table with search/filter
│   │   │   │   └── [id]/page.tsx       # Lead detail + AI analysis
│   │   │   ├── queue/page.tsx          # Call queue
│   │   │   ├── calls/page.tsx          # Call history
│   │   │   ├── appointments/page.tsx   # Appointments
│   │   │   └── analytics/page.tsx      # Analytics + charts
│   │   └── api/
│   │       ├── leads/route.ts          # GET, POST leads
│   │       ├── leads/[id]/route.ts     # PATCH, DELETE lead
│   │       ├── calls/route.ts          # GET, POST calls
│   │       ├── appointments/route.ts   # GET, POST appointments
│   │       ├── appointments/[id]/route.ts # PATCH appointment
│   │       ├── analytics/route.ts      # GET analytics
│   │       └── seed/route.ts           # POST seed demo data
│   ├── components/
│   │   ├── dashboard/                  # KPICards, Charts, Sidebar, TopBar
│   │   ├── leads/                      # LeadsTable, LeadsHeader, AddToQueue
│   │   ├── calls/                      # MarkCalledButton
│   │   └── appointments/               # CreateAppointmentModal, UpdateStatus
│   ├── lib/
│   │   ├── supabase/                   # client.ts, server.ts, middleware.ts
│   │   ├── ai-engine.ts                # Lead qualification scoring logic
│   │   ├── seed-data.ts                # Demo data generator
│   │   └── utils.ts                    # Formatters, color helpers
│   ├── types/index.ts                  # TypeScript interfaces
│   └── middleware.ts                   # Route protection
├── supabase/migrations/001_schema.sql  # Full DB schema + RLS
├── public/sample-leads.csv             # Sample CSV for testing
└── vercel.json                         # Vercel deployment config
```

---

## 🤖 AI Scoring Engine

Leads are scored automatically on upload:

| Factor | Points |
|--------|--------|
| Vehicle 10+ years old | 50 pts |
| Vehicle 7–9 years old | 40 pts |
| Vehicle 5–6 years old | 30 pts |
| Budget ₹1.5L+ | 30 pts |
| Budget ₹1–1.5L | 20 pts |
| Budget ₹50K–1L | 10 pts |
| Phone number present | 10 pts |

**Score → Temperature:**
- 70–100 → 🔥 Hot
- 40–69 → ⚡ Warm
- 0–39 → ❄️ Cold

---

## 📊 CSV Upload Format

Your CSV must have these column headers (case-sensitive):

```
Name, Phone, Vehicle, Purchase Year, Budget
```

Download `public/sample-leads.csv` for a ready-to-use example.

---

## 🔒 Security

- **Supabase Auth** — email/password authentication
- **Row Level Security (RLS)** — each dealership only sees their own data
- **Protected routes** — middleware redirects unauthenticated users
- **Tenant isolation** — complete data separation between dealerships

---

## 🔌 Future Integrations

The codebase is architected for:

- **Vapi.ai** — AI phone calling (schema ready, call logs structured for it)
- **WhatsApp** — lead follow-up via Twilio
- **SMS** — appointment reminders

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Backend | Next.js API Routes |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| Charts | Recharts |
| CSV Parsing | PapaParse |
| Deployment | Vercel |

---

## 📞 Support

Built for non-technical founders. If you get stuck:
1. Check the Supabase SQL editor ran without errors
2. Confirm all 3 environment variables are set in Vercel
3. Try clearing browser cookies and logging in again
