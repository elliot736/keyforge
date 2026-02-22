# Load Tests

Verify the sub-5ms p95 latency target for the key verification endpoint.

## Prerequisites

Install k6: https://k6.io/docs/get-started/installation/

## Setup

Create a test key first:

    curl -X POST http://localhost:4000/v1/keys.createKey \
      -H "Authorization: Bearer YOUR_ROOT_KEY" \
      -H "Content-Type: application/json" \
      -d '{"name": "Load Test Key"}'

## Run

Smoke test (10 VUs, 30 seconds):

    API_URL=http://localhost:4000 API_KEY=sk_your_key k6 run verify.k6.js --scenario smoke

Full load test (ramp to 200 VUs):

    API_URL=http://localhost:4000 API_KEY=sk_your_key k6 run verify.k6.js

## Thresholds

- p95 verify latency < 10ms
- p99 verify latency < 25ms
- Error rate < 1%
