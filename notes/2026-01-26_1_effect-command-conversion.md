# Effect-Based Command Handler Conversion

Completed conversion of all async command handlers to Effect-based implementations.

## Files Modified

### Phase 1: Simple Commands
- `app/commands/demo.ts` - Converted slash + context menu commands
- `app/commands/force-ban.ts` - Converted user context menu command
- `app/commands/report.ts` - Converted message context menu command

### Phase 2: Setup Commands
- `app/commands/setupReactjiChannel.ts` - DB upsert with emoji parsing
- `app/commands/setup.ts` - Multi-step guild registration
- `app/commands/setupHoneypot.ts` - DB + Discord channel operations
- `app/commands/setupTickets.ts` - Complex 4-handler ticket system

### Phase 3: Escalation System
- `app/commands/escalationControls.ts` - Changed to EffectMessageComponentCommand[]
- `app/commands/escalate/handlers.ts` - Converted 8 handlers to pure Effect

## Pattern Applied

```typescript
// Before
const handler = async (interaction) => {
  await trackPerformance("cmd", async () => {
    log("info", "Commands", "...");
    try {
      await doSomething();
    } catch (e) {
      log("error", "Commands", "...");
    }
  });
};
export const Command = { handler, command };

// After
export const Command = {
  type: "effect",
  command: new SlashCommandBuilder()...,
  handler: (interaction) =>
    Effect.gen(function* () {
      yield* logEffect("info", "Commands", "...");
      yield* Effect.tryPromise(() => doSomething());
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* logEffect("error", "Commands", "...");
          yield* Effect.tryPromise(() =>
            interaction.reply({ content: "Error", flags: [MessageFlags.Ephemeral] })
          ).pipe(Effect.catchAll(() => Effect.void));
        })
      ),
      Effect.withSpan("commandName", { attributes: { ... } }),
    ),
} satisfies EffectSlashCommand;
```

## Key Changes
1. Removed `trackPerformance()` wrappers (Effect.withSpan replaces this)
2. Replaced `log()` with `yield* logEffect()`
3. Replaced `await` with `yield* Effect.tryPromise()`
4. Replaced try/catch with `.pipe(Effect.catchAll(...))`
5. Added `type: "effect"` discriminator
6. Used `satisfies` for type inference with proper handler types

## Notes
- `getFailure()` in `app/commands/escalate/index.ts` is still used by `escalationResolver.ts`
- Metrics calls (`commandStats`, `featureStats`) remained as synchronous side effects
- Error replies in catchAll are wrapped with `.pipe(Effect.catchAll(() => Effect.void))` to prevent cascading failures
