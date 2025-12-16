import { Router, Request, Response } from 'express';

const CASES_ENDPOINT = 'https://dev.fraudknight.com/api/gateway/cases';

export const casesRouter = Router();

const DEFAULT_QUERY: Record<string, string> = {
  page: '0',
  tenantId: '3',
  size: '100',
  sort: 'createdDateTime,desc',
  caseStatus: 'OPEN',
  caseType: 'APPLICATION',
  assigneeId: '3e5335d6-0edc-4db4-a8a9-f03dc81dc0a9',
};

const createProxyHandler =
  (resolveEndpoint: (req: Request) => string) =>
  async (req: Request, res: Response): Promise<Response | void> => {
    const authorization = req.header('authorization');
    const tenantHeader = req.header('x-tenant-id') ?? DEFAULT_QUERY.tenantId;

    if (!authorization) {
      return res.status(400).json({ error: 'Missing Authorization header' });
    }

    const upstreamUrl = new URL(resolveEndpoint(req));

    // apply defaults first
    Object.entries(DEFAULT_QUERY).forEach(([key, value]) => {
      upstreamUrl.searchParams.set(key, value);
    });

    // override or append with incoming query params
    Object.entries(req.query).forEach(([key, value]) => {
      // remove existing values for this key to allow overrides
      upstreamUrl.searchParams.delete(key);

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
          'x-tenant-id': tenantHeader,
        },
      });

      const responseBody = await upstreamResponse.text();
      const contentType = upstreamResponse.headers.get('content-type');

      if (contentType) {
        res.set('content-type', contentType);
      }

      res.status(upstreamResponse.status).send(responseBody);
    } catch (error) {
      console.error('Failed to proxy cases request', error);
      res.status(502).json({ error: 'Failed to fetch cases data' });
    }
  };

casesRouter.get('/', createProxyHandler(() => CASES_ENDPOINT));
