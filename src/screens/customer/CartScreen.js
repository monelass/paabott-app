import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  Image,
  StatusBar,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';

// ============================================================
// MODERN POPUP
// ============================================================

const ModernPopup = memo(
  ({
    visible,
    type = 'info',
    title,
    message,
    primaryText = 'OK',
    secondaryText = null,
    onPrimary,
    onSecondary,
  }) => {
    const palette = {
      success: {
        icon: 'checkmark-circle',
        color: '#059669',
        soft: '#ECFDF5',
        border: '#A7F3D0',
        label: 'SUCCESS',
      },
      error: {
        icon: 'alert-circle',
        color: '#DC2626',
        soft: '#FEF2F2',
        border: '#FECACA',
        label: 'ERROR',
      },
      warning: {
        icon: 'warning',
        color: '#D97706',
        soft: '#FFFBEB',
        border: '#FDE68A',
        label: 'NOTICE',
      },
      info: {
        icon: 'information-circle',
        color: '#059669', 
        soft: '#ECFDF5', 
        border: '#A7F3D0', 
        label: 'NOTICE',
      },
    };

    const current = palette[type] || palette.info;

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={onSecondary || onPrimary}
      >
        <View style={popupStyles.popupOverlay}>
          <View style={popupStyles.popupCard}>
            <View
              style={[
                popupStyles.popupAccent,
                { backgroundColor: current.color },
              ]}
            />
            <View
              style={[
                popupStyles.popupIconCircle,
                {
                  backgroundColor: current.soft,
                  borderColor: current.border,
                },
              ]}
            >
              <Ionicons
                name={current.icon}
                size={29}
                color={current.color}
              />
            </View>
            <Text
              style={[
                popupStyles.popupEyebrow,
                { color: current.color },
              ]}
            >
              {current.label}
            </Text>
            <Text
              style={popupStyles.popupTitle}
              numberOfLines={2}
            >
              {title}
            </Text>
            <Text style={popupStyles.popupMessage}>
              {message}
            </Text>
            <View style={popupStyles.popupButtons}>
              {secondaryText ? (
                <TouchableOpacity
                  style={popupStyles.popupSecondaryButton}
                  onPress={onSecondary}
                  activeOpacity={0.85}
                >
                  <Text style={popupStyles.popupSecondaryText}>
                    {secondaryText}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  popupStyles.popupPrimaryButton,
                  {
                    backgroundColor: current.color,
                  },
                  !secondaryText &&
                    popupStyles.popupPrimaryButtonSingle,
                ]}
                onPress={onPrimary}
                activeOpacity={0.85}
              >
                <Text style={popupStyles.popupPrimaryText}>
                  {primaryText}
                </Text>
                <Ionicons
                  name={
                    secondaryText
                      ? 'arrow-forward'
                      : 'checkmark'
                  }
                  size={17}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }
);


