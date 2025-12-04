# Shopify Webhook Setup with Amazon EventBridge

Complete guide for configuring Shopify webhooks to deliver events through Amazon EventBridge.

## Overview

This setup allows Shopify to send webhook events (like order creation, product updates, etc.) to AWS EventBridge, where they can be processed by AWS services like Lambda, SQS, or logged to CloudWatch.

---

## Prerequisites

- Shopify Partner account with an app
- AWS account with EventBridge access
- Shopify CLI installed
- App with appropriate API scopes

---

## Step 1: Create EventBridge Source in Shopify Dev Dashboard

### Actions Required:

1. Navigate to your app in **Shopify Dev Dashboard** (not Partner Dashboard)
2. Go to **Settings**
3. Scroll to **Amazon EventBridge** section
4. Click **Create source**
5. Enter the following information:
   - **AWS Account ID**: Your 12-digit AWS account ID (e.g., `848764838033`)
   - **AWS Region**: The region where you want to receive events (e.g., `ap-southeast-2`)
   - **Event source name**: A unique name for this source (e.g., `shopify-test-app-order-create-01`)
6. Click **Create**

### Important Notes:

- Each app needs its own EventBridge source
- The source name must be unique across all your apps
- Note down the source name - you'll need it for the ARN in your configuration

---

## Step 2: Associate Event Source in AWS EventBridge

### Actions Required:

1. Go to **AWS Console** > **EventBridge**
2. Navigate to **Integration** > **Partner event sources** (in left sidebar)
3. **Select the correct region** in the dropdown (must match the region from Step 1)
4. Find your Shopify event source in the list (status will be "Pending")
5. Click on the event source
6. Click **Associate with event bus**
7. The status will change from "Pending" to "Active"

### Important Notes:

- The AWS region MUST match the region you specified in Shopify
- The event source won't appear if regions don't match
- Association creates an event bus automatically with the naming pattern: `aws.partner/shopify.com/{APP_ID}/{SOURCE_NAME}`
- You need the event bus ARN for creating rules

---

## Step 3: Create EventBridge Rule

### Actions Required:

1. In AWS EventBridge, go to **Rules**
2. Select your event bus (the one created in Step 2)
3. Click **Create rule**
4. Configure the rule:
   - **Name**: Give it a descriptive name (e.g., `shopify-order-create`)
   - **Rule type**: Rule with an event pattern
   - **Event source**: EventBridge partners
   - **Partner**: Shopify
   - **Event type**: All Events (or define custom pattern)
5. Click **Next**
6. **Select target(s)**:
   - For testing: CloudWatch log group
   - For production: Lambda function, SQS queue, SNS topic, etc.
7. Click **Next** and **Create rule**

### Important Notes:

- Rules define WHERE the events go (targets)
- Multiple rules can route to different targets based on event patterns
- CloudWatch is great for testing/debugging but not for production processing
- Without a rule, events arrive at the bus but go nowhere

### Custom Event Pattern Example:

```json
{
  "source": ["aws.partner/shopify.com"],
  "detail-type": ["orders/create"]
}
```

---

## Step 4: Configure Webhook in shopify.app.toml

### Actions Required:

Add the webhook subscription to your `shopify.app.toml` file:

```toml
[webhooks]
api_version = "2025-10"

[[webhooks.subscriptions]]
topics = ["orders/create"]
uri = "arn:aws:events:ap-southeast-2::event-source/aws.partner/shopify.com/{APP_ID}/{EVENT_SOURCE_NAME}"

[access_scopes]
scopes = "write_products,read_orders"
```

### Important Notes:

- **ARN Format**: `arn:aws:events:{REGION}::event-source/aws.partner/shopify.com/{APP_ID}/{EVENT_SOURCE_NAME}`
  - `{REGION}`: AWS region (e.g., `ap-southeast-2`)
  - `{APP_ID}`: Found in the event bus name in AWS (e.g., `298666754049`)
  - `{EVENT_SOURCE_NAME}`: The name you created in Step 1 (e.g., `shopify-test-app-order-create-01`)
