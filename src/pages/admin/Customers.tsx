import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Input, Tag, Modal, Form, Select, Drawer, Descriptions, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined, DeleteOutlined, HomeOutlined, TagsOutlined, MoreOutlined, MinusCircleOutlined } from '@ant-design/icons';
import api from '@/lib/api';
import type { User, UserMeta, RoleName, UserRole } from '@/lib/types';
import { message } from '@/lib/antdApp';

interface CustomerFormValues {
  username: string;
  email: string;
  display_name: string;
  password?: string;
}

interface MetaFormValues {
  customMeta?: Array<{ key: string; value: unknown }>;
}

const roleOptions: Array<{ value: RoleName; label: string }> = [
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'ORDER_MANAGER', label: 'Order Manager' },
  { value: 'CONTENT_MANAGER', label: 'Content Manager' },
];

const Customers = () => {
  const [searchText, setSearchText] = useState('');
  const [customers, setCustomers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [modalVisible, setModalVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<User | null>(null);
  const [metaModalVisible, setMetaModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<User | null>(null);
  const [form] = Form.useForm();
  const [metaForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);

  const fetchCustomers = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const res = await api.customers.list({
        page,
        pageSize: pageSize,
        search: searchText || undefined,
      });
      setCustomers(res.items ?? []);
      setPagination({
        current: res.pagination.page,
        pageSize: res.pagination.pageSize,
        total: res.pagination.total,
      });
    } catch (error) {
      message.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [searchText]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers(1, pagination.pageSize);
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchCustomers, pagination.pageSize]);

  const handleCreate = () => {
    setEditingCustomer(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = async (customer: User) => {
    try {
      const details = await api.customers.get(customer.id);
      setEditingCustomer(details);
      form.resetFields();
      form.setFieldsValue({
        username: details.username,
        email: details.email,
        display_name: details.display_name,
        password: undefined,
      });
      setModalVisible(true);
    } catch {
      message.error('Failed to load customer details');
    }
  };

  const handleViewDetails = async (customer: User) => {
    try {
      const details = await api.customers.get(customer.id);
      setDetailCustomer(details);
    } catch {
      message.error('Failed to load customer details');
    }
  };

  const handleViewAddresses = async (customer: User) => {
    try {
      const details = await api.customers.get(customer.id);
      setEditingCustomer(details);
      setDrawerVisible(true);
    } catch {
      message.error('Failed to load customer addresses');
    }
  };

  const handleManageMeta = async (customer: User) => {
    setEditingCustomer(customer);
    try {
      const res = await api.users.meta.list(customer.id);
      const customMeta = res.map((meta: UserMeta) => ({
        key: meta.meta_key,
        value: meta.meta_value,
      }));
      metaForm.setFieldsValue({ customMeta });
      setMetaModalVisible(true);
    } catch (error) {
      message.error('Failed to load user meta');
    }
  };

  const handleUpdateMeta = async (values: MetaFormValues) => {
    if (!editingCustomer) return;
    setSaving(true);
    try {
      const { customMeta } = values;
      if (customMeta && Array.isArray(customMeta)) {
        const metaObject = customMeta.reduce<Record<string, unknown>>((acc, entry) => {
          if (entry.key) {
            acc[entry.key] = entry.value;
          }
          return acc;
        }, {} as Record<string, unknown>);
        await api.users.meta.batchUpdate(editingCustomer.id, metaObject);
      }
      message.success('User meta updated successfully');
      setMetaModalVisible(false);
    } catch (error) {
      message.error('Failed to update user meta');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: 'Delete Customer',
      content: 'Are you sure you want to delete this customer?',
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await api.customers.delete(id);
          message.success('Customer deleted successfully');
          const page = customers.length === 1 && pagination.current > 1
            ? pagination.current - 1 : pagination.current;
          await fetchCustomers(page, pagination.pageSize);
        } catch (error) {
          message.error('Failed to delete customer');
          throw error;
        }
      },
    });
  };

  const handleSubmit = async (values: CustomerFormValues) => {
    if (savingCustomer) return;
    setSavingCustomer(true);
    try {
      if (editingCustomer) {
        const payload: Record<string, unknown> = {
          name: values.display_name,
          email: values.email,
          phone: values.username || undefined,
        };
        if (values.password) payload.password = values.password;
        await api.customers.update(editingCustomer.id, payload);
        message.success('Customer updated successfully');
      } else {
        await api.customers.create({
          name: values.display_name,
          email: values.email,
          password: values.password,
          phone: values.username || undefined,
        });
        message.success('Customer created successfully');
      }
      setModalVisible(false);
      await fetchCustomers(pagination.current, pagination.pageSize);
    } catch (error) {
      const errorMessage = typeof error === 'object' && error !== null && 'message' in error
        && typeof error.message === 'string' ? error.message : 'Failed to save customer';
      message.error(errorMessage);
    } finally {
      setSavingCustomer(false);
    }
  };

  const getActionMenuItems = (record: User): MenuProps['items'] => [
    {
      key: 'details',
      label: 'Details',
      onClick: () => handleViewDetails(record),
    },
    {
      key: 'edit',
      label: 'Edit',
      icon: <EditOutlined />,
      onClick: () => handleEdit(record),
    },
    {
      key: 'addresses',
      label: 'Addresses',
      icon: <HomeOutlined />,
      onClick: () => handleViewAddresses(record),
    },
    {
      key: 'meta',
      label: 'Meta',
      icon: <TagsOutlined />,
      onClick: () => handleManageMeta(record),
    },
    {
      type: 'divider',
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => handleDelete(record.id),
    },
  ];

  const columns = [
    {
      title: 'ID',
      key: 'row_number',
      width: 70,
      render: (_: unknown, __: User, index: number) =>
        (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: 'Name',
      dataIndex: 'display_name',
      key: 'display_name',
      width: 150,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 200,
    },
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      width: 150,
    },
    {
      title: 'Roles',
      dataIndex: 'roles',
      key: 'roles',
      width: 200,
      render: (userRoles: UserRole[], record: User) => (
        <>
          {record.role && <Tag color="blue">{roleOptions.find(option => option.value === record.role)?.label ?? record.role}</Tag>}
          {!record.role && userRoles?.map(role => (
            <Tag key={role.name} color="blue">{role.display_name || role.name}</Tag>
          ))}
        </>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      render: (_: unknown, record: User) => (
        <Tag color={record.status === 1 ? 'green' : 'red'}>
          {record.status === 1 ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: 'Registered',
      dataIndex: 'registered_at',
      key: 'registered_at',
      width: 120,
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      fixed: 'right' as const,
      render: (_: unknown, record: User) => (
        <Dropdown menu={{ items: getActionMenuItems(record) }} trigger={['click']}>
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1>Customers</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Add Customer
        </Button>
      </div>
      <Input
        placeholder="Search customers..."
        prefix={<SearchOutlined />}
        allowClear
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 400 }}
      />
      <Table
        columns={columns}
        dataSource={customers}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1100 }}
        pagination={{
          ...pagination,
          onChange: (page, pageSize) => fetchCustomers(page, pageSize),
        }}
      />

      {/* Create/Edit Modal */}
      <Modal
        title={editingCustomer ? 'Edit Customer' : 'Create Customer'}
        open={modalVisible}
        onCancel={() => { if (!savingCustomer) setModalVisible(false); }}
        onOk={() => form.submit()}
        confirmLoading={savingCustomer}
        cancelButtonProps={{ disabled: savingCustomer }}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} disabled={savingCustomer}>
          <Form.Item name="display_name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="username" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label={editingCustomer ? 'New Password' : 'Password'}
            extra={editingCustomer ? 'Leave blank to keep the current password.' : undefined}
            rules={[{ required: !editingCustomer }, { min: 8 }]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="Customer Details"
        width={600}
        open={detailCustomer !== null}
        onClose={() => setDetailCustomer(null)}
      >
        {detailCustomer && (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="Name">{detailCustomer.display_name}</Descriptions.Item>
            <Descriptions.Item label="Username">{detailCustomer.username}</Descriptions.Item>
            <Descriptions.Item label="Email">{detailCustomer.email}</Descriptions.Item>
            <Descriptions.Item label="Status">{detailCustomer.status === 1 ? 'Active' : 'Inactive'}</Descriptions.Item>
            <Descriptions.Item label="Roles">
              {detailCustomer.role
                ? roleOptions.find(option => option.value === detailCustomer.role)?.label ?? detailCustomer.role
                : detailCustomer.roles?.map(role => role.display_name || role.name).join(', ')}
            </Descriptions.Item>
            <Descriptions.Item label="Registered">
              {detailCustomer.registered_at ? new Date(detailCustomer.registered_at).toLocaleDateString() : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      {/* Addresses Drawer */}
      <Drawer
        title="Customer Addresses"
        width={600}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        {editingCustomer?.addresses && editingCustomer.addresses.length > 0 ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            {editingCustomer.addresses.map(addr => (
              <div key={addr.id} style={{ padding: 16, border: '1px solid #f0f0f0', borderRadius: 4 }}>
                <div><strong>{addr.first_name} {addr.last_name}</strong></div>
                {addr.company && <div>{addr.company}</div>}
                <div>{addr.address_1}</div>
                {addr.address_2 && <div>{addr.address_2}</div>}
                <div>{addr.city}, {addr.state} {addr.postcode}</div>
                <div>{addr.country}</div>
                {addr.phone && <div>Phone: {addr.phone}</div>}
                {addr.is_default && <Tag color="blue">Default</Tag>}
              </div>
            ))}
          </Space>
        ) : (
          <div>No addresses found</div>
        )}
      </Drawer>

      {/* Meta Management Modal */}
      <Modal
        title={`Customer Meta: ${editingCustomer?.display_name}`}
        open={metaModalVisible}
        onCancel={() => setMetaModalVisible(false)}
        onOk={() => metaForm.submit()}
        okButtonProps={{ loading: saving }}
        width={600}
      >
        <Form form={metaForm} layout="vertical" onFinish={handleUpdateMeta}>
          <Form.List name="customMeta">
            {(fields, { add, remove }) => (
              <>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  {fields.map(field => (
                    <Space key={field.key} style={{ width: '100%' }} align="start">
                      <Form.Item
                        {...field}
                        name={[field.name, 'key']}
                        rules={[{ required: true, message: 'Key is required' }]}
                        style={{ marginBottom: 0, flex: 1 }}
                      >
                        <Input placeholder="Meta Key" disabled={saving} />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, 'value']}
                        style={{ marginBottom: 0, flex: 1 }}
                      >
                        <Input placeholder="Meta Value" disabled={saving} />
                      </Form.Item>
                      <Button
                        type="text"
                        danger
                        icon={<MinusCircleOutlined />}
                        onClick={() => remove(field.name)}
                        disabled={saving}
                      />
                    </Space>
                  ))}
                </Space>
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add()}
                  disabled={saving}
                  style={{ width: '100%', marginTop: 8 }}
                >
                  Add Custom Field
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
};

export default Customers;
