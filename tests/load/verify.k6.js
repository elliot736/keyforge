import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const verifyLatency = new Trend('verify_latency_ms');
const verifyErrors = new Rate('verify_errors');

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
    },
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 200 },
        { duration: '1m', target: 200 },
        { duration: '30s', target: 0 },
      ],
      startTime: '30s',
    },
  },
  thresholds: {
    'verify_latency_ms': ['p(95)<10', 'p(99)<25'],
    'verify_errors': ['rate<0.01'],
    'http_req_duration': ['p(95)<50'],
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:4000';
const API_KEY = __ENV.API_KEY || 'sk_test_key';

export default function () {
  const res = http.post(`${API_URL}/v1/keys.verifyKey`, JSON.stringify({ key: API_KEY }), {
    headers: { 'Content-Type': 'application/json' },
  });

  verifyLatency.add(res.timings.duration);

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response has valid field': (r) => {
      const body = JSON.parse(r.body);
      return body.valid !== undefined;
    },
    'latency under 10ms': (r) => r.timings.duration < 10,
  });

  if (!success) verifyErrors.add(1);

  sleep(0.1);
}
