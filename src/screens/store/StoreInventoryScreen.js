import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../config/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  primary: '#047857',
  primaryDark: '#065F46',
  primaryLight: '#D1FAE5',
  primarySoft: '#ECFDF5',

  background: '#F5F7F6',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAF9',

  text: '#17201C',
  textSecondary: '#66736D',
  textMuted: '#94A19B',

  border: '#E5EAE7',

  success: '#059669',
  successSoft: '#D1FAE5',

  warning: '#D97706',
  warningSoft: '#FEF3C7',

  danger: '#DC2626',
  dangerSoft: '#FEE2E2',

  white: '#FFFFFF',
  black: '#000000',
};

const CATEGORY_OPTIONS = [
  'Meals',
  'Drinks',
  'Snacks',
  'Desserts',
  'Rice Meals',
  'Fast Food',
  'Other',
];

const EMPTY_FORM = {
  name: '',
  price: '',
  category: 'Meals',
  item_description: '',
  image_url: '',
};

const formatPrice = (value) => {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return '₱0.00';
  }

  return `₱${number.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const normalizePrice = (value) => {
  if (!value) return '';

  const cleaned = String(value).replace(/[^\d.]/g, '');

  const parts = cleaned.split('.');

  if (parts.length > 2) {
    return `${parts[0]}.${parts.slice(1).join('')}`;
  }

  return cleaned;
};

const truncateText = (text, maxLength = 80) => {
  if (!text) return '';

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.substring(0, maxLength).trim()}...`;
};

const getProductImage = (item) => {
  if (!item) return null;

  return (
    item.image_url ||
    item.image_pic ||
    item.product_image ||
    item.image ||
    null
  );
};

