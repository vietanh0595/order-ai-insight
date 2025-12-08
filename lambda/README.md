# AWS Lambda - Shopify AI Insights Processor

This Lambda function processes Shopify `orders/create` events from EventBridge and generates AI-powered insights.

## Architecture

```
EventBridge (orders/create) → Lambda → OpenAI API → Remix App (ingestion endpoint)
```

## Setup

### 1. Install Dependencies

```bash
cd lambda
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Configure Environment Variables

In AWS Lambda console, set these environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key | Yes |
| `OPENAI_MODEL` | Model to use (default: `gpt-3.5-turbo`) | No |
| `REMIX_APP_URL` | Your Remix app URL (e.g., `https://your-app.fly.dev`) | Yes |
| `HMAC_SECRET` | Shared secret for signing requests | Yes |
| `SHOPIFY_SHOP_DOMAIN` | Fallback shop domain | No |
| `INCLUDE_CUSTOMER_NAME` | Include customer name in AI prompts (`true`/`false`) | No |

### 4. Deploy to AWS

#### Option A: AWS Console
1. Build: `npm run build`
2. Package: `npm run package:win` (Windows) or `npm run package` (Unix)
3. Upload `function.zip` to AWS Lambda console

#### Option B: AWS CLI
```bash
npm run build
cd dist
zip -r ../function.zip .
aws lambda update-function-code \
  --function-name shopify-ai-insights-processor \
  --zip-file fileb://../function.zip
```

### 5. Configure Lambda Settings

- **Runtime:** Node.js 20.x
- **Handler:** `index.handler`
- **Timeout:** 30 seconds (AI calls can take time)
- **Memory:** 256 MB (minimum recommended)

### 6. Add EventBridge Trigger

1. Go to Lambda → Add trigger → EventBridge
2. Select your Shopify partner event bus
3. Configure rule pattern:
```json
{
  "source": ["aws.partner/shopify.com"],
  "detail-type": ["orders/create"]
}
```

## Project Structure

```
lambda/
├── src/
│   ├── index.ts          # Main Lambda handler
│   ├── types.ts          # TypeScript type definitions
│   ├── orderProcessor.ts # Process Shopify order data
│   ├── promptBuilder.ts  # Build AI prompts
│   ├── aiService.ts      # OpenAI API integration
│   └── httpClient.ts     # HTTP client for Remix app
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Testing Locally

You can test the handler locally with a mock event:

```typescript
import { handler } from './src/index';

const mockEvent = {
  "detail-type": "orders/create",
  "source": "aws.partner/shopify.com",
  "detail": {
    "id": 12345,
    "name": "#1001",
    "total_price": "85.00",
    "currency": "USD",
    "line_items": [
      { "title": "Test Product", "quantity": 1, "price": "85.00" }
    ],
    "customer": {
      "id": 1,
      "first_name": "John",
      "orders_count": 1,
      "total_spent": "85.00"
    },
    "discount_codes": [],
    "metadata": {
      "X-Shopify-Shop-Domain": "test-store.myshopify.com"
    }
  }
};

handler(mockEvent as any, {} as any);
```

## Cost Estimation

| Component | Cost per 1000 orders |
|-----------|---------------------|
| Lambda (5s avg, 256MB) | ~$0.08 |
| OpenAI GPT-3.5-turbo | ~$1.00 |
| **Total** | **~$1.08** |
