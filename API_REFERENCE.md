# 🔌 API Reference - Lead Date Filters

## Available Date Filter Parameters

### 1️⃣ Creation Date Filter

**Parameters:**
```
created_from: YYYY-MM-DD (optional)
created_to: YYYY-MM-DD (optional)
```

**Examples:**
```bash
# Get leads created in January 2026
GET /api/leads?created_from=2026-01-01&created_to=2026-01-31

# Get leads created after March 1, 2026
GET /api/leads?created_from=2026-03-01

# Get leads created before June 21, 2026
GET /api/leads?created_to=2026-06-21
```

**Database Column:** `leads.created_at`

---

### 2️⃣ Assign Date Filter ⭐ NEW!

**Parameters:**
```
assigned_date_from: YYYY-MM-DD (optional)
assigned_date_to: YYYY-MM-DD (optional)
```

**Examples:**
```bash
# Get leads assigned in February 2026
GET /api/leads?assigned_date_from=2026-02-01&assigned_date_to=2026-02-28

# Get leads assigned after March 15, 2026
GET /api/leads?assigned_date_from=2026-03-15

# Get leads assigned to user 5 in February
GET /api/leads?assigned_date_from=2026-02-01&assigned_date_to=2026-02-28&assigned_to=5
```

**Database Column:** `leads.assigned_at` (NEW COLUMN)

**Status:** ✅ Working (Previously broken)

---

### 3️⃣ Action Date Filter

**Parameters:**
```
action_date_from: YYYY-MM-DD (optional)
action_date_to: YYYY-MM-DD (optional)
```

**Important:** This returns ALL leads that have ANY action within the date range, not just the last one.

**Examples:**
```bash
# Get leads with actions on February 10, 2026
GET /api/leads?action_date_from=2026-02-10&action_date_to=2026-02-10

# Get leads with any activity in March 2026
GET /api/leads?action_date_from=2026-03-01&action_date_to=2026-03-31

# Even if last action is in April, will still be returned if any action in March
```

**Database Column:** `lead_actions.created_at`

**Behavior:** `whereHas('actions')` - Returns leads with matching actions

---

### 4️⃣ Last Action Date Filter

**Parameters:**
```
last_action_date_from: YYYY-MM-DD (optional)
last_action_date_to: YYYY-MM-DD (optional)
```

**Examples:**
```bash
# Get leads with last activity in March 2026
GET /api/leads?last_action_date_from=2026-03-01&last_action_date_to=2026-03-31

# Get leads NOT touched since January
GET /api/leads?last_action_date_to=2026-01-31

# Get recently active leads (last 7 days)
GET /api/leads?last_action_date_from=2026-06-14
```

**Database Column:** `leads.last_contact` (Auto-updated)

**Status:** ✅ Working (Previously inconsistent)

**Special:** Automatically updated when actions are created

---

## 🔗 Combined Filters (AND Logic)

### Multiple Filters Example

All filters are combined with **AND** logic (all conditions must be true):

```bash
# Complex query with multiple filters
GET /api/leads?
  created_from=2026-01-01&
  created_to=2026-01-31&
  assigned_date_from=2026-02-01&
  assigned_date_to=2026-02-15&
  assigned_to=5&
  last_action_date_from=2026-03-01&
  last_action_date_to=2026-03-31
```

**Result:** Only leads matching ALL conditions:
- ✅ Created between Jan 1-31
- ✅ AND assigned between Feb 1-15
- ✅ AND assigned to user 5
- ✅ AND had last activity between Mar 1-31

---

## 📋 API Response Format

### Successful Response

```json
{
  "data": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "created_at": "2026-01-15T10:30:00Z",
      "assigned_at": "2026-02-05T14:20:00Z",
      "last_contact": "2026-03-10T16:45:00Z",
      "assigned_to": 5,
      ...
    }
  ],
  "meta": {
    "total": 42,
    "per_page": 15,
    "current_page": 1,
    "last_page": 3
  }
}
```

### Key Date Fields

```json
{
  "created_at": "2026-01-15T10:30:00Z",      // When lead was created
  "assigned_at": "2026-02-05T14:20:00Z",     // When assigned to user
  "last_contact": "2026-03-10T16:45:00Z",    // Last action timestamp
  "updated_at": "2026-03-10T16:45:00Z"       // Last update
}
```

---

## 🎯 Real-World Usage Examples

### Example 1: Sales Manager Dashboard

Get all leads assigned to my team this month:

```bash
GET /api/leads?
  assigned_date_from=2026-06-01&
  assigned_date_to=2026-06-30&
  assigned_to[]=5&
  assigned_to[]=8&
  assigned_to[]=12
```

### Example 2: Follow-up Report

Get leads that need follow-up (no action in 7 days):

```bash
GET /api/leads?
  last_action_date_to=2026-06-14&
  stage=pending
```

### Example 3: New Lead Analysis

Get newly created leads:

```bash
GET /api/leads?
  created_from=2026-06-21&
  created_to=2026-06-21&
  source=website
```

### Example 4: Monthly Conversion

Get leads created this month that have been assigned and contacted:

```bash
GET /api/leads?
  created_from=2026-06-01&
  created_to=2026-06-30&
  assigned_date_from=2026-06-01&
  last_action_date_from=2026-06-01
```

### Example 5: Stale Lead Detection

Get leads not touched in 3 months:

```bash
GET /api/leads?
  last_action_date_to=2026-03-21&
  stage!=closed
```

---

## 📊 Data Type Reference

### Date Format

All date parameters must be in **YYYY-MM-DD** format:

```
✅ Correct:   2026-06-21
❌ Wrong:     06/21/2026
❌ Wrong:     2026-6-21
❌ Wrong:     21-06-2026
```

### Datetime Response

All datetime values in responses are in ISO 8601 format with UTC timezone:

```
2026-06-21T15:30:45Z
2026-06-21T15:30:45+00:00
```

---

## ⚙️ Query Optimization

### Best Practices

1. **Use specific date ranges** (better performance):
```bash
✅ GET /api/leads?created_from=2026-06-01&created_to=2026-06-30
❌ GET /api/leads (returns all - slower)
```

2. **Combine with other filters** (narrower results):
```bash
✅ GET /api/leads?assigned_date_from=2026-06-01&assigned_to=5
❌ GET /api/leads?assigned_date_from=2026-06-01 (returns all for all users)
```

3. **Limit results**:
```bash
✅ GET /api/leads?created_from=2026-06-01&per_page=10&page=1
❌ GET /api/leads?created_from=2026-06-01 (might be thousands)
```

---

## 🔍 Pagination

All date filters support pagination:

```bash
# Get page 2 of results
GET /api/leads?
  created_from=2026-06-01&
  page=2&
  per_page=20

Response includes:
{
  "data": [...],
  "meta": {
    "total": 256,
    "per_page": 20,
    "current_page": 2,
    "last_page": 13
  }
}
```

---

## 🚨 Error Handling

### Invalid Date Format

```json
{
  "message": "The created_from field must be a valid date.",
  "errors": {
    "created_from": ["The created_from field must be a valid date."]
  }
}
```

### Invalid Date Range

```json
{
  "message": "The created_from date must be before created_to.",
  "errors": {
    "created_from": ["created_from must be before created_to"]
  }
}
```

### Too Many Results

```json
{
  "message": "Please use pagination or narrow your date range.",
  "errors": {
    "filters": ["Results exceed 10000 records, please use pagination"]
  }
}
```

---

## 📱 Frontend Integration Example

### React Example

```javascript
// Get leads assigned this month
const fetchLeadsAssignedThisMonth = async () => {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  const params = new URLSearchParams({
    assigned_date_from: startOfMonth.toISOString().split('T')[0],
    assigned_date_to: endOfMonth.toISOString().split('T')[0],
  });
  
  const response = await fetch(`/api/leads?${params}`);
  return response.json();
};
```

### Vue.js Example

```javascript
// Get leads with last activity in specific month
const getLeadsWithActivity = async (month, year) => {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  
  const { data } = await axios.get('/api/leads', {
    params: {
      last_action_date_from: startDate,
      last_action_date_to: endDate,
    }
  });
  
  return data;
};
```

### JavaScript/Fetch Example

```javascript
// Combined filter example
fetch('/api/leads?' + new URLSearchParams({
  created_from: '2026-06-01',
  created_to: '2026-06-30',
  assigned_to: '5',
  last_action_date_from: '2026-06-01',
  per_page: '20'
}))
  .then(r => r.json())
  .then(data => console.log(data))
  .catch(err => console.error(err));
```

---

## 📞 API Endpoints

### Related Endpoints

```
GET /api/leads                    # List all leads with filters
GET /api/leads/:id                # Get single lead
POST /api/leads                   # Create lead
PUT /api/leads/:id                # Update lead
DELETE /api/leads/:id             # Delete lead

GET /api/leads/reports/pipeline   # Pipeline report with date filters
GET /api/leads/reports/meetings   # Meetings report with date filters
```

---

## 🎯 Filter Support Matrix

| Endpoint | created_from | assigned_date_from | action_date_from | last_action_date_from |
|----------|-------------|------------------|-----------------|---------------------|
| GET /api/leads | ✅ | ✅ | ✅ | ✅ |
| GET /api/leads/referrals | ✅ | ✅ | ✅ | ✅ |
| GET /api/reports/pipeline | ✅ | ✅ | ✅ | ✅ |
| GET /api/reports/meetings | ✅ | ✅ | ✅ | ✅ |

---

## 📝 Notes

1. All dates are stored and compared in **UTC** timezone
2. Observers automatically update timestamps - no manual updates needed
3. Combined filters use **AND** logic (all conditions must be true)
4. Action Date filter returns leads with **ANY** action in range (not just last)
5. Dates are **inclusive** (from/to dates included in results)

---

**Documentation Version:** 1.0
**Last Updated:** 2026-06-21
**API Version:** v1
**Status:** ✅ Production Ready
