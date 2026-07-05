# Flutter Handoff: Assign Lead Alignment With Web

Date: 2026-07-05

## Goal

This document explains the current `Assign Lead` behavior in web after the latest changes, so the Flutter Android app can match the web behavior exactly.

## Current Web Behavior Summary

The assignment flow now has 3 important rules:

1. `Clear History` is independent from stage selection.
2. `Duplicate and assign as fresh` is a separate clone flow, not a normal reassignment.
3. `Duplicate` and `Same stage` cannot be selected together.

`Clear History` can be combined with:

- `Fresh`
- `As cold call`
- `Same stage`
- `Duplicate and assign as fresh`

## UI Rules To Match In Flutter

The modal should include:

- Assignee picker
- `Assign With` toggle:
  - `Fresh`
  - `As cold call`
- Checkboxes:
  - `Duplicate and assign as fresh`
  - `Same stage`
  - `Clear History`

Selection rules:

- If `Duplicate and assign as fresh` is checked, `Same stage` must be unchecked.
- If `Same stage` is checked, `Duplicate and assign as fresh` must be unchecked.
- `Clear History` stays fully independent and does not uncheck anything else.

## Payload Mapping

Map the UI state to backend payload like this:

- If `Same stage` is checked:
  - `stage = same_stage`
- Else if `Assign With = As cold call`:
  - `stage = cold_calls`
- Else:
  - `stage = new_lead`

- If `Clear History` is checked:
  - `history_option = assign_as_new`
- Else:
  - `history_option = keep_history`

## Backend Endpoints

### 1. Single lead reassignment

Use:

`POST /api/leads/{id}/transfer`

Payload:

```json
{
  "assigned_to": 123,
  "stage": "same_stage",
  "history_option": "assign_as_new"
}
```

Valid values:

- `stage`: `same_stage` | `new_lead` | `cold_calls`
- `history_option`: `keep_history` | `assign_as_new`

### 2. Bulk assign

Use:

`POST /api/leads/bulk-assign`

Payload:

```json
{
  "ids": [1, 2, 3],
  "assigned_to": 123,
  "assign_role": "sales",
  "stage": "new_lead",
  "history_option": "keep_history"
}
```

Valid values:

- `assign_role`: `sales` | `manager`
- `stage`: `same_stage` | `new_lead` | `cold_calls`
- `history_option`: `keep_history` | `assign_as_new`

### 3. Duplicate and assign as fresh

Use:

`POST /api/leads/{id}/duplicate-as-fresh`

Payload:

```json
{
  "assigned_to": 123,
  "history_option": "assign_as_new"
}
```

Notes:

- This creates a new cloned lead.
- The original lead remains unchanged.
- The new cloned lead is assigned to the selected user.
- The cloned lead is always created as:
  - `stage = New Lead`
  - `status = pending`

## Exact Behavior To Mirror

### Normal reassignment

When using normal reassignment:

- The same lead record is updated.
- Stage behavior:
  - `Fresh` sets stage to `New Lead`
  - `As cold call` sets stage to `Cold Calls`
  - `Same stage` keeps the current stage
- For assigned sales leads, status becomes `pending`
- If `Clear History` is selected:
  - Old history is hidden only for the newly assigned salesperson view
  - History is still kept in database
  - Managers/admins can still see full history

Important:

- `Clear History` does not force stage to `New Lead`
- This was changed in the latest update

### Duplicate and assign as fresh

When using duplicate as fresh:

- A new lead is created from the original
- Original lead stays with its current assignee, stage, and history
- New lead gets:
  - selected assignee
  - `stage = New Lead`
  - `status = pending`
  - `is_duplicate_exception = true`
  - `original_lead_id = original lead id`

## Important Difference In Current Web

This is very important if Flutter needs to match web exactly:

- In bulk assignment, web already supports `Duplicate and assign as fresh` using the new endpoint.
- In single-lead reassignment from lead details, web still uses `transfer`.
- That means the web UI now exposes the new option clearly, but the single-lead flow is not yet fully switched to `duplicate-as-fresh` the same way as bulk.

So there are 2 possible implementation choices:

### Option A: Match current web literally

- Bulk assign:
  - if `Duplicate and assign as fresh` is selected, call `POST /api/leads/{id}/duplicate-as-fresh` per lead
  - otherwise call `POST /api/leads/bulk-assign`
- Single lead:
  - keep using `POST /api/leads/{id}/transfer`

### Option B: Match intended business behavior

- Bulk assign:
  - same as web
- Single lead:
  - if `Duplicate and assign as fresh` is selected, call `POST /api/leads/{id}/duplicate-as-fresh`
  - otherwise call `POST /api/leads/{id}/transfer`

If the target is "Android must be a copy of web right now", use Option A.

If the target is "Android must reflect the final intended behavior", use Option B after confirmation.

## Recommended Flutter Implementation

To stay safe and aligned:

1. Implement the same UI rules as web.
2. Keep payload mapping exactly the same.
3. Support all 3 backend flows:
   - `transfer`
   - `bulk-assign`
   - `duplicate-as-fresh`
4. Confirm with backend/web owner whether single-lead duplicate should stay as current web behavior or move to the new endpoint.

## Backend Dependency

Make sure backend migration is applied before relying on duplicate-as-fresh:

- `api/database/migrations/2026_07_05_120000_add_duplicate_exception_to_leads_table.php`

This adds:

- `is_duplicate_exception`
- `original_lead_id`

Without this migration, the duplicate-as-fresh flow is not complete.

## Quick Delivery Version For Flutter Dev

Implement `Assign Lead` in Flutter with:

- assignee picker
- `Fresh / As cold call`
- `Duplicate and assign as fresh`
- `Same stage`
- `Clear History`

Rules:

- `Duplicate` and `Same stage` cannot both be selected
- `Clear History` is independent

API:

- Single normal reassign:
  - `POST /api/leads/{id}/transfer`
- Bulk normal reassign:
  - `POST /api/leads/bulk-assign`
- Duplicate as fresh:
  - `POST /api/leads/{id}/duplicate-as-fresh`

Payload fields:

- `assigned_to`
- `stage`
- `history_option`
- `assign_role` for bulk only

Mapping:

- `Same stage` -> `stage = same_stage`
- `As cold call` -> `stage = cold_calls`
- otherwise -> `stage = new_lead`
- `Clear History` on -> `history_option = assign_as_new`
- `Clear History` off -> `history_option = keep_history`

Duplicate as fresh behavior:

- create new lead
- keep original lead unchanged
- new lead becomes `New Lead` and `pending`
