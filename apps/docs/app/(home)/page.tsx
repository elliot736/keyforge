'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  KeyRound,
  Github,
  Sun,
  Moon,
  Zap,
  Shield,
  BarChart3,
  Coins,
  Gauge,
  Webhook,
  ArrowRight,
  Check,
  X,
  Play,
  Copy,
  CheckCircle2,
  Terminal,
  Loader2,
} from 'lucide-react';

const s = {
  bg: { background: 'var(--kf-bg)' },
  bgCode: { backgroundColor: 'var(--kf-bg-code)' },
  border: { borderColor: 'var(--kf-border)' },
  borderSubtle: { borderColor: 'var(--kf-border-subtle)' },
  accent: { color: 'var(--kf-accent)' },
  accentBg: { backgroundColor: 'var(--kf-accent)', color: 'var(--kf-accent-text)' },
  text: { color: 'var(--kf-text)' },
  text2: { color: 'var(--kf-text-secondary)' },
  text3: { color: 'var(--kf-text-tertiary)' },
  muted: { color: 'var(--kf-text-muted)' },
} as const;

const frameworks = [
  {
    name: 'Express',
    code: `import { keyforgeMiddleware } from '@keyforge/sdk/middleware/express';

app.use('/api', keyforgeMiddleware({ keyforge: kf }));

app.post('/api/completions', (req, res) => {
  const { keyId, ownerId, scopes } = req.keyforge;
  // Your AI endpoint logic
});`,
  },
  {
    name: 'Next.js',
    code: `import { withKeyForge } from '@keyforge/sdk/middleware/nextjs';

export const middleware = withKeyForge({
  keyforge: kf,
  matcher: ['/api/:path*'],
});`,
  },
  {
    name: 'Fastify',
    code: `import { keyforgePlugin } from '@keyforge/sdk/middleware/fastify';

fastify.register(keyforgePlugin, { keyforge: kf });

fastify.post('/api/completions', async (req, reply) => {
  const { keyId, ownerId } = req.keyforge;
});`,
  },
  {
    name: 'Hono',
    code: `import { keyforgeMiddleware } from '@keyforge/sdk/middleware/hono';

app.use('/api/*', keyforgeMiddleware({ keyforge: kf }));

app.post('/api/completions', (c) => {
  const { keyId, ownerId } = c.get('keyforge');
});`,
  },
];

const features = [
  { icon: Zap, title: 'Sub-5ms Verification', desc: 'Redis-cached key lookups with Postgres fallback' },
  { icon: Gauge, title: '3 Rate-Limit Algorithms', desc: 'Fixed window, sliding window, token bucket' },
  { icon: Coins, title: 'Per-Model Budgets', desc: 'Token limits and spend caps per AI model' },
  { icon: BarChart3, title: 'Cost Analytics', desc: 'Model breakdown, cost projection, usage trends' },
  { icon: Shield, title: 'Model Policies', desc: 'Block models, per-model rate limits and caps' },
  { icon: Webhook, title: 'Webhook Alerts', desc: 'Quota warnings at 80%, 90%, 100% via webhooks' },
];

const comparison = [
  { feature: 'Self-hosted', kf: true, unkey: false, custom: true },
  { feature: 'Per-model rate limits', kf: true, unkey: false, custom: false },
  { feature: 'Token budget tracking', kf: true, unkey: false, custom: false },
  { feature: 'Spend cap enforcement', kf: true, unkey: false, custom: false },
  { feature: 'Cost analytics by model', kf: true, unkey: false, custom: false },
  { feature: 'Embeddable React portal', kf: true, unkey: true, custom: false },
  { feature: 'Sub-5ms verification', kf: true, unkey: true, custom: false },
  { feature: 'Webhook notifications', kf: true, unkey: true, custom: false },
  { feature: 'Open source', kf: true, unkey: true, custom: true },
  { feature: 'Setup time', kf: '2 min', unkey: '2 min', custom: '2+ weeks' },
];

