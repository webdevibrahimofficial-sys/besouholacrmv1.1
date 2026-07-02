# Lead Management Module

Final, code-confirmed handoff for Flutter integration.

## 1. Scope

This document reflects the current implemented behavior in the codebase for:

- lead lifecycle
- stages
- lead actions
- transfer / reassignment
- duplicate handling
- referral supervision constraints
- role-sensitive visibility
- primary API endpoints used by mobile

It is intentionally limited to behavior confirmed in backend and frontend source.

## 2. Core Entities

### `leads`

Primary lead record. Important fields for mobile:

- `id`
- `name`
- `phone`
- `email`
- `source`
- `stage`
- `status`
- `assigned_to`
- `manager_id`
- `sales_person`
- `attachments`
- `meta_data`
- `last_action_at`
- `permissions`
- `display_stage` from list/stat APIs where applicable

### `stages`

Tenant-specific stage definitions.

Important fields:

- `id`
- `name`
- `name_ar`
- `type`
- `order`
- `color`
- `icon`
- `delay_time`
- `notify_time`

### `lead_actions`

Timeline entries representing operational movement on the lead.

Important fields:

- `id`
- `lead_id`
- `user_id`
- `action_type`
- `description`
- `stage_id_at_creation`
- `next_action_type`
- `details`
- `created_at`

## 3. Important Technical Rule

`leads.stage` is stored as text, not as a foreign key.

When `stage_id` is submitted in `POST /api/lead-actions`, backend resolves the stage name from `stages` and writes the stage name into `leads.stage`.

This means:

- mobile should fetch stage definitions from API
- mobile should not assume fixed stage IDs
- mobile should not assume `leads.stage` always maps perfectly back to a current stage row by ID

## 4. Lead Creation

Primary creation endpoint:

- `POST /api/leads`

Other intake sources also exist:

- `POST /api/p/{slug}/lead`
- `POST /api/intake/website/{apiKey}`
- imports and external webhook-driven flows

### Confirmed lead creation behavior

- If no explicit business stage is provided, backend normalizes the lead into `New Lead`.
- Phone is normalized before persistence.
- Source is validated against tenant sources when provided.
- Duplicate detection may mark the lead as:
  - `status = duplicate`
  - `stage = Duplicate`
- If a Sales Person creates a lead with no assignee, backend may self-assign the lead to that sales user.
- If rotation is enabled and conditions match, backend may auto-assign the lead.

## 5. Stages

Stages are dynamic per tenant.

Primary endpoint:

- `GET /api/stages`

Stage `type` is operationally important because it drives UI and behavior:

- `follow_up`
- `meeting`
- `proposal`
- `reservation`
- `closing_deals`
- `rent`
- `cancel`

Mobile should build stage-driven UI from API data, not from hardcoded stage assumptions.

## 6. `status` vs `stage` vs `display_stage`

### `status`

General lifecycle state. Common values used by current code:

- `new`
- `pending`
- `duplicate`

### `stage`

Stored business stage text on the lead itself.

Examples:

- `New Lead`
- `Cold Calls`
- `Meeting`
- `Proposal`
- `Reservation`
- `Closing Deal`
- `Duplicate`

### `display_stage`

Computed visibility stage returned by list/stat flows for display purposes.

This is role- and context-sensitive.

Confirmed behavior includes:

- assigned leads with no actions can be shown as `pending` depending on user context
- managers can see a virtual pending state in cases where the assignee has not yet acted
- sales users should rely on backend-provided display behavior instead of recalculating it locally

Mobile rule:

- use `display_stage` in lead lists / boards when returned
- use `stage` in details/edit context

## 7. Lead Action is the Main Workflow Engine

Primary endpoint:

- `POST /api/lead-actions`

Minimal confirmed payload shape:

```json
{
  "lead_id": 123,
  "type": "meeting",
  "status": "pending",
  "date": "2026-07-05",
  "time": "14:00",
  "stage_id": 3,
  "next_action_type": "proposal",
  "meeting_status": "scheduled"
}
```

### Important fields

- `lead_id`
- `type`
- `status`
- `date`
- `time`
- `description`
- `notes`
- `outcome`
- `stage_id`
- `next_action_type`
- extra business fields inside `details`

### Confirmed action types in use

- `call`
- `follow_up`
- `meeting`
- `proposal`
- `reservation`
- `closing_deals`
- `rent`
- `cancel`
- `comment`
- `note`
- `internal_comment`

