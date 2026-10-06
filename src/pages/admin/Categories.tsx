import { useCallback, useEffect, useState } from 'react';
import { DeleteOutlined, EditOutlined, EyeOutlined, MoreOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, App, AutoComplete, Button, Descriptions, Drawer, Dropdown, Form, Image, Input, Modal, Spin, Table, Upload } from 'antd';
import type { MenuProps } from 'antd';
import type { RcFile, UploadFile } from 'antd/es/upload/interface';
import api from '@/lib/api';
import type { Category } from '@/lib/types';
import { message } from '@/lib/antdApp';

interface CategoryFormValues {
  name: string;
  description?: string;
  imageUrl?: string;
  parentCategoryName?: string;
}

const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const Categories = () => {
  const { modal } = App.useApp();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<Category[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageFile, setImageFile] = useState<UploadFile | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [detailCategory, setDetailCategory] = useState<Category | null>(null);
  const [detailImageFailed, setDetailImageFailed] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [form] = Form.useForm<CategoryFormValues>();

  const fetchCategories = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const response = await api.categories.list({
        page,
        pageSize,
        search: searchText || undefined,
        filter: { onlyChildren: 1 },
      });
      setCategories(response.items ?? []);
      setPagination({
        current: response.pagination.page,
        pageSize: response.pagination.pageSize,
        total: response.pagination.total,
      });
    } catch {
      message.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, [searchText]);

  const fetchCategoryOptions = useCallback(async () => {
    try {
      const response = await api.categories.list({ page: 1, pageSize: 100 });
      setCategoryOptions(response.items ?? []);
    } catch {
      message.error('Failed to load parent categories');
    }
  }, []);

  useEffect(() => {
    void fetchCategoryOptions();
  }, [fetchCategoryOptions]);

  useEffect(() => {
    const timer = setTimeout(() => void fetchCategories(1, pagination.pageSize), 300);
    return () => clearTimeout(timer);
  }, [fetchCategories, pagination.pageSize]);

  const categoryNames = new Map(categoryOptions.map((category) => [category.id, category.name]));

  const handleCreate = () => {
    setEditingCategory(null);
    setImageFile(null);
    setPreviewImageUrl(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = async (category: Category) => {
    try {
      const details = await api.categories.get(category.id);
      setEditingCategory(details);
      form.setFieldsValue({
        name: details.name,
        description: details.description ?? undefined,
        imageUrl: details.imageUrl ?? undefined,
        parentCategoryName: details.parentId
          ? categoryOptions.find((item) => item.id === details.parentId)?.name
          : undefined,
      });
      setImageFile(details.imageUrl ? {
        uid: `category-${details.id}`,
        name: 'category-image',
        status: 'done',
        url: details.imageUrl,
      } : null);
      setPreviewImageUrl(details.imageUrl ?? null);
      setModalVisible(true);
    } catch {
      message.error('Failed to load category details');
    }
  };

  const handleViewDetails = async (category: Category) => {
    setDetailLoading(true);
    setDetailImageFailed(false);
    setDetailCategory(category);
    try {
      const details = await api.categories.get(category.id);
      setDetailCategory(details);
    } catch {
      setDetailCategory(null);
      message.error('Failed to load category details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleImageUpload = async (file: RcFile) => {
    const previousImage = imageFile;
    const previousPreview = previewImageUrl;
    setUploadingImage(true);
    setImageFile({ uid: file.uid, name: file.name, status: 'uploading', originFileObj: file });
    try {
      const localPreview = await readFileAsDataUrl(file);
      setPreviewImageUrl(localPreview);
      const response = await api.categories.uploadImage(file);
      setImageFile({
        uid: file.uid,
        name: file.name,
        status: 'done',
        url: response.url,
      });
      form.setFieldValue('imageUrl', response.url);
      const format = response.contentType.replace('image/', '').toUpperCase();
      const sizeInKb = Math.max(1, Math.round(response.bytes / 1024));
      message.success(`Category image uploaded to AWS S3 (${format}, ${sizeInKb} KB)`);
    } catch (error) {
      setImageFile(previousImage);
      setPreviewImageUrl(previousPreview);
      const errorMessage = typeof error === 'object' && error !== null && 'message' in error
        && typeof error.message === 'string' ? error.message : 'Failed to upload category image';
      message.error(errorMessage);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (values: CategoryFormValues) => {
    if (saving) return;
    setSaving(true);
    try {
      const parentName = values.parentCategoryName?.trim();
      let parentId: number | null = null;

      if (parentName) {
        if (parentName.toLocaleLowerCase() === values.name.trim().toLocaleLowerCase()) {
          message.error('A category cannot be its own parent');
          return;
        }

        const existingParent = categoryOptions.find(
          (category) => category.name.toLocaleLowerCase() === parentName.toLocaleLowerCase(),
        );
        if (existingParent) {
          parentId = existingParent.id;
        } else {
          const createdParent = await api.categories.create({
            name: parentName,
            description: null,
            imageUrl: null,
            parentId: null,
          });
          parentId = createdParent.id;
          message.success(`Parent category “${parentName}” created`);
        }
      }

      const payload = {
        name: values.name,
        description: values.description?.trim() || null,
        imageUrl: values.imageUrl?.trim() || null,
        parentId,
      };

      if (editingCategory) {
        await api.categories.update(editingCategory.id, payload);
        message.success('Category updated successfully');
      } else {
        await api.categories.create(payload);
        message.success('Category created successfully');
      }
      setModalVisible(false);
      await Promise.all([
        fetchCategories(pagination.current, pagination.pageSize),
        fetchCategoryOptions(),
      ]);
    } catch {
      message.error('Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (category: Category) => {
    modal.confirm({
      title: 'Delete Category',
      content: `Delete “${category.name}”? Categories containing products cannot be deleted.`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await api.categories.delete(category.id);
          message.success('Category deleted successfully');
          const page = categories.length === 1 && pagination.current > 1
            ? pagination.current - 1
            : pagination.current;
          await Promise.all([fetchCategories(page, pagination.pageSize), fetchCategoryOptions()]);
        } catch (error) {
          message.error('Failed to delete category');
          throw error;
        }
      },
    });
  };

  const getActions = (category: Category): MenuProps['items'] => [
    { key: 'details', label: 'View Details', icon: <EyeOutlined />, onClick: () => void handleViewDetails(category) },
    { key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => void handleEdit(category) },
    { type: 'divider' },
    { key: 'delete', label: 'Delete', icon: <DeleteOutlined />, danger: true, onClick: () => handleDelete(category) },
  ];

  const columns = [
    {
      title: 'ID', key: 'rowNumber', width: 70,
      render: (_: unknown, __: Category, index: number) =>
        (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Parent', dataIndex: 'parentId', key: 'parentId',
      render: (value: number | null) => value ? categoryNames.get(value) ?? `Category #${value}` : '—',
    },
    { title: 'Description', dataIndex: 'description', key: 'description', render: (value?: string) => value || '—' },
    {
      title: 'Created', dataIndex: 'createdAt', key: 'createdAt', width: 130,
      render: (value?: string) => value ? new Date(value).toLocaleDateString() : '—',
    },
    {
      title: 'Actions', key: 'actions', width: 80,
      render: (_: unknown, category: Category) => (
        <Dropdown menu={{ items: getActions(category) }} trigger={['click']}>
          <Button type="text" aria-label={`Actions for ${category.name}`} icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1>Categories</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Category</Button>
      </div>
      <Input allowClear placeholder="Search categories..." prefix={<SearchOutlined />}
        value={searchText} onChange={(event) => setSearchText(event.target.value)}
        style={{ marginBottom: 16, maxWidth: 400 }} />
      <Table columns={columns} dataSource={categories} rowKey="id" loading={loading}
        pagination={{ ...pagination, onChange: (page, pageSize) => void fetchCategories(page, pageSize) }} />

      <Drawer
        title="Category Details"
        width={520}
        open={detailCategory !== null}
        onClose={() => {
          setDetailCategory(null);
          setDetailImageFailed(false);
        }}
      >
        {detailLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}><Spin /></div>
        ) : detailCategory ? (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="Name">{detailCategory.name}</Descriptions.Item>
            <Descriptions.Item label="Parent Category">
              {detailCategory.parentId
                ? categoryNames.get(detailCategory.parentId) ?? `Category #${detailCategory.parentId}`
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Description">{detailCategory.description || '—'}</Descriptions.Item>
            <Descriptions.Item label="Image">
              {detailCategory.imageUrl ? (
                <div>
                  {!detailImageFailed ? (
                    <Image
                      key={detailCategory.imageUrl}
                      src={detailCategory.imageUrl}
                      alt={detailCategory.name}
                      width={180}
                      style={{ maxHeight: 220, objectFit: 'contain' }}
                      onError={() => setDetailImageFailed(true)}
                    />
                  ) : (
                    <Alert
                      type="warning"
                      showIcon
                      message="The category has an image, but the browser could not load it."
                      description={(
                        <a href={detailCategory.imageUrl} target="_blank" rel="noreferrer">
                          Open the stored image URL
                        </a>
                      )}
                    />
                  )}
                </div>
              ) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Created">
              {detailCategory.createdAt ? new Date(detailCategory.createdAt).toLocaleString() : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Last Updated">
              {detailCategory.updatedAt ? new Date(detailCategory.updatedAt).toLocaleString() : '—'}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>

      <Modal title={editingCategory ? 'Edit Category' : 'Add Category'} open={modalVisible}
        onCancel={() => { if (!saving && !uploadingImage) setModalVisible(false); }} onOk={() => form.submit()}
        confirmLoading={saving} okButtonProps={{ disabled: uploadingImage }}
        cancelButtonProps={{ disabled: saving || uploadingImage }} forceRender>
        <Form form={form} layout="vertical" onFinish={handleSubmit} disabled={saving || uploadingImage}>
          <Form.Item name="name" label="Category Name"
            extra="Example: Luxury Chiffon or Classic Chiffon"
            rules={[{ required: true, message: 'Category name is required' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={4} /></Form.Item>
          <Form.Item name="parentCategoryName" label="Parent Category"
            extra="Example: Chiffon. Type a new name or select an existing parent. Leave empty for a top-level category.">
            <AutoComplete
              allowClear
              placeholder="e.g., Chiffon"
              options={categoryOptions.filter((item) => item.id !== editingCategory?.id)
                .map((item) => ({ value: item.name }))}
              filterOption={(inputValue, option) =>
                String(option?.value ?? '').toLocaleLowerCase().includes(inputValue.toLocaleLowerCase())
              }
            />
          </Form.Item>
          <Form.Item label="Category Image" extra="Choose a JPEG, PNG, WebP, or GIF image (maximum 5 MB).">
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <Upload listType="picture-card" accept="image/jpeg,image/png,image/webp,image/gif"
              maxCount={1} fileList={imageFile ? [imageFile] : []}
              beforeUpload={(file) => {
                const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
                if (!allowedTypes.includes(file.type)) {
                  message.error('Only JPEG, PNG, WebP, and GIF images are allowed');
                  return Upload.LIST_IGNORE;
                }
                if (file.size > 5 * 1024 * 1024) {
                  message.error('Category image must be 5 MB or smaller');
                  return Upload.LIST_IGNORE;
                }
                void handleImageUpload(file);
                return false;
              }}
              onRemove={() => {
                setImageFile(null);
                setPreviewImageUrl(null);
                form.setFieldValue('imageUrl', undefined);
                return true;
              }}>
                {imageFile ? null : (
                  <div>
                    <PlusOutlined />
                    <div style={{ marginTop: 8 }}>{uploadingImage ? 'Uploading...' : 'Choose Image'}</div>
                  </div>
                )}
              </Upload>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, marginBottom: 8 }}>Image Preview</div>
                <div style={{
                width: '100%',
                minHeight: 125,
                padding: 12,
                display: 'grid',
                placeItems: 'center',
                border: '1px solid #d9d9d9',
                borderRadius: 8,
                background: '#fafafa',
                }}>
                  {previewImageUrl ? (
                    <Image
                      src={previewImageUrl}
                      alt="Category image preview"
                      style={{ maxHeight: 180, maxWidth: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{ color: 'rgba(0, 0, 0, 0.45)', textAlign: 'center' }}>
                      {uploadingImage ? 'Uploading image...' : 'No image selected'}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <Form.Item name="imageUrl" hidden><Input /></Form.Item>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Categories;
