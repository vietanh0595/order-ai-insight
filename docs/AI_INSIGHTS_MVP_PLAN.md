# AI Post-Purchase Insights App - MVP Implementation Plan

**Target Timeline:** 4 weeks (1 month)  
**Last Updated:** November 25, 2025

---

## Executive Summary

Build a Shopify app that automatically generates AI-powered insights and follow-up email suggestions for every new order. Merchants see actionable intelligence about customer behavior (first-time vs. repeat, high-value, discount-sensitive, etc.) and get ready-to-use email copy to improve retention and engagement.

**Core Value Proposition:**
- Merchants understand each order's context without manual analysis
- Pre-written follow-up messages save time and increase conversion
- No automated actions—merchant stays in control (better for Shopify review)

---

## Business Requirements

### Functional Requirements

#### FR1: Automatic Order Analysis
- **Trigger:** Every `orders/create` event
- **Input:** Order data from webhook (line items, totals, customer info, discounts)
- **Process:** AI generates 2-3 sentence insight + follow-up email suggestion
- **Output:** Stored in app database, viewable in admin UI

#### FR2: Admin Dashboard - Insights Feed
- **Location:** Embedded in Shopify admin
- **Features:**
  - Paginated list of recent insights (newest first)
  - Shows: order reference, date, insight preview, customer type
  - Filter by: date range, customer type (first-time/repeat), order value
  - Click to view full detail

#### FR3: Order Detail View
- **Location:** Dedicated page per order
- **Features:**
  - Full AI-generated insight
  - Suggested follow-up email (subject + body)
  - Basic order info from Shopify (items, total, customer)
  - "Copy email" button for easy use
  - Status indicator (success, processing, error)

#### FR4: Merchant Settings
- **Location:** Settings page in app
- **Features:**
  - Enable/disable AI processing toggle
  - Privacy controls: include/exclude customer name in AI prompts
  - View data usage explanation
  - Link to privacy policy

#### FR5: Error Handling
- **Graceful degradation:** If AI fails, show error state (not blank page)
- **Retry mechanism:** Manual "Regenerate insight" button
- **Logging:** Track failures for debugging

### Non-Functional Requirements

#### NFR1: Performance
- **Lambda response time:** < 10 seconds per order
- **Admin UI load time:** < 2 seconds for insights list
- **Rate limits:** Stay within Shopify (2 req/sec) and OpenAI limits

#### NFR2: Security
- **Lambda → App communication:** HMAC signature verification
- **Customer data:** Minimal PII sent to AI (configurable)
- **Secrets management:** AWS Secrets Manager or Lambda env vars

