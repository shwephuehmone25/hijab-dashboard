import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeleteOutlined, EditOutlined, EyeOutlined, MoreOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Descriptions, Drawer, Dropdown, Image, Input, Modal, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import api from '@/lib/api';
import type { Category, Product, ProductVariant } from '@/lib/types';
import { message } from '@/lib/antdApp';

const productStatuses = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;

const formatPrice = (value?: number) => value == null
  ? '—'
  : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDateTime = (value?: string) => value ? new Date(value).toLocaleString() : '—';

const renderVariantValues = (
  variants: ProductVariant[],
  getValue: (variant: ProductVariant) => string | null,
) => {
  const values = variants.flatMap((variant) => {
    const value = getValue(variant);
    return value ? [{ id: variant.id, value }] : [];
  });

  return values.length ? (
    <Space size={[4, 4]} wrap>
      {values.map((item) => <Tag key={item.id}>{item.value}</Tag>)}
    </Space>
  ) : '—';
};

const renderStatusPill = (value: string) => {
  const normalized = value.toUpperCase();
  const isActive = normalized === 'ACTIVE' || normalized === 'PUBLISH';
  const isArchived = normalized === 'ARCHIVED';
  const color = isActive ? '#4fbd82' : isArchived ? '#8c8c8c' : '#d89614';
  const background = isActive ? '#edf9f2' : isArchived ? '#f3f3f3' : '#fff7e6';
  const label = normalized.charAt(0) + normalized.slice(1).toLowerCase();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 14px',
        borderRadius: 999,
        background,
        color,
        fontSize: 14,
        fontWeight: 600,
        lineHeight: '20px',
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color }} />
      {label}
    </span>
  );
};

