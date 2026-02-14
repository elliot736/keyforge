import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { VerifyKeyResponse } from '@keyforge/shared';
import { KeyForge } from '../client.js';

export interface KeyForgeFastifyOptions {
  /** A configured KeyForge client instance */
  client: KeyForge;
  /** Custom error handler */
  onError?: (req: FastifyRequest, reply: FastifyReply, error: unknown) => void;
  /** Custom key extraction — defaults to reading the Authorization Bearer header */
  extractKey?: (req: FastifyRequest) => string | null;
}

// Augment Fastify's request type
declare module 'fastify' {
  interface FastifyRequest {
    keyforge: VerifyKeyResponse | null;
  }
}

/**
 * Fastify plugin that verifies API keys via the KeyForge API.
 *
 * On success the verified key metadata is attached to `request.keyforge`.
 */
export function keyforgePlugin(
  fastify: FastifyInstance,
  options: KeyForgeFastifyOptions,
  done: () => void,
) {
  fastify.decorateRequest('keyforge', null);

  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const key =
      options.extractKey?.(req) ??
      (req.headers.authorization?.replace('Bearer ', '') || null);

    if (!key) {
      if (options.onError) return options.onError(req, reply, { code: 'MISSING_KEY' });
      return reply.status(401).send({ error: 'Missing API key' });
    }

    try {
      const result = await options.client.keys.verify({ key });

      if (!result.valid) {
        const status = result.code === 'RATE_LIMITED' ? 429 : 403;
        if (options.onError) return options.onError(req, reply, result);
        return reply.status(status).send({ error: result.code });
      }

      if (result.rateLimit) {
        reply.header('X-RateLimit-Limit', String(result.rateLimit.limit));
        reply.header('X-RateLimit-Remaining', String(result.rateLimit.remaining));
        reply.header('X-RateLimit-Reset', String(result.rateLimit.reset));
      }

      (req as FastifyRequest).keyforge = result;
    } catch (err) {
      if (options.onError) return options.onError(req, reply, err);
      return reply.status(500).send({ error: 'Internal verification error' });
    }
  });

  done();
}
