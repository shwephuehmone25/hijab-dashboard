import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Tag } from 'antd';
import type { FormInstance } from 'antd';
import type { ProductFormValues, ProductVariantFormValue } from '@/lib/types';

interface Props {
  form: FormInstance<ProductFormValues>;
  disabled?: boolean;
}

const statusOptions = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const moneyRules = [
  { required: true, message: 'Price is required' },
  { type: 'number' as const, min: 0, max: 99_999_999.99, message: 'Enter an amount from 0 to 99,999,999.99' },
];

const ProductVariationsSection = ({ form, disabled = false }: Props) => (
  <Card title="Variants" className="shadow-sm" styles={{ body: { paddingBottom: 8 } }}>
    <Alert
      type="info"
      showIcon
      className="mb-4"
      message="Variants are saved together with the product"
      description="Removing an existing variant here removes it when you save. Variant images are not available because the current API does not accept them."
    />
    <Form.List name="variants">
      {(fields, { add, remove }) => (
        <Space direction="vertical" size="middle" className="w-full">
          {fields.map((field, index) => (
            <Card
              key={field.key}
              size="small"
              title={<Space><span>Variant {index + 1}</span><Tag>{form.getFieldValue(['variants', index, 'sku']) || 'New'}</Tag></Space>}
              extra={(
                <Button type="text" danger icon={<DeleteOutlined />} disabled={disabled} onClick={() => remove(field.name)}>
                  Remove
                </Button>
              )}
            >
              <Form.Item name={[field.name, 'id']} hidden><Input /></Form.Item>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name={[field.name, 'sku']}
                    label="SKU"
                    rules={[
                      { required: true, whitespace: true, message: 'SKU is required' },
                      { max: 50, message: 'SKU cannot exceed 50 characters' },
                      {
                        validator: async (_, value?: string) => {
                          if (!value?.trim()) return;
                          const normalized = value.trim().toUpperCase();
                          const variants = form.getFieldValue('variants') as ProductVariantFormValue[] | undefined;
                          const duplicateCount = (variants ?? []).filter(
                            (variant) => variant?.sku?.trim().toUpperCase() === normalized,
                          ).length;
                          if (duplicateCount > 1) throw new Error('Each variant SKU must be unique');
                        },
                      },
                    ]}
                  >
                    <Input placeholder="HIJAB-BLK-M" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name={[field.name, 'status']} label="Status" rules={[{ required: true, message: 'Status is required' }]}>
                    <Select options={statusOptions} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={24} sm={8}>
                  <Form.Item name={[field.name, 'color']} label="Color" rules={[{ max: 50, message: 'Color cannot exceed 50 characters' }]}>
                    <Input placeholder="Black" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name={[field.name, 'style']} label="Style" rules={[{ max: 50, message: 'Style cannot exceed 50 characters' }]}>
                    <Input placeholder="Classic" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name={[field.name, 'size']} label="Size" rules={[{ max: 50, message: 'Size cannot exceed 50 characters' }]}>
                    <Input placeholder="M" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={24} sm={12} md={6}>
                  <Form.Item name={[field.name, 'price']} label="Price" rules={moneyRules}>
                    <InputNumber min={0} max={99_999_999.99} precision={2} className="w-full" prefix="$" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={6}>
                  <Form.Item name={[field.name, 'compareAtPrice']} label="Compare-at price" rules={[{ type: 'number', min: 0, max: 99_999_999.99, message: 'Enter a valid non-negative amount' }]}>
                    <InputNumber min={0} max={99_999_999.99} precision={2} className="w-full" prefix="$" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={6}>
                  <Form.Item name={[field.name, 'quantity']} label="Stock quantity" rules={[{ required: true, message: 'Stock quantity is required' }]}>
                    <InputNumber min={0} precision={0} className="w-full" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={6}>
                  <Form.Item
                    name={[field.name, 'reservedQuantity']}
                    label="Reserved"
                    dependencies={[[field.name, 'quantity']]}
                    rules={[
                      { required: true, message: 'Reserved quantity is required' },
                      ({ getFieldValue }) => ({
                        validator: async (_, value?: number) => {
                          const quantity = getFieldValue(['variants', field.name, 'quantity']) as number | undefined;
                          if (value != null && quantity != null && value > quantity) throw new Error('Reserved quantity cannot exceed stock quantity');
                        },
                      }),
                    ]}
                  >
                    <InputNumber min={0} precision={0} className="w-full" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          ))}
          {fields.length === 0 ? <div className="py-4 text-center text-muted-foreground">No variants added yet.</div> : null}
          <Button block type="dashed" icon={<PlusOutlined />} disabled={disabled} onClick={() => add({ status: 'ACTIVE', quantity: 0, reservedQuantity: 0 })}>
            Add Variant
          </Button>
        </Space>
      )}
    </Form.List>
  </Card>
);

export default ProductVariationsSection;
