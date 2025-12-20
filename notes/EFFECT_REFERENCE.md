# Effect-TS Construct Decision Guide

## Quick Decision Tree

### 🚦 Start Here: What Are You Building?

```
Are you handling side effects?
├─ YES → Use Effect<A, E, R>
│  └─ Do you need dependencies?
│     ├─ YES → Use Services + Layers
│     └─ NO → Pure Effect
└─ NO → Use pure functions with Schema validation
```

### 🔄 Data Processing Decision Path

```
What kind of data are you processing?
├─ Single values → Effect.Effect
├─ Collections (transform all at once) → Array + Effect.forEach
├─ Large datasets (process incrementally) → Stream
├─ Real-time events → Stream + Sink
└─ Need backpressure control → Stream with buffers
```

### ⏰ Timing & Scheduling Decision Path

```
Do you need timing control?
├─ One-time delay → Effect.sleep
├─ Retry failed operations → Effect.retry + Schedule
├─ Repeat successful operations → Effect.repeat + Schedule
├─ Complex recurring patterns → Schedule combinators
└─ Background tasks → Effect.fork
```

## Construct Selection Matrix

| **Problem**             | **Primary Construct**       | **Supporting Constructs**   | **When to Use**                        |
| ----------------------- | --------------------------- | --------------------------- | -------------------------------------- |
| **API Calls**           | `Effect.tryPromise`         | `Schedule` for retries      | Converting promises to Effects         |
| **Database Operations** | `Effect.gen + Service`      | `Layer` for connection pool | Type-safe DB with dependency injection |
| **Configuration**       | `Config` module             | `Layer.setConfigProvider`   | Type-safe env vars with validation     |
| **Background Jobs**     | `Effect.fork`               | `Queue`, `Schedule`         | Fire-and-forget or periodic tasks      |
| **Rate Limiting**       | `Schedule.spaced`           | `Effect.repeat`             | Controlling execution frequency        |
| **Circuit Breaking**    | `Schedule.intersect`        | `Effect.retry`              | Preventing cascade failures            |
| **Event Processing**    | `Stream`                    | `Sink`, `Schedule`          | Real-time data pipelines               |
| **Resource Management** | `Effect.acquireUseRelease`  | `Scope`, `Layer`            | Safe cleanup of resources              |
| **Validation**          | `Schema`                    | `Effect.mapError`           | Input/output validation with errors    |
| **Metrics/Tracing**     | `Metric`, `Effect.withSpan` | `Layer` for providers       | Observability and monitoring           |

## Pattern Matching Guide

### Error Handling Patterns

#### ✅ **When to Use Effect.catchAll vs Effect.catchTag**

```typescript
// Use catchAll for handling any error
const handleAnyError = effect.pipe(
  Effect.catchAll((error) => Effect.succeed(defaultValue)),
);

// Use catchTag for specific error types
const handleSpecificErrors = effect.pipe(
  Effect.catchTags({
    ValidationError: (error) => Effect.succeed(correctedValue),
    NetworkError: (error) => Effect.retry(Schedule.exponential("1 second")),
  }),
);
```

**Decision Rule**: Use `catchTag` when you need different recovery strategies
per error type, `catchAll` for uniform handling.

### Concurrency Patterns

#### ✅ **Sequential vs Parallel vs Racing**

```typescript
// Sequential: One after another (dependencies)
const sequential = Effect.gen(function* () {
  const user = yield* getUser(id);
  const profile = yield* getProfile(user.profileId); // Depends on user
  return { user, profile };
});

// Parallel: Independent operations
const parallel = Effect.gen(function* () {
  const [user, settings] = yield* Effect.all([getUser(id), getSettings(id)], {
    concurrency: "unbounded",
  });
  return { user, settings };
});

// Racing: First successful result
const racing = Effect.race(getUserFromCache(id), getUserFromDB(id));
```

**Decision Rule**:

- Sequential when operations depend on each other
- Parallel when operations are independent
- Racing when you want the fastest successful result

### Data Processing Patterns

#### ✅ **Array vs Stream vs Sink**

```typescript
// Array processing: Small, finite datasets
const processArray = (items: Item[]) =>
  Effect.forEach(items, processItem, { concurrency: 5 });

// Stream processing: Large, potentially infinite data
const processStream = Stream.fromIterable(items).pipe(
  Stream.mapEffect(processItem),
  Stream.buffer(100), // Backpressure control
  Stream.run(Sink.collectAll()),
);

// Sink usage: Custom accumulation logic
const customSink = Sink.fold(
  0, // Initial state
  (sum, n) => sum < 100, // Continue condition
  (sum, n) => sum + n, // Accumulator
);
```

**Decision Rule**:

- Array processing for < 1000 items
- Stream for large datasets or real-time processing
- Custom Sinks when you need specialized accumulation

## Service Architecture Decision Guide

### 🏗️ Service Design Patterns

#### Simple Service (No Dependencies)

