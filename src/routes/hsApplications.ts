import { Router, Request, Response } from 'express';

const APPLICATIONS_ENDPOINT = 'https://dev.fraudknight.com/api/gateway/applications';

export const hsApplicationsRouter = Router();

const createProxyHandler =
  (resolveEndpoint: (req: Request) => string, method: 'GET' | 'PUT' = 'GET') =>
  async (req: Request, res: Response): Promise<Response | void> => {
    const authorization = req.header('authorization');
    const tenantId = req.header('x-tenant-id');

    if (!authorization) {
      return res.status(400).json({ error: 'Missing Authorization header' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'Missing x-tenant-id header' });
    }

    const upstreamUrl = new URL(resolveEndpoint(req));
    const existingQueryValues = new Map<string, Set<string>>();
    upstreamUrl.searchParams.forEach((value, key) => {
      if (!existingQueryValues.has(key)) {
        existingQueryValues.set(key, new Set());
      }
      existingQueryValues.get(key)!.add(value);
    });

    const appendQueryParam = (key: string, value: string): void => {
      const values = existingQueryValues.get(key);
      if (values?.has(value)) {
        return;
      }

      if (!values) {
        existingQueryValues.set(key, new Set([value]));
      } else {
        values.add(value);
      }

      upstreamUrl.searchParams.append(key, value);
    };

    Object.entries(req.query).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => appendQueryParam(key, String(entry)));
        return;
      }

      if (value !== undefined) {
        appendQueryParam(key, String(value));
      }
    });

    const headers: Record<string, string> = {
      Authorization: authorization,
      'x-tenant-id': tenantId,
    };

    let body: BodyInit | undefined;

    if (method !== 'GET') {
      const contentType = req.header('content-type');

      if (contentType) {
        headers['content-type'] = contentType;
      }

      if (req.body !== undefined) {
        if (typeof req.body === 'string' || req.body instanceof Buffer) {
          body = req.body;
        } else {
          body = JSON.stringify(req.body);
          if (!headers['content-type']) {
            headers['content-type'] = 'application/json';
          }
        }
      }
    }

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method,
        headers,
        body,
      });

      const responseBody = await upstreamResponse.text();
      const contentType = upstreamResponse.headers.get('content-type');

      if (contentType) {
        res.set('content-type', contentType);
      }

      res.status(upstreamResponse.status).send(responseBody);
    } catch (error) {
      console.error('Failed to proxy hs-applications request', error);
      res.status(502).json({ error: 'Failed to fetch applications data' });
    }
  };

hsApplicationsRouter.get(
  '/',
  createProxyHandler((req) => {
    const upstreamUrl = new URL(APPLICATIONS_ENDPOINT);
    const appendHaystackClientId = (value: unknown): void => {
      if (value === undefined) {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(appendHaystackClientId);
        return;
      }

      upstreamUrl.searchParams.append('haystackClientId', String(value));
    };

    appendHaystackClientId(req.query.haystackClientId);

    return upstreamUrl.toString();
  })
);
hsApplicationsRouter.get(
  '/:applicationId',
  createProxyHandler((req) => `${APPLICATIONS_ENDPOINT}/${req.params.applicationId}`)
);
hsApplicationsRouter.get(
  '/:applicationId/notes',
  createProxyHandler((req) => `${APPLICATIONS_ENDPOINT}/${req.params.applicationId}/notes`)
);
hsApplicationsRouter.put(
  '/:applicationId/notes/:noteId',
  createProxyHandler(
    (req) =>
      `${APPLICATIONS_ENDPOINT}/${req.params.applicationId}/notes/${req.params.noteId}`,
    'PUT'
  )
);
