# Flutter FCM Handoff

## Overview
- Use these endpoints to register and remove mobile FCM tokens per authenticated user.
- Existing web notifications (`database` + `broadcast` + web push) continue to work unchanged.
- Mobile push is sent automatically when a database notification is created and user notification preferences allow app notifications.

## Required Headers
- `Authorization: Bearer {sanctum_token}`
- `X-Tenant-Id: {tenant_slug}`
- `Accept: application/json`

## Register Device Token
- `POST /api/device-tokens`

### Request Body
```json
{
  "token": "FCM_TOKEN",
  "platform": "android",
  "device_name": "Samsung A52"
}
```

### Success Response
```json
{
  "message": "Device token saved successfully"
}
```

### When Flutter Should Call
- right after login
- whenever Firebase issues a token refresh
- whenever the app detects the token changed

## Delete Device Token
- `DELETE /api/device-tokens`

### Request Body
```json
{
  "token": "FCM_TOKEN"
}
```

### Success Response
```json
{
  "message": "Device token deleted successfully"
}
```

### When Flutter Should Call
- on logout
- when user disables push on the device

## Test Notification Endpoint
- `POST /api/device-tokens/test-notification`
- available only in non-production environments

### Request Body
```json
{
  "title": "Lead Assigned",
  "body": "A new lead has been assigned to you",
  "data": {
    "type": "lead_assigned",
    "screen": "lead_details",
    "lead_id": "123"
  }
}
```

## FCM Payload Shape
```json
{
  "title": "Lead Assigned",
  "body": "A new lead has been assigned to you",
  "data": {
    "type": "lead_assigned",
    "screen": "lead_details",
    "lead_id": "123",
    "entity_id": "123"
  }
}
```

## Notes For Flutter
- all `data` values are strings
- use `type` and `screen` for navigation decisions
- use `entity_id` or specific ids such as `lead_id` for detail screens
- backend currently resolves `X-Tenant-Id` using the tenant slug in middleware, so pass the same tenant slug your app already uses