#### NFR3: Privacy & Compliance
- **Protected customer data:** Request access, document usage
- **Data retention:** Store insights indefinitely (merchant's data)
- **AI provider:** Disclose that order data sent to OpenAI/Bedrock
- **Opt-out:** Merchant can disable processing anytime

#### NFR4: Scalability
- **EventBridge + Lambda:** Auto-scales with order volume
- **Database:** Start with SQLite, migrate to Postgres if needed
- **Cost control:** Monitor AI API usage, set per-store limits

---

## Technical Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         SHOPIFY STORE                            │
│                  (Merchant creates order)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ orders/create webhook
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    SHOPIFY WEBHOOK SYSTEM                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                   AWS EVENTBRIDGE (Partner Source)               │
│                  Event Bus: aws.partner/shopify.com/...          │
└────────────────────────────┬────────────────────────────────────┘
                             │ EventBridge Rule
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                       AWS LAMBDA FUNCTION                        │
│                                                                  │
│  1. Parse EventBridge event (Shopify order data)                │
│  2. Extract: order ID, items, total, customer info              │
│  3. Optional: Call Shopify Admin API for customer history       │
│  4. Build AI prompt with order context                          │
│  5. Call OpenAI/Bedrock API                                     │
│  6. Parse AI response (insight + follow-up email)               │
│  7. POST to Remix app ingestion endpoint (with HMAC)            │
│                                                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS POST with signature
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    REMIX APP (Shopify Embedded)                  │
│                                                                  │
│  Ingestion Route (app/routes/api.ai-insights.ingest.tsx)        │
│  ├─ Verify HMAC signature                                       │
│  ├─ Validate shop domain                                        │
│  ├─ Upsert AIOrderInsight record (Prisma)                       │
│  └─ Return 200 OK                                                │
│                                                                  │
│  Admin UI Routes                                                 │
│  ├─ app.ai-insights._index.tsx (list view)                      │
│  ├─ app.ai-insights.$orderId.tsx (detail view)                  │
│  └─ app.ai-insights.settings.tsx (merchant controls)            │
│                                                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Prisma ORM
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                   DATABASE (SQLite / Postgres)                   │
│                                                                  │
│  Tables:                                                         │
│  ├─ Session (Shopify auth sessions)                             │
│  └─ AIOrderInsight                                              │
│       ├─ id, shop, orderId, orderName                           │
│       ├─ insightText, followupSubject, followupBody             │
│       ├─ customerType, orderValue                               │
│       ├─ status, errorMessage                                   │
│       └─ createdAt, updatedAt                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. AWS Lambda Function
**Purpose:** Process `orders/create` events and generate AI insights

**Runtime:** Node.js 20.x  
**Trigger:** EventBridge rule (orders/create)  
**Environment Variables:**
- `OPENAI_API_KEY` or `AWS_BEDROCK_MODEL_ID`
- `REMIX_APP_URL` (e.g., `https://your-app.fly.dev`)
- `HMAC_SECRET` (shared with Remix app)

**Dependencies:**
- `@shopify/shopify-api` (optional, for Admin API calls)
- `openai` or `@aws-sdk/client-bedrock-runtime`
- `node:crypto` (for HMAC signing)

**Key Functions:**
- `handler(event)` - Main entry point
- `extractOrderData(orderPayload)` - Normalize order data
- `enrichWithCustomerHistory(customerId, shopDomain)` - Optional API call
- `generateAIPrompt(orderData, customerData)` - Build prompt
- `callAI(prompt)` - OpenAI/Bedrock request
- `postToRemixApp(insightData)` - Send to ingestion endpoint

#### 2. Remix App - New Routes

**Ingestion Route:** `app/routes/api.ai-insights.ingest.tsx`
- Method: POST only
- Auth: HMAC signature in header
- Input: `{ shop, orderId, orderName, insightText, followupSubject, followupBody, customerType, orderValue, signature }`
- Output: `{ success: true }` or error

**List View:** `app/routes/app.ai-insights._index.tsx`
- Fetch recent insights from DB
- Paginate (20 per page)
- Filter controls (date, customer type, value)
- Link to detail view

**Detail View:** `app/routes/app.ai-insights.$orderId.tsx`
- Load insight from DB by order ID
- Fetch order details from Shopify Admin API
- Display insight + follow-up email
- "Copy to clipboard" buttons
- "Regenerate" action (if needed)

**Settings:** `app/routes/app.ai-insights.settings.tsx`
- Form to toggle AI processing on/off
- Checkbox: include customer name in prompts
- Privacy notice text
- Save to merchant preferences (new table or metafield)

#### 3. Database Schema Extension

**New Model:** `AIOrderInsight`

```prisma
model AIOrderInsight {
  id               String   @id @default(cuid())
  shop             String   // Shopify domain (e.g., "store.myshopify.com")
  orderId          String   // Shopify order ID (numeric as string)
  orderName        String   // Human-readable (e.g., "#1234")
  
  insightText      String   @db.Text // AI-generated insight (2-3 sentences)
  followupSubject  String?  // Email subject line
  followupBody     String?  @db.Text // Email body with {{placeholders}}
  
  customerType     String?  // "first-time", "repeat", "vip"
  orderValue       Float?   // Total order value (for filtering)
  
  status           String   @default("completed") // "pending", "completed", "error"
  errorMessage     String?  @db.Text
  
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  @@index([shop, createdAt])
  @@index([orderId])
}
```

**Migration Command:**
```bash
npx prisma migrate dev --name add_ai_order_insight
```

---

## Business Logic Flow

### Scenario 1: First-Time Customer, Mid-Value Order

**Input (from webhook):**
- Order total: $85
- Line items: 2 products (basic collection)
- Customer: `orders_count: 1`, `total_spent: "85.00"`
- No discount code used

**AI Processing:**
```
Prompt: "Analyze this first-time order: $85, 2 items from basic collection, 
no discount. Generate merchant insight + welcome email suggestion."

AI Output:
{
  "insight": "First-time customer purchasing entry-level products. 
  Standard order value suggests genuine interest. Consider a small 
  thank-you discount (10-15%) on next purchase to encourage return visit.",
  
  "followupSubject": "Welcome to [Brand] – here's a little something extra",
  
  "followupBody": "Hi {{customer_first_name}},\n\nThanks for your first 
  order! You picked great starter items. As a welcome gift, here's 15% off 
  your next purchase: {{discount_code}}.\n\nQuestions? Just reply to this 
  email.\n\nCheers,\n[Your Team]"
}
```

**Stored in DB:**
- `customerType: "first-time"`
- `orderValue: 85.00`
- `status: "completed"`

**Merchant sees in admin:**
- Insight card in feed
- Click → full detail + copyable email

---

### Scenario 2: Repeat Customer, High-Value Order

**Input:**
- Order total: $268
- Line items: 5 products (premium collection)
- Customer: `orders_count: 4`, `total_spent: "523.50"`
- Used discount code: "VIP20"

**AI Processing:**
```
Prompt: "Analyze this repeat customer order: $268, 5 premium items, 
4th total order, LTV $523.50, used VIP discount code. Generate insight 
+ VIP appreciation email."

AI Output:
{
  "insight": "High-value repeat customer (4 orders, $523 LTV). Premium 
  product selection + VIP code usage indicates strong brand affinity. 
  Tag as VIP segment for early access to new drops.",
  
  "followupSubject": "You're officially a VIP at [Brand] 🎉",
  
  "followupBody": "Hi {{customer_first_name}},\n\nYour recent order shows 
  you're one of our top customers. We'd love to give you early access to 
  new collections and exclusive bundles.\n\nKeep an eye out – good things 
  are coming your way.\n\nThank you for being awesome,\n[Your Team]"
}
```

**Stored in DB:**
- `customerType: "vip"`
- `orderValue: 268.00`
- `status: "completed"`

---

### Scenario 3: Replenishment Order (Same Product as 45 Days Ago)

**Input:**
- Order total: $42
- Line items: 1 product ("Daily Vitamins")
- Customer: `orders_count: 3`, last order 45 days ago included same SKU

**AI Processing (with customer history lookup):**
```
Lambda calls: GET /admin/api/2025-10/customers/{id}/orders.json?limit=5

Finds: Same product purchased 45 days ago

Prompt: "Repeat customer re-ordering 'Daily Vitamins' on ~45 day cycle. 
Generate replenishment insight + subscription suggestion."

AI Output:
{
  "insight": "Replenishment pattern detected: customer re-orders same 
  product every 45 days. Strong candidate for auto-subscribe offer to 
  lock in recurring revenue.",
  
  "followupSubject": "Never run out of [Product] again",
  
  "followupBody": "Hi {{customer_first_name}},\n\nWe noticed you're back 
  for {{product_name}} – smart choice! Want to automate this? Subscribe 
  and save 10%: {{subscription_link}}.\n\nYou can pause or cancel anytime.\n\n
  Cheers,\n[Your Team]"
}
```

**Stored in DB:**
- `customerType: "repeat"`
- `orderValue: 42.00`
- Insight flags replenishment opportunity

---

## Implementation Steps (4-Week Timeline)

### Week 1: Foundation & Data Pipeline

#### Day 1-2: Database Schema & Ingestion Endpoint
- [ ] Create Prisma migration for `AIOrderInsight` model
- [ ] Run migration in dev environment
- [ ] Create `app/routes/api.ai-insights.ingest.tsx`
  - HMAC verification helper
  - Validate required fields
  - Upsert insight to DB
  - Return JSON response
- [ ] Test ingestion with curl/Postman

#### Day 3-4: AWS Lambda Setup
- [ ] Create Lambda function in AWS Console (or via CLI)
- [ ] Set up environment variables (HMAC_SECRET, REMIX_APP_URL)
- [ ] Write Lambda handler skeleton:
  - Parse EventBridge event
  - Extract order data
  - Log to CloudWatch
  - Test with dummy POST to ingestion endpoint
- [ ] Update EventBridge rule to target Lambda (instead of CloudWatch)

#### Day 5-7: End-to-End Pipeline Test
- [ ] Test full flow: create order in dev store → Lambda → app DB
- [ ] Verify insight record appears in database
- [ ] Debug any EventBridge/Lambda/ingestion issues
- [ ] Document Lambda logs and error handling

**Deliverable:** Orders flowing from Shopify → EventBridge → Lambda → Remix DB (no AI yet)

---

### Week 2: AI Integration

#### Day 8-9: AI Provider Setup
- [ ] Create OpenAI account (or set up AWS Bedrock)
- [ ] Get API key and test simple completion
- [ ] Add AI SDK to Lambda dependencies
- [ ] Store API key in Lambda env vars or Secrets Manager

#### Day 10-12: Lambda AI Logic
- [ ] Write prompt template function
- [ ] Implement AI API call with error handling
- [ ] Parse AI response (extract insight, subject, body)
- [ ] Test with sample order data (unit test or manual trigger)
- [ ] Refine prompt based on output quality

#### Day 13-14: Customer History Enrichment (Optional)
- [ ] Add Shopify Admin API client to Lambda
- [ ] Implement `GET /customers/{id}/orders.json` call
- [ ] Detect patterns: replenishment, category shift
- [ ] Include in AI prompt context
- [ ] Test with multi-order customer in dev store

**Deliverable:** Lambda generates real AI insights and stores them in DB

---

### Week 3: Admin UI & Merchant Experience

#### Day 15-16: Insights List View
- [ ] Create `app/routes/app.ai-insights._index.tsx`
- [ ] Fetch insights from DB (paginated)
- [ ] Build UI with Polaris components:
  - ResourceList or IndexTable
  - Pagination controls
  - Empty state
- [ ] Add filters (date range, customer type)
- [ ] Link to detail view

#### Day 17-18: Order Detail View
- [ ] Create `app/routes/app.ai-insights.$orderId.tsx`
- [ ] Load insight from DB by orderId
- [ ] Fetch order details from Shopify Admin API
- [ ] Display:
  - Order summary (items, total, customer)
  - AI insight text
  - Follow-up email (subject + body)
- [ ] Add "Copy email" button (clipboard API)
- [ ] Show status badges (success, error, pending)

#### Day 19-21: Settings Page
- [ ] Create `app/routes/app.ai-insights.settings.tsx`
- [ ] Build form with Polaris:
  - Toggle: Enable/disable AI processing
  - Checkbox: Include customer name in prompts
  - Text: Privacy notice
- [ ] Store settings (new Prisma model or shop metafield)
- [ ] Update Lambda to respect settings (fetch via API or ENV)

**Deliverable:** Fully functional admin UI for viewing and managing insights

---

### Week 4: Polish, Testing & Shopify Review Prep

#### Day 22-23: Error Handling & Edge Cases
- [ ] Test Lambda timeout scenarios
- [ ] Test AI API failures (mock bad responses)
- [ ] Test ingestion endpoint with invalid signatures
- [ ] Add user-friendly error messages in UI
- [ ] Implement manual "Regenerate insight" action

#### Day 24-25: Performance & Security Audit
- [ ] Verify HMAC signature validation is secure
- [ ] Check rate limits (Shopify API, OpenAI)
- [ ] Add logging and CloudWatch alerts
- [ ] Test with bulk order creation (5-10 orders quickly)
- [ ] Optimize DB queries (add indexes if needed)

#### Day 26-27: Privacy & Compliance
- [ ] Update app privacy policy (mention AI, data usage)
- [ ] Add privacy notice to settings page
- [ ] Complete Protected Customer Data request form (Partner Dashboard)
- [ ] Document data flows for app review
- [ ] Test opt-out flow (disable → no new insights)

#### Day 28: App Store Listing Draft
- [ ] Write app name, subtitle, description
- [ ] Create feature list (use Shopify requirements)
- [ ] Take screenshots (list view, detail view, settings)
- [ ] Record demo video (optional but recommended)
- [ ] Prepare "App review instructions" text
- [ ] Include performance test results (Lighthouse not applicable for backend app)

**Deliverable:** Production-ready app, ready for Shopify review submission

---

## AI Prompt Engineering

### Base Prompt Template

```javascript
const buildPrompt = (orderData, customerData, settings) => {
  const customerName = settings.includeCustomerName 
    ? customerData.firstName || 'the customer' 
    : 'the customer';
  
  return `
You are an expert e-commerce analyst helping a Shopify merchant understand 
their orders and customers.

Analyze the following order and generate:
1. A 2-3 sentence insight for the merchant (what this order reveals about 
   customer behavior, potential actions)
2. A suggested follow-up email with subject line and body (keep it friendly, 
   personalized, and actionable)

ORDER DETAILS:
- Order Total: $${orderData.totalPrice}
- Items: ${orderData.lineItems.map(i => i.title).join(', ')}
- Quantity: ${orderData.lineItems.reduce((sum, i) => sum + i.quantity, 0)} items
- Discount Used: ${orderData.discountCodes.length > 0 ? 'Yes (' + orderData.discountCodes[0].code + ')' : 'No'}

CUSTOMER CONTEXT:
- Total Orders: ${customerData.ordersCount}
- Lifetime Spend: $${customerData.totalSpent}
- First Order: ${customerData.createdAt}
${customerData.recentOrders.length > 0 ? '- Recent Orders: ' + customerData.recentOrders.map(o => o.name).join(', ') : ''}

INSTRUCTIONS:
- Keep insights actionable (suggest tags, segments, or next steps)
- Email should be 3-5 sentences, conversational tone
- Use {{customer_first_name}}, {{product_name}}, {{order_name}} as placeholders
- Don't make up specific discount codes or links

Return as JSON:
{
  "insight": "string",
  "followupSubject": "string",
  "followupBody": "string"
}
  `.trim();
};
```

### Prompt Variations by Customer Type

**First-Time Customer:**
```
Additional context: This is the customer's first purchase. Focus on:
- Welcome messaging
- Building loyalty
- Encouraging second purchase
```

**Repeat Customer (VIP):**
```
Additional context: This customer has high lifetime value (4+ orders, $500+). Focus on:
- Appreciation and recognition
- Exclusive benefits
- Early access opportunities
```

**Replenishment Pattern:**
```
Additional context: Customer re-ordered a product they bought ${daysSinceLastOrder} days ago. Focus on:
- Subscription or auto-reorder offers
- Convenience messaging
- Preventing stockouts
```

---

## Data Privacy & Compliance Strategy

### What Data Is Sent to AI Provider?

**Included by default:**
- Order total
- Product titles (not full descriptions)
- Item quantities
- Discount codes used
- Customer's order count and lifetime spend
- Days since last order

**Excluded by default (merchant can opt-in):**
- Customer first/last name
- Email address
- Phone number
- Shipping/billing addresses
- Order notes with PII

### Shopify Protected Customer Data Request

**When to request:**
- Your app uses `read_orders` scope (✅ you already have this)
- Order data includes customer information

**How to request (Partner Dashboard):**
1. Go to **API access** → **Protected customer data access**
2. Select reason: **"Store management and optimization"**
3. Fill out questionnaire:
   - **What data:** Order totals, product names, customer order history
   - **Why needed:** Generate personalized insights and follow-up suggestions
   - **Where processed:** AWS Lambda, OpenAI API (or Bedrock)
   - **Retention:** Insights stored indefinitely (merchant's data)
   - **Deletion:** App uninstall triggers data cleanup (mandatory webhooks)
4. Save (don't need full submission for dev stores)

**For App Store submission:**
- Complete full compliance form
- Provide data flow diagram
- Link to privacy policy
- Show opt-out mechanism in settings

### Privacy Policy Requirements

**Must include:**
- Types of data collected (order details, customer aggregates)
- Third-party services used (OpenAI/AWS Bedrock)
- How data is used (AI analysis, insight generation)
- Data retention (insights stored, raw orders not stored)
- Merchant controls (disable processing, exclude PII)
- Contact information for data requests

**Template section:**
```
Our app analyzes your order data to generate business insights using 
AI (powered by OpenAI/AWS Bedrock). We send order totals, product names, 
and customer purchase history (order count, lifetime value) to our AI 
provider to generate insights. We do not store raw customer PII beyond 
what's necessary for the insight. You can disable AI processing anytime 
in the app settings.
```

---

## Testing Strategy

### Unit Tests (Optional for MVP, Recommended for Production)

**Lambda function:**
- Mock EventBridge event → verify order data extraction
- Mock AI API response → verify parsing logic
- Test HMAC signature generation

**Remix routes:**
- Mock ingestion POST → verify HMAC validation
- Mock DB insert → verify data structure
- Test UI components (list, detail, settings)

### Integration Tests

**Scenario 1: Happy path (first-time customer)**
1. Create order in dev store (manual or via Admin API)
2. Verify EventBridge receives event (CloudWatch logs)
3. Verify Lambda executes successfully
4. Verify insight appears in app UI within 10 seconds
5. Verify email copy is usable (no placeholders broken)

**Scenario 2: Repeat customer with history**
1. Create customer with 2-3 existing orders
2. Create new order for that customer
3. Verify Lambda fetches customer history
4. Verify insight mentions repeat behavior
5. Verify follow-up email is contextually appropriate

**Scenario 3: AI API failure**
1. Mock AI API timeout or error
2. Verify Lambda handles gracefully (logs error)
3. Verify insight status = "error" in DB
4. Verify UI shows error state (not blank)
5. Verify "Regenerate" button works

**Scenario 4: Merchant disables processing**
1. Set "Enable AI processing" to OFF in settings
2. Create new order
3. Verify Lambda skips AI call (early return)
4. Verify no new insight created

### Load Testing (Pre-Production)

**Test 10 concurrent orders:**
- Use Shopify Admin API to create orders rapidly
- Verify all EventBridge events processed
- Verify all Lambdas complete within timeout (15s default)
- Check for rate limit errors (Shopify, OpenAI)

---

## Deployment Checklist

### Pre-Deployment (Week 4, Day 28)

- [ ] All routes implemented and tested locally
- [ ] Lambda deployed to AWS with production config
- [ ] EventBridge rule pointing to production Lambda
- [ ] Database migrated (if using managed Postgres)
- [ ] Environment variables set correctly in both Lambda and Remix
- [ ] HMAC secret shared between Lambda and Remix (secure storage)
- [ ] Privacy policy published and linked in app
- [ ] Protected Customer Data request approved (or in progress)

### Deployment Steps

#### 1. Deploy Lambda Function
```bash
# Package Lambda code
cd lambda-insights-processor
npm install --production
zip -r function.zip .

# Upload to AWS (or use AWS CLI)
aws lambda update-function-code \
  --function-name shopify-ai-insights-processor \
  --zip-file fileb://function.zip
```

#### 2. Deploy Remix App
```bash
# From project root
npm run build
shopify app deploy

# Or deploy to hosting platform (Fly.io, Railway, etc.)
fly deploy
```

#### 3. Test Production Flow
- [ ] Create test order in production dev store
- [ ] Verify insight appears in app within 15 seconds
- [ ] Check CloudWatch logs for errors
- [ ] Test admin UI (list, detail, settings)

### Post-Deployment Monitoring

**CloudWatch Alarms:**
- Lambda errors > 5% in 5 minutes
- Lambda duration > 10 seconds (p95)
- EventBridge failed invocations > 0

**Shopify App Dashboard:**
- Monitor app installs/uninstalls
- Check for Partner notifications (errors, complaints)

**Cost Tracking:**
- OpenAI API usage ($ per 1K tokens)
- Lambda invocations and duration
- EventBridge events

---

## Cost Estimation (MVP)

### AWS Costs (per month, 1000 orders)

| Service | Usage | Cost |
|---------|-------|------|
| EventBridge | 1000 events | $0.00* |
| Lambda | 1000 invocations, 5s avg, 512MB | $0.08 |
| CloudWatch Logs | 50MB logs | $0.03 |
| **Total AWS** | | **~$0.11/month** |

*EventBridge partner events are free

### OpenAI Costs (per month, 1000 orders)

| Model | Input Tokens/Order | Output Tokens/Order | Cost/Order | Monthly (1000) |
|-------|-------------------|---------------------|-----------|----------------|
| GPT-4o | ~300 | ~200 | $0.004 | **$4.00** |
| GPT-3.5-turbo | ~300 | ~200 | $0.001 | **$1.00** |

**Recommended for MVP:** GPT-3.5-turbo (good quality, low cost)

### Total Monthly Cost (1000 orders)
- AWS: $0.11
- OpenAI (GPT-3.5): $1.00
- **Total: ~$1.11/month** or **$0.0011 per order**

**At scale (10,000 orders/month):**
- AWS: $1.10
- OpenAI: $10.00
- **Total: ~$11/month** or **$0.0011 per order**

### Revenue Model Options

**Option 1: Freemium**
- Free: First 50 insights/month
- Pro: $9.99/month (unlimited)

**Option 2: Per-Order Pricing**
- $0.10 per insight (90x markup)
- Break-even: 11 insights/month

**Option 3: Flat Rate**
- $19.99/month (unlimited)
- Target: Stores with 100+ orders/month

---

## Risks & Mitigation

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| AI API downtime | No new insights | Medium | Retry logic, queue failed orders, status page |
| Lambda timeout (15s limit) | Failed processing | Low | Optimize API calls, increase timeout to 30s |
| Rate limit hit (Shopify/OpenAI) | Throttled requests | Medium | Queue system, exponential backoff |
| HMAC signature bypass | Security breach | Low | Strong secret, rotate regularly, IP whitelist |
| Database grows too large | Performance issues | Low | Start SQLite, plan Postgres migration |

### Business Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Shopify rejects app (privacy) | Delayed launch | Medium | Complete Protected Data request early, clear docs |
| Merchants find insights generic | Low retention | Medium | Prompt tuning, A/B test prompts, collect feedback |
| Cost per order too high | Unprofitable | Low | Use GPT-3.5 instead of GPT-4, cache common patterns |
| Low merchant adoption | No revenue | Medium | Strong onboarding, demo video, free trial |

---

## Success Metrics (Post-Launch)

### Product Metrics
- **Insight generation rate:** % of orders that generate insights (target: >95%)
- **Insight quality:** Manual review of 50 random insights (target: 80% useful)
- **Merchant engagement:** % of merchants who view insights weekly (target: >50%)
- **Email copy usage:** Survey merchants on whether they use suggested emails (target: >30%)

### Technical Metrics
- **Lambda success rate:** % of successful executions (target: >99%)
- **Average processing time:** Lambda duration (target: <8s p95)
- **Error rate:** Failed insights per 1000 orders (target: <5)
- **Cost per insight:** Total AI cost / insights generated (target: <$0.005)

### Business Metrics
- **App installs:** Cumulative installs (target: 50 in first 3 months)
- **Active users:** Merchants using app in last 30 days (target: 70% retention)
- **Revenue (if paid):** MRR from subscriptions (target: $500 in first 6 months)
- **App review score:** Shopify App Store rating (target: >4.5 stars)

---

## Future Enhancements (Post-MVP)

### Phase 2 (Month 2-3)
- [ ] Store-wide analytics dashboard (trending products, customer segments)
- [ ] Email provider integration (Klaviyo, Mailchimp, Shopify Email)
- [ ] Custom prompt templates (merchant can tune tone/style)
- [ ] Webhook support for `orders/fulfilled`, `orders/cancelled`
- [ ] Bulk insight regeneration (for historical orders)

### Phase 3 (Month 4-6)
- [ ] Auto-tagging customers based on insights (VIP, first-time, at-risk)
- [ ] Predictive churn detection (AI flags declining engagement)
- [ ] A/B testing for follow-up emails (track open/click rates)
- [ ] Multi-language support (detect store locale, translate emails)
- [ ] Shopify Flow integration (trigger actions based on insights)

### Phase 4 (Month 7+)
- [ ] Mobile app (view insights on the go)
- [ ] AI-powered bundle suggestions (create draft products)
- [ ] Customer segmentation reports (export lists for retargeting)
- [ ] White-label option (custom branding for agencies)

---

## Support & Maintenance Plan

### Documentation
- [ ] Merchant onboarding guide (how to enable, interpret insights)
- [ ] Troubleshooting FAQ (no insights appearing, AI errors)
- [ ] Privacy & data usage explainer
- [ ] Video tutorials (setup, using insights, email best practices)

### Support Channels
- **Email:** support@yourapp.com (response time: <24hrs)
- **In-app help:** Link to docs and contact form
- **Community:** Slack/Discord for merchants (optional)

### Monitoring & Alerts
- **Daily:** Check CloudWatch for Lambda errors
- **Weekly:** Review insight quality (sample 10 random insights)
- **Monthly:** Analyze merchant usage patterns, cost trends
- **Quarterly:** Shopify API version updates (migrate if needed)

---

## Appendix

### A. Sample EventBridge Event (orders/create)

```json
{
  "version": "0",
  "id": "abc123",
  "detail-type": "orders/create",
  "source": "aws.partner/shopify.com",
  "account": "123456789012",
  "time": "2025-11-25T10:30:00Z",
  "region": "ap-southeast-2",
  "resources": [],
  "detail": {
    "id": 5678901234,
    "order_number": 1234,
    "name": "#1234",
    "total_price": "150.00",
    "subtotal_price": "135.00",
    "total_tax": "15.00",
    "currency": "USD",
    "financial_status": "paid",
    "created_at": "2025-11-25T10:30:00Z",
    "line_items": [
      {
        "id": 12345,
        "title": "Classic White T-Shirt",
        "quantity": 2,
        "price": "25.00"
      },
      {
        "id": 12346,
        "title": "Blue Denim Jeans",
        "quantity": 1,
        "price": "85.00"
      }
    ],
    "customer": {
      "id": 987654321,
      "email": "customer@example.com",
      "first_name": "Jane",
      "last_name": "Doe",
      "orders_count": 1,
      "total_spent": "150.00",
      "created_at": "2025-11-25T10:25:00Z"
    },
    "discount_codes": [],
    "shipping_address": {
      "city": "San Francisco",
      "province": "California",
      "country": "United States"
    }
  }
}
```

### B. Sample AI Response (JSON)

```json
{
  "insight": "First-time customer purchasing entry-level basics (t-shirts and jeans) at full price, which suggests genuine brand interest rather than discount-hunting. Cart composition indicates a casual wear focus. Recommend a personalized welcome email with styling tips and a small incentive (10-15% off) to encourage a second purchase within 30 days.",
  
  "followupSubject": "Welcome to [Brand] – here's how to style your new basics",
  
  "followupBody": "Hi {{customer_first_name}},\n\nThanks for your first order! You picked some of our most versatile pieces.\n\nHere are 3 quick ways to style your new tee and jeans:\n1. Add a blazer for instant polish\n2. Layer with a cardigan for cozy weekends\n3. Throw on sneakers and a denim jacket for effortless cool\n\nAs a thank-you, here's 15% off your next order: {{discount_code}}\n\nQuestions? Just reply to this email.\n\nCheers,\n[Your Team]"
}
```

### C. HMAC Signature Verification (Node.js)

**Lambda (signing):**
```javascript
const crypto = require('crypto');

const signPayload = (payload, secret) => {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
};

// Usage
const payload = { shop, orderId, insightText, ... };
const signature = signPayload(payload, process.env.HMAC_SECRET);

await fetch(`${REMIX_APP_URL}/api/ai-insights/ingest`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Hmac-SHA256': signature,
  },
  body: JSON.stringify(payload),
});
```

**Remix (verification):**
```typescript
import crypto from 'crypto';

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await request.text();
  const hmac = request.headers.get('X-Shopify-Hmac-SHA256');
  
  const expectedHmac = crypto
    .createHmac('sha256', process.env.HMAC_SECRET!)
    .update(body)
    .digest('hex');
  
  if (hmac !== expectedHmac) {
    return json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  const data = JSON.parse(body);
  // Process insight...
};
```

### D. Useful Shopify CLI Commands

```bash
# Start dev server (auto-registers webhooks)
shopify app dev

# Trigger test webhook
shopify app webhook trigger --topic orders/create

# Deploy to production
shopify app deploy

# View app info
shopify app info

# Generate new route
shopify app generate extension

# Check for errors
shopify app env show
```

### E. Recommended VS Code Extensions
- Shopify Liquid (Shopify.theme-check-vscode)
- Prisma (Prisma.prisma)
- ESLint (dbaeumer.vscode-eslint)
- Prettier (esbenp.prettier-vscode)
- AWS Toolkit (AmazonWebServices.aws-toolkit-vscode)

---

## Document Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Nov 25, 2025 | Initial | Complete MVP implementation plan |

---

**Next Steps:**
1. Review this plan with your team/advisor
2. Set up project tracking (Trello, Linear, GitHub Projects)
3. Create Week 1 tasks in detail
4. Begin implementation: database schema + ingestion endpoint

**Questions or need clarification on any section? Let's refine before you start building!**