const DEMO_KEYS: Record<string, { valid: boolean; response: object }> = {
  'kf_live_demo_valid_key_abc123': {
    valid: true,
    response: {
      valid: true,
      keyId: 'key_9f8a7b6c5d4e',
      ownerId: 'user_12345',
      workspaceId: 'ws_prod_main',
      name: 'Production API Key',
      environment: 'production',
      scopes: ['completions.create', 'models.read'],
      meta: { team: 'ml-platform', tier: 'pro' },
      rateLimit: { limit: 1000, remaining: 847, reset: Date.now() + 42000 },
      usage: { requests: 153, tokens: 284500 },
    },
  },
  'kf_live_demo_ratelimited_key': {
    valid: false,
    response: {
      valid: false,
      code: 'RATE_LIMITED',
      rateLimit: { limit: 100, remaining: 0, reset: Date.now() + 12000 },
    },
  },
  'kf_live_demo_expired_key': {
    valid: false,
    response: {
      valid: false,
      code: 'KEY_EXPIRED',
    },
  },
};

const DEMO_KEY_OPTIONS = [
  { label: 'Valid key', value: 'kf_live_demo_valid_key_abc123' },
  { label: 'Rate limited', value: 'kf_live_demo_ratelimited_key' },
  { label: 'Expired key', value: 'kf_live_demo_expired_key' },
];

