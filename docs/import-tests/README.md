# Excel Import Test Pack

Files:

- `excel-import-operational-stages-real-estate.csv`
- `excel-import-operational-stages-general.csv`

Before import:

1. Replace `REPLACE_WITH_REAL_PROJECT` with a real project name from the tenant.
2. Replace `REPLACE_WITH_REAL_ITEM` with a real item name from the tenant.
3. Replace `REPLACE_WITH_SALES_PERSON` with an existing sales person name or user id.
4. Convert the CSV to `.xlsx` if you want to use the current upload input directly.

Expected result after import:

- `Meeting` row: lead created, stage saved, `meeting` action auto-generated.
- `Proposal` row: lead created, stage saved, `proposal` action auto-generated.
- `Reservation` row:
  - real estate tenant: `reservation` action + `real_estate_requests` record
  - general tenant: `reservation` action + `inventory_requests` record
- `Rent` row: lead created, stage saved, `rent` action auto-generated.
- `Check In` row: lead created, stage saved, `visit` record auto-generated.

Suggested verification:

1. Import the file.
2. Open `Lead Management` and confirm the 5 leads exist.
3. Open `Reports` and verify:
   - `Meetings Report` includes the meeting lead
   - `Proposals Report` includes the proposal lead
   - `Reservations Report` includes the reservation lead
   - `Rent Report` includes the rent lead
   - `Check In Report` includes the check-in lead

Notes:

- If project/item name does not exist in the tenant, the row will be skipped.
- If stage name does not exist in the tenant stages table, the row will be skipped.
- Auto-generated records are tagged internally with `source=excel_import` and `auto_generated=true`.
