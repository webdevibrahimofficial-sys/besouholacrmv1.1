# Flutter Mobile Push Handoff

## Overview
- Use these endpoints to register and remove mobile push tokens per authenticated user.
- Existing web notifications (`database` + `broadcast` + web push) continue to work unchanged.
- Mobile push is sent automatically when a database notification is created and user notification preferences allow app notifications.
- Android devices can now register a `push_provider` of either `fcm` or `hms`.
- iOS devices continue to be delivered through Firebase Admin even if `push_provider` is omitted.

## Required Headers
- `Authorization: Bearer {sanctum_token}`
- `X-Tenant-Id: {tenant_slug}`
- `Accept: application/json`

## Register Device Token
- `POST /api/device-tokens`

### Request Body
```json
{
  "token": "DEVICE_PUSH_TOKEN",
  "platform": "android",
  "device_name": "Huawei P40",
  "push_provider": "hms"
}
```

### Allowed `push_provider` values
- `fcm`: Firebase Cloud Messaging
- `hms`: Huawei Push Kit

### Success Response
```json
{
  "message": "Device token saved successfully"
}
```

### When Flutter Should Call
- right after login
- whenever Firebase or Huawei issues a token refresh
- whenever the app detects the token changed

## Delete Device Token
- `DELETE /api/device-tokens`

### Request Body
```json
{
  "token": "DEVICE_PUSH_TOKEN"
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

## Mobile Payload Shape
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

## Routing Rules In Backend
- if `platform` is `ios`, the notification is sent through Firebase Admin
- if `push_provider` is `fcm`, the notification is sent through Firebase Admin
- if `push_provider` is `hms`, the notification is sent through Huawei Push Kit server API

## Required Backend Environment Variables
- `HUAWEI_PUSH_CLIENT_ID`
- `HUAWEI_PUSH_CLIENT_SECRET`
- optional: `HUAWEI_PUSH_OAUTH_URL`
- optional: `HUAWEI_PUSH_API_BASE_URL`

## Notes For Flutter
- all `data` values should remain string-safe for navigation logic
- use `type` and `screen` for navigation decisions
- use `entity_id` or specific ids such as `lead_id` for detail screens
- backend resolves `X-Tenant-Id` using the tenant slug in middleware, so pass the same tenant slug your app already uses
