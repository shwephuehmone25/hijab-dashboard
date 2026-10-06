import axios from 'axios';
import {
  MediaMeta,
  User,
  Product,
  Order,
  Role,
  Permission,
  Post,
  Media,
  Comment,
  PaymentGateway,
  Coupon,
  CouponListResponse,
  CreateCouponRequest,
  UpdateCouponRequest,
  Setting,
  ShippingMethod,
  OrderShipment,
  ProductAttribute,
  Category,
  Tag,
  AuthLogin,
  Pagination,
  PaginatedResponse,
  ProductAttributeValue,
  UserMeta,
  TokenLog,
  TokenLogFilters,
  TokenLogStatistics,
  BlacklistTokenRequest,
  BlacklistUserTokensRequest,
  FlashSaleCampaign,
  FlashSaleProduct,
  EmailLog,
  EmailStats,
  EmailSettings,
  EmailTemplate,
  EmailLogFilters,
  TestEmailRequest,
  EmailSettingsRequest,
  EmailTemplateRequest,
  DeleteOldEmailLogsRequest,
  UserPoints,
  Customer,
  CustomerListResponse,
  CustomerAddress,
  CustomerAddressListResponse,
  PointsTransaction,
  PointsRule,
  PointsProduct,
  PointsStats,
  AdjustPointsRequest,
  CreatePointsRuleRequest,
  UpdatePointsRuleRequest,
  CreatePointsProductRequest,
} from './types';
import type {
  OverviewStats,
  SalesStats,
  TopProduct,
  OrderStatusStats,
  RevenueData
} from '@/types/generated';
import { QueryParams, buildQueryParams, validateQueryParams } from './queryBuilder';
import { transformResponse } from './transformers';
import type { ErrorResponse } from '@/types/api';
import { shouldEnableMocks } from '@/mocks/config';

// Accepts plain objects (typed form values) or FormData payloads
type UnknownRecord = Record<string, unknown> | FormData;

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (shouldEnableMocks()
    ? `${import.meta.env.BASE_URL}api/v1/admin`
    : 'http://localhost:3000/api/v1/admin');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const customerToUser = (customer: Customer): User => ({
  id: customer.id,
  username: customer.phone ?? '',
  email: customer.email,
  display_name: customer.name,
  status: 1,
  roles: [],
  role: 'CUSTOMER',
  registered_at: customer.createdAt,
});

// Request interceptor to add auth token and transform data
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

let refreshInFlight: Promise<{ access_token: string; refresh_token: string }> | null = null;