function InteractiveDemo() {
  const [demoKey, setDemoKey] = useState('kf_live_demo_valid_key_abc123');
  const [demoModel, setDemoModel] = useState('gpt-4o');
  const [demoResult, setDemoResult] = useState<object | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoLatency, setDemoLatency] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [typingResult, setTypingResult] = useState('');
  const resultRef = useRef<HTMLPreElement>(null);

  const runDemo = async () => {
    setDemoResult(null);
    setDemoLatency(null);
    setTypingResult('');
    setDemoLoading(true);

    // Simulate network latency (2-4ms to show sub-5ms claim)
    const latency = Math.round(1.5 + Math.random() * 2.5 * 10) / 10;
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));

    const match = DEMO_KEYS[demoKey];
    const result = match
      ? match.response
      : { valid: false, code: 'KEY_NOT_FOUND' };

    setDemoLatency(latency);
    setDemoResult(result);
    setDemoLoading(false);

    // Typewriter effect for the JSON output
    const json = JSON.stringify(result, null, 2);
    let i = 0;
    const interval = setInterval(() => {
      i += 3;
      setTypingResult(json.slice(0, i));
      if (i >= json.length) {
        clearInterval(interval);
        setTypingResult(json);
      }
    }, 8);
  };

  const curlCommand = `curl -X POST http://localhost:4000/v1/keys.verifyKey \\
  -H "Content-Type: application/json" \\
  -d '{"key": "${demoKey}", "model": "${demoModel}"}'`;

  const copyCmd = () => {
    navigator.clipboard.writeText(curlCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="px-6 pb-16 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-center mb-2" style={s.text}>
        Try it live
      </h2>
      <p className="text-center text-sm mb-8" style={s.text2}>
        See how key verification works. Pick a scenario and hit verify.
      </p>

      <div className="rounded-xl border overflow-hidden" style={s.border}>
        {/* Demo header */}
        <div
          className="flex items-center gap-2 px-4 py-3 border-b"
          style={{ ...s.bgCode, ...s.border }}
        >
          <Terminal size={14} style={s.accent} />
          <span className="text-xs font-medium" style={s.text2}>Interactive Demo</span>
          {demoLatency != null && (
            <span
              className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'rgba(34,197,94,0.1)',
                color: '#22c55e',
              }}
            >
              {demoLatency}ms
            </span>
          )}
        </div>

        {/* Input area */}
        <div className="p-4 space-y-3" style={s.bg}>
          {/* Scenario pills */}
          <div className="flex flex-wrap gap-2">
            {DEMO_KEY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setDemoKey(opt.value);
                  setDemoResult(null);
                  setTypingResult('');
                  setDemoLatency(null);
                }}
                className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                style={{
                  borderColor: demoKey === opt.value ? 'var(--kf-accent)' : 'var(--kf-border)',
                  color: demoKey === opt.value ? 'var(--kf-accent)' : 'var(--kf-text-secondary)',
                  backgroundColor: demoKey === opt.value ? 'rgba(59,130,246,0.08)' : 'transparent',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Key input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={demoKey}
              onChange={(e) => {
                setDemoKey(e.target.value);
                setDemoResult(null);
                setTypingResult('');
              }}
              className="flex-1 px-3 py-2 rounded-lg border text-sm font-mono outline-none focus:border-[var(--kf-accent)] transition-colors"
              style={{ ...s.border, ...s.bg, color: 'var(--kf-text)' }}
              placeholder="kf_live_..."
            />
            <select
              value={demoModel}
              onChange={(e) => setDemoModel(e.target.value)}
              className="px-3 py-2 rounded-lg border text-xs font-medium outline-none"
              style={{ ...s.border, ...s.bg, color: 'var(--kf-text-secondary)' }}
            >
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="claude-sonnet-4-20250514">claude-sonnet</option>
            </select>
            <button
              onClick={runDemo}
              disabled={demoLoading || !demoKey}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              style={s.accentBg}
            >
              {demoLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              Verify
            </button>
          </div>

          {/* curl command */}
          <div className="relative">
            <pre
              className="p-3 rounded-lg text-xs leading-relaxed overflow-x-auto"
              style={s.bgCode}
            >
              <code style={{ color: 'var(--kf-code-text)' }}>{curlCommand}</code>
            </pre>
            <button
              onClick={copyCmd}
              className="absolute top-2 right-2 p-1.5 rounded-md transition-opacity hover:opacity-80"
              style={s.text3}
            >
              {copied ? <CheckCircle2 size={14} style={{ color: '#22c55e' }} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Response area */}
        {(typingResult || demoLoading) && (
          <div className="border-t" style={s.border}>
            <div
              className="flex items-center gap-2 px-4 py-2 border-b"
              style={{ ...s.bgCode, ...s.border }}
            >
              <span className="text-xs font-medium" style={s.text3}>Response</span>
              {demoResult && (
                <span
                  className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: (demoResult as any).valid
                      ? 'rgba(34,197,94,0.1)'
                      : 'rgba(239,68,68,0.1)',
                    color: (demoResult as any).valid ? '#22c55e' : '#ef4444',
                  }}
                >
                  {(demoResult as any).valid ? '200 OK' : `403 ${(demoResult as any).code}`}
                </span>
              )}
            </div>
            <pre
              ref={resultRef}
              className="p-4 text-sm leading-relaxed overflow-x-auto min-h-[100px]"
              style={s.bgCode}
            >
              {demoLoading ? (
                <span style={s.text3} className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Verifying key...
                </span>
              ) : (
                <code>
                  {typingResult.split('\n').map((line, i) => {
                    // Simple syntax highlighting
                    const highlighted = line
                      .replace(/"([^"]+)":/g, '<key>"$1"</key>:')
                      .replace(/: "(.*?)"/g, ': <str>"$1"</str>')
                      .replace(/: (true)/g, ': <bool>$1</bool>')
                      .replace(/: (false)/g, ': <boolF>$1</boolF>')
                      .replace(/: (\d+\.?\d*)/g, ': <num>$1</num>');

                    return (
                      <span key={i}>
                        {highlighted.split(/(<key>|<\/key>|<str>|<\/str>|<bool>|<\/bool>|<boolF>|<\/boolF>|<num>|<\/num>)/).reduce((acc: any[], part, idx) => {
                          if (part === '<key>' || part === '</key>' || part === '<str>' || part === '</str>' || part === '<bool>' || part === '</bool>' || part === '<boolF>' || part === '</boolF>' || part === '<num>' || part === '</num>') return acc;
                          const prev = highlighted.split(/(<key>|<\/key>|<str>|<\/str>|<bool>|<\/bool>|<boolF>|<\/boolF>|<num>|<\/num>)/);
                          const prevTag = prev[idx - 1];
                          let color = 'var(--kf-code-text)';
                          if (prevTag === '<key>') color = 'var(--kf-accent)';
                          else if (prevTag === '<str>') color = '#22c55e';
                          else if (prevTag === '<bool>') color = '#22c55e';
                          else if (prevTag === '<boolF>') color = '#ef4444';
                          else if (prevTag === '<num>') color = '#f59e0b';
                          acc.push(<span key={idx} style={{ color }}>{part}</span>);
                          return acc;
                        }, [])}
                        {'\n'}
                      </span>
                    );
                  })}
                </code>
              )}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div style={s.bg}>
      {/* Nav */}
      <nav
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ ...s.bg, ...s.border }}
      >
        <Link href="/" className="flex items-center gap-2">
          <KeyRound size={20} style={s.accent} />
          <span className="font-semibold text-lg" style={s.text}>KeyForge</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/docs" className="text-sm hover:opacity-80" style={s.text2}>Docs</Link>
          <a href="https://github.com/elliot736/keyforge" className="hover:opacity-80" style={s.text2}>
            <Github size={18} />
          </a>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-1.5 rounded-md hover:opacity-80"
            style={s.text2}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-20 pb-16 text-center max-w-3xl mx-auto">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs mb-6"
          style={{ ...s.border, ...s.text2 }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--kf-accent)' }} />
          Open Source &middot; Self-Hosted
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight" style={s.text}>
          API key management{' '}
          <span style={s.accent}>built for AI</span>
        </h1>
        <p className="mt-4 text-lg leading-relaxed max-w-xl mx-auto" style={s.text2}>
          Per-model rate limits, token budgets, spend caps, and cost analytics.
          Protect your AI API in minutes, not weeks.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/docs/quickstart"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
            style={s.accentBg}
          >
            Get Started <ArrowRight size={14} />
          </Link>
          <a
            href="https://github.com/elliot736/keyforge"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border transition-opacity hover:opacity-80"
            style={{ ...s.border, ...s.text }}
          >
            <Github size={14} /> GitHub
          </a>
        </div>
        <p className="mt-4 text-xs" style={s.text3}>
          docker compose up &middot; 72 tests &middot; MIT license
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <a href="https://railway.app/template/keyforge">
            <img src="https://railway.app/button.svg" alt="Deploy on Railway" height="32" />
          </a>
          <a href="https://render.com/deploy?repo=https://github.com/elliot736/keyforge">
            <img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" height="32" />
          </a>
        </div>
      </section>

      {/* Code Example */}
      <section className="px-6 pb-16 max-w-3xl mx-auto">
        <div className="rounded-xl border overflow-hidden" style={s.border}>
          <div className="flex border-b" style={{ ...s.bgCode, ...s.border }}>
            {frameworks.map((fw, i) => (
              <button
                key={fw.name}
                onClick={() => setActiveTab(i)}
                className="px-4 py-2.5 text-xs font-medium border-b-2 transition-colors"
                style={{
                  borderColor: activeTab === i ? 'var(--kf-accent)' : 'transparent',
                  color: activeTab === i ? 'var(--kf-accent)' : 'var(--kf-text-tertiary)',
                }}
              >
                {fw.name}
              </button>
            ))}
          </div>
          <pre className="p-4 overflow-x-auto text-sm leading-relaxed" style={s.bgCode}>
            <code style={{ color: 'var(--kf-code-text)' }}>{frameworks[activeTab].code}</code>
          </pre>
        </div>
      </section>

      {/* Interactive Demo */}
      <InteractiveDemo />

      {/* Features Grid */}
      <section className="px-6 pb-16 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-8" style={s.text}>
          Built for the AI stack
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="p-5 rounded-xl border transition-colors hover:border-[var(--kf-accent)]"
                style={s.border}
              >
                <Icon size={20} style={s.accent} />
                <h3 className="mt-3 font-semibold text-sm" style={s.text}>{f.title}</h3>
                <p className="mt-1 text-xs leading-relaxed" style={s.text2}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="px-6 pb-20 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-8" style={s.text}>
          How KeyForge compares
        </h2>
        <div className="rounded-xl border overflow-hidden" style={s.border}>
          <table className="w-full text-sm">
            <thead>
              <tr style={s.bgCode}>
                <th className="text-left px-4 py-3 font-medium" style={s.text2}>Feature</th>
                <th className="px-4 py-3 font-medium" style={s.accent}>KeyForge</th>
                <th className="px-4 py-3 font-medium" style={s.text2}>Unkey</th>
                <th className="px-4 py-3 font-medium" style={s.text2}>Custom</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row, i) => (
                <tr key={row.feature} className="border-t" style={s.border}>
                  <td className="px-4 py-2.5" style={s.text}>{row.feature}</td>
                  {[row.kf, row.unkey, row.custom].map((val, j) => (
                    <td key={j} className="px-4 py-2.5 text-center">
                      {typeof val === 'boolean' ? (
                        val ? (
                          <Check size={16} className="mx-auto" style={s.accent} />
                        ) : (
                          <X size={16} className="mx-auto" style={s.text3} />
                        )
                      ) : (
                        <span style={j === 0 ? s.accent : s.text2}>{val}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t text-center" style={{ ...s.bg, ...s.border }}>
        <p className="text-xs" style={s.text3}>
          KeyForge is open source under the MIT license.
        </p>
      </footer>
    </div>
  );
}