## 8. Confirmed Backend Effects of Creating an Action

When `POST /api/lead-actions` succeeds, backend may do one or more of the following:

- validate permission to act on the lead
- block unauthorized non-owner users from full actions, while still allowing comments/notes in limited cases
- if `stage_id` exists:
  - resolve the stage row
  - update `leads.stage`
- if current assignee is acting on a lead whose `status = pending`:
  - update lead `status` to `new`
- create or update meeting state
- create revenue on closing if closing revenue exists
- reserve inventory/property on reservation flows
- mark older pending scheduled actions as `superseded` in some cases
- send notifications to assignee / configured recipients

## 9. Meetings Workflow

Meetings are not a separate module endpoint. They are `lead_actions` with meeting semantics.

Relevant fields:

- `type = meeting` or `next_action_type = meeting`
- `meeting_status`
- `date`
- `time`
- `meetingType`
- `meetingLocation`

Confirmed meeting statuses:

- `scheduled`
- `done`
- `no_show`
- `cancelled`

### Confirmed constraints

- cannot create a new scheduled meeting while another open scheduled meeting exists for the same lead
- cannot mark `done` or `no_show` unless there is an open scheduled meeting to close
- meeting correction / reopen is restricted
- missed meeting count is tracked on the lead
- warnings are added when missed meetings become high

Mobile should expect `422` responses for invalid meeting state transitions.

## 10. Reservation Workflow

Reservation happens through `lead_actions`.

Relevant fields may include:

- `reservationType`
- `reservationProject`
- `reservationUnit`
- `reservationAmount`
- `reservationNotes`

Confirmed backend behavior:

- reservation can reserve a related property/unit
- hold duration may depend on CRM settings
- if no hold duration is configured, reservation may remain open-ended

## 11. Closing Workflow

Closing also happens through `lead_actions`.

Typical action type:

- `closing_deals`

Relevant fields:

- `closingRevenue`

Confirmed backend behavior:

- revenue record may be created automatically
- reserved unit/property may be marked sold when resolution succeeds

## 12. Cancel Workflow

Cancel is represented as a lead action, not a dedicated lead-delete workflow.

Typical action type:

- `cancel`

Relevant fields:

- `cancelReason`
- `notes`

## 13. Transfer / Reassignment

Primary endpoint:

- `POST /api/leads/{id}/transfer`

Confirmed request fields:

- `assigned_to`
- `stage`
- `history_option`
- optional `duplicate_id`

Confirmed accepted values:

- `stage`
  - `same_stage`
  - `new_lead`
  - `cold_calls`
- `history_option`
  - `keep_history`
  - `assign_as_new`

### Confirmed transfer behavior

- Sales Person cannot reassign leads unless elevated by role context
- reassignment scope is restricted for manager/team roles
- if transferred to `new_lead`:
  - stage becomes `New Lead`
  - status becomes `pending` when assigned
- if transferred to `cold_calls`:
  - stage becomes `Cold Calls`
  - status becomes `pending` when assigned
- if transferred with `same_stage`:
  - current stage remains, with duplicate cleanup if needed

### History behavior

If `history_option = assign_as_new`:

- old history stays in database
- new assignee's sales view hides older actions
- manager/admin-like users still see full history

Mobile should not attempt to implement this visibility rule itself. Use action API response as-is.

## 14. Duplicate Leads

Duplicate handling is built into lead creation/update and special duplicate endpoints.

Important endpoints:

- `POST /api/leads/{id}/warn-duplicate`
- `POST /api/leads/{id}/resolve-duplicate`
- `POST /api/leads/duplicates/bulk-action`

Confirmed behavior:

- duplicate is represented through lead `status` / `stage`
- permissions are stricter than normal leads
- duplicate workflows may merge or re-link data

Mobile should expect duplicate-related actions to be permission-sensitive.

## 15. Referral Supervision

Referral-related endpoints:

- `GET /api/leads/referral-index`
- `GET /api/referral-leads`
- `GET /api/leads/referral-filters`
- `GET /api/leads/referral-stats`
- `GET /api/referral-supervisors`
- `POST /api/leads/bulk-assign-referral`
- `POST /api/leads/bulk-remove-referral`

Confirmed restriction:

If user is only a referral supervisor and not the real acting owner:

- cannot fully update the lead
- cannot add normal operational actions
- cannot delete actions
- may be limited to comments / notes only

## 16. Role-Sensitive UI Guidance

The backend enforces permissions server-side. Mobile UI should still hide unsupported operations when possible.

### Sales Person

Safe screens:

- `My Leads`
- lead details
- timeline
- add action on owned lead

### Team Leader / Sales Manager / Branch Manager

Safe screens:

- `My Leads`
- `Team Leads`
- `Pending`
- `Delayed`
- pipeline-oriented list views
- lead details
- timeline
- reassignment within valid scope

### Director / Operation Manager

Safe screens:

- broader lead listing
- delayed leads
- analytics / pipeline summaries
- full lead details

### Admin / Tenant Admin / Super Admin

Safest superset:

- all leads
- duplicates
- referrals
- stages management
- attachments
- bulk operations
- advanced reporting endpoints

### Referral Supervisor

Preferred UI is read-mostly:

- lead summary
- timeline
- comments

Hide or disable:

- full edit
- transfer
- stage change
- full operational actions

## 17. Lead Listing Endpoints

Primary endpoint:

- `GET /api/leads`

Important supported query inputs include:

- `stage`
- `stage[]`
- `status`
- `assigned_to`
- `manager_id`
- `view_type`
- `page`
- `per_page`
- `sort_by`
- `sort_order`

Other analytics endpoints:

- `GET /api/leads/stats`
- `GET /api/leads/analysis`
- `GET /api/leads/pipeline-analysis`
- `GET /api/leads/pipeline-report`
- `GET /api/leads/delayed`
- `GET /api/leads/meetings-report`
- `GET /api/leads/reassignment-report`

## 18. Lead Action Endpoints

- `GET /api/lead-actions?lead_id={id}`
- `POST /api/lead-actions`
- `GET /api/lead-actions/{id}`
- `PUT /api/lead-actions/{id}`
- `DELETE /api/lead-actions/{id}`
- `GET /api/lead-actions/activity-report`

Useful action filters:

- `lead_id`
- `type`
- `next_action_type`
- `date_from`
- `date_to`
- `scheduled_date_from`
- `scheduled_date_to`

## 19. Stage Endpoints

- `GET /api/stages`
- `POST /api/stages`
- `GET /api/stages/{id}`
- `PUT /api/stages/{id}`
- `DELETE /api/stages/{id}`
- `POST /api/stages/reorder`

Reorder payload:

```json
{
  "stages": [
    { "id": 1, "order": 1 },
    { "id": 2, "order": 2 }
  ]
}
```

## 20. Attachments / Recycle / Bulk

Important endpoints:

- `POST /api/leads/{id}/attachments`
- `GET /api/leads/recycle`
- `POST /api/leads/recycle/{id}/restore`
- `POST /api/leads/bulk-assign`
- `POST /api/leads/bulk-status`
- `POST /api/leads/bulk-delete`
- `POST /api/leads/bulk-restore`
- `POST /api/leads/bulk-force-delete`
- `POST /api/leads/bulk-import`

## 21. Mobile Rules to Follow

- do not hardcode stages or stage IDs
- use `GET /api/stages`
- use backend-provided `display_stage` where present
- use `POST /api/lead-actions` as the main journey-changing operation
- use `POST /api/leads/{id}/transfer` for reassignment
- handle `403` even if UI hides buttons
- handle `422` especially for meetings and constrained workflows
- do not recalculate pending logic or hidden-history logic locally

## 22. Practical Lead Journey

```text
1. Lead enters the system
2. Lead may be unassigned, self-assigned, manually assigned, or rotation-assigned
3. Lead appears with stage/status context based on backend rules
4. Assignee performs first action
5. Backend may move status from pending -> new
6. Action may also update stage through stage_id
7. Further actions continue the operational journey:
   follow-up / meeting / proposal / reservation / closing / cancel
8. Transfer can reset or preserve history visibility depending on request
9. Duplicate and referral cases apply additional restrictions
```

## 23. Final Summary

The current implementation is centered around three things:

- `leads` as the main entity
- `stages` as tenant-defined workflow configuration
- `lead_actions` as the real operational timeline

For Flutter integration, the safest rule set is:

- list with backend-provided display behavior
- detail with true stored lead values
- journey changes through lead actions
- reassignment through transfer endpoint
- permission handling always delegated to backend