export default function StoreInventoryScreen({ navigation }) {
  const [store, setStore] = useState(null);

  const [items, setItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const [showItemModal, setShowItemModal] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);

  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState('success');

  const [deleteItem, setDeleteItem] = useState(null);

  const [editingItem, setEditingItem] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);

  const [selectedImage, setSelectedImage] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [storeAccess, setStoreAccess] = useState({
    verified: false,
    paidPlan: false,
  });

  const [accessMessage, setAccessMessage] = useState('');

  const [updatingAvailability, setUpdatingAvailability] = useState(null);

  const isEditing = !!editingItem;

  const showMessage = useCallback((title, message, type = 'success') => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertType(type);
    setShowAlertModal(true);
  }, []);

  const getCurrentUser = useCallback(async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      throw error;
    }

    if (!user) {
      throw new Error('No authenticated user found.');
    }

    return user;
  }, []);

  const checkStoreAccess = useCallback(
    async (user) => {
      if (!user?.id) {
        return null;
      }

      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (storeError) {
        throw storeError;
      }

      setStore(storeData || null);

      if (!storeData) {
        setStoreAccess({
          verified: false,
          paidPlan: false,
        });

        setAccessMessage(
          'You need to create your store before you can manage inventory.'
        );

        setShowAccessModal(true);

        return null;
      }

      const verified =
        storeData?.is_verified === true ||
        String(storeData?.verification_status || '').trim().toLowerCase() ===
          'verified';

      const subscriptionPlan = String(
        storeData?.subscription_plan || 'Free Plan'
      ).trim();

      const paidPlan =
        subscriptionPlan !== '' &&
        subscriptionPlan.toLowerCase() !== 'free plan' &&
        subscriptionPlan.toLowerCase() !== 'free';

      setStoreAccess({
        verified,
        paidPlan,
      });

      if (!verified) {
        setAccessMessage(
          'Your store needs to be verified before you can manage products.'
        );
        setShowAccessModal(true);
      } else if (!paidPlan) {
        setAccessMessage(
          'Inventory management is available on an active paid subscription plan.'
        );
        setShowAccessModal(true);
      }

      return storeData;
    },
    []
  );

  const fetchItems = useCallback(
    async (storeId) => {
      if (!storeId) {
        setItems([]);
        return;
      }

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const normalizedItems = (data || []).map((item) => ({
        ...item,
        name: item.name || '',
        price: Number(item.price || 0),
        category: item.category || 'Other',
        item_description: item.item_description || '',
        image_url: item.image_url || null,
        is_available: item.is_available !== false,
        sales_count: Number(item.sales_count || 0),
      }));

      setItems(normalizedItems);
    },
    []
  );

  const loadInventory = useCallback(
    async (showLoader = true) => {
      try {
        if (showLoader) {
          setLoading(true);
        }

        const user = await getCurrentUser();

        const storeData = await checkStoreAccess(user);

        if (storeData?.id) {
          await fetchItems(storeData.id);
        } else {
          setItems([]);
        }
      } catch (error) {
        console.error('Inventory loading error:', error);

        showMessage(
          'Unable to Load Inventory',
          error?.message ||
            'Something went wrong while loading your inventory.',
          'error'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [checkStoreAccess, fetchItems, getCurrentUser, showMessage]
  );

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInventory(false);
  }, [loadInventory]);

  const categories = useMemo(() => {
    const dynamicCategories = items
      .map((item) => item.category)
      .filter(Boolean);

    return [
      'All',
      ...Array.from(new Set([...CATEGORY_OPTIONS, ...dynamicCategories])),
    ];
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        !query ||
        item.name?.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query) ||
        item.item_description?.toLowerCase().includes(query);

      const matchesCategory =
        selectedCategory === 'All' ||
        String(item.category).toLowerCase() ===
          selectedCategory.toLowerCase();

      return matchesSearch && matchesCategory;
    });
  }, [items, searchText, selectedCategory]);

  const totalItems = items.length;

  const availableItems = items.filter(
    (item) => item.is_available !== false
  ).length;

  const soldItems = items.reduce(
    (total, item) => total + Number(item.sales_count || 0),
    0
  );

  const totalValue = items.reduce(
    (total, item) => total + Number(item.price || 0),
    0
  );

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setSelectedImage(null);
    setEditingItem(null);
    setImageLoading(false);
  }, []);

  const openAddModal = useCallback(() => {
    if (!storeAccess.verified || !storeAccess.paidPlan) {
      setShowAccessModal(true);
      return;
    }

    resetForm();
    setShowItemModal(true);
  }, [
    resetForm,
    storeAccess.paidPlan,
    storeAccess.verified,
  ]);

  const openEditModal = useCallback((item) => {
    setEditingItem(item);

    setForm({
      name: item?.name || '',
      price:
        item?.price !== undefined && item?.price !== null
          ? String(item.price)
          : '',
      category: item?.category || 'Meals',
      item_description: item?.item_description || '',
      image_url: item?.image_url || '',
    });

    setSelectedImage(null);
    setShowItemModal(true);
  }, []);

  const closeItemModal = useCallback(() => {
    if (saving) return;

    setShowItemModal(false);
    resetForm();
  }, [resetForm, saving]);

  const updateForm = useCallback((field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }, []);

  const requestImagePermission = async () => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      showMessage(
        'Permission Required',
        'Please allow photo library access so you can add product images.',
        'error'
      );

      return false;
    }

    return true;
  };

  const pickImage = async () => {
    try {
      const allowed = await requestImagePermission();

      if (!allowed) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];

      setSelectedImage(asset);
    } catch (error) {
      console.error('Image picker error:', error);

      showMessage(
        'Image Error',
        'Unable to select the image. Please try again.',
        'error'
      );
    }
  };

  const convertImageToDataUri = async (uri) => {
    if (!uri) return null;

    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const extension =
        uri
          .split('?')[0]
          .split('.')
          .pop()
          ?.toLowerCase() || 'jpg';

      let mimeType = 'image/jpeg';

      if (extension === 'png') {
        mimeType = 'image/png';
      } else if (extension === 'webp') {
        mimeType = 'image/webp';
      } else if (extension === 'gif') {
        mimeType = 'image/gif';
      }

      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.error('Image conversion error:', error);
      throw new Error('Unable to process the selected image.');
    }
  };

  const validateForm = () => {
    const name = form.name.trim();
    const price = normalizePrice(form.price);

    if (!name) {
      showMessage(
        'Product Name Required',
        'Please enter a name for your product.',
        'error'
      );

      return false;
    }

    if (name.length < 2) {
      showMessage(
        'Product Name Too Short',
        'Please enter a valid product name.',
        'error'
      );

      return false;
    }

    if (!price) {
      showMessage(
        'Price Required',
        'Please enter the price of the product.',
        'error'
      );

      return false;
    }

    const numericPrice = Number(price);

    if (Number.isNaN(numericPrice) || numericPrice <= 0) {
      showMessage(
        'Invalid Price',
        'Please enter a valid price greater than ₱0.',
        'error'
      );

      return false;
    }

    return true;
  };

  const saveItem = async () => {
    if (saving) return;

    if (!validateForm()) {
      return;
    }

    if (!store?.id) {
      showMessage(
        'Store Not Found',
        'Your store could not be found. Please refresh and try again.',
        'error'
      );

      return;
    }

    try {
      setSaving(true);
      setImageLoading(true);

      let imageUrl = form.image_url || null;

      if (selectedImage?.uri) {
        imageUrl = await convertImageToDataUri(selectedImage.uri);
      }

      const payload = {
        name: form.name.trim(),
        price: Number(normalizePrice(form.price)),
        category: form.category || 'Other',
        item_description: form.item_description.trim(),
        image_url: imageUrl,
      };

      if (editingItem?.id) {
        const { data, error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingItem.id)
          .eq('store_id', store.id)
          .select()
          .single();

        if (error) {
          throw error;
        }

        setItems((previous) =>
          previous.map((item) =>
            item.id === editingItem.id
              ? {
                  ...item,
                  ...data,
                  price: Number(data.price || payload.price),
                }
              : item
          )
        );

        setShowItemModal(false);
        resetForm();

        showMessage(
          'Item Updated',
          `${payload.name} has been updated successfully.`,
          'success'
        );
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert({
            store_id: store.id,
            name: payload.name,
            price: payload.price,
            category: payload.category,
            item_description: payload.item_description,
            image_url: payload.image_url,
          })
          .select()
          .single();

        if (error) {
          throw error;
        }

        const newItem = {
          ...data,
          price: Number(data.price || payload.price),
          category: data.category || payload.category,
          item_description:
            data.item_description || payload.item_description,
          image_url: data.image_url || payload.image_url,
          is_available: data.is_available !== false,
          sales_count: Number(data.sales_count || 0),
        };

        setItems((previous) => [newItem, ...previous]);

        setShowItemModal(false);
        resetForm();

        showMessage(
          'Item Added',
          `${payload.name} has been added to your inventory.`,
          'success'
        );
      }
    } catch (error) {
      console.error('Save item error:', error);

      showMessage(
        isEditing ? 'Unable to Update Item' : 'Unable to Add Item',
        error?.message ||
          'Something went wrong while saving the product.',
        'error'
      );
    } finally {
      setSaving(false);
      setImageLoading(false);
    }
  };

  const toggleAvailability = async (item, value) => {
    if (!item?.id || updatingAvailability === item.id) {
      return;
    }

    try {
      setUpdatingAvailability(item.id);

      const { error } = await supabase
        .from('products')
        .update({
          is_available: value,
        })
        .eq('id', item.id)
        .eq('store_id', store.id);

      if (error) {
        throw error;
      }

      setItems((previous) =>
        previous.map((product) =>
          product.id === item.id
            ? {
                ...product,
                is_available: value,
              }
            : product
        )
      );
    } catch (error) {
      console.error('Availability update error:', error);

      showMessage(
        'Update Failed',
        error?.message ||
          'Unable to update the product availability.',
        'error'
      );
    } finally {
      setUpdatingAvailability(null);
    }
  };

  const askDeleteItem = (item) => {
    setDeleteItem(item);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    if (saving) return;

    setShowDeleteModal(false);
    setDeleteItem(null);
  };

  const confirmDeleteItem = async () => {
    if (!deleteItem?.id || !store?.id) {
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', deleteItem.id)
        .eq('store_id', store.id);

      if (error) {
        throw error;
      }

      setItems((previous) =>
        previous.filter((item) => item.id !== deleteItem.id)
      );

      const deletedName = deleteItem.name;

      setShowDeleteModal(false);
      setDeleteItem(null);

      showMessage(
        'Item Removed',
        `${deletedName} has been removed from your inventory.`,
        'success'
      );
    } catch (error) {
      console.error('Delete item error:', error);

      showMessage(
        'Unable to Remove Item',
        error?.message ||
          'Something went wrong while deleting this product.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const renderStats = () => {
    return (
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <View
            style={[
              styles.statIcon,
              {
                backgroundColor: COLORS.primarySoft,
              },
            ]}
          >
            <Ionicons
              name="grid-outline"
              size={20}
              color={COLORS.primary}
            />
          </View>

          <Text style={styles.statValue}>{totalItems}</Text>

          <Text style={styles.statLabel}>Total Items</Text>
        </View>

        <View style={styles.statCard}>
          <View
            style={[
              styles.statIcon,
              {
                backgroundColor: COLORS.successSoft,
              },
            ]}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={20}
              color={COLORS.success}
            />
          </View>

          <Text style={styles.statValue}>{availableItems}</Text>

          <Text style={styles.statLabel}>Available</Text>
        </View>

        <View style={styles.statCard}>
          <View
            style={[
              styles.statIcon,
              {
                backgroundColor: COLORS.warningSoft,
              },
            ]}
          >
            <Ionicons
              name="trending-up-outline"
              size={20}
              color={COLORS.warning}
            />
          </View>

          <Text style={styles.statValue}>{soldItems}</Text>

          <Text style={styles.statLabel}>Sold</Text>
        </View>
      </View>
    );
  };

  const renderProductCard = ({ item }) => {
    const image = getProductImage(item);

    return (
      <View style={styles.productCard}>
        <View style={styles.productImageContainer}>
          {image ? (
            <Image
              source={{ uri: image }}
              style={styles.productImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.productImagePlaceholder}>
              <Ionicons
                name="image-outline"
                size={34}
                color={COLORS.textMuted}
              />

              <Text style={styles.noImageText}>No Image</Text>
            </View>
          )}

          <View
            style={[
              styles.availabilityBadge,
              item.is_available
                ? styles.availableBadge
                : styles.unavailableBadge,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: item.is_available
                    ? COLORS.success
                    : COLORS.danger,
                },
              ]}
            />

            <Text
              style={[
                styles.availabilityText,
                {
                  color: item.is_available
                    ? COLORS.success
                    : COLORS.danger,
                },
              ]}
            >
              {item.is_available ? 'Available' : 'Unavailable'}
            </Text>
          </View>
        </View>

        <View style={styles.productContent}>
          <View style={styles.productTopRow}>
            <View style={styles.productTitleContainer}>
              <Text
                style={styles.productName}
                numberOfLines={2}
              >
                {item.name}
              </Text>

              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>
                  {item.category || 'Other'}
                </Text>
              </View>
            </View>

            <Text style={styles.productPrice}>
              {formatPrice(item.price)}
            </Text>
          </View>

          {!!item.item_description && (
            <Text
              style={styles.productDescription}
              numberOfLines={2}
            >
              {truncateText(item.item_description, 110)}
            </Text>
          )}

          <View style={styles.productMeta}>
            <View style={styles.soldInfo}>
              <Ionicons
                name="bag-check-outline"
                size={16}
                color={COLORS.textSecondary}
              />

              <Text style={styles.soldText}>
                {Number(item.sales_count || 0)} sold
              </Text>
            </View>

            <View style={styles.availabilityControl}>
              <Text style={styles.switchLabel}>
                {item.is_available ? 'On' : 'Off'}
              </Text>

              <Switch
                value={item.is_available}
                onValueChange={(value) =>
                  toggleAvailability(item, value)
                }
                disabled={updatingAvailability === item.id}
                trackColor={{
                  false: '#D7DEDA',
                  true: '#A7E3CC',
                }}
                thumbColor={
                  item.is_available
                    ? COLORS.primary
                    : '#FFFFFF'
                }
                ios_backgroundColor="#D7DEDA"
              />
            </View>
          </View>

          <View style={styles.productActions}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.editButton}
              onPress={() => openEditModal(item)}
            >
              <Ionicons
                name="create-outline"
                size={18}
                color={COLORS.primary}
              />

              <Text style={styles.editButtonText}>Edit Item</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.deleteButton}
              onPress={() => askDeleteItem(item)}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={COLORS.danger}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => {
    const hasFilters =
      searchText.trim().length > 0 ||
      selectedCategory !== 'All';

    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Ionicons
            name={
              hasFilters
                ? 'search-outline'
                : 'cube-outline'
            }
            size={42}
            color={COLORS.primary}
          />
        </View>

        <Text style={styles.emptyTitle}>
          {hasFilters
            ? 'No items found'
            : 'Your inventory is empty'}
        </Text>

        <Text style={styles.emptyDescription}>
          {hasFilters
            ? 'Try changing your search or category filter.'
            : 'Add your first product to start building your store catalog.'}
        </Text>

        {!hasFilters && (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.emptyAddButton}
            onPress={openAddModal}
          >
            <Ionicons
              name="add"
              size={20}
              color={COLORS.white}
            />

            <Text style={styles.emptyAddButtonText}>
              Add First Item
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderAccessModal = () => {
    return (
      <Modal
        visible={showAccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAccessModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.accessModal}>
            <View style={styles.accessIcon}>
              <Ionicons
                name="lock-closed-outline"
                size={30}
                color={COLORS.primary}
              />
            </View>

            <Text style={styles.accessTitle}>
              Inventory Access
            </Text>

            <Text style={styles.accessDescription}>
              {accessMessage ||
                'Your store is not currently eligible to manage inventory.'}
            </Text>

            <View style={styles.requirementList}>
              <View style={styles.requirementRow}>
                <View
                  style={[
                    styles.requirementIcon,
                    storeAccess.verified
                      ? styles.requirementSuccess
                      : styles.requirementPending,
                  ]}
                >
                  <Ionicons
                    name={
                      storeAccess.verified
                        ? 'checkmark'
                        : 'shield-checkmark-outline'
                    }
                    size={17}
                    color={
                      storeAccess.verified
                        ? COLORS.success
                        : COLORS.warning
                    }
                  />
                </View>

                <View style={styles.requirementTextContainer}>
                  <Text style={styles.requirementTitle}>
                    Verified Store
                  </Text>

                  <Text style={styles.requirementSubtitle}>
                    Your store must be verified
                  </Text>
                </View>
              </View>

              <View style={styles.requirementRow}>
                <View
                  style={[
                    styles.requirementIcon,
                    storeAccess.paidPlan
                      ? styles.requirementSuccess
                      : styles.requirementPending,
                  ]}
                >
                  <Ionicons
                    name={
                      storeAccess.paidPlan
                        ? 'checkmark'
                        : 'card-outline'
                    }
                    size={17}
                    color={
                      storeAccess.paidPlan
                        ? COLORS.success
                        : COLORS.warning
                    }
                  />
                </View>

                <View style={styles.requirementTextContainer}>
                  <Text style={styles.requirementTitle}>
                    Active Plan
                  </Text>

                  <Text style={styles.requirementSubtitle}>
                    An active paid subscription is required
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.accessCloseButton}
              onPress={() => setShowAccessModal(false)}
            >
              <Text style={styles.accessCloseButtonText}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderItemModal = () => {
    const currentImage =
      selectedImage?.uri || form.image_url || null;

    return (
      <Modal
        visible={showItemModal}
        transparent
        animationType="slide"
        onRequestClose={closeItemModal}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.itemModalBackdrop}>
            <View style={styles.itemModal}>
              <View style={styles.modalHandle} />

              <View style={styles.itemModalHeader}>
                <View>
                  <Text style={styles.itemModalTitle}>
                    {isEditing
                      ? 'Edit Item'
                      : 'Add New Item'}
                  </Text>

                  <Text style={styles.itemModalSubtitle}>
                    {isEditing
                      ? 'Update your product details below.'
                      : 'Add a product to your store catalog.'}
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.closeIconButton}
                  onPress={closeItemModal}
                  disabled={saving}
                >
                  <Ionicons
                    name="close"
                    size={22}
                    color={COLORS.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.formScroll}
                contentContainerStyle={styles.formContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.formLabel}>
                  Product Image
                </Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.imagePicker}
                  onPress={pickImage}
                  disabled={saving}
                >
                  {currentImage ? (
                    <Image
                      source={{ uri: currentImage }}
                      style={styles.selectedProductImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.imagePickerEmpty}>
                      <View style={styles.imagePickerIcon}>
                        <Ionicons
                          name="camera-outline"
                          size={26}
                          color={COLORS.primary}
                        />
                      </View>

                      <Text style={styles.imagePickerTitle}>
                        Add Product Photo
                      </Text>

                      <Text style={styles.imagePickerSubtitle}>
                        Tap to choose an image
                      </Text>
                    </View>
                  )}

                  {currentImage && (
                    <View style={styles.changeImageBadge}>
                      <Ionicons
                        name="camera-outline"
                        size={16}
                        color={COLORS.white}
                      />

                      <Text style={styles.changeImageText}>
                        Change
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>
                    Product Name
                  </Text>

                  <View style={styles.inputWrapper}>
                    <Ionicons
                      name="restaurant-outline"
                      size={19}
                      color={COLORS.textMuted}
                    />

                    <TextInput
                      value={form.name}
                      onChangeText={(value) =>
                        updateForm('name', value)
                      }
                      placeholder="e.g. Chicken Adobo"
                      placeholderTextColor={COLORS.textMuted}
                      style={styles.textInput}
                      maxLength={100}
                      editable={!saving}
                    />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View
                    style={[
                      styles.formGroup,
                      styles.halfField,
                    ]}
                  >
                    <Text style={styles.formLabel}>
                      Price
                    </Text>

                    <View style={styles.inputWrapper}>
                      <Text style={styles.currencyPrefix}>
                        ₱
                      </Text>

                      <TextInput
                        value={form.price}
                        onChangeText={(value) =>
                          updateForm(
                            'price',
                            normalizePrice(value)
                          )
                        }
                        placeholder="0.00"
                        placeholderTextColor={
                          COLORS.textMuted
                        }
                        style={styles.textInput}
                        keyboardType="decimal-pad"
                        editable={!saving}
                      />
                    </View>
                  </View>

                  <View
                    style={[
                      styles.formGroup,
                      styles.halfField,
                    ]}
                  >
                    <Text style={styles.formLabel}>
                      Category
                    </Text>

                    <View style={styles.categorySelectWrapper}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={
                          styles.categorySelectScroll
                        }
                      >
                        {CATEGORY_OPTIONS.map((category) => {
                          const active =
                            form.category === category;

                          return (
                            <TouchableOpacity
                              key={category}
                              activeOpacity={0.8}
                              style={[
                                styles.categoryOption,
                                active &&
                                  styles.categoryOptionActive,
                              ]}
                              onPress={() =>
                                updateForm(
                                  'category',
                                  category
                                )
                              }
                              disabled={saving}
                            >
                              <Text
                                style={[
                                  styles.categoryOptionText,
                                  active &&
                                    styles.categoryOptionTextActive,
                                ]}
                              >
                                {category}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>
                    Description
                    <Text style={styles.optionalLabel}>
                      {' '}
                      Optional
                    </Text>
                  </Text>

                  <View
                    style={[
                      styles.inputWrapper,
                      styles.textAreaWrapper,
                    ]}
                  >
                    <TextInput
                      value={form.item_description}
                      onChangeText={(value) =>
                        updateForm(
                          'item_description',
                          value
                        )
                      }
                      placeholder="Describe your product..."
                      placeholderTextColor={
                        COLORS.textMuted
                      }
                      style={[
                        styles.textInput,
                        styles.textArea,
                      ]}
                      multiline
                      textAlignVertical="top"
                      maxLength={500}
                      editable={!saving}
                    />
                  </View>

                  <Text style={styles.characterCount}>
                    {form.item_description.length}/500
                  </Text>
                </View>

                <View style={styles.formInfoBox}>
                  <Ionicons
                    name="information-circle-outline"
                    size={19}
                    color={COLORS.primary}
                  />

                  <Text style={styles.formInfoText}>
                    {isEditing
                      ? 'Changes will be saved directly to your store inventory.'
                      : 'You can edit the item later if you need to change its details.'}
                  </Text>
                </View>

                <View style={styles.formActions}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.cancelButton}
                    onPress={closeItemModal}
                    disabled={saving}
                  >
                    <Text style={styles.cancelButtonText}>
                      Cancel
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.saveButton,
                      saving && styles.saveButtonDisabled,
                    ]}
                    onPress={saveItem}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator
                        size="small"
                        color={COLORS.white}
                      />
                    ) : (
                      <>
                        <Ionicons
                          name={
                            isEditing
                              ? 'checkmark-outline'
                              : 'add-outline'
                          }
                          size={20}
                          color={COLORS.white}
                        />

                        <Text style={styles.saveButtonText}>
                          {isEditing
                            ? 'Save Changes'
                            : 'Add Item'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  const renderDeleteModal = () => {
    return (
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.deleteModal}>
            <View style={styles.deleteIcon}>
              <Ionicons
                name="trash-outline"
                size={28}
                color={COLORS.danger}
              />
            </View>

            <Text style={styles.deleteTitle}>
              Remove Item?
            </Text>

            <Text style={styles.deleteDescription}>
              Are you sure you want to remove{' '}
              <Text style={styles.deleteProductName}>
                {deleteItem?.name || 'this item'}
              </Text>
              ? This action cannot be undone.
            </Text>

            <View style={styles.deleteActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.deleteCancelButton}
                onPress={closeDeleteModal}
                disabled={saving}
              >
                <Text style={styles.deleteCancelText}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.confirmDeleteButton}
                onPress={confirmDeleteItem}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator
                    size="small"
                    color={COLORS.white}
                  />
                ) : (
                  <Text style={styles.confirmDeleteText}>
                    Remove
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderAlertModal = () => {
    const isError = alertType === 'error';

    return (
      <Modal
        visible={showAlertModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAlertModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.alertModal}>
            <View
              style={[
                styles.alertIcon,
                {
                  backgroundColor: isError
                    ? COLORS.dangerSoft
                    : COLORS.successSoft,
                },
              ]}
            >
              <Ionicons
                name={
                  isError
                    ? 'alert-circle-outline'
                    : 'checkmark-circle-outline'
                }
                size={30}
                color={
                  isError
                    ? COLORS.danger
                    : COLORS.success
                }
              />
            </View>

            <Text style={styles.alertTitle}>
              {alertTitle}
            </Text>

            <Text style={styles.alertMessage}>
              {alertMessage}
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.alertButton}
              onPress={() => setShowAlertModal(false)}
            >
              <Text style={styles.alertButtonText}>
                Okay
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={COLORS.background}
        />

        <View style={styles.loadingScreen}>
          <View style={styles.loadingLogo}>
            <Ionicons
              name="cube-outline"
              size={34}
              color={COLORS.primary}
            />
          </View>

          <ActivityIndicator
            size="small"
            color={COLORS.primary}
          />

          <Text style={styles.loadingTitle}>
            Loading inventory
          </Text>

          <Text style={styles.loadingSubtitle}>
            Getting your products ready...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.background}
      />

      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons
                  name="cube-outline"
                  size={24}
                  color={COLORS.primary}
                />
              </View>

              <View>
                <Text style={styles.headerTitle}>
                  Inventory
                </Text>

                <Text style={styles.headerSubtitle}>
                  Manage your store products
                </Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.headerAddButton}
              onPress={openAddModal}
            >
              <Ionicons
                name="add"
                size={21}
                color={COLORS.white}
              />

              <Text style={styles.headerAddText}>
                Add Item
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.storeBanner}>
            <View style={styles.storeBannerIcon}>
              <Ionicons
                name="storefront-outline"
                size={24}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.storeBannerContent}>
              <Text style={styles.storeBannerLabel}>
                Your Store
              </Text>

              <Text
                style={styles.storeBannerName}
                numberOfLines={1}
              >
                {store?.name || 'Store'}
              </Text>
            </View>

            <View
              style={[
                styles.storeStatus,
                storeAccess.verified
                  ? styles.storeStatusVerified
                  : styles.storeStatusPending,
              ]}
            >
              <View
                style={[
                  styles.storeStatusDot,
                  {
                    backgroundColor: storeAccess.verified
                      ? COLORS.success
                      : COLORS.warning,
                  },
                ]}
              />

              <Text
                style={[
                  styles.storeStatusText,
                  {
                    color: storeAccess.verified
                      ? COLORS.success
                      : COLORS.warning,
                  },
                ]}
              >
                {storeAccess.verified
                  ? 'Verified'
                  : 'Pending'}
              </Text>
            </View>
          </View>

          {renderStats()}

          <View style={styles.overviewRow}>
            <View>
              <Text style={styles.sectionTitle}>
                Products
              </Text>

              <Text style={styles.sectionSubtitle}>
                {filteredItems.length === items.length
                  ? `${items.length} ${
                      items.length === 1
                        ? 'item'
                        : 'items'
                    } in your catalog`
                  : `Showing ${filteredItems.length} of ${items.length} items`}
              </Text>
            </View>

            {items.length > 0 && (
              <Text style={styles.catalogValue}>
                {formatPrice(totalValue)}
              </Text>
            )}
          </View>

          <View style={styles.searchContainer}>
            <Ionicons
              name="search-outline"
              size={20}
              color={COLORS.textMuted}
            />

            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search products..."
              placeholderTextColor={COLORS.textMuted}
              style={styles.searchInput}
              returnKeyType="search"
            />

            {searchText.length > 0 && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSearchText('')}
              >
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={COLORS.textMuted}
                />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryFilterContent}
          >
            {categories.map((category) => {
              const active =
                selectedCategory === category;

              return (
                <TouchableOpacity
                  key={category}
                  activeOpacity={0.8}
                  style={[
                    styles.filterChip,
                    active && styles.filterChipActive,
                  ]}
                  onPress={() =>
                    setSelectedCategory(category)
                  }
                >
                  {active && (
                    <Ionicons
                      name="checkmark"
                      size={15}
                      color={COLORS.white}
                    />
                  )}

                  <Text
                    style={[
                      styles.filterChipText,
                      active &&
                        styles.filterChipTextActive,
                    ]}
                  >
                    {category}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.productsContainer}>
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => (
                <View key={item.id}>
                  {renderProductCard({ item })}
                </View>
              ))
            ) : (
              renderEmptyState()
            )}
          </View>

          <View style={styles.bottomSpacing} />
        </ScrollView>

        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.floatingAddButton}
          onPress={openAddModal}
        >
          <Ionicons
            name="add"
            size={27}
            color={COLORS.white}
          />
        </TouchableOpacity>
      </View>

      {renderItemModal()}
      {renderDeleteModal()}
      {renderAccessModal()}
      {renderAlertModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },

  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },

  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  headerAddButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    elevation: 2,
    shadowColor: COLORS.primary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },

  headerAddText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
  },

  storeBanner: {
    minHeight: 76,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  storeBannerIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  storeBannerContent: {
    flex: 1,
    minWidth: 0,
  },

  storeBannerLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  storeBannerName: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },

  storeStatus: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },

  storeStatusVerified: {
    backgroundColor: COLORS.successSoft,
  },

  storeStatusPending: {
    backgroundColor: COLORS.warningSoft,
  },

  storeStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },

  storeStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },

  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },

  statCard: {
    flex: 1,
    minHeight: 112,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 13,
  },

  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },

  statValue: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.text,
  },

  statLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  overviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.text,
  },

  sectionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  catalogValue: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
  },

  searchContainer: {
    height: 52,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  searchInput: {
    flex: 1,
    height: '100%',
    marginLeft: 10,
    fontSize: 14,
    color: COLORS.text,
  },

  categoryFilterContent: {
    paddingBottom: 17,
    gap: 8,
  },

  filterChip: {
    minHeight: 36,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },

  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  filterChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },

  filterChipTextActive: {
    color: COLORS.white,
  },

  productsContainer: {
    gap: 13,
  },

  productCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },

  productImageContainer: {
    height: Math.min(SCREEN_WIDTH * 0.52, 245),
    backgroundColor: COLORS.surfaceMuted,
    position: 'relative',
  },

  productImage: {
    width: '100%',
    height: '100%',
  },

  productImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  noImageText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  availabilityBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
  },

  availableBadge: {
    backgroundColor: 'rgba(236, 253, 245, 0.94)',
  },

  unavailableBadge: {
    backgroundColor: 'rgba(254, 242, 242, 0.94)',
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },

  availabilityText: {
    fontSize: 10,
    fontWeight: '800',
  },

  productContent: {
    padding: 15,
  },

  productTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  productTitleContainer: {
    flex: 1,
    paddingRight: 10,
  },

  productName: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    color: COLORS.text,
  },

  categoryBadge: {
    alignSelf: 'flex-start',
    marginTop: 7,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },

  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
  },

  productPrice: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.primary,
  },

  productDescription: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },

  productMeta: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  soldInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  soldText: {
    marginLeft: 6,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },

  availabilityControl: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  switchLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginRight: 4,
  },

  productActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 9,
  },

  editButton: {
    flex: 1,
    height: 43,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#B7DED0',
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },

  editButtonText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '800',
  },

  deleteButton: {
    width: 46,
    height: 43,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F4CACA',
    backgroundColor: COLORS.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyState: {
    backgroundColor: COLORS.surface,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 24,
    paddingVertical: 50,
    alignItems: 'center',
  },

  emptyIcon: {
    width: 78,
    height: 78,
    borderRadius: 26,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 17,
  },

  emptyTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
  },

  emptyDescription: {
    marginTop: 8,
    maxWidth: 310,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  emptyAddButton: {
    marginTop: 19,
    height: 45,
    paddingHorizontal: 17,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  emptyAddButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
  },

  floatingAddButton: {
    position: 'absolute',
    right: 20,
    bottom: 22,
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: COLORS.primary,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },

  bottomSpacing: {
    height: 90,
  },

  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },

  loadingLogo: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  loadingTitle: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },

  loadingSubtitle: {
    marginTop: 5,
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 20, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  modalContainer: {
    flex: 1,
  },

  itemModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 20, 0.48)',
    justifyContent: 'flex-end',
  },

  itemModal: {
    maxHeight: '94%',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },

  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#CBD4CF',
    alignSelf: 'center',
    marginTop: 9,
    marginBottom: 5,
  },

  itemModalHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  itemModalTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: COLORS.text,
  },

  itemModalSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  closeIconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  formScroll: {
    flexGrow: 0,
  },

  formContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },

  formGroup: {
    marginTop: 16,
  },

  formRow: {
    flexDirection: 'row',
    gap: 10,
  },

  halfField: {
    flex: 1,
  },

  formLabel: {
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
  },

  optionalLabel: {
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  inputWrapper: {
    minHeight: 51,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },

  textInput: {
    flex: 1,
    minHeight: 49,
    paddingHorizontal: 9,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
  },

  currencyPrefix: {
    paddingLeft: 2,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },

  textAreaWrapper: {
    minHeight: 115,
    alignItems: 'stretch',
  },

  textArea: {
    minHeight: 105,
    paddingTop: 12,
    textAlignVertical: 'top',
  },

  characterCount: {
    alignSelf: 'flex-end',
    marginTop: 5,
    fontSize: 10,
    color: COLORS.textMuted,
  },

  imagePicker: {
    height: 185,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    position: 'relative',
  },

  selectedProductImage: {
    width: '100%',
    height: '100%',
  },

  imagePickerEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  imagePickerIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },

  imagePickerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },

  imagePickerSubtitle: {
    marginTop: 4,
    fontSize: 11,
    color: COLORS.textMuted,
  },

  changeImageBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: 'rgba(4, 120, 87, 0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  changeImageText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '800',
  },

  categorySelectWrapper: {
    minHeight: 51,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },

  categorySelectScroll: {
    alignItems: 'center',
    paddingHorizontal: 7,
    gap: 6,
  },

  categoryOption: {
    marginVertical: 7,
    paddingHorizontal: 10,
    minHeight: 35,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  categoryOptionActive: {
    backgroundColor: COLORS.primary,
  },

  categoryOptionText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },

  categoryOptionTextActive: {
    color: COLORS.white,
  },

  formInfoBox: {
    marginTop: 18,
    padding: 12,
    borderRadius: 13,
    backgroundColor: COLORS.primarySoft,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  formInfoText: {
    flex: 1,
    marginLeft: 9,
    fontSize: 11,
    lineHeight: 17,
    color: COLORS.primaryDark,
  },

  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },

  cancelButton: {
    flex: 1,
    height: 49,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },

  saveButton: {
    flex: 1.35,
    height: 49,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },

  saveButtonDisabled: {
    opacity: 0.7,
  },

  saveButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.white,
  },

  accessModal: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 25,
    backgroundColor: COLORS.surface,
    padding: 22,
  },

  accessIcon: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 15,
  },

  accessTitle: {
    textAlign: 'center',
    fontSize: 21,
    fontWeight: '900',
    color: COLORS.text,
  },

  accessDescription: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  requirementList: {
    marginTop: 20,
    gap: 11,
  },

  requirementRow: {
    minHeight: 59,
    padding: 10,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
  },

  requirementIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  requirementSuccess: {
    backgroundColor: COLORS.successSoft,
  },

  requirementPending: {
    backgroundColor: COLORS.warningSoft,
  },

  requirementTextContainer: {
    flex: 1,
    marginLeft: 10,
  },

  requirementTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
  },

  requirementSubtitle: {
    marginTop: 2,
    fontSize: 10,
    color: COLORS.textSecondary,
  },

  accessCloseButton: {
    height: 47,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },

  accessCloseButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.white,
  },

  deleteModal: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    padding: 22,
    alignItems: 'center',
  },

  deleteIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: COLORS.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },

  deleteTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: COLORS.text,
  },

  deleteDescription: {
    marginTop: 9,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  deleteProductName: {
    fontWeight: '800',
    color: COLORS.text,
  },

  deleteActions: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 21,
  },

  deleteCancelButton: {
    flex: 1,
    height: 47,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  deleteCancelText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },

  confirmDeleteButton: {
    flex: 1,
    height: 47,
    borderRadius: 13,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },

  confirmDeleteText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.white,
  },

  alertModal: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    padding: 22,
    alignItems: 'center',
  },

  alertIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },

  alertTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
  },

  alertMessage: {
    marginTop: 9,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  alertButton: {
    width: '100%',
    height: 47,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 21,
  },

  alertButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.white,
  },
});