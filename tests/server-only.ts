// Vitest runs billing modules in Node. Next.js replaces `server-only` with its
// server condition during application builds; this no-op keeps that marker
// testable without weakening the production boundary.
export {};