```typescript
// Use when: Pure business logic, no external dependencies
interface ICalculatorService {
  readonly add: (a: number, b: number) => Effect.Effect<number, never, never>;
  readonly divide: (
    a: number,
    b: number,
  ) => Effect.Effect<number, DivisionByZeroError, never>;
}
```

#### Service with Dependencies

```typescript
// Use when: Needs other services, external resources
interface IUserService {
  readonly getUser: (
    id: UserId,
  ) => Effect.Effect<User, UserNotFoundError, never>;
}

export const UserServiceLive = Layer.effect(
  UserService,
  Effect.gen(function* () {
    const db = yield* DatabaseService; // Dependency injection
    const cache = yield* CacheService;
    // Implementation uses both services
  }),
);
```

#### Service with Configuration

```typescript
// Use when: Behavior varies by environment
const UserServiceLive = Layer.effect(
  UserService,
  Effect.gen(function* () {
    const config = yield* Config.struct({
      cacheEnabled: Config.boolean("CACHE_ENABLED"),
      timeout: Config.duration("USER_TIMEOUT"),
    });
    // Implementation adapts to config
  }),
);
```

### 🔧 Layer Composition Strategies

#### Merge Strategy: Independent Services

```typescript
// Use when: Services don't depend on each other
const AppLayer = Layer.mergeAll(DatabaseLive, CacheLive, MetricsLive);
```

#### Chain Strategy: Sequential Dependencies

```typescript
// Use when: Services have linear dependencies
const AppLayer = DatabaseLive.pipe(
  Layer.provide(CacheLive),
  Layer.provide(UserServiceLive),
);
```

#### Complex Dependencies: Explicit Wiring

```typescript
// Use when: Complex dependency graph
const AppLayer = Layer.make(
  DatabaseLive,
  CacheLive.pipe(Layer.provide(DatabaseLive)),
  UserServiceLive.pipe(Layer.provide(Layer.merge(DatabaseLive, CacheLive))),
);
```

## Migration Strategies

### 🔄 Converting Existing Code to Effect

#### Promise-based Code

```typescript
// Before: Promise-based
const fetchUser = async (id: string): Promise<User> => {
  const response = await fetch(`/users/${id}`);
  if (!response.ok) throw new Error("User not found");
  return response.json();
};

// After: Effect-based
const fetchUser = (id: string): Effect.Effect<User, FetchError, never> =>
  Effect.tryPromise({
    try: () =>
      fetch(`/users/${id}`).then((r) => {
        if (!r.ok) throw new Error("User not found");
        return r.json();
      }),
    catch: (error) => new FetchError(String(error)),
  });
```

#### Callback-based Code

```typescript
// Before: Callback-based
const readFileCallback = (
  path: string,
  callback: (err: Error | null, data: string) => void,
) => {
  fs.readFile(path, "utf8", callback);
};

// After: Effect-based
const readFile = (path: string): Effect.Effect<string, FileError, never> =>
  Effect.async<string, FileError>((resume) => {
    fs.readFile(path, "utf8", (err, data) => {
      if (err) resume(Effect.fail(new FileError(err.message)));
      else resume(Effect.succeed(data));
    });
  });
```

#### Class-based Services

```typescript
// Before: Class-based
class UserService {
  constructor(
    private db: Database,
    private cache: Cache,
  ) {}

  async getUser(id: string): Promise<User> {
    // Implementation
  }
}

// After: Effect service
interface IUserService {
  readonly getUser: (id: string) => Effect.Effect<User, UserError, never>;
}

const UserService = Context.GenericTag<IUserService>("UserService");

const UserServiceLive = Layer.effect(
  UserService,
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const cache = yield* CacheService;

    return {
      getUser: (id: string) =>
        Effect.gen(function* () {
          // Implementation using db and cache
        }),
    };
  }),
);
```

## Anti-Patterns to Avoid

### ❌ **Don't: Nested Effect.runPromise**

```typescript
// Wrong
const badExample = Effect.gen(function* () {
  const result = yield* Effect.tryPromise(async () => {
    const data = await Effect.runPromise(someEffect); // DON'T DO THIS
    return processData(data);
  });
});

// Right
const goodExample = Effect.gen(function* () {
  const data = yield* someEffect;
  const result = yield* processDataEffect(data);
  return result;
});
```

### ❌ **Don't: Create Services in Business Logic**

```typescript
// Wrong
const badUserFunction = Effect.gen(function* () {
  const db = new DatabaseService(); // DON'T CREATE SERVICES HERE
  return yield* db.getUser("123");
});

// Right
const goodUserFunction = Effect.gen(function* () {
  const db = yield* DatabaseService; // USE DEPENDENCY INJECTION
  return yield* db.getUser("123");
});
```

### ❌ **Don't: Ignore Error Types**

```typescript
// Wrong - loses error information
const badErrorHandling = effect.pipe(
  Effect.catchAll(() => Effect.succeed(null)),
);

// Right - handle errors appropriately
const goodErrorHandling = effect.pipe(
  Effect.catchTags({
    NetworkError: () => Effect.retry(Schedule.exponential("1 second")),
    ValidationError: (error) => Effect.fail(new UserFacingError(error.message)),
  }),
);
```