const Products = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchText, setSearchText] = useState('');
  const [categoryId, setCategoryId] = useState<number>();
  const [status, setStatus] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const fetchProducts = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const response = await api.products.list({
        page,
        pageSize,
        search: searchText || undefined,
        filter: {
          ...(categoryId ? { categoryId } : {}),
          ...(status ? { status } : {}),
        },
      });
      setProducts(response.items ?? []);
      setPagination({
        current: response.pagination.page,
        pageSize: response.pagination.pageSize,
        total: response.pagination.total,
      });
    } catch {
      message.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [categoryId, searchText, status]);

  useEffect(() => {
    void api.categories.list({ page: 1, pageSize: 100 })
      .then((response) => setCategories(response.items ?? []))
      .catch(() => message.error('Failed to load categories'));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void fetchProducts(1, pagination.pageSize), 300);
    return () => clearTimeout(timer);
  }, [fetchProducts, pagination.pageSize]);

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  const handleViewDetails = async (product: Product) => {
    setDetailProduct(product);
    setDetailLoading(true);
    try {
      setDetailProduct(await api.products.get(product.id));
    } catch {
      setDetailProduct(null);
      message.error('Failed to load product details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = (product: Product) => {
    Modal.confirm({
      title: 'Delete Product',
      content: `Are you sure you want to delete “${product.name}”?`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await api.products.delete(product.id);
          message.success('Product deleted successfully');
          const page = products.length === 1 && pagination.current > 1
            ? pagination.current - 1
            : pagination.current;
          await fetchProducts(page, pagination.pageSize);
        } catch (error) {
          message.error('Failed to delete product');
          throw error;
        }
      },
    });
  };

  const getActions = (product: Product): MenuProps['items'] => [
    {
      key: 'details', label: 'View Details', icon: <EyeOutlined />,
      onClick: () => void handleViewDetails(product),
    },
    {
      key: 'edit', label: 'Edit', icon: <EditOutlined />,
      onClick: () => navigate(`/admin/products/${product.id}/edit`),
    },
    { type: 'divider' },
    {
      key: 'delete', label: 'Delete', icon: <DeleteOutlined />, danger: true,
      onClick: () => handleDelete(product),
    },
  ];

  const columns = [
    {
      title: 'ID', key: 'rowNumber', width: 70,
      render: (_: unknown, __: Product, index: number) =>
        (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Category', dataIndex: 'categoryId', key: 'categoryId',
      render: (value: number) => categoryNames.get(value) ?? `Category #${value}`,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: (value: string) => renderStatusPill(value),
    },
    {
      title: 'Created', dataIndex: 'createdAt', key: 'createdAt', width: 130,
      render: (value?: string) => value ? new Date(value).toLocaleDateString() : '—',
    },
    {
      title: 'Actions', key: 'actions', width: 80,
      render: (_: unknown, product: Product) => (
        <Dropdown menu={{ items: getActions(product) }} trigger={['click']}>
          <Button type="text" aria-label={`Actions for ${product.name}`} icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1>Products</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/admin/products/new')}>
          Add Product
        </Button>
      </div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input allowClear placeholder="Search products..." prefix={<SearchOutlined />}
          value={searchText} onChange={(event) => setSearchText(event.target.value)} style={{ width: 320 }} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="All categories"
          value={categoryId} onChange={setCategoryId}
          options={categories.map((category) => ({ value: category.id, label: category.name }))}
          style={{ width: 220 }} />
        <Select allowClear placeholder="All statuses" value={status} onChange={setStatus}
          options={productStatuses.map((value) => ({ value, label: value }))} style={{ width: 160 }} />
      </Space>
      <Table columns={columns} dataSource={products} rowKey="id" loading={loading}
        pagination={{ ...pagination, onChange: (page, pageSize) => void fetchProducts(page, pageSize) }} />

      <Drawer
        title="Product Details"
        width={640}
        open={detailProduct !== null}
        onClose={() => setDetailProduct(null)}
        extra={detailProduct ? (
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => navigate(`/admin/products/${detailProduct.id}/edit`)}
          >
            Edit Product
          </Button>
        ) : null}
      >
        {detailLoading ? (
          <div style={{ display: 'grid', minHeight: 240, placeItems: 'center' }}><Spin /></div>
        ) : detailProduct ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {(detailProduct.featured_image || detailProduct.images?.[0]?.url) && (
              <Image
                src={detailProduct.featured_image || detailProduct.images?.[0]?.url}
                alt={detailProduct.name}
                width="100%"
                style={{ maxHeight: 320, objectFit: 'contain', borderRadius: 8 }}
              />
            )}
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Name">{detailProduct.name}</Descriptions.Item>
              <Descriptions.Item label="Status">
                {renderStatusPill(detailProduct.status)}
              </Descriptions.Item>
              <Descriptions.Item label="Type">
                {detailProduct.variants?.length ? 'Variable' : detailProduct.type ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="SKU">
                {detailProduct.variants?.length
                  ? <Space size={[4, 4]} wrap>{detailProduct.variants.map((variant) => <Tag key={variant.id}>{variant.sku}</Tag>)}</Space>
                  : detailProduct.sku || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Slug">{detailProduct.slug || '—'}</Descriptions.Item>
              <Descriptions.Item label="Category">
                {detailProduct.categories?.map((category) => category.name).join(', ')
                  || categoryNames.get(detailProduct.categoryId)
                  || (detailProduct.categoryId ? `Category #${detailProduct.categoryId}` : '—')}
              </Descriptions.Item>
              <Descriptions.Item label="Tags">
                {detailProduct.tags?.length
                  ? detailProduct.tags.map((tag) => <Tag key={tag.id}>{tag.name}</Tag>)
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Regular Price">
                {detailProduct.variants?.length ? (
                  <Space direction="vertical" size={2}>
                    {detailProduct.variants.map((variant) => (
                      <span key={variant.id}>{formatPrice(Number(variant.compareAtPrice ?? variant.price))}</span>
                    ))}
                  </Space>
                ) : formatPrice(detailProduct.regular_price)}
              </Descriptions.Item>
              <Descriptions.Item label="Sale Price">
                {detailProduct.variants?.some((variant) => variant.compareAtPrice != null) ? (
                  <Space direction="vertical" size={2}>
                    {detailProduct.variants.filter((variant) => variant.compareAtPrice != null).map((variant) => (
                      <span key={variant.id}>{formatPrice(Number(variant.price))}</span>
                    ))}
                  </Space>
                ) : formatPrice(detailProduct.sale_price)}
              </Descriptions.Item>
              <Descriptions.Item label="Stock Quantity">
                {detailProduct.variants?.length ? (
                  <Space direction="vertical" size={2}>
                    {detailProduct.variants.map((variant) => (
                      <span key={variant.id}>
                        {variant.inventory?.quantity ?? 0}
                        {variant.inventory?.reservedQuantity ? ` (${variant.inventory.reservedQuantity} reserved)` : ''}
                      </span>
                    ))}
                  </Space>
                ) : detailProduct.stock_quantity ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Stock Status">
                {detailProduct.variants?.length ? (
                  <Space size={[4, 4]} wrap>
                    {detailProduct.variants.map((variant) => {
                      const available = (variant.inventory?.quantity ?? 0) - (variant.inventory?.reservedQuantity ?? 0);
                      return <Tag key={variant.id} color={available > 0 ? 'green' : 'red'}>{available > 0 ? 'In stock' : 'Out of stock'}</Tag>;
                    })}
                  </Space>
                ) : detailProduct.stock_status ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Manage Stock">
                {detailProduct.variants?.length
                  ? `Yes (${detailProduct.variants.length} variant${detailProduct.variants.length === 1 ? '' : 's'})`
                  : detailProduct.manage_stock == null ? '—' : detailProduct.manage_stock ? 'Yes' : 'No'}
              </Descriptions.Item>
              {detailProduct.variants?.length ? (
                <Descriptions.Item label="Color">
                  {renderVariantValues(detailProduct.variants, (variant) => variant.color)}
                </Descriptions.Item>
              ) : null}
              {detailProduct.variants?.length ? (
                <Descriptions.Item label="Style">
                  {renderVariantValues(detailProduct.variants, (variant) => variant.style)}
                </Descriptions.Item>
              ) : null}
              {detailProduct.variants?.length ? (
                <Descriptions.Item label="Size">
                  {renderVariantValues(detailProduct.variants, (variant) => variant.size)}
                </Descriptions.Item>
              ) : null}
              {!detailProduct.variants?.length ? (
                <Descriptions.Item label="Attributes">
                  {detailProduct.attributes && Object.keys(detailProduct.attributes).length
                    ? Object.entries(detailProduct.attributes).map(([name, value]) => (
                      <Tag key={name}>{name}: {value}</Tag>
                    ))
                    : '—'}
                </Descriptions.Item>
              ) : null}
              <Descriptions.Item label="Short Description">
                <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                  {detailProduct.short_description || '—'}
                </Typography.Paragraph>
              </Descriptions.Item>
              <Descriptions.Item label="Description">
                <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                  {detailProduct.description || '—'}
                </Typography.Paragraph>
              </Descriptions.Item>
              <Descriptions.Item label="Created">{formatDateTime(detailProduct.createdAt ?? detailProduct.created_at)}</Descriptions.Item>
              <Descriptions.Item label="Last Updated">{formatDateTime(detailProduct.updatedAt ?? detailProduct.updated_at)}</Descriptions.Item>
            </Descriptions>
          </Space>
        ) : null}
      </Drawer>
    </div>
  );
};

export default Products;