export default function CartScreen({ navigation }) {
  const [selectedItemIds, setSelectedItemIds] = useState({});
  const [storeNamesMap, setStoreNamesMap] = useState({});

  const { user, profile } = useAuth();
  const cartContext = useCart();

  const cartItems = cartContext?.cartItems || [];
  const removeFromCart = cartContext?.removeFromCart;
  const updateQuantity = cartContext?.updateQuantity;

  // ── NEW STATE — customer verification status ─────────────
  const [
    verificationStatus,
    setVerificationStatus,
  ] = useState('unverified');
  // 'unverified' | 'pending' | 'rejected' | 'verified'

  // Modern Popup State
  const [popup, setPopup] = useState({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    primaryText: 'OK',
    secondaryText: null,
    onPrimary: null,
    onSecondary: null,
  });

  const showPopup = useCallback(
    ({
      type = 'info',
      title,
      message,
      primaryText = 'OK',
      secondaryText = null,
      onPrimary = null,
      onSecondary = null,
    }) => {
      setPopup({
        visible: true,
        type,
        title,
        message,
        primaryText,
        secondaryText,
        onPrimary,
        onSecondary,
      });
    },
    []
  );

  const closePopup = useCallback(() => {
    setPopup((current) => ({
      ...current,
      visible: false,
      onPrimary: null,
      onSecondary: null,
    }));
  }, []);

  // ── NEW EFFECT — fetch customer verification status ──────
  useEffect(() => {
    const fetchVerificationStatus = async () => {
      const currentUserId = user?.id || profile?.id;

      if (!currentUserId) {
        return;
      }

      try {
        const { data, error } = await supabase
          .from('customer_verifications')
          .select('is_verified, verification_status')
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (error) {
          console.error(
            'Verification status fetch error:',
            error
          );
          return;
        }

        if (!data) {
          setVerificationStatus('unverified');
        } else if (data.is_verified) {
          setVerificationStatus('verified');
        } else {
          setVerificationStatus(
            data.verification_status || 'pending'
          );
        }
      } catch (error) {
        console.error(
          'Fetch verification status error:',
          error
        );
      }
    };

    fetchVerificationStatus();
  }, [user?.id, profile?.id]);

  // Fetch real store names from Supabase 'stores' table based on item store IDs
  useEffect(() => {
    const fetchStoreNames = async () => {
      const storeIds = [...new Set(cartItems.map(item => item.store_id || item.storeId || item.vendor_id).filter(Boolean))];
      if (storeIds.length === 0) return;

      try {
        const { data, error } = await supabase
          .from('stores')
          .select('id, name')
          .in('id', storeIds);

        if (!error && data) {
          const map = {};
          data.forEach(store => {
            map[store.id] = store.name;
          });
          setStoreNamesMap(map);
        }
      } catch (err) {
        console.error('Error fetching store names:', err);
      }
    };

    fetchStoreNames();
  }, [cartItems]);

  // Initialize all items as checked by default
  useMemo(() => {
    const initialSelected = {};
    cartItems.forEach((item) => {
      initialSelected[item.id] = selectedItemIds[item.id] ?? true;
    });
    setSelectedItemIds(initialSelected);
  }, [cartItems]);

  const toggleSelectItem = (id) => {
    setSelectedItemIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const toggleSelectStore = (storeItems) => {
    const storeItemIds = storeItems.map(i => i.id);
    const allStoreChecked = storeItemIds.every(id => selectedItemIds[id]);
    
    const newState = { ...selectedItemIds };
    storeItemIds.forEach(id => {
      newState[id] = !allStoreChecked;
    });
    setSelectedItemIds(newState);
  };

  const toggleSelectAll = () => {
    const allSelected = cartItems.every((item) => selectedItemIds[item.id]);
    const newState = {};
    cartItems.forEach((item) => {
      newState[item.id] = !allSelected;
    });
    setSelectedItemIds(newState);
  };

  // Group cart items dynamically by their specific stores using fetched store names
  const groupedByStore = useMemo(() => {
    const groups = {};
    cartItems.forEach((item) => {
      const storeKey = item.store_id || item.storeId || item.vendor_id || 'unassigned';
      
      const storeName = 
        storeNamesMap[storeKey] || 
        item.store_name || 
        item.storeName || 
        item.merchant_name || 
        'Store Partner';
      
      if (!groups[storeKey]) {
        groups[storeKey] = {
          storeId: storeKey,
          storeName: storeName,
          items: [],
        };
      }
      groups[storeKey].items.push(item);
    });
    return Object.values(groups);
  }, [cartItems, storeNamesMap]);

  // Calculate total only for checked items
  const selectedStoreTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      if (selectedItemIds[item.id]) {
        return sum + (parseFloat(item.price) || 0) * (item.quantity || 1);
      }
      return sum;
    }, 0);
  }, [cartItems, selectedItemIds]);

  // Quantity Handlers (+1 and -1 delta increments)
  const handleIncreaseQty = (item) => {
    if (updateQuantity) {
      updateQuantity(item.id, 1);
    }
  };

  const handleDecreaseQty = (item) => {
    if (item.quantity > 1) {
      if (updateQuantity) {
        updateQuantity(item.id, -1);
      }
    } else {
      if (removeFromCart) {
        removeFromCart(item.id);
      }
    }
  };

  // ── UPDATED — checkout now gated by verification status ──
  const handleProceedCheckout = () => {
    const itemsToCheckout = cartItems.filter((item) => selectedItemIds[item.id]);
    if (itemsToCheckout.length === 0) {
      showPopup({
        type: 'info',
        title: 'No Items Selected',
        message: 'Please check at least one item to proceed to checkout.',
        primaryText: 'OK',
        onPrimary: closePopup
      });
      return;
    }

    if (verificationStatus !== 'verified') {
      const isPending = verificationStatus === 'pending';
      
      showPopup({
        type: 'warning',
        title: isPending ? 'Verification Pending' : 'Verify Your Account',
        message: isPending
          ? 'Your ID is currently under review. You will be able to check out once your account is approved.'
          : 'You need to verify your account with a valid ID before you can check out.',
        primaryText: isPending ? 'Close' : 'Verify Now',
        secondaryText: isPending ? null : 'Not Now',
        onPrimary: () => {
          closePopup();
          if (!isPending) {
            navigation.navigate('CustomerVerification');
          }
        },
        onSecondary: closePopup
      });

      return;
    }

    navigation.navigate('Checkout', { itemsToCheckout });
  };

  const allChecked = cartItems.length > 0 && cartItems.every((item) => selectedItemIds[item.id]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shopping Cart</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* TAB CONTENT: STORE CART */}
      {cartItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>Explore products from multiple stores and add them here.</Text>
          <TouchableOpacity
            style={styles.browseBtn}
            onPress={() => navigation.navigate('HomeTab')}
          >
            <Text style={styles.browseBtnText}>Browse Stores</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Select All Toggle Header */}
          <View style={styles.selectAllRow}>
            <TouchableOpacity style={styles.selectAllTouchable} onPress={toggleSelectAll} activeOpacity={0.8}>
              <View style={[styles.checkbox, allChecked && styles.checkboxChecked]}>
                {allChecked && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
              </View>
              <Text style={styles.selectAllText}>Select All Items ({cartItems.length})</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={groupedByStore}
            keyExtractor={(group) => group.storeId.toString()}
            contentContainerStyle={styles.listContainer}
            renderItem={({ item: storeGroup }) => {
              const storeItemIds = storeGroup.items.map(i => i.id);
              const isStoreAllChecked = storeItemIds.every(id => selectedItemIds[id]);

              return (
                <View style={styles.storeSectionCard}>
                  {/* Store Header with Store-Level Checkbox */}
                  <TouchableOpacity 
                    style={styles.storeHeaderRow} 
                    activeOpacity={0.9}
                    onPress={() => toggleSelectStore(storeGroup.items)}
                  >
                    <View style={[styles.checkbox, isStoreAllChecked && styles.checkboxChecked]}>
                      {isStoreAllChecked && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                    </View>
                    <Ionicons name="storefront-outline" size={16} color="#059669" style={{ marginLeft: 8 }} />
                    <Text style={styles.storeHeaderText}>{storeGroup.storeName}</Text>
                  </TouchableOpacity>

                  {/* Items under this specific store */}
                  {storeGroup.items.map((item) => {
                    const isChecked = !!selectedItemIds[item.id];
                    return (
                      <View key={item.id} style={styles.cartCard}>
                        {/* Item Checkbox */}
                        <TouchableOpacity
                          style={[styles.checkbox, isChecked && styles.checkboxChecked]}
                          onPress={() => toggleSelectItem(item.id)}
                          activeOpacity={0.8}
                        >
                          {isChecked && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                        </TouchableOpacity>

                        {item.image_url ? (
                          <Image source={{ uri: item.image_url }} style={styles.itemImage} />
                        ) : (
                          <View style={styles.itemPlaceholder}>
                            <Ionicons name="fast-food-outline" size={24} color="#9CA3AF" />
                          </View>
                        )}

                        <View style={styles.itemDetails}>
                          <Text style={styles.itemName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.itemPrice}>₱{item.price}</Text>

                          {/* Quantity Controls */}
                          <View style={styles.qtyContainer}>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => handleDecreaseQty(item)}
                            >
                              <Ionicons name="remove" size={14} color="#111827" />
                            </TouchableOpacity>

                            <Text style={styles.qtyText}>{item.quantity}</Text>

                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => handleIncreaseQty(item)}
                            >
                              <Ionicons name="add" size={14} color="#111827" />
                            </TouchableOpacity>
                          </View>
                        </View>

                        <TouchableOpacity
                          style={styles.removeBtn}
                          onPress={() => removeFromCart && removeFromCart(item.id)}
                        >
                          <Ionicons name="trash-outline" size={20} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              );
            }}
          />

          {/* Footer / Store Checkout */}
          <View style={styles.footer}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Selected Total</Text>
              <Text style={styles.totalValue}>₱{selectedStoreTotal.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={handleProceedCheckout}
            >
              <Text style={styles.checkoutText}>Check Out Selected Items</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ModernPopup
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        primaryText={popup.primaryText}
        secondaryText={popup.secondaryText}
        onPrimary={popup.onPrimary || closePopup}
        onSecondary={popup.onSecondary || closePopup}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 20) + 8 : 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  selectAllRow: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  selectAllTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginLeft: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  storeSectionCard: {
    marginBottom: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  storeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  storeHeaderText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
    marginLeft: 6,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 4, lineHeight: 18 },
  browseBtn: {
    marginTop: 20,
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  browseBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  listContainer: { padding: 16 },
  cartCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  itemImage: { width: 60, height: 60, borderRadius: 10, resizeMode: 'cover', marginLeft: 10 },
  itemPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  itemDetails: { flex: 1, marginLeft: 12, paddingRight: 8 },
  itemName: { fontSize: 14, fontWeight: '800', color: '#111827' },
  itemPrice: { fontSize: 14, fontWeight: '800', color: '#059669', marginTop: 4 },
  qtyContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 10 },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { fontSize: 13, fontWeight: '700', color: '#111827' },
  removeBtn: { padding: 6 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  totalLabel: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  totalValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  checkoutBtn: {
    backgroundColor: '#059669',
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 3,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  checkoutText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});

// POPUP STYLES EXTRACTED FOR CLARITY
const popupStyles = StyleSheet.create({
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  popupCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 20,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 14,
  },
  popupAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
  },
  popupIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  popupEyebrow: {
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 1.25,
    marginBottom: 6,
  },
  popupTitle: {
    width: '100%',
    fontSize: 21,
    lineHeight: 27,
    color: '#0F172A',
    fontWeight: '900',
    textAlign: 'center',
  },
  popupMessage: {
    width: '100%',
    maxWidth: 330,
    fontSize: 12,
    lineHeight: 19,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 9,
  },
  popupButtons: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  popupSecondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  popupSecondaryText: {
    color: '#475569',
    fontSize: 11.5,
    fontWeight: '900',
  },
  popupPrimaryButton: {
    flex: 1.3,
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
  },
  popupPrimaryButtonSingle: {
    flex: 1,
  },
  popupPrimaryText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '900',
  },
});