⏺ Effect-TS Service Implementation Checklist

Each service follows this pattern: Types → Interface → Implementation → Layer →
Integration, maintaining functional purity while managing real-world side
effects through the Effect system.

1. Define Domain Types & Errors: Create pure TypeScript interfaces for your
   domain models and custom error classes with \_tag discriminators. Keep these
   in a separate file (e.g., FlagService.ts) for clean separation.
2. Define the service contract as an interface with methods returning
   Effect.Effect<Success | DifferentSuccess, Error | DifferentError, never>. The
   never indicates dependencies are resolved internally.
3. Implement Core Business Logic: Write pure functions using
   Effect.gen(function* () { ... }) that access dependencies via yield*. Keep
   these functions focused on single responsibilities.
4. Integrate External Services: For third-party APIs, use Effect.tryPromise() to
   convert promises to Effects, providing structured error handling with your
   domain errors.
5. Compose Service Layer: Create the live implementation using Layer.effect()
   that yields dependencies and returns a service record satisfying the
   interface.
6. Wire Dependencies: Chain layers using .pipe(Layer.provide(...)) to inject
   required services into your service layer.
7. Implement Error Recovery: Add retry logic with Effect.retry() and timeout
   policies where appropriate. Use Effect.catchTag() for specific error handling
   branches.
8. Add Observability: Include structured logging within Effect flows and
   consider adding spans for tracing. Use Effect.tap() for side effects like
   logging without affecting the flow.

Use [EFFECT_REFERENCE.md](./EFFECT_REFERENCE.md) when you're planning change to
existing Effects, or designing something new.

Much of the Effect-TS docs are
[online in a compacted form](https://effect.website/llms-small.txt). The
unabridged versions of the documentation are
[indexed here](https://effect.website/llms.txt); you can retrieve a URL with
more detailed information from there.
