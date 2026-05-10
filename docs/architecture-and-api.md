# Pawn Electron - Technical Architecture & Developer Guide

## System Overview

Pawn Electron is a cross-platform (Web, Desktop, Mobile) pawn shop management app. The architecture revolves around a centralized **Express + Postgres backend**, which forms a single source of truth for all clients in the system.

### Client Applications
1. **Web Frontend (`src/`)**: A modern React 19 application built with Vite and TailwindCSS v4. It acts as a standard Single Page Application running in a browser.
2. **Desktop Shell (`electron/`)**: An Electron wrapper using `main.ts` and `preload.ts` that serves the React frontend inside an independent desktop window context. It bypasses IPC for heavy logic and talks directly to the local backend using standard HTTP APIs.
3. **Mobile Client (`mobile-react-native/`)**: An Expo React Native application targeting iOS and Android platforms, providing on-the-go access to the store's functionalities, mirroring the primary capabilities of the main desktop app.

---

## 🛠️ Technology Stack

### Backend
- **Server:** Node.js, Express.js
- **Database:** PostgreSQL (via Docker Compose setup)
- **ORM:** Drizzle ORM
- **Runtime Testing:** `tsx` for local fast feedback, compiled to standard Javascript on production.

### Frontend (Web / Electron)
- **Framework:** React 19 with Vite ecosystem.
- **Styling:** TailwindCSS v4 (Custom UI framework mimicking a minimalist warm aesthetic).
- **Icons:** `lucide-react`
- **Hardware Integration:** 
  - `@vladmandic/face-api` for Facial Recognition.
  - `html5-qrcode` for Scanning operations.
  - Live Webcam capture API workflows.

### Mobile Client
- **Framework:** React Native via Expo SDK (~54.0).
- **Routing:** Expo Router (`expo-router`).
- **Styles:** React Native Stylesheets & UI components.

---

## 💾 Database Architecture

The schema uses Drizzle ORM to define the shape and queries of the application. The system operates on a robust double-entry-style log for all cash operations.

### Core Entities (`server/src/db/schema.ts`):
1. **`employees`**: Acts as user accounts for system authentication and authorization features.
2. **`customers`**: Holds physical details of pawn customers, including `photo` urls/images to identify them, and `faceDescriptor` used by Face API to authenticate returning customers automatically.
3. **`items`**: Describes pawned items (type, weight, and status).
4. **`pawns`**: The core "Ticket". It links a Customer (owner) to an Item. Includes maximum available amount, current interest rates, storage location, and dates.
5. **`cash_transactions`**: A critical table designed as an immutable ledger tracking all operations.
   - Types: `PAWN` (loan creation), `PLUS_AMOUNT`, `MINUS_AMOUNT`, `REDEEM_BA` (principal redemption), `REDEEM_I` (interest redemption), and `PAID_INTEREST`.
6. **`settings`**: A simple key/value store for arbitrary application toggles.

---

## 🎨 Design System & UI Philosophy

The system includes a highly specific UI architecture detailed in `DESIGN.md`.

> [!NOTE] 
> The UI borrows heavily from the "Cursor Editor" aesthetic.

- **Atmosphere:** Minimalist and warm. Instead of pure white backgrounds, it leans on warm cream (`#f2f1ed`) combined with a dark brown/black typography (`#26251e`). 
- **Typography:** Uses a mixture of `CursorGothic` for display precision, `jjannon` (a humanist serif) for reading materials and editorial text, and `berkeleyMono` for any code or specialized tables. 
- **Colors:**
  - Interaction Accents: `#f54e00` (Warm Orange)
  - Error/Destructive: `#cf2d56` (Warm Crimson)
  - Success States: `#1f8a65` (Muted Teal Greens)
- **Borders & Interactions:** Border logic uniquely uses `oklab` color space to mimic natural drop shadows seamlessly merging into the warm aesthetic backgrounds.

---

## 📡 Backend API Reference (`server/src/index.ts`)

The backend runs on Express at `http://localhost:8787`. All endpoints return JSON responses.

### 🔐 Authentication
- `GET /health` : Verifies the API is online.
- `POST /auth/login` : Authenticates a user.
  - **Body**: `{ "username": "...", "password": "..." }`
  - **Returns**: `{ success: true, user: { id, name, level } }`

### 👥 Users (Employees)
- `GET /users` : Returns list of users.
- `POST /users` : Creates a new user. 
  - **Body**: `{ "name": "...", "userName": "...", "password": "...", "level": "..." }`
- `PUT /users/:id` : Updates user details.
- `DELETE /users/:id` : Deletes a user by ID.

