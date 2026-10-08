import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag } from 'antd';
import api from '@/lib/api';
import { message } from '@/lib/antdApp';
import type { Product } from '@/lib/types';

interface InventoryFormValues {
  productId: number;
  quantity: number;
}

const stockStatus = (quantity?: number): Product['stock_status'] =>
  (quantity ?? 0) > 0 ? 'instock' : 'outofstock';

const statusLabel: Record<NonNullable<Product['stock_status']>, string> = {
  instock: 'In stock',
  outofstock: 'Out of stock',
  onbackorder: 'On backorder',
};

const Inventory = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [form] = Form.useForm<InventoryFormValues>();

  const fetchInventory = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const response = await api.products.list({
        page,
        pageSize,
        search: searchText.trim() || undefined,
      });
      setProducts(response.items ?? []);
      setPagination({
        current: response.pagination.page,
        pageSize: response.pagination.pageSize,
        total: response.pagination.total,
      });
    } catch {
      message.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [searchText]);

  useEffect(() => {
    const timer = setTimeout(() => void fetchInventory(1, pagination.pageSize), 300);
    return () => clearTimeout(timer);
  }, [fetchInventory, pagination.pageSize]);

  const selectableProducts = useMemo(() => products.map((product) => ({
    value: product.id,
    label: `${product.name}${product.sku ? ` (${product.sku})` : ''}`,
  })), [products]);

  const openCreate = () => {
    setEditingProduct(null);
    form.resetFields();
    form.setFieldsValue({ quantity: 0 });
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    form.setFieldsValue({ productId: product.id, quantity: product.stock_quantity ?? 0 });
    setModalOpen(true);
  };

  const saveInventory = async (values: InventoryFormValues) => {
    if (saving) return;
    setSaving(true);
    try {
      await api.products.stock.update(values.productId, values.quantity);
      message.success(editingProduct ? 'Inventory updated successfully' : 'Inventory added successfully');
      setModalOpen(false);
      await fetchInventory(pagination.current, pagination.pageSize);
    } catch {
      message.error('Failed to save inventory');
    } finally {
      setSaving(false);
    }
  };

  const clearInventory = (product: Product) => {
    Modal.confirm({
      title: 'Clear Inventory',
      content: `Set the stock for “${product.name}” to zero?`,
      okText: 'Clear Stock',
      okType: 'danger',
      onOk: async () => {
        try {
          await api.products.stock.update(product.id, 0);
          message.success('Inventory cleared successfully');
          await fetchInventory(pagination.current, pagination.pageSize);
        } catch (error) {
          message.error('Failed to clear inventory');
          throw error;
        }
      },
    });
  };

  const columns = [
    {
      title: 'ID', key: 'rowNumber', width: 70,
      render: (_: unknown, __: Product, index: number) =>
        (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    { title: 'Product', dataIndex: 'name', key: 'name' },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', render: (value?: string) => value || '—' },
    {
      title: 'Quantity', dataIndex: 'stock_quantity', key: 'stock_quantity', width: 120,
      render: (value?: number) => value ?? 0,
    },
    {
      title: 'Stock Status', key: 'stock_status', width: 150,
      render: (_: unknown, product: Product) => {
        const value = product.stock_status ?? stockStatus(product.stock_quantity);
        return <Tag color={value === 'instock' ? 'green' : value === 'onbackorder' ? 'orange' : 'red'}>{statusLabel[value]}</Tag>;
      },
    },
    {
      title: 'Actions', key: 'actions', width: 190,
      render: (_: unknown, product: Product) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openEdit(product)}>Edit</Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => clearInventory(product)}>Clear</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1>Inventory</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Inventory</Button>
      </div>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Search by product name or SKU..."
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        style={{ marginBottom: 16, maxWidth: 400 }}
      />
      <Table
        columns={columns}
        dataSource={products}
        rowKey="id"
        loading={loading}
        pagination={{ ...pagination, onChange: (page, pageSize) => void fetchInventory(page, pageSize) }}
      />

      <Modal
        title={editingProduct ? `Edit Inventory: ${editingProduct.name}` : 'Add Inventory'}
        open={modalOpen}
        onCancel={() => { if (!saving) setModalOpen(false); }}
        onOk={() => form.submit()}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={saveInventory} disabled={saving}>
          <Form.Item name="productId" label="Product" rules={[{ required: true, message: 'Select a product' }]}>
            <Select
              showSearch
              disabled={editingProduct !== null}
              optionFilterProp="label"
              placeholder="Select a product"
              options={selectableProducts}
            />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="Stock Quantity"
            rules={[{ required: true, message: 'Enter a stock quantity' }]}
          >
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Inventory;
