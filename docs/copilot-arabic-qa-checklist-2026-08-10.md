# Besouhola Copilot Arabic QA Checklist

Date: 2026-08-10
Purpose: Manual Arabic QA scenarios for delivery review

## Expected pass scenarios
1. `???? ?? ???????`
Expected: Permission-aware overview of available modules only.

2. `??? ???? ???? ??????`
Expected: Capabilities summary plus quick navigation/report guidance.

3. `??? ???????? ??????? ???`
Expected: Available reports response based on current permissions.

4. `???? ????? ???????? ?? 2026-07-01 ??? 2026-07-31`
Expected: Meetings report opens with date filters applied.

5. `???? pipeline ??? ???`
Expected: Copilot returns download action and allowed user can download export.

6. `???? ?????? ????????`
Expected: Delayed lead cards appear within user visibility scope.

7. `???? ?????? ??`
Expected: Follow-up advice flow starts from chosen delayed lead card.

8. `????? ???? ?????? ???? 123`
Expected: Draft appears, requires confirmation, then task is created.

9. `??? ????? ??????`
Expected: Success response with `Open lead`, `Open task`, and `Open tasks` actions.

## Permission denial scenarios
1. Ask to open a report without `_show` permission.
Expected: Clear denial message.

2. Ask to export a report without `_export` permission.
Expected: Clear denial message and no successful download action.

3. Ask to create a task for a lead outside visibility scope.
Expected: Request is rejected.

## Regression checks
- `autoNavigate` must not interrupt download choice when a download button exists.
- Export should run once and then remove `export=1` from the page URL.
- Deep-link `task_id` should open the target task in the tasks page.
- Deep-link `lead_id` should continue opening the target lead in the leads page.

## Open QA focus
- Arabic employee names such as `????`, `????`, `????`
- Arabic stage names and mixed Arabic/English phrasing
- Relative dates like `???`, `??? 7 ????`, `??? ?????`, `??? 30 ???`

## Result tracking template
- Scenario:
- User role:
- Input:
- Expected:
- Actual:
- Pass/Fail:
- Notes:
