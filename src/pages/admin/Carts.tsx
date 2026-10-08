import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Descriptions,
  Drawer,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { MenuProps, TableProps } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  MoreOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import api from '@/lib/api';
import type { Cart, CartItem, UpdateCartRequest } from '@/lib/types';
import { message } from '@/lib/antdApp';

interface CartFormValues {
  status?: string;
  couponCode?: string;
  items: Array<{ productId: number; productName?: string; quantity: number }>;
}

interface CartItemFormValues {
  quantity: number;
}

const currencyFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
const money = (value?: number) => currencyFormatter.format(value ?? 0);

const Carts = () => {
  const [carts, setCarts] = useState<Cart[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [detailCart, setDetailCart] = useState<Cart | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingCart, setEditingCart] = useState<Cart | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [form] = Form.useForm<CartFormValues>();
  const [itemForm] = Form.useForm<CartItemFormValues>();

  const fetchCarts = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const response = await api.carts.list({
        page,
        pageSize,
        search: searchText.trim() || undefined,
      });
      setCarts(response.items ?? []);
      setPagination({
        current: response.pagination.page,
        pageSize: response.pagination.pageSize,
        total: response.pagination.total,
      });
    } catch {
      message.error('Failed to load carts');
    } finally {
      setLoading(false);
    }
  }, [searchText]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCarts(1, pagination.pageSize);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [fetchCarts, pagination.pageSize]);

  const loadCart = async (id: number) => {
    setDetailLoading(true);
    try {
      return await api.carts.get(id);
    } catch {
      message.error('Failed to load cart details');
      return null;
    } finally {
      setDetailLoading(false);
    }
  };

  const handleView = async (cart: Cart) => {
    setDetailCart(cart);
    const details = await loadCart(cart.id);
    if (details) setDetailCart(details);
  };

  const handleEdit = async (cart: Cart) => {
    const details = await loadCart(cart.id);
    if (!details) return;
    setEditingCart(details);
    form.setFieldsValue({
      status: details.status,
      couponCode: details.couponCode ?? undefined,
      items: (details.items ?? []).map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
      })),
    });
  };

  const handleSave = async (values: CartFormValues) => {
    if (!editingCart || saving) return;
    setSaving(true);
    try {
      const payload: UpdateCartRequest = {
        status: values.status?.trim() || undefined,
        couponCode: values.couponCode?.trim() || null,
        items: values.items.map(({ productId, quantity }) => ({ productId, quantity })),
      };
      await api.carts.update(editingCart.id, payload);
      message.success('Cart updated successfully');
      setEditingCart(null);
      await fetchCarts(pagination.current, pagination.pageSize);
    } catch (error) {
      const errorMessage = typeof error === 'object' && error !== null && 'message' in error
        && typeof error.message === 'string' ? error.message : 'Failed to update cart';
      message.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (cart: Cart) => {
    Modal.confirm({
      title: 'Delete Cart',
      content: `Delete cart #${cart.id}? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await api.carts.delete(cart.id);
          message.success('Cart deleted successfully');
          const page = carts.length === 1 && pagination.current > 1
            ? pagination.current - 1
            : pagination.current;
          await fetchCarts(page, pagination.pageSize);
        } catch (error) {
          message.error('Failed to delete cart');
          throw error;
        }
      },
    });
  };

  const refreshCartDetails = async (cartId: number) => {
    const [details] = await Promise.all([
      loadCart(cartId),
      fetchCarts(pagination.current, pagination.pageSize),
    ]);
    if (details) setDetailCart(details);
  };

  const getItemId = (item: CartItem) => item.id ?? item.productId;

  const handleEditItem = (item: CartItem) => {
    setEditingItem(item);
    itemForm.setFieldsValue({ quantity: item.quantity });
  };

  const handleSaveItem = async ({ quantity }: CartItemFormValues) => {
    if (!detailCart || !editingItem || savingItem) return;
    setSavingItem(true);
    try {
      await api.carts.items.update(detailCart.id, getItemId(editingItem), { quantity });
      message.success('Cart item updated successfully');
      setEditingItem(null);
      await refreshCartDetails(detailCart.id);
    } catch (error) {
      const errorMessage = typeof error === 'object' && error !== null && 'message' in error
        && typeof error.message === 'string' ? error.message : 'Failed to update cart item';
      message.error(errorMessage);
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = (item: CartItem) => {
    if (!detailCart) return;
    const cartId = detailCart.id;
    Modal.confirm({
      title: 'Remove Cart Item',
      content: `Remove ${item.productName || `product #${item.productId}`} from this cart?`,
      okText: 'Remove',
      okType: 'danger',
      onOk: async () => {
        try {
          await api.carts.items.delete(cartId, getItemId(item));
          message.success('Cart item removed successfully');
          await refreshCartDetails(cartId);
        } catch (error) {
          message.error('Failed to remove cart item');
          throw error;
        }
      },
    });
  };

  const actionItems = (cart: Cart): MenuProps['items'] => [
    { key: 'view', label: 'Details', icon: <EyeOutlined />, onClick: () => void handleView(cart) },
    { key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => void handleEdit(cart) },
    { type: 'divider' },
    { key: 'delete', label: 'Delete', icon: <DeleteOutlined />, danger: true, onClick: () => handleDelete(cart) },
  ];

  const columns: TableProps<Cart>['columns'] = [
    { title: 'Cart', dataIndex: 'id', key: 'id', width: 90, render: (id: number) => `#${id}` },
    {
      title: 'Customer',
      key: 'customer',
      render: (_, cart) => cart.customerName || cart.customerEmail || (cart.customerId ? `Customer #${cart.customerId}` : 'Guest'),
    },
    { title: 'Session', dataIndex: 'sessionId', key: 'sessionId', ellipsis: true, render: (value?: string) => value || '—' },
    { title: 'Items', dataIndex: 'itemCount', key: 'itemCount', width: 90, render: (value: number, cart) => value ?? cart.items?.length ?? 0 },
    { title: 'Total', dataIndex: 'total', key: 'total', width: 120, render: money },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status?: string) => status ? <Tag color={status === 'active' ? 'green' : 'default'}>{status}</Tag> : '—',
    },
    { title: 'Updated', dataIndex: 'updatedAt', key: 'updatedAt', width: 170, render: (date?: string) => date ? new Date(date).toLocaleString() : '—' },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 80,
      render: (_, cart) => (
        <Dropdown menu={{ items: actionItems(cart) }} trigger={['click']}>
          <Button type="text" aria-label={`Actions for cart ${cart.id}`} icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  const itemColumns: TableProps<CartItem>['columns'] = [
    { title: 'Product', dataIndex: 'productName', key: 'productName', render: (name?: string, item) => name || `Product #${item.productId}` },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', render: (value?: string) => value || '—' },
    { title: 'Quantity', dataIndex: 'quantity', key: 'quantity', width: 90 },
    { title: 'Subtotal', dataIndex: 'subtotal', key: 'subtotal', width: 120, render: money },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, item) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEditItem(item)}>
            Edit
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteItem(item)}>
            Remove
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={2}>Cart</Typography.Title>
      <Input
        aria-label="Search carts"
        placeholder="Search by customer, email, or session..."
        prefix={<SearchOutlined />}
        allowClear
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        style={{ marginBottom: 16, maxWidth: 420 }}
      />
      <Table<Cart>
        columns={columns}
        dataSource={carts}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1000 }}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          onChange: (page, pageSize) => void fetchCarts(page, pageSize),
        }}
      />

      <Drawer
        title={detailCart ? `Cart #${detailCart.id}` : 'Cart details'}
        width={760}
        open={detailCart !== null}
        loading={detailLoading}
        onClose={() => setDetailCart(null)}
        extra={detailCart && <Button icon={<EditOutlined />} onClick={() => void handleEdit(detailCart)}>Edit</Button>}
      >
        {detailCart && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="Customer">{detailCart.customerName || detailCart.customerEmail || 'Guest'}</Descriptions.Item>
              <Descriptions.Item label="Status">{detailCart.status || '—'}</Descriptions.Item>
              <Descriptions.Item label="Session">{detailCart.sessionId || '—'}</Descriptions.Item>
              <Descriptions.Item label="Coupon">{detailCart.couponCode || '—'}</Descriptions.Item>
              <Descriptions.Item label="Subtotal">{money(detailCart.subtotal)}</Descriptions.Item>
              <Descriptions.Item label="Discount">{money(detailCart.discount)}</Descriptions.Item>
              <Descriptions.Item label="Total" span={2}>{money(detailCart.total)}</Descriptions.Item>
            </Descriptions>
            <Table<CartItem>
              columns={itemColumns}
              dataSource={detailCart.items ?? []}
              rowKey={(item) => String(item.id ?? item.productId)}
              pagination={false}
              size="small"
            />
          </Space>
        )}
      </Drawer>

      <Modal
        title={`Update ${editingItem?.productName || 'Cart Item'}`}
        open={editingItem !== null}
        onCancel={() => { if (!savingItem) setEditingItem(null); }}
        onOk={() => itemForm.submit()}
        confirmLoading={savingItem}
        cancelButtonProps={{ disabled: savingItem }}
        destroyOnClose
      >
        <Form form={itemForm} layout="vertical" onFinish={handleSaveItem} disabled={savingItem}>
          <Form.Item
            name="quantity"
            label="Quantity"
            rules={[
              { required: true, message: 'Quantity is required' },
              { type: 'number', min: 1, message: 'Quantity must be at least 1' },
            ]}
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingCart ? `Edit Cart #${editingCart.id}` : 'Edit Cart'}
        open={editingCart !== null}
        onCancel={() => { if (!saving) setEditingCart(null); }}
        onOk={() => form.submit()}
        confirmLoading={saving}
        cancelButtonProps={{ disabled: saving }}
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSave} disabled={saving}>
          <Form.Item name="status" label="Status">
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item name="couponCode" label="Coupon code">
            <Input maxLength={100} allowClear />
          </Form.Item>
          <Form.List name="items">
            {(fields) => (
              <Space direction="vertical" style={{ width: '100%' }}>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Form.Item name={[field.name, 'productId']} hidden><InputNumber /></Form.Item>
                    <Form.Item name={[field.name, 'productName']} label="Product" style={{ flex: 1 }}>
                      <Input disabled />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'quantity']}
                      label="Quantity"
                      rules={[{ required: true, message: 'Quantity is required' }]}
                    >
                      <InputNumber min={0} precision={0} />
                    </Form.Item>
                  </Space>
                ))}
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
};

export default Carts;