// Response interceptor for token refresh and error handling
api.interceptors.response.use(
  (response: any) => {
    // Transform response data from snake_case to camelCase
    const transformedData = transformResponse(response.data);
    return transformedData as any;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const noAuthUrl = ['/auth/login', '/auth/refresh'];

    // Pattern 1: Network errors (no response from server)
    if (!error.response) {
      return Promise.reject({
        success: false,
        message: 'Network error. Please check your connection.',
        error: 'NETWORK_ERROR'
      } as ErrorResponse);
    }

    // Pattern 2: Validation errors (400 Bad Request)
    if (status === 400) {
      const errorData = error.response.data;
      return Promise.reject({
        success: false,
        message: errorData.message || 'Validation failed',
        error: errorData.error,
        errors: errorData.errors || []
      } as ErrorResponse);
    }

    // Pattern 3: Authentication errors (401 Unauthorized)
    if (status === 401 && !originalRequest._retry && !noAuthUrl.includes(originalRequest.url.split('?')[0])) {
      originalRequest._retry = true;

      // Attempt to refresh token
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const currentToken = localStorage.getItem('access_token');
          if (currentToken && originalRequest.headers.Authorization !== `Bearer ${currentToken}`) {
            originalRequest.headers.Authorization = `Bearer ${currentToken}`;
            return api.request(originalRequest);
          }
          // Share refresh across concurrent requests because refresh tokens are single-use.
          if (!refreshInFlight) {
            refreshInFlight = axios.post<{ access_token: string; refresh_token: string }>(
              `${API_BASE_URL}/auth/refresh`,
              { refresh_token: refreshToken },
              { timeout: 10_000 }
            ).then(({ data }) => {
              if (!data.access_token || !data.refresh_token) throw new Error('Invalid refresh response');
              localStorage.setItem('access_token', data.access_token);
              localStorage.setItem('refresh_token', data.refresh_token);
              return data;
            }).finally(() => { refreshInFlight = null; });
          }
          const { access_token } = await refreshInFlight;

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api.request(originalRequest);
        } catch (refreshError) {
          // Refresh failed, clear tokens and redirect to login
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('admin_user');
          window.location.href = import.meta.env.VITE_ROUTER_MODE === 'hash'
            ? `${import.meta.env.BASE_URL}#/login`
            : `${import.meta.env.BASE_URL}login`;

          return Promise.reject({
            success: false,
            message: 'Session expired. Please login again.',
            error: 'AUTH_EXPIRED'
          } as ErrorResponse);
        }
      } else {
        // No refresh token, redirect to login
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('admin_user');
        window.location.href = import.meta.env.VITE_ROUTER_MODE === 'hash'
          ? `${import.meta.env.BASE_URL}#/login`
          : `${import.meta.env.BASE_URL}login`;

        return Promise.reject({
          success: false,
          message: 'Authentication required. Please login.',
          error: 'AUTH_REQUIRED'
        } as ErrorResponse);
      }
    }

    // Authorization errors (403 Forbidden)
    if (status === 403) {
      return Promise.reject({
        success: false,
        message: error.response.data?.message || 'You do not have permission to perform this action.',
        error: 'FORBIDDEN'
      } as ErrorResponse);
    }

    // Not found errors (404)
    if (status === 404) {
      return Promise.reject({
        success: false,
        message: error.response.data?.message || 'Resource not found.',
        error: 'NOT_FOUND'
      } as ErrorResponse);
    }

    // Server errors (500+)
    if (status >= 500) {
      return Promise.reject({
        success: false,
        message: 'Server error. Please try again later.',
        error: 'SERVER_ERROR'
      } as ErrorResponse);
    }

    // Generic error response for other status codes
    return Promise.reject({
      success: false,
      message: error.response.data?.message || 'An error occurred',
      error: error.response.data?.error || 'UNKNOWN_ERROR'
    } as ErrorResponse);
  }
);

