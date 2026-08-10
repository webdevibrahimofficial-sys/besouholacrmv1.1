# Besouhola Copilot Support Matrix

Date: 2026-08-10
Status: Current implementation snapshot for delivery review

## Scope
This matrix describes what the current Besouhola Copilot implementation supports in the codebase today.

| Area | Capability | Status | Notes |
|---|---|---|---|
| System overview | Explain CRM modules based on current user permissions | Supported | Permission-aware via `AiSystemCatalog` and `explain_feature` |
| Capabilities list | Answer questions like "What can I do?" / "Available reports" | Supported | Uses `list_capabilities` |
| Delayed leads | List delayed leads in user scope | Supported | Includes lead cards and follow-up entry flow |
| Lead task flow | Create task after confirmation | Supported | Now returns `Open lead`, `Open task`, `Open tasks` |
| Tool telemetry | Log tool result status | Supported | Logs `tool`, `status`, `user_id`, `tenant_id`, `resource` |

## Reports Matrix
| Report | Open | Filter from query params | Export from Copilot | Notes |
|---|---|---|---|---|
| Leads Pipeline | Yes | Yes | Yes | `export=1` supported |
| Meetings Report | Yes | Yes | Yes | `export=1` supported |
| Reservations Report | Yes | Yes | Yes | `export=1` supported |
| Closed Deals | Yes | Yes | Yes | `export=1` supported |
| Proposals Report | Yes | Yes | Yes | `export=1` supported |
| Customers Report | Yes | Yes | Yes | `export=1` supported |
| Cancellation Report | Yes | Yes | Yes | `export=1` supported |
| Targets & Revenue | Yes | Yes | Yes | `export=1` supported |
| Imports Report | Yes | Partial | Yes | Export deep-link supported; filter behavior depends on page inputs already implemented |
| Exports Report | Yes | Partial | Yes | Export deep-link supported; filter behavior depends on page inputs already implemented |
| Sales Activities | Yes | Partial | Not confirmed | Report can open, but Copilot export deep-link was not completed in this pass |
| Leads To Telesales | Yes | Partial | Not confirmed | Open supported from catalog; export path not finalized here |

## Permission behavior
- Report open requires report show permission.
- Report export requires both report export permission and report visibility permission.
- System/module explanations only return modules visible to the current user.
- Delayed lead and task actions respect lead visibility checks.

## Known limits
- Employee-name and stage-name resolution from Arabic natural language still needs deeper QA and hardening.
- Not every report page has been verified against a full open/filter/export permission matrix yet.
- Some reports are supported for open/export but still need stronger query-param QA coverage.

## Delivery note
This support matrix reflects the implementation state as of Monday, August 10, 2026.
