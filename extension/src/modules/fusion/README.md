# Fusion Module (`modules/fusion`)

The **Fusion Module** integrates head-tracking pointer coordinates with speech recognition to enable intentional, safe, and low-effort browser interaction.

## Architecture

1. **Target Resolver (`target-resolver.ts`)**:
   - Hit tests the actionable DOM element at current cursor coordinates.
   - Climbs parent nodes from icons/spans up to button/link/input elements.
   - Filters out hidden, disabled, or zero-sized elements.
   - Classifies consequence risk tiers:
     - `low`: standard clicks, toggles, scrolls.
     - `moderate`: page navigation, external links.
     - `high`: forms, delete/purchase/pay/submit actions.

2. **Intent Filter (`intent-filter.ts`)**:
   - Single authoritative validation gate before any action executes.
   - Validates application state (rejects during paused or lost tracking states).
   - Enforces target stability threshold (default: 150ms).
   - Enforces bounded temporal fusion window (default: 2500ms).
   - Enforces duplicate command suppression and idempotency tokens (`exec_*`).
   - Requires explicit confirmation for high-risk actions.

3. **Fatigue & Interaction-Effort Management (`fatigue-manager.ts`)**:
   - Measures observable interaction-strain indicators (session duration, rapid target slips, command rejections, repeat clicks).
   - States: `NORMAL`, `EFFORT_ELEVATED`, `BREAK_SUGGESTED`, `PAUSED`.
   - Offers conservative adaptations (break suggestion, recalibration offer, smoothing increase) with hysteresis.
   - Never lowers safety standards or bypasses confirmation when fatigue is detected.

4. **Fusion Engine (`fusion-engine.ts`)**:
   - Central finite state machine:
     `IDLE` → `TARGET_ACQUIRED` → `COMMAND_RECOGNIZED` → `VALIDATING_INTENT` → `AWAITING_CONFIRMATION` → `EXECUTING`
   - Target locking policy: locks the acquired target so head jitter during speaking never redirects the action.
   - Supports voice confirmation ("Confirm" / "Yes" / "Theek hai") and voice cancellation ("Cancel" / "Never mind" / "Ruk jao").