### ❌ **Don't: Use Effect for Pure Computations**

```typescript
// Wrong - unnecessary Effect wrapper
const addNumbers = (
  a: number,
  b: number,
): Effect.Effect<number, never, never> => Effect.succeed(a + b);

// Right - keep pure functions pure
const addNumbers = (a: number, b: number): number => a + b;

// Use Effect when you actually have effects
const addNumbersWithLogging = (
  a: number,
  b: number,
): Effect.Effect<number, never, never> =>
  Effect.gen(function* () {
    yield* Effect.log(`Adding ${a} + ${b}`);
    return a + b;
  });
```

## Quick Reference Charts

### 🎯 **Effect Constructors Quick Pick**

| **Need**          | **Use**             | **Example**                                    |
| ----------------- | ------------------- | ---------------------------------------------- |
| Pure value        | `Effect.succeed`    | `Effect.succeed(42)`                           |
| Pure error        | `Effect.fail`       | `Effect.fail(new MyError())`                   |
| Sync side effect  | `Effect.sync`       | `Effect.sync(() => Math.random())`             |
| Async side effect | `Effect.tryPromise` | `Effect.tryPromise(() => fetch(url))`          |
| Conditional logic | `Effect.if`         | `Effect.if(condition, thenEffect, elseEffect)` |
| Loop with effects | `Effect.loop`       | `Effect.loop(state, condition, update)`        |

### ⚡ **Schedule Quick Pick**

| **Pattern**         | **Schedule**                         | **Use Case**                |
| ------------------- | ------------------------------------ | --------------------------- |
| Fixed delay         | `Schedule.fixed("1 second")`         | Polling, heartbeats         |
| Exponential backoff | `Schedule.exponential("100 millis")` | Retry with increasing delay |
| Limited attempts    | `Schedule.recurs(5)`                 | Max retry count             |
| Fibonacci delays    | `Schedule.fibonacci("100 millis")`   | Gradual backoff             |
| Cron-like           | `Schedule.cron("0 */15 * * * *")`    | Scheduled tasks             |
| Jittered            | `Schedule.jittered()`                | Avoid thundering herd       |

### 🌊 **Stream Processing Quick Pick**

| **Data Source** | **Create With**             | **Process With**                   |
| --------------- | --------------------------- | ---------------------------------- |
| Array           | `Stream.fromIterable`       | `Stream.map`, `Stream.filter`      |
| Async iterator  | `Stream.fromAsyncIterable`  | `Stream.mapEffect`                 |
| Events          | `Stream.async`              | `Stream.buffer`, `Stream.debounce` |
| Intervals       | `Stream.repeatEffect`       | `Stream.take`, `Stream.takeWhile`  |
| File lines      | `Stream.fromReadableStream` | `Stream.transduce`                 |

### 🏛️ **Layer Composition Quick Pick**

| **Relationship** | **Combinator**   | **Example**                 |
| ---------------- | ---------------- | --------------------------- |
| Independent      | `Layer.merge`    | `Layer.merge(A, B)`         |
| Sequential       | `Layer.provide`  | `B.pipe(Layer.provide(A))`  |
| Multiple         | `Layer.mergeAll` | `Layer.mergeAll(A, B, C)`   |
| Conditional      | `Layer.if`       | `Layer.if(condition, A, B)` |

## Decision Checklist

### ✅ **Before You Code**

- [ ] Do I need side effects? → Use Effect
- [ ] Do I need dependencies? → Use Services + Layers
- [ ] Do I need configuration? → Use Config module
- [ ] Do I need error recovery? → Define error types + Schedule
- [ ] Do I need observability? → Add Metrics + Spans
- [ ] Am I processing large data? → Consider Stream
- [ ] Do I need resource cleanup? → Use acquireUseRelease or Scope

### ✅ **Code Review Checklist**

- [ ] All effects are properly typed with error types
- [ ] Services use dependency injection, not direct instantiation
- [ ] Resources are cleaned up (no leaks)
- [ ] Error handling is specific, not generic `catchAll`
- [ ] Retry policies are appropriate for the operation
- [ ] Pure functions stay pure (no unnecessary Effects)
- [ ] Configuration is externalized and validated
- [ ] Operations are instrumented for observability

## Conclusion

Effect-TS provides powerful primitives, but choosing the right construct for
each situation is crucial for maintainable, performant code. Use this guide to:

1. **Start with the decision trees** to quickly narrow your options
2. **Consult the selection matrix** for specific problem-construct mappings
3. **Follow the patterns** shown for common scenarios
4. **Avoid the anti-patterns** that lead to brittle code
5. **Use the checklists** to verify your design decisions

Remember: Effect shines when you embrace its functional paradigm and leverage
its type system to catch errors at compile time rather than runtime.
