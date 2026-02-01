import { Router, Request, Response } from 'express';

const APPLICATIONS_ENDPOINT = 'https://fraudknight.com/api/gateway/applications';
const DEFAULT_SORT = 'createdDate,asc';
const DEFAULT_EXCLUDE_LIVE_PROFILE = 'true';
const ALLOWED_SORTS = [
  'modifiedDate,desc',
  'modifiedDate,asc',
  'createdDate,asc',
  'createdDate,desc',
] as const;
type ApplicationSort = (typeof ALLOWED_SORTS)[number];
const isApplicationSort = (value: string): value is ApplicationSort =>
  (ALLOWED_SORTS as readonly string[]).includes(value);
const normalizeSortValue = (value: string): string =>
  value.trim().replace(/%2C/gi, ',');

export type ApplicationStatus =
  // common
  | 'OPEN'
  | 'CLIENT_INFORMED' // obsolete status, replaced by COMPLETED
  // for Live Profile application
  | 'LOCKED'
  | 'UNLOCKED'
  // OpenPayd
  | 'PENDING_ON_CUSTOMER'
  | 'PENDING_ON_CUSTOMER_SECOND'
  | 'PENDING_SALES_TEAM'
  | 'PENDING_ONBOARDING_COMPLIANCE_FIRST'
  | 'PENDING_BANKING'
  | 'PENDING_INTERNAL_CHECKING'
  | 'PENDING_INTEGRATION_CHECKING'
  | 'PENDING_ONBOARDING_COMPLIANCE_SECOND_LINE'
  | 'PENDING_ONBOARDING_COMPLIANCE_THIRD'
  | 'PENDING_UK_MLRO'
  | 'PENDING_MALTA_MLRO'
  | 'PENDING_SALES_TEAM_FINAL' // obsolete status, replaced by COMPLETED
  | 'COMPLETED'
  | 'EXPIRED'
  | 'PENDING_SENIOR_COMPLIANCE' // obsolete status
  | 'PENDING_ONBOARDING_OPERATIONS'
  | 'PENDING_ONBOARDING_OPERATIONS_SECOND'
  | 'PENDING_FORMS_SIGNATURE'
  | 'PENDING_REVIEW_COMPLIANCE'
  | 'PENDING_REVIEW_SENIOR_COMPLIANCE'
  // EMB
  | 'PENDING_AML_TEAM_PREQUESTIONNAIRE'
  | 'PENDING_BOARD_MEMBER'
  | 'PENDING_ON_CUSTOMER_FURTHER_FORMS'
  | 'PENDING_AML_TEAM'
  | 'PENDING_RISK_SCORE_CHECK'
  | 'PENDING_PEP_CHECK'
  | 'PENDING_ON_CUSTOMER_FURTHER_INFO'
  | 'PENDING_ON_SALES_TEAM_FINAL_STAGE'
  | 'PENDING_MLRO_MANAGER'
  | 'PENDING_MLRO_MANAGER_AFTER_AML'
  | 'PENDING_ON_SALES_TEAM_AFTER_MLRO'
  | 'PENDING_ON_SALES_TEAM_HIGH_RISK'
  | 'PENDING_ON_SALES_TEAM_PREQUESTIONNAIRE'
  | 'PENDING_ON_CUSTOMER_PREQUESTIONNAIRE'
  | 'PENDING_PREQUESTIONNAIRE_CHECK';

const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'OPEN',
  'CLIENT_INFORMED',
  'LOCKED',
  'UNLOCKED',
  'PENDING_ON_CUSTOMER',
  'PENDING_ON_CUSTOMER_SECOND',
  'PENDING_SALES_TEAM',
  'PENDING_ONBOARDING_COMPLIANCE_FIRST',
  'PENDING_BANKING',
  'PENDING_INTERNAL_CHECKING',
  'PENDING_INTEGRATION_CHECKING',
  'PENDING_ONBOARDING_COMPLIANCE_SECOND_LINE',
  'PENDING_ONBOARDING_COMPLIANCE_THIRD',
  'PENDING_UK_MLRO',
  'PENDING_MALTA_MLRO',
  'PENDING_SALES_TEAM_FINAL',
  'COMPLETED',
  'EXPIRED',
  'PENDING_SENIOR_COMPLIANCE',
  'PENDING_ONBOARDING_OPERATIONS',
  'PENDING_ONBOARDING_OPERATIONS_SECOND',
  'PENDING_FORMS_SIGNATURE',
  'PENDING_REVIEW_COMPLIANCE',
  'PENDING_REVIEW_SENIOR_COMPLIANCE',
  'PENDING_AML_TEAM_PREQUESTIONNAIRE',
  'PENDING_BOARD_MEMBER',
  'PENDING_ON_CUSTOMER_FURTHER_FORMS',
  'PENDING_AML_TEAM',
  'PENDING_RISK_SCORE_CHECK',
  'PENDING_PEP_CHECK',
  'PENDING_ON_CUSTOMER_FURTHER_INFO',
  'PENDING_ON_SALES_TEAM_FINAL_STAGE',
  'PENDING_MLRO_MANAGER',
  'PENDING_MLRO_MANAGER_AFTER_AML',
  'PENDING_ON_SALES_TEAM_AFTER_MLRO',
  'PENDING_ON_SALES_TEAM_HIGH_RISK',
  'PENDING_ON_SALES_TEAM_PREQUESTIONNAIRE',
  'PENDING_ON_CUSTOMER_PREQUESTIONNAIRE',
  'PENDING_PREQUESTIONNAIRE_CHECK',
];

const isApplicationStatus = (value: string): value is ApplicationStatus =>
  APPLICATION_STATUSES.includes(value as ApplicationStatus);

export const prodHsApplicationsRouter = Router();

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

    const allowedQueryParams = ['page', 'size'] as const;
    allowedQueryParams.forEach((param) => {
      const value = req.query[param];
      if (Array.isArray(value)) {
        value.forEach((entry) => appendQueryParam(param, String(entry)));
        return;
      }

      if (value !== undefined) {
        appendQueryParam(param, String(value));
      }
    });

    const mainStatusQuery = req.query.mainStatus;
    const appendMainStatus = (value: unknown): void => {
      if (value === undefined) {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(appendMainStatus);
        return;
      }

      const statusValue = String(value);
      if (isApplicationStatus(statusValue)) {
        appendQueryParam('mainStatus', statusValue);
      }
    };

    appendMainStatus(mainStatusQuery);

    const sortQuery = req.query.sort;
    let appliedSort = false;
    const appendSort = (value: unknown): void => {
      if (value === undefined) {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(appendSort);
        return;
      }

      const sortValue = normalizeSortValue(String(value));
      if (isApplicationSort(sortValue)) {
        upstreamUrl.searchParams.set('sort', sortValue);
        appliedSort = true;
      }
    };

    appendSort(sortQuery);
    if (!appliedSort) {
      upstreamUrl.searchParams.set('sort', DEFAULT_SORT);
    }

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
      console.error('Failed to proxy prod-hs-applications request', error);
      res.status(502).json({ error: 'Failed to fetch applications data' });
    }
  };

prodHsApplicationsRouter.get(
  '/',
  createProxyHandler(() => {
    const upstreamUrl = new URL(APPLICATIONS_ENDPOINT);
    upstreamUrl.searchParams.set('excludeLiveProfile', DEFAULT_EXCLUDE_LIVE_PROFILE);

    return upstreamUrl.toString();
  })
);
