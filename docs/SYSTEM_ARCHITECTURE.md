# SYSTEM ARCHITECTURE MANUAL — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Internal Technical Reference  

---

## 1. PRESENTATION LAYER
Built using React 19, Tailwind CSS v4, and Zustand state management:
*   **Desktop Shell (`apps/desktop/`)**: Runs inside Electron 33, bridging native desktop window controls, file systems, and operating system notification registers.
*   **Web Shell (`apps/web/`)**: Highly responsive Progressive Web App (PWA) incorporating service workers, responsive flexbox layers, and offline caches.

---

## 2. APPLICATION GATEWAY & ROUTING LAYER
Nginx handles ingress controls and proxies requests to backend Express nodes:
*   **SSL/TLS Termination**: Done at Nginx gateway.
*   **Rate Limiting**: Employs bucket filters inside Nginx for public endpoints.

---

## 3. APPLICATION LAYER
The Express backend server runs Node.js 20, incorporating robust modular middlewares:
*   **Authentication Middleware**: Resolves, checks, and validates JWT headers.
*   **Organization Scoping Middleware**: Implements multi-tenant logic.

---

## 4. AI KERNEL & CORE LAYER
The central intelligence coordinator:
*   **`aiRegistry`**: Standard provider abstractions routing to OpenAI, Anthropic, or local Ollama networks.
*   **Central Event Bus**: Redis-backed Pub/Sub server propagating events system-wide.
*   **Vector Storage**: Performs similarity search vectors on user queries.

---

## 5. PERSISTENCE & INFRASTRUCTURE LAYER
*   **PostgreSQL 17**: Transactional database storage mapped with Prisma.
*   **Redis 8**: Cache arrays and pub/sub message brokers.
*   **Local Caches**: Handles decoded video streams and svg conversions.
