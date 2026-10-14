import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Select, Space, Spin } from 'antd';
import api from '@/lib/api';
import type { Category, ProductFormValues, ProductVariantInput } from '@/lib/types';
import { message } from '@/lib/antdApp';
import { getErrorMessage } from '@/lib/error';
import ProductVariationsSection from '@/components/product-editor/ProductVariationsSection';

const toMoney = (value: number) => value.toFixed(2);

const ProductEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm<ProductFormValues>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);

  const loadEditorData = useCallback(async () => {
    setLoading(true);
    try {
      const categoryRequest = api.categories.list({ page: 1, pageSize: 100 });
      const productRequest = id ? api.products.get(Number(id)) : Promise.resolve(null);
      const [categoryResponse, product] = await Promise.all([categoryRequest, productRequest]);
      setCategories(categoryResponse.items ?? []);
      if (product) {
        form.setFieldsValue({
          categoryId: product.categoryId,
          name: product.name,
          description: product.description ?? undefined,
          status: product.status as ProductFormValues['status'],
          variants: (product.variants ?? []).map((variant) => ({
            id: variant.id,
            sku: variant.sku,
            color: variant.color,
            style: variant.style,
            size: variant.size,
            price: Number(variant.price),
            compareAtPrice: variant.compareAtPrice == null ? null : Number(variant.compareAtPrice),
            status: variant.status,
            quantity: variant.inventory?.quantity ?? 0,
            reservedQuantity: variant.inventory?.reservedQuantity ?? 0,
          })),
        });
      } else {
        form.setFieldsValue({ status: 'ACTIVE', variants: [] });
      }
    } catch {
      message.error('Failed to load product editor');
      navigate('/admin/products');
    } finally {
      setLoading(false);
    }
  }, [form, id, navigate]);

  useEffect(() => {
    void loadEditorData();
  }, [loadEditorData]);

  const handleSubmit = async (values: ProductFormValues) => {
    if (saving) return;
    setSaving(true);
    const variants: ProductVariantInput[] = values.variants.map((variant) => ({
      ...(variant.id ? { id: variant.id } : {}),
      sku: variant.sku.trim(),
      color: variant.color?.trim() || null,
      style: variant.style?.trim() || null,
      size: variant.size?.trim() || null,
      price: toMoney(variant.price),
      compareAtPrice: variant.compareAtPrice == null ? null : toMoney(variant.compareAtPrice),
      status: variant.status,
      quantity: variant.quantity,
      reservedQuantity: variant.reservedQuantity,
    }));
    const payload = {
      categoryId: values.categoryId,
      name: values.name.trim(),
      description: values.description?.trim() || null,
      status: values.status,
      variants,
    };
    try {
      if (id) {
        await api.products.update(Number(id), payload);
        message.success('Product updated successfully');
      } else {
        await api.products.create(payload);
        message.success('Product created successfully');
      }
      navigate('/admin/products');
    } catch (error) {
      message.error(getErrorMessage(error, `Failed to ${id ? 'update' : 'create'} product`));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}><Spin size="large" /></div>;
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/products')}>Back</Button>
        <h1 style={{ margin: 0 }}>{id ? 'Edit Product' : 'Add Product'}</h1>
      </Space>
      <Card>
        <Form form={form} layout="vertical" onFinish={handleSubmit} disabled={saving}
          initialValues={{ status: 'ACTIVE', variants: [] }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input maxLength={150} />
          </Form.Item>
          <Form.Item name="categoryId" label="Category"
            rules={[{ required: true, message: 'Category is required' }]}>
            <Select showSearch optionFilterProp="label" placeholder="Select a category"
              options={categories.map((category) => ({ value: category.id, label: category.name }))} />
          </Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
              { value: 'ARCHIVED', label: 'Archived' },
            ]} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={8} />
          </Form.Item>
          <ProductVariationsSection form={form} disabled={saving} />
          <div style={{ height: 16 }} />
          <Space>
            <Button onClick={() => navigate('/admin/products')} disabled={saving}>Cancel</Button>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              {id ? 'Save Changes' : 'Create Product'}
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
};

export default ProductEditor;