- **API Version**: Use a valid current version (e.g., `2025-10`, `2025-07`, `2026-01`)
  - Old versions may not be supported anymore
  - Check valid versions with: `shopify app webhook trigger --help`
- **Topics**: Use kebab-case format (e.g., `orders/create`, `products/update`)
- **Scopes**: Some webhook topics require specific API scopes
  - `orders/create` requires `read_orders` or `read_marketplace_orders`
  - Check [Webhooks Reference](https://shopify.dev/docs/api/webhooks) for scope requirements

---

## Step 5: Request Protected Customer Data Access

### When Required:

If your webhook topic requires protected customer data scopes (like `read_orders`, `read_customers`), you MUST request access.

### Actions Required:

1. Go to **Partner Dashboard** (partners.shopify.com)
2. Navigate to your app
3. Look for **API access** or **Configuration** in left sidebar
4. Find **Protected customer data access**
5. Select appropriate reason (e.g., "Store management")
6. Fill out **only the first step**
7. Click **Save**

### Important Notes:

- This is required even for development stores
- You don't need to complete the full submission process for dev
- For production apps, you'll need to complete all compliance steps
- After saving, you MUST reinstall the app in your dev store

---

## Step 6: Install/Reinstall App and Run Dev Server

### Actions Required:

1. If you changed scopes, **uninstall and reinstall** the app in your dev store
2. Run `shopify app dev` in your terminal
3. The webhook subscription will be automatically created/updated

### Important Notes:

- Webhook subscriptions update automatically when `shopify app dev` is running and you save the TOML file
- If you see scope errors, ensure you completed Step 5 and reinstalled the app
- Check terminal output for webhook registration confirmation

---

## Step 7: Test the Webhook

### Method 1: Create Real Event in Dev Store

1. Perform the action that triggers the webhook (e.g., create an order)
2. Check AWS CloudWatch > Log groups > Your event bus log group
3. Verify the webhook payload appears

### Method 2: Use Shopify CLI Trigger

```powershell
shopify app webhook trigger --topic orders/create --api-version 2025-10 --address arn:aws:events:ap-southeast-2::event-source/aws.partner/shopify.com/{APP_ID}/{EVENT_SOURCE_NAME}
```

### Important Notes:

- CLI trigger tests the EventBridge connection but sends synthetic data
- Real events from the store are the best test
- CloudWatch may take a few seconds to show events
- If events don't appear, check:
  - EventBridge rule is enabled
  - Event source is "Active" in AWS
  - The ARN in TOML matches the actual event source ARN

---

## Common Issues and Solutions

### Issue: "Unable to validate address"

**Cause**: The ARN format is incorrect or the event source isn't associated.

**Solution**:
- Verify the ARN format exactly matches: `arn:aws:events:{REGION}::event-source/aws.partner/shopify.com/{APP_ID}/{EVENT_SOURCE_NAME}`
- Ensure event source is "Active" in AWS (Step 2 completed)
- Check the APP_ID matches (visible in AWS event bus name)

### Issue: "URI format isn't correct"

**Cause**: TOML configuration has invalid ARN syntax.

**Solution**:
- Use `uri` field (not `arn` or `delivery_method`)
- Don't include the account ID in the ARN (double colon `::` before `event-source`)
- Correct: `arn:aws:events:ap-southeast-2::event-source/...`
- Incorrect: `arn:aws:events:ap-southeast-2:123456789012:event-source/...`

### Issue: "Missing scope for webhook topic"

**Cause**: The webhook topic requires an API scope that isn't granted.

**Solution**:
- Add the required scope to `[access_scopes]` in TOML
- Complete Step 5 (request protected customer data access)
- Reinstall the app in your dev store
- Restart `shopify app dev`

### Issue: "App is not approved to subscribe to webhook topics containing protected customer data"

**Cause**: Protected customer data access not requested or app not reinstalled.

**Solution**:
1. Complete Step 5 fully
2. Uninstall app from dev store
3. Reinstall app from dev store
4. Run `shopify app dev` again

### Issue: No events appearing in CloudWatch

**Cause**: Rule not configured or event source not associated.

**Solution**:
- Verify EventBridge rule exists and is **Enabled**
- Check rule has a valid target (CloudWatch log group)
- Ensure event source status is "Active" in AWS
- Verify you're creating events on the correct dev store
- Check AWS region matches everywhere (Shopify source, AWS event source, rule)

### Issue: "No app with client ID found"

**Cause**: The app was deleted or the client_id in TOML is wrong.

**Solution**:
- Run `shopify app config link` to link to existing app or create new one
- Verify the client_id in TOML matches the app in Partner Dashboard

---

## Key Architecture Components

### Flow of Events:

```
Shopify Store Event (Order Created)
    ↓
Shopify Webhook System
    ↓
Amazon EventBridge Partner Event Source
    ↓
EventBridge Event Bus
    ↓
EventBridge Rules (Filtering/Routing)
    ↓
Target(s) - Lambda, SQS, CloudWatch, etc.
```

### Important Concepts:

1. **Partner Event Source**: The connection point from Shopify to AWS
2. **Event Bus**: The central hub that receives all events
3. **Rules**: Define which events go where (routing and filtering)
4. **Targets**: Where events are ultimately sent for processing

---

## Best Practices

### Development:

- Use CloudWatch log groups for initial testing and debugging
- Keep API versions up to date
- Test with real events, not just CLI triggers
- Monitor CloudWatch for errors during development

### Production:

- Use Lambda or SQS for actual event processing
- Set up CloudWatch alarms for failed EventBridge rules
- Monitor EventBridge metrics (invocations, failed invocations)
- Consider DLQ (Dead Letter Queue) for failed events
- Implement idempotency in your event handlers (Shopify may send duplicate events)

### Security:

- Events from EventBridge don't require HMAC verification (AWS handles authentication)
- Use IAM roles with least-privilege permissions
- Consider VPC endpoints for private event processing
- Regularly rotate AWS credentials

---

## EventBridge ARN Components Explained

```
arn:aws:events:ap-southeast-2::event-source/aws.partner/shopify.com/298666754049/shopify-test-app-order-create-01
│   │   │      │                │             │           │            │          │
│   │   │      │                │             │           │            │          └─ Event Source Name (from Step 1)
│   │   │      │                │             │           │            └─ Shopify App ID
│   │   │      │                │             │           └─ Shopify.com partner namespace
│   │   │      │                │             └─ AWS partner prefix
│   │   │      │                └─ Resource type (event-source)
│   │   │      └─ AWS Region
│   │   └─ Service (events = EventBridge)
│   └─ AWS partition
└─ ARN prefix
```

---

## Deployment to Production

When ready to deploy:

```powershell
shopify app deploy
```

This will:
- Create an app version with your webhook configuration
- Release it to production stores
- Update webhook subscriptions for all installed stores

### Important Notes:

- All stores with your app will get the new webhook subscriptions
- Rollout may take several minutes
- Test thoroughly in development before deploying
- Use `--no-release` flag to create version without releasing

---

## Additional Resources

- [Shopify Webhooks Documentation](https://shopify.dev/docs/apps/build/webhooks)
- [Amazon EventBridge Documentation](https://docs.aws.amazon.com/eventbridge/)
- [Shopify Webhooks Reference](https://shopify.dev/docs/api/webhooks)
- [AWS EventBridge Partner Integrations](https://aws.amazon.com/eventbridge/integrations/)

---

## Summary Checklist

- [ ] Create EventBridge source in Shopify Dev Dashboard
- [ ] Associate event source in AWS EventBridge (verify "Active" status)
- [ ] Create EventBridge rule with target (e.g., CloudWatch log group)
- [ ] Configure webhook in `shopify.app.toml` with correct ARN format
- [ ] Add required API scopes to TOML
- [ ] Request protected customer data access (if needed)
- [ ] Reinstall app in dev store (if scopes changed)
- [ ] Run `shopify app dev` and verify no errors
- [ ] Test webhook by creating event in store
- [ ] Verify event appears in CloudWatch/target
- [ ] (Optional) Add production targets like Lambda or SQS
- [ ] Deploy to production with `shopify app deploy`
