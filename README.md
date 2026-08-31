<div align="center">

<br>

# 🏡 Backyard

### The club discovery platform your campus actually deserves.

<br>

<img src="src/assets/intro_screen_hero.gif" alt="Backyard Demo" width="720">

<br>

**Find your people. Discover your passions. Never miss what's happening on campus.**

[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Vite](https://img.shields.io/badge/Vite_7-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

---

</div>

## The Problem

Every semester, hundreds of clubs fight for attention at a single activities fair. Students forget names, lose flyers, and never discover the communities that would change their college experience. Club leaders struggle to reach the right people, and event turnout stays low because no one knows what's happening until it's too late.

**Campus life is fragmented. Backyard brings it together.**

---

## What is Backyard?

Backyard is a beautifully crafted web platform that makes discovering, exploring, and engaging with student organizations effortless. Think of it as the social layer your university never built — where clubs come alive with real reviews, live event schedules, and a community you can actually see.

Built with a hand-painted Ghibli-inspired aesthetic, Backyard doesn't feel like another sterile university portal. It feels like *home*.

---

## Features

### 🔍 Smart Club Discovery
Browse every club at your university in one place. Filter by category — academics, arts, athletics, community service, and more. A powerful search bar surfaces exactly what you're looking for, instantly.

### ⭐ Honest Club Reviews
Real students. Real opinions. Read candid reviews from peers who've actually been in the club, complete with upvotes so the best insights rise to the top.

### 📅 This Week — Live Event Calendar
See what's happening *right now*. A day-by-day weekly view shows you which clubs are active today, what they're doing, and which of your friends are interested. Never miss an event again.

### 👥 Friends & Social
Connect with classmates and see what they're joining. Backyard's friend system shows you who's going where, making it easy to find familiar faces or discover something new together.

### 🎴 Visual Club Profiles
Every club gets a rich, visual profile — think polaroid-style cards, community boards, and detailed descriptions that go beyond a one-line bio.

### 🔐 Secure Google Auth
One-click sign-in with your university Google account. No new passwords, no friction — just tap and you're in.

### 🎨 A UI That Feels Different
Forget generic dashboards. Backyard's Ghibli-inspired design features hand-textured backgrounds, organic layouts, and animations that make browsing feel like exploring a world, not filling out a form.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Framer Motion, Tailwind CSS 4 |
| **Backend** | Express 5, Node.js |
| **Database** | Supabase (PostgreSQL + Auth + Realtime) |
| **Build** | Vite 7 |
| **State** | Zustand |
| **Auth** | Supabase Auth + Google OAuth 2.0 |

---

## Architecture

```
backyard/
├── src/
│   ├── home_components/      # Landing page & search
│   ├── uni_components/       # University hub, clubs, calendar
│   ├── review_components/    # Club reviews & ratings
│   ├── profile_components/   # User profiles & friends
│   ├── login_components/     # Authentication flows
│   ├── context/              # Global data providers
│   └── lib/                  # Supabase client, API, state store
├── server/                   # Express API server
├── scraper/                  # Club data ingestion
└── data/                     # Static datasets
```

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/ConnorFriedman10/Backyard.git
cd Backyard

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your Supabase URL, anon key, and Google OAuth credentials

# Run the full stack (frontend + backend)
npm run dev:all
```

---

## The Team

Built with care by **Milo Bell**, **Connor Friedman**, **Ryan Marshall**, **Ryan Sinha**, and **Benjamin Hailu**.

---

<div align="center">

<br>

**Backyard** — Where campus communities come alive.

<br>

*© 2026 Backyard. All rights reserved.*

</div>
