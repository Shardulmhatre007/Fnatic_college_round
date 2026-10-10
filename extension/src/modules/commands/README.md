# Commands Module

**Owner:** Frontend Agent  
**Location:** `extension/src/modules/commands/`

## Purpose

Matches transcript text against the active command grammar using fuzzy matching.
Resolves the best-matching `CommandDefinition`, extracts parameters, and dispatches
a `COMMAND_EXECUTE` message. Supports English and Hindi (Hinglish) aliases loaded
from locale files.

## Public interface

```ts
// commands/index.ts
export function matchCommand(transcript: string, locale: Locale, commands: CommandDefinition[]): CommandMatch | null;
export type { CommandMatch };
```

## Dependencies

- `shared/types.ts` (CommandDefinition, CommandAction, Locale)
- `shared/messaging.ts` (COMMAND_EXECUTE)
- `locales/en.json`, `locales/hi.json` (grammar aliases)
