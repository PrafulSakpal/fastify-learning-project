# Project Setup (TypeScript + Fastify)

## What is it?

The minimal toolchain needed to write Fastify in TypeScript and run it: a
`package.json`, a `tsconfig.json`, and a runner. This project uses `tsx` for
development (runs `.ts` directly, restarts on change) and `tsc` for production
builds.

## Why does Fastify have it?

Fastify itself has no opinion on TypeScript — it's a plain npm package with
its own published type definitions. The "setup" here is standard Node/TS
project setup, not a Fastify-specific tool. It matters for this project
because Fastify's type inference (route params, query, body types; see
[05-request.md](05-request.md)) only works if the TypeScript setup is correct.

## How does it work?

Key files:

- **`package.json`** — declares `"type": "module"`, meaning this project uses
  native ES Modules (`import`/`export`), not CommonJS (`require`). This is why
  every local import ends in `.js` (e.g. `import { env } from './config/env.js'`)
  even though the source file is `.ts` — Node resolves ESM imports by their
  runtime (compiled) extension, not the TypeScript source extension.
- **`tsconfig.json`** — `module`/`moduleResolution: "NodeNext"` tells
  TypeScript to follow Node's ESM resolution rules (matching the `.js`
  extension requirement above). `strict: true` is on because Fastify's type
  inference is most useful under strict mode.
- **`tsx`** — a dev-only tool that runs TypeScript directly via esbuild,
  without a separate compile step. `npm run dev` uses `tsx watch` so the
  server restarts on file changes.
- **`tsc`** — the real TypeScript compiler, used for `npm run build` to
  produce plain JavaScript in `dist/` for production (`npm start`).

## Simple example

```jsonc
// package.json (relevant parts)
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js"
  }
}
```

## Application example

See [package.json](../../package.json) and [tsconfig.json](../../tsconfig.json)
in the project root, and [src/server.ts](../../src/server.ts) as the dev entry
point run by `npm run dev`.

## Important details

- `strict: true` catches real bugs early — e.g. forgetting to narrow
  `request.body` from `unknown` before using it.
- `skipLibCheck: true` avoids wasting time type-checking `node_modules`
  type declarations, which is standard for app (not library) projects.

## Common mistakes

- Mixing CommonJS (`require`) and ESM (`import`) in the same project — pick
  one; this project is 100% ESM.
- Forgetting the `.js` extension on relative imports under `NodeNext` — this
  is a compile error, not a runtime surprise, so it's caught immediately.
- Running `tsc --watch` in development instead of `tsx watch` — it works, but
  is slower and requires a separate `node --watch dist/server.js` process.

## Best practices

- Use `tsx` (or equivalent) for the fast local dev loop; use real `tsc` output
  for what actually ships to production.
- Keep `tsconfig.json` strict from the start of the project — loosening it
  later after code already relies on `any` is much harder.

## Express comparison

Express projects are commonly still CommonJS with loose or absent typing
(`@types/express` provides types, but `req.body` is `any` unless you add your
own middleware/generics). Nothing here is Express-specific — this is general
Node/TypeScript project setup, but it matters more in Fastify because Fastify
uses your types to generate runtime validation (Level 3, JSON Schema).

## Interview questions

1. Why does this project use `"type": "module"`, and what does that change?
2. Why do local imports use a `.js` extension in a TypeScript project?
3. What's the difference between `tsx` and `tsc` in this setup?

## Interview answer

> This project is a native ES Module Node app (`"type": "module"`), compiled
> with strict TypeScript targeting `NodeNext` module resolution, which mirrors
> how Node itself resolves ESM at runtime — including the requirement that
> relative imports use the compiled `.js` extension even in `.ts` source files.
> `tsx` is used for a fast, no-build dev loop, while `tsc` produces the actual
> JavaScript that ships to production via `npm run build && npm start`.
