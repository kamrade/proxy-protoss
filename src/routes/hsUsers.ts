import { Router, Request, Response } from 'express';

const USERS_ENDPOINT = 'https://dev.fraudknight.com/api/gateway/users';

export const hsUsersRouter = Router();

const createProxyHandler =
  (resolveEndpoint: (req: Request) => string) =>
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
    Object.entries(req.query).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => upstreamUrl.searchParams.append(key, String(entry)));
        return;
      }

      if (value !== undefined) {
        upstreamUrl.searchParams.append(key, String(value));
      }
    });

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: 'GET',
        headers: {
          Authorization: authorization,
          'x-tenant-id': tenantId,
        },
      });

      const responseBody = await upstreamResponse.text();
      const contentType = upstreamResponse.headers.get('content-type');

      if (contentType) {
        res.set('content-type', contentType);
      }

      res.status(upstreamResponse.status).send(responseBody);
    } catch (error) {
      console.error('Failed to proxy hs-users request', error);
      res.status(502).json({ error: 'Failed to fetch users data' });
    }
  };

hsUsersRouter.get('/', createProxyHandler(() => USERS_ENDPOINT));
hsUsersRouter.get(
  '/:userId',
  createProxyHandler((req) => `${USERS_ENDPOINT}/${req.params.userId}`)
);