// Create a unified API interface that can switch between real API and mock
const createApi = () => {
  // Real API implementation using axios
  return {
    auth: {
      login: (payload: UnknownRecord): Promise<AuthLogin> => api.post('/auth/login', payload),
      refresh: (payload: UnknownRecord): Promise<unknown> => api.post('/auth/refresh', payload),
      logout: (): Promise<unknown> => api.post('/auth/logout'),
      me: (): Promise<User> => api.get('/auth/me'),
    },
    customers: {
      list: async (params: QueryParams): Promise<PaginatedResponse<User>> => {
        const page = Number(params.page ?? 1);
        const limit = Number(params.pageSize ?? 20);
        const queryParams = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });
        const search = params.search?.trim();
        if (search) queryParams.set('search', search);

        const response = await api.get(
          `/customers?${queryParams.toString()}`
        ) as unknown as CustomerListResponse;
        return {
          items: response.items.map(customerToUser),
          pagination: {
            page: response.page,
            pageSize: response.limit,
            total: response.total,
            totalPages: Math.ceil(response.total / response.limit),
          },
        };
      },
      get: async (id: number): Promise<User> => {
        const customer = await api.get(`/customers/${id}`) as unknown as Customer;
        return customerToUser(customer);
      },
      create: (payload: UnknownRecord): Promise<Customer> => api.post('/customers', payload),
      update: (id: number, payload: UnknownRecord): Promise<Customer> => api.patch(`/customers/${id}`, payload),
      delete: (id: number): Promise<unknown> => api.delete(`/customers/${id}`),
      addresses: {
        list: (customerId: number): Promise<CustomerAddressListResponse> =>
          api.get(`/customers/${customerId}/addresses?page=1&limit=100`),
        get: (customerId: number, addressId: number): Promise<CustomerAddress> =>
          api.get(`/customers/${customerId}/addresses/${addressId}`),
        create: (customerId: number, payload: UnknownRecord): Promise<CustomerAddress> =>
          api.post(`/customers/${customerId}/addresses`, payload),
        update: (customerId: number, addressId: number, payload: UnknownRecord): Promise<CustomerAddress> =>
          api.patch(`/customers/${customerId}/addresses/${addressId}`, payload),
        delete: (customerId: number, addressId: number): Promise<unknown> =>
          api.delete(`/customers/${customerId}/addresses/${addressId}`),
      },
    },
    users: {
      list: (params: QueryParams): Promise<PaginatedResponse<User>> => {
        const validated = validateQueryParams(params);
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/users?${queryString}`);
      },
      get: (id: number): Promise<User> => api.get(`/users/${id}`),
      create: (payload: UnknownRecord): Promise<User> => api.post('/users', payload),
      update: (id: number, payload: UnknownRecord): Promise<User> => api.put(`/users/${id}`, payload),
      delete: (id: number): Promise<unknown> => api.delete(`/users/${id}`),
      addresses: {
        list: (userId: number) => api.get(`/users/addresses/${userId}`),
        create: (userId: number, payload: UnknownRecord) => api.post(`/users/addresses/${userId}`, payload),
        update: (userId: number, addressId: number, payload: UnknownRecord) =>
          api.put(`/users/addresses/${userId}/${addressId}`, payload),
        delete: (userId: number, addressId: number) =>
          api.delete(`/users/addresses/${userId}/${addressId}`),
        setDefault: (userId: number, addressId: number) =>
          api.patch(`/users/addresses/${userId}/${addressId}/default`),
      },
      meta: {
        list: (userId: number): Promise<UserMeta[]> => api.get(`/users/${userId}/meta`),
        get: (userId: number, key: string): Promise<UserMeta> => api.get(`/users/${userId}/meta/${key}`),
        set: (userId: number, key: string, value: unknown): Promise<UserMeta> =>
          api.put(`/users/${userId}/meta/${key}`, { value }),
        delete: (userId: number, key: string): Promise<unknown> =>
          api.delete(`/users/${userId}/meta/${key}`),
        batchUpdate: (userId: number, meta: Record<string, unknown>): Promise<unknown> =>
          api.put(`/users/${userId}/meta/batch`, { meta }),
      },
    },
    products: {
      list: (params: QueryParams): Promise<PaginatedResponse<Product>> => {
        const validated = validateQueryParams(params);
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/products?${queryString}`);
      },
      search: (params: QueryParams): Promise<PaginatedResponse<Product>> => {
        const validated = validateQueryParams(params);
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/products/search?${queryString}`);
      },
      get: (id: number): Promise<Product> => api.get(`/products/${id}`),
      createSimple: (payload: UnknownRecord): Promise<Product> => api.post('/products/simple', payload),
      createVariable: (payload: UnknownRecord): Promise<Product> => api.post('/products/variable', payload),
      update: (id: number, payload: UnknownRecord): Promise<Product> => api.put(`/products/${id}`, payload),
      delete: (id: number): Promise<unknown> => api.delete(`/products/${id}`),
      batchDelete: (payload: UnknownRecord): Promise<unknown> => api.delete('/products/batch', { data: payload }),
      batchUpdateStatus: (payload: UnknownRecord): Promise<unknown> => api.put('/products/status/batch', payload),
      batchUpdateStock: (payload: UnknownRecord): Promise<unknown> => api.put('/products/stock/batch', payload),
      byCategory: (categoryId: number, params?: UnknownRecord): Promise<PaginatedResponse<Product>> => api.get(`/products/category/${categoryId}`, { params }),
      byTag: (tagId: number, params?: UnknownRecord): Promise<PaginatedResponse<Product>> => api.get(`/products/tag/${tagId}`, { params }),
      variants: {
        list: (parentId: number): Promise<{ variants: Product[] }> =>
          api.get(`/products/variants/${parentId}`),
        create: (parentId: number, payload: UnknownRecord): Promise<Product> =>
          api.post(`/products/variants/${parentId}`, payload),
        update: (variantId: number, payload: UnknownRecord): Promise<Product> =>
          api.put(`/products/variants/${variantId}`, payload),
        delete: (variantId: number): Promise<unknown> => api.delete(`/products/variants/${variantId}`),
      },
      stock: {
        update: (productId: number, payload: UnknownRecord) => api.put(`/products/stock/${productId}`, payload),
        batchUpdate: (payload: UnknownRecord) => api.put('/products/stock/batch', payload),
      },
    },
    orders: {
      list: (params: QueryParams): Promise<PaginatedResponse<Order>> => {
        const validated = validateQueryParams(params);
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/orders?${queryString}`);
      },
      get: (id: number): Promise<Order> => api.get(`/orders/${id}`),
      updateStatus: (id: number, payload: UnknownRecord): Promise<Order> => api.put(`/orders/${id}/status`, payload),
      statistics: (params: UnknownRecord): Promise<unknown> => api.get('/orders/stats', { params }),
    },
    attributes: {
      list: (): Promise<ProductAttribute[]> => api.get('/attributes'),
      get: (id: number): Promise<ProductAttribute> => api.get(`/attributes/${id}`),
      create: (payload: UnknownRecord): Promise<ProductAttribute> => api.post('/attributes', payload),
      update: (id: number, payload: UnknownRecord): Promise<ProductAttribute> => api.put(`/attributes/${id}`, payload),
      delete: (id: number): Promise<unknown> => api.delete(`/attributes/${id}`),
      values: {
        list: (attributeId: number): Promise<ProductAttributeValue[]> =>
          api.get(`/attributes/${attributeId}/values`),
        create: (attributeId: number, payload: UnknownRecord): Promise<ProductAttributeValue> =>
          api.post(`/attributes/${attributeId}/values`, payload),
        update: (attributeId: number, valueId: number, payload: UnknownRecord): Promise<ProductAttributeValue> =>
          api.put(`/attributes/${attributeId}/values/${valueId}`, payload),
        delete: (attributeId: number, valueId: number): Promise<unknown> =>
          api.delete(`/attributes/${attributeId}/values/${valueId}`),
      },
    },
    taxonomies: {
      categories: {
        list: (params: QueryParams): Promise<PaginatedResponse<Category>> => {
          const validated = validateQueryParams(params);
          const queryString = buildQueryParams(validated).toString();
          return api.get(`/taxonomies/categories?${queryString}`);
        },
        tree: (params: QueryParams): Promise<Category[]> => {
          const validated = validateQueryParams(params);
          const queryString = buildQueryParams(validated).toString();
          return api.get(`/taxonomies/categories/tree?${queryString}`);
        },
        get: (id: number): Promise<Category> => api.get(`/taxonomies/categories/${id}`),
        create: (payload: UnknownRecord): Promise<Category> => api.post('/taxonomies/categories', payload),
        update: (id: number, payload: UnknownRecord): Promise<Category> => api.put(`/taxonomies/categories/${id}`, payload),
        delete: (id: number): Promise<unknown> => api.delete(`/taxonomies/categories/${id}`),
      },
      tags: {
        list: (params: QueryParams): Promise<PaginatedResponse<Tag>> => {
          const validated = validateQueryParams(params);
          const queryString = buildQueryParams(validated).toString();
          return api.get(`/taxonomies/tags?${queryString}`);
        },
        get: (id: number): Promise<Tag> => api.get(`/taxonomies/tags/${id}`),
        create: (payload: UnknownRecord): Promise<Tag> => api.post('/taxonomies/tags', payload),
        update: (id: number, payload: UnknownRecord): Promise<Tag> => api.put(`/taxonomies/tags/${id}`, payload),
        delete: (id: number): Promise<unknown> => api.delete(`/taxonomies/tags/${id}`),
      },
    },
    roles: {
      list: (params?: QueryParams): Promise<PaginatedResponse<Role>> => {
        const validated = validateQueryParams(params || {});
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/roles?${queryString}`);
      },
      get: (id: number): Promise<Role> => api.get(`/roles/${id}`),
      create: (payload: UnknownRecord): Promise<Role> => api.post('/roles', payload),
      update: (id: number, payload: UnknownRecord): Promise<Role> => api.put(`/roles/${id}`, payload),
      delete: (id: number): Promise<unknown> => api.delete(`/roles/${id}`),
    },
    permissions: {
      list: (params?: QueryParams): Promise<PaginatedResponse<Permission>> => {
        const validated = validateQueryParams(params || {});
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/permissions?${queryString}`);
      },
    },
    posts: {
      list: (params: QueryParams): Promise<PaginatedResponse<Post>> => {
        const validated = validateQueryParams(params);
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/posts?${queryString}`);
      },
      get: (id: number): Promise<Post> => api.get(`/posts/${id}`),
      create: (payload: UnknownRecord): Promise<Post> => api.post('/posts', payload),
      update: (id: number, payload: UnknownRecord): Promise<Post> => api.put(`/posts/${id}`, payload),
      delete: (id: number): Promise<unknown> => api.delete(`/posts/${id}`),
    },
    media: {
      list: (params: QueryParams): Promise<PaginatedResponse<Media>> => {
        const validated = validateQueryParams(params);
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/media?${queryString}`);
      },
      upload: (file: File, metadata: MediaMeta): Promise<Media> => {
        const formData = new FormData();
        formData.append('file', file);
        Object.entries(metadata).forEach(([key, value]) => {
          formData.append(key, value as string);
        });
        return api.post('/media/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      },
      delete: (id: number): Promise<unknown> => api.delete(`/media/${id}`),
    },
    comments: {
      list: (params: QueryParams): Promise<PaginatedResponse<Comment>> => {
        const validated = validateQueryParams(params);
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/comments?${queryString}`);
      },
      get: (id: number): Promise<Comment> => api.get(`/comments/${id}`),
      create: (payload: UnknownRecord): Promise<Comment> => api.post('/comments', payload),
      update: (id: number, payload: UnknownRecord): Promise<Comment> => api.put(`/comments/${id}`, payload),
      delete: (id: number): Promise<unknown> => api.delete(`/comments/${id}`),
    },
    paymentGateways: {
      list: (params: QueryParams): Promise<PaginatedResponse<PaymentGateway>> => {
        const validated = validateQueryParams(params || {});
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/payment-gateways?${queryString}`);
      },
      available: (): Promise<PaymentGateway[]> => api.get('/payment-gateways/available'),
      get: (gateway_id: string): Promise<PaymentGateway> => api.get(`/payment-gateways/${gateway_id}`),
      toggle: (gateway_id: string, enabled?: boolean): Promise<PaymentGateway> =>
        api.post(`/payment-gateways/${gateway_id}/toggle`, enabled !== undefined ? { enabled } : {}),
      updateConfig: (gateway_id: string, config: UnknownRecord): Promise<PaymentGateway> =>
        api.put(`/payment-gateways/${gateway_id}`, config),
    },
    coupons: {
      list: (params: QueryParams = {}): Promise<CouponListResponse> => {
        const validated = validateQueryParams(params);
        const queryString = buildQueryParams(validated).toString();
        const suffix = queryString ? `?${queryString}` : '';
        return api.get(`/coupons${suffix}`);
      },
      get: (id: number): Promise<Coupon> => api.get(`/coupons/${id}`),
      create: (payload: CreateCouponRequest): Promise<Coupon> => api.post('/coupons', payload),
      update: (id: number, payload: UpdateCouponRequest): Promise<Coupon> => api.put(`/coupons/${id}`, payload),
      delete: (id: number): Promise<unknown> => api.delete(`/coupons/${id}`),
      toggle: (id: number, active: boolean): Promise<unknown> => api.post(`/coupons/${id}/toggle`, { active }),
    },
    email: {
      listLogs: (params: QueryParams & EmailLogFilters): Promise<{ data: EmailLog[]; pagination: Pagination }> => {
        const validated = validateQueryParams(params || {});
        const queryString = buildQueryParams(validated).toString();
        const suffix = queryString ? `?${queryString}` : '';
        return api.get(`/email/logs${suffix}`);
      },
      getLog: (id: number): Promise<EmailLog> => api.get(`/email/logs/${id}`),
      stats: (): Promise<EmailStats> => api.get('/email/stats'),
      test: (payload: TestEmailRequest): Promise<unknown> => api.post('/email/test', payload),
      retryFailed: (): Promise<unknown> => api.post('/email/retry-failed'),
      retry: (id: number): Promise<unknown> => api.post(`/email/retry/${id}`),
      getSettings: (): Promise<EmailSettings> => api.get('/email/settings'),
      updateSettings: (payload: EmailSettingsRequest): Promise<EmailSettings> => api.put('/email/settings', payload),
      getTemplates: (): Promise<{ templates: EmailTemplate[]; total: number }> => api.get('/email/templates'),
      updateTemplate: (template_key: string, payload: EmailTemplateRequest): Promise<unknown> =>
        api.put(`/email/templates/${template_key}`, payload),
      deleteOldLogs: (payload: DeleteOldEmailLogsRequest): Promise<unknown> =>
        api.delete('/email/logs/cleanup', { data: payload }),
    },
    settings: {
      list: (): Promise<UnknownRecord> => api.get('/settings'),
      update: (payload: UnknownRecord): Promise<Setting[]> => api.put('/settings', payload),
    },
    shippingMethods: {
      list: (): Promise<ShippingMethod[]> => api.get('/shipping-methods'),
      get: (id: number): Promise<ShippingMethod> => api.get(`/shipping-methods/${id}`),
      create: (payload: UnknownRecord): Promise<ShippingMethod> => api.post('/shipping-methods', payload),
      update: (id: number, payload: UnknownRecord): Promise<ShippingMethod> => api.put(`/shipping-methods/${id}`, payload),
      delete: (id: number): Promise<unknown> => api.delete(`/shipping-methods/${id}`),
    },
    orderShipments: {
      list: (params: QueryParams): Promise<PaginatedResponse<OrderShipment>> => {
        const validated = validateQueryParams(params);
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/order-shipments?${queryString}`);
      },
      getByOrder: (orderId: number): Promise<OrderShipment[]> => api.get(`/order-shipments/order/${orderId}`),
      create: (payload: UnknownRecord): Promise<OrderShipment> => api.post('/order-shipments', payload),
      update: (id: number, payload: UnknownRecord): Promise<OrderShipment> => api.put(`/order-shipments/${id}`, payload),
    },
    flashSales: {
      list: (params: QueryParams): Promise<PaginatedResponse<FlashSaleCampaign>> => {
        const validated = validateQueryParams(params);
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/flash-sales?${queryString}`);
      },
      get: (id: number): Promise<FlashSaleCampaign> => api.get(`/flash-sales/${id}`),
      create: (payload: UnknownRecord): Promise<FlashSaleCampaign> => api.post('/flash-sales', payload),
      update: (id: number, payload: UnknownRecord): Promise<FlashSaleCampaign> => api.put(`/flash-sales/${id}`, payload),
      delete: (id: number): Promise<unknown> => api.delete(`/flash-sales/${id}`),
      getProducts: (id: number): Promise<FlashSaleProduct[]> => api.get(`/flash-sales/${id}/products`),
      addProduct: (id: number, payload: UnknownRecord): Promise<FlashSaleProduct> => 
        api.post(`/flash-sales/${id}/products`, payload),
      updateProduct: (campaignId: number, productId: number, payload: UnknownRecord): Promise<FlashSaleProduct> => 
        api.put(`/flash-sales/${campaignId}/products/${productId}`, payload),
      removeProduct: (campaignId: number, productId: number): Promise<unknown> => 
        api.delete(`/flash-sales/${campaignId}/products/${productId}`),
    },
    tokenLogs: {
      list: (params: QueryParams & TokenLogFilters): Promise<PaginatedResponse<TokenLog>> => {
        const validated = validateQueryParams(params);
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/token-logs?${queryString}`);
      },
      get: (id: number): Promise<TokenLog> => api.get(`/token-logs/${id}`),
      statistics: (): Promise<TokenLogStatistics> => api.get('/token-logs/stats'),
      blacklist: (payload: BlacklistTokenRequest): Promise<unknown> => api.post('/token-logs/blacklist', payload),
      blacklistUserTokens: (payload: BlacklistUserTokensRequest): Promise<unknown> =>
        api.post('/token-logs/blacklist-user', payload),
      isBlacklisted: (tokenJti: string): Promise<{ is_blacklisted: boolean }> =>
        api.get(`/token-logs/check-blacklist/${tokenJti}`),
    },
    points: {
      // User Points Management
      getUserPoints: (userId: number): Promise<UserPoints> => api.get(`/points/users/${userId}`),
      getUserBalance: (userId: number): Promise<{ balance: number }> => api.get(`/points/users/${userId}/balance`),
      adjustPoints: (payload: AdjustPointsRequest): Promise<PointsTransaction> => 
        api.post('/points/adjust', payload),
      getUserTransactions: (userId: number, params: QueryParams = {}): Promise<PaginatedResponse<PointsTransaction>> => {
        const validated = validateQueryParams(params);
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/points/users/${userId}/transactions?${queryString}`);
      },
      getTransaction: (id: number): Promise<PointsTransaction> => api.get(`/points/transactions/${id}`),
      // Points Rules Management
      createRule: (payload: CreatePointsRuleRequest): Promise<PointsRule> => 
        api.post('/points/rules', payload),
      getRules: (params: QueryParams = {}): Promise<PaginatedResponse<PointsRule>> => {
        const validated = validateQueryParams(params);
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/points/rules?${queryString}`);
      },
      getRule: (id: number): Promise<PointsRule> => api.get(`/points/rules/${id}`),
      updateRule: (id: number, payload: UpdatePointsRuleRequest): Promise<PointsRule> => 
        api.put(`/points/rules/${id}`, payload),
      deleteRule: (id: number): Promise<unknown> => api.delete(`/points/rules/${id}`),
      // Points Products Management
      createPointsProduct: (payload: CreatePointsProductRequest): Promise<PointsProduct> => 
        api.post('/points/products', payload),
      getPointsProducts: (params: QueryParams = {}): Promise<PaginatedResponse<PointsProduct>> => {
        const validated = validateQueryParams(params);
        const queryString = buildQueryParams(validated).toString();
        return api.get(`/points/products?${queryString}`);
      },
      deletePointsProduct: (id: number): Promise<unknown> => api.delete(`/points/products/${id}`),
      // Statistics and Analytics
      getStats: (): Promise<PointsStats> => api.get('/points/stats'),
      getUserStats: (userId: number): Promise<PointsStats> => api.get(`/points/users/${userId}/stats`),
      getTopEarners: (limit: number = 10): Promise<Array<{
        user_id: number;
        username: string;
        total_earned: number;
        current_balance: number;
      }>> => api.get(`/points/top-earners?limit=${limit}`),
      // Maintenance
      processExpiredPoints: (): Promise<{ processed: number }> => api.post('/points/process-expired'),
    },
    dashboard: {
      // Dashboard overview and statistics
      overviewStats: (): Promise<OverviewStats> => api.get('/dashboard/overview'),
      salesStats: (period: string): Promise<SalesStats[]> => api.get(`/dashboard/sales?period=${period}`),
      recentOrders: (limit: number = 10): Promise<Order[]> => api.get(`/dashboard/recent-orders?limit=${limit}`),
      topProducts: (period: string, limit: number = 10): Promise<TopProduct[]> =>
        api.get(`/dashboard/top-products?period=${period}&limit=${limit}`),
      orderStatusStats: (): Promise<OrderStatusStats[]> => api.get('/dashboard/order-status'),
      revenueByPeriod: (period: string): Promise<RevenueData[]> => api.get(`/dashboard/revenue?period=${period}`),
    },
  };
};

export default createApi();
