# Meeting Workflow In Add Action

## Current review result

The meeting workflow is mostly backend-driven now, but it is not 100% backend-only yet.

### Backend is now the source of truth for

- Validating that Meeting actions always include next action date/time.
- Normalizing `meeting_status` values into `scheduled`, `done`, `no_show`, or `cancelled`.
- Applying meeting lifecycle fields such as:
  - `arranged_at`
  - `scheduled_at`
  - `done_at`
  - `missed_at`
  - `meeting_status_changed_at`
  - `doneMeeting`
- Recording meeting actions and audit rows through `MeetingActionService`.

### Evidence in backend

- `api/app/Services/MeetingActionService.php`
  - `validateNextActionDate()` line 17
  - `normalizeMeetingStatus()` line 32
  - `applyMeetingStatus()` line 64
  - `recordAction()` line 96
- `api/app/Http/Controllers/LeadActionController.php`
  - meeting service is injected in constructor line 29
  - store flow delegates validation/normalization/application to service around lines 946-950
  - meeting creation delegates to `recordAction()` around lines 1195-1202

## Important review note

There is still frontend decision logic related to Meeting behavior inside `frontend/src/components/AddActionModal.jsx`, so we should not describe the frontend as "display-only" yet.

### Frontend logic that still exists

- Stage UI behavior is interpreted in frontend through `getStageUiBehavior()` at line 81.
- Meeting result selection (`done` / `no_show`) is set in frontend through:
  - `meetingStatuses` line 1050
  - `handleStatusChange()` line 1055
- Quick scheduling buttons still decide and write date/time values in frontend:
  - `handleQuickTimeSelect()` line 1260
- Frontend auto-defaults meeting status to `scheduled` before submit if user did not choose one:
  - lines 1564-1566
- Frontend still derives meeting mode for rendering from client-side conditions:
  - `isMeetingStage` line 1710
  - `isMeetingAction` lines 1715-1718

## Very important backend note

The old complex meeting-locking / correction logic inside `LeadActionController` is currently disabled, not active.

### Evidence

- The old branches are wrapped with `if (false && ...)` around:
  - line 992
  - line 1141
  - line 1159
- Helper methods related to that old logic are now stubs returning empty/default values:
  - `loadRecentMeetingActions()` line 95
  - `meetingKeyFromDetails()` line 100
  - `maxFinalRankForMeetingKey()` line 110
  - `findLatestActionForMeetingKey()` line 115
  - `isMeetingCorrectionRequested()` line 120
  - `applyMeetingCloseNextAction()` line 125

This means:

- The dead locking logic is no longer enforcing behavior.
- The current active flow is the simplified service-based create/update behavior.
- If we want "all business decisions in backend", we should either:
  - move remaining frontend defaults into backend contracts, or
  - keep them in frontend but document them as UI-layer behavior.

## New workflow summary

### 1. User opens Add Action

- Frontend loads stages from `/api/stages`.
- Stage metadata may include `ui_behavior`.
- Frontend uses that to decide what inputs to show.

### 2. User selects Meeting stage/action

- Frontend shows Meeting-specific fields such as:
  - meeting type
  - meeting location
  - schedule date/time
  - optional final result buttons: `Meeting Done` or `No Show`

### 3. Frontend sends request

- Payload still includes raw meeting-related fields, such as:
  - `type`
  - `next_action_type`
  - `date`
  - `time`
  - `meeting_status`
  - `doneMeeting`
  - notes / description

### 4. Backend applies the real meeting rules

- `LeadActionController@store` detects that the action is a Meeting action.
- It calls `MeetingActionService` to:
  - validate schedule presence
  - normalize status
  - enrich details with lifecycle timestamps
- Then backend persists the final meeting action through `recordAction()`.

### 5. Audit trail

- Backend writes an audit row through `writeMeetingAudit()` when supported by tenant schema.

## What I would tell the engineer

The new Meeting workflow is already centered in backend service code, but there are still frontend-side Meeting decisions in `AddActionModal.jsx`. So the accurate statement is:

"Meeting persistence and lifecycle normalization are backend-driven now, while some UI-level Meeting defaults and state selection still exist in frontend."

## Recommended next cleanup

If we want a strict backend-only decision model, the next cleanup should be:

- Stop defaulting `meeting_status` in frontend.
- Stop deriving Meeting mode from ad hoc frontend checks where possible.
- Let backend return explicit stage/action behavior contracts for rendering.
- Remove the dead stubbed meeting-locking code from `LeadActionController` entirely once we are sure no update path still depends on it.
