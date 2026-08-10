# Sakhi AI

Sakhi AI is a general-purpose chat assistant for everyday users — fast, personalized conversations with support for sharing images, documents, audio, and PDFs. Built with Next.js.

## Getting Started

1. Copy the environment template and fill in the values you need:

   ```bash
   cp env.example .env.local
   ```

2. Install dependencies and start the development server:

   ```bash
   pnpm install
   pnpm dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the app by modifying files under `app/`. The page auto-updates as you edit.

## Tech Stack

- [Next.js](https://nextjs.org) (App Router, Turbopack) with TypeScript
- [Vercel AI SDK](https://sdk.vercel.ai) for model access and streaming chat
- [Firebase](https://firebase.google.com) for auth and Firestore
- [Composio](https://composio.dev) for tool/integration connections
- [Upstash QStash](https://upstash.com/docs/qstash) for scheduled/automation triggers
- [Razorpay](https://razorpay.com) for subscription billing
- [Radix UI](https://www.radix-ui.com) + Tailwind for the component layer

## Scripts

- `pnpm dev` — run the development server
- `pnpm build` — build for production
- `pnpm start` — start the production server
- `pnpm lint` — run ESLint
- `pnpm test` — run the test suite once (Vitest)
- `pnpm test:watch` — run tests in watch mode
- `pnpm tunnel` — run a Cloudflare tunnel (needed locally for QStash callbacks)

## Environment Variables

See [`env.example`](./env.example) for the full list of required and optional variables, including Firebase, AI provider keys, QStash, and Razorpay configuration.

## Deploy

This project is set up to deploy on [Vercel](https://vercel.com). Configure the environment variables above in your Vercel project settings before deploying.