### 🏪 Customers
- `GET /customers` : Returns list of customers (id, name, phone, address, photo, faceDescriptor).
- `GET /customers/:id/pawns` : Gets all pawns specifically tied to a given customer ID.

### 💰 Pawns (Tickets)
- `GET /pawns` : Returns pawns mapped with customers and current outstanding principal. (Accepts optional `status` query).
- `GET /pawns/:id` : Retrieve specific pawn complete info.
- `POST /pawns` : Create a new pawn/loan.
  - **Body**: `{ "customer": { ... }, "item": { ... }, "loanAmount": 1000, "maxAvailableAmount": 1000, "interestRate": 2.5 }`
- `POST /pawns/:id/pay-interest` : Pay interest on a pawn transaction.
  - **Body**: `{ "daysToPay": 30, "amount": 500 }`
- `POST /pawns/:id/adjust` : Modify the principal up or down.
  - **Body**: `{ "amount": 200, "adjustmentType": "PLUS_AMOUNT" | "MINUS_AMOUNT" }`
- `POST /pawns/:id/redeem` : Fully redeem a pawn item and mark it closed.
  - **Body**: `{ "totalAmount": 1050, "discountAmount": 50 }`
- `GET /pawns/:id/transactions` : Returns the immutable `cash_transaction` log for a single pawn ticket.

### 📊 Reports & Storage
- `GET /reports/daily-transactions` : Aggregate `cash_transactions` spanning given dates.
  - **Query Elements**: `?start=...&end=...` OR `?date=YYYY-MM-DD`
- `GET /reports/inventory` : Returns all non-redeemed active items.
- `GET /reports/financial-summary` : Calculates active loans, redeemed principal summaries, and total interest collected to date.
- `GET /reports/overdue-items` : Queries and flags pawns that have past 30 days without interest updates.
- `GET /reports/top-customers` : Aggregation grouping customers by their lifetime total loan amounts.
- `GET /storage/info` : Calculates default shelf storage/slot locations for incoming pawn entries based on current operational volume.

---

## 🗂️ Project Structure

```text
pawn-electron/
├── src/                    # React Web Context (Pages, Contexts, UI)
│   ├── components/         # Reusable modules (BarcodeScanner, FaceSearch, WebcamCapture)
│   ├── pages/              # Core routable views (Dashboard, Pawn, Redeem, Settings, etc)
│   └── browser-bridge.ts   # Connects web requests or local electron requests together
├── server/src/             # Express API Server
│   ├── index.ts            # Holds all Routing endpoints & Logic
│   └── db/                 # Drizzle Schema setup and connection pool 
├── electron/               # Electron Application startup logic
├── mobile-react-native/    # Expo Mobile Application
├── shared/                 # Contract folder mapping TS types between API and Clients
├── DESIGN.md               # Strict Design Identity & CSS specs
└── package.json            # Central script registry (dev, api:dev, docker:up, electron:start)
```

---

## 🚗 Core System Workflows

### 1. Loan Creation (Pawn)
A user enters a customer or uses facial recognition `FaceSearch.tsx`. Once the customer is loaded, the item properties are assessed. A `POST /pawns` request is made. The backend creates a record in `customers` (if new), an `items` record, a `pawns` record, and importantly, an initial `cash_transactions` entity representing the `PAWN` ledger entry.

### 2. Adjustments & Interest Payments
Payments made are strictly layered into the `cash_transactions` to calculate balances dynamically. The API recalculates current principals dynamically via the helper function `currentPrincipalByPawnId()` mapping across the immutable log (`type = 'PLUS_AMOUNT' / 'MINUS_AMOUNT'`).

### 3. Redemptions
When redeeming a pawn via `POST /pawns/:id/redeem`, the system marks the item as `REDEEMED`, closes out the timeline, and pushes both a `REDEEM_BA` (Base Amount) and `REDEEM_I` (Interest Amount) into the log.

> [!TIP]
> **API Contracts**
> Since the project is structured to share types, both Web and Mobile teams can trust the output payload schemas declared in `shared/contracts/ipc.ts`.

---

## 🚀 Development Quick Start

The repository embraces Docker for local API hosting.

1. **Start dependencies and backend**: 
   `npm run docker:up` (Boots a local postgres, and builds the API container).
2. **Start the Electron app & UI watcher**:
   `npm run electron:dev`
3. **Start Mobile (Parallel terminal)**:
   Navigate to `mobile-react-native/` and execute `npm start` to fire the Expo Bundler. Update `EXPO_PUBLIC_API_URL` to hit the LAN IP mapping to your computer (`http://<YOUR_IP>:8787`).
