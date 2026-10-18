import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  memo,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Platform,
  Modal,
  ScrollView,
  Image,
  TextInput,
  Linking,
  Animated,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';

// ============================================================
// HELPERS
// ============================================================

const parseCustomDescription = (item) => {
  if (!item) {
    return {
      type: 'Custom Request',
      details: ['General Item Request'],
      cost: null,
      payment: 'Cash on Delivery (COD)',
      instructions: null,
    };
  }

  const rawText = typeof item === 'string' ? item : (item.description || item.item_description || '');

  let type = 'Custom Request';

  if (rawText.includes('PACKAGE PICKUP')) {
    type = 'Package Pickup';
  } else if (rawText.includes('ITEM REQUEST')) {
    type = 'Item Request';
  }

  let cost = typeof item === 'object' && item.estimated_budget ? item.estimated_budget : null;

  if (!cost) {
    const costMatch = rawText.match(
      /ESTIMATED ITEM COST: ₱([0-9.]+)/
    );
    if (costMatch) {
      cost = costMatch[1];
    }
  }

  let payment = 'Cash on Delivery (COD)';

  const payMatch = rawText.match(
    /PAYMENT METHOD: ([^\n]+)/
  );

  if (payMatch) {
    payment = payMatch[1].trim();
  }

  let instructions = typeof item === 'object' && item.notes ? item.notes : null;

  if (!instructions) {
    const instMatch = rawText.match(
      /RIDER INSTRUCTIONS: ([^\n]+)/
    );
    if (instMatch) {
      instructions = instMatch[1].trim();
    }
  }

  let cleanDetails = rawText
    .replace(
      /\[(PACKAGE PICKUP|ITEM REQUEST|ESTIMATED ITEM COST:[^\]]+)\]/g,
      ''
    )
    .replace(
      /💳 PAYMENT METHOD: [^\n]+/g,
      ''
    )
    .replace(
      /RIDER INSTRUCTIONS: [^\n]+/g,
      ''
    )
    .trim();

  const detailsArray = cleanDetails
    ? cleanDetails
        .split(/,|\n/)
        .map((val) => val.trim())
        .filter(Boolean)
    : ['General Item Request'];

  return {
    type,
    details:
      detailsArray.length > 0
        ? detailsArray
        : ['General Item Request'],
    cost,
    payment,
    instructions,
  };
};

const getOrderTitle = (item) => {
  if (
    item.order_type === 'store' &&
    item.store_name
  ) {
    return item.store_name;
  }

  if (
    item.description ||
    item.item_description
  ) {
    const parsed =
      parseCustomDescription(item);

    if (
      parsed.type === 'Item Request'
    ) {
      return 'Pabakal';
    }

    if (
      parsed.type === 'Package Pickup'
    ) {
      return 'Pakuha';
    }

    return 'Custom Request';
  }

  if (item.items) {
    let parsedItems = item.items;

    if (typeof parsedItems === 'string') {
      try {
        parsedItems = JSON.parse(
          parsedItems
        );
      } catch (e) {
        parsedItems = [];
      }
    }

    if (
      Array.isArray(parsedItems) &&
      parsedItems.length > 0
    ) {
      const activeItems = parsedItems.filter(i => !i.is_unavailable);
      
      if (activeItems.length > 0) {
        const firstItem =
          activeItems[0]?.name ||
          activeItems[0]?.title ||
          'Item';

        const extraCount =
          activeItems.length - 1;

        return extraCount > 0
          ? `${firstItem} + ${extraCount} more`
          : firstItem;
      }
    }
  }

  return `Order ID: ${
    item.id?.substring(0, 5)?.toUpperCase() ||
    'Details'
  }`;
};

const parseOrderItems = (items) => {
  if (!items) return [];

  if (Array.isArray(items)) {
    return items;
  }

  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);

      return Array.isArray(parsed)
        ? parsed
        : [];
    } catch (e) {
      return [];
    }
  }

  return [];
};

const calculatePaymentSummary = (order) => {
  if (!order) {
    return {
      itemsPrice: 0,
      deliveryFee: 0,
      total: 0,
    };
  }

  const items = parseOrderItems(
    order.items
  );

  let computedItemsPrice =
    items.reduce((sum, prod) => {
      if (prod.is_unavailable || prod.is_penalty || String(prod.name || '').toLowerCase().includes('penalty')) {
        return sum;
      }

      const price = Number(
        prod.price || 0
      );

      const qty = Number(
        prod.quantity ||
          prod.qty ||
          1
      );

      return (
        sum + price * qty
      );
    }, 0);

  const deliveryFee = Number(
    order.delivery_fee || 0
  );

  let total = Number(
    order.total_amount || 0
  );

  if (order.order_type === 'store') {
    total = computedItemsPrice + deliveryFee;
  } else {
    if (total === 0) {
      total = computedItemsPrice + deliveryFee;
    }
  }

  if (
    computedItemsPrice === 0 &&
    total > deliveryFee &&
    order.order_type === 'store'
  ) {
    computedItemsPrice =
      total - deliveryFee;
  }

  return {
    itemsPrice:
      computedItemsPrice,
    deliveryFee,
    total,
  };
};

const getPaymentMethodLabel = (
  item
) => {
  if (
    item.payment_method ===
    'online'
  ) {
    return 'Paid Online (GCash/Card)';
  }

  if (
    item.payment_method ===
    'cod'
  ) {
    return 'Cash on Delivery';
  }

  if (
    item.status === 'paid' ||
    item.status ===
      'awaiting_payment'
  ) {
    return 'Paid Online (GCash/Card)';
  }

  return 'Cash on Delivery';
};

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
        color: '#2563EB',
        soft: '#EFF6FF',
        border: '#BFDBFE',
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
        <View style={styles.popupOverlay}>
          <View style={styles.popupCard}>
            <View
              style={[
                styles.popupAccent,
                { backgroundColor: current.color },
              ]}
            />
            <View
              style={[
                styles.popupIconCircle,
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
                styles.popupEyebrow,
                { color: current.color },
              ]}
            >
              {current.label}
            </Text>
            <Text
              style={styles.popupTitle}
              numberOfLines={2}
            >
              {title}
            </Text>
            <Text style={styles.popupMessage}>
              {message}
            </Text>
            <View style={styles.popupButtons}>
              {secondaryText ? (
                <TouchableOpacity
                  style={styles.popupSecondaryButton}
                  onPress={onSecondary}
                  activeOpacity={0.85}
                >
                  <Text style={styles.popupSecondaryText}>
                    {secondaryText}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.popupPrimaryButton,
                  {
                    backgroundColor: current.color,
                  },
                  !secondaryText &&
                    styles.popupPrimaryButtonSingle,
                ]}
                onPress={onPrimary}
                activeOpacity={0.85}
              >
                <Text style={styles.popupPrimaryText}>
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

// ============================================================
// MAIN SCREEN
// ============================================================

export default function OrderHistoryScreen({
  navigation,
}) {
  const { profile, user } =
    useAuth();

  const userId =
    profile?.id || user?.id;

  const headerOpacity = useRef(
    new Animated.Value(0)
  ).current;

  const headerTranslateY = useRef(
    new Animated.Value(-12)
  ).current;

  const filterOpacity = useRef(
    new Animated.Value(0)
  ).current;

  const filterTranslateY = useRef(
    new Animated.Value(-8)
  ).current;

  const [deliveries, setDeliveries] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [cancelling, setCancelling] =
    useState(false);

  const [
    selectedOrder,
    setSelectedOrder,
  ] = useState(null);

  const [
    activeFilter,
    setActiveFilter,
  ] = useState('All');

  const [
    cancelModalVisible,
    setCancelModalVisible,
  ] = useState(false);

  const [
    orderToCancel,
    setOrderToCancel,
  ] = useState(null);

  const [
    modalAction,
    setModalAction,
  ] = useState('cancel');

  const [
    refundMethod,
    setRefundMethod,
  ] = useState('GCash');

  const [
    refundName,
    setRefundName,
  ] = useState('');

  const [
    refundNumber,
    setRefundNumber,
  ] = useState('');

  const [
    evidenceModalVisible,
    setEvidenceModalVisible,
  ] = useState(false);

  const [
    proofPurchaseModalVisible,
    setProofPurchaseModalVisible,
  ] = useState(false);

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

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.spring(headerTranslateY, {
        toValue: 0,
        friction: 8,
        tension: 65,
        useNativeDriver: true,
      }),
      Animated.timing(filterOpacity, {
        toValue: 1,
        duration: 380,
        delay: 100,
        useNativeDriver: true,
      }),
      Animated.spring(filterTranslateY, {
        toValue: 0,
        friction: 8,
        tension: 70,
        useNativeDriver: true,
      }),
    ]).start();
  }, [
    headerOpacity,
    headerTranslateY,
    filterOpacity,
    filterTranslateY,
  ]);

  const handleGoHome = () => {
    try {
      navigation.navigate(
        'CustomerTabs',
        {
          screen: 'HomeTab',
        }
      );
    } catch (e) {
      try {
        navigation.navigate(
          'HomeTab'
        );
      } catch (err) {
        navigation.goBack();
      }
    }
  };

  const handleCallPhone = (
    phone
  ) => {
    if (!phone) return;

    Linking.openURL(
      `tel:${phone}`
    ).catch(() => {
      showPopup({
        type: 'error',
        title: 'Error',
        message: 'Unable to make phone call',
        primaryText: 'Close',
        onPrimary: closePopup
      });
    });
  };

  const handleBuyAgain = (
    order
  ) => {
    if (!order) return;

    if (
      order.order_type !==
      'store'
    ) {
      showPopup({
        type: 'info',
        title: 'Buy Again',
        message: 'Buy Again is available for store orders only.',
        primaryText: 'Got It',
        onPrimary: closePopup
      });
      return;
    }

    const savedItems =
      parseOrderItems(
        order.items
      ).filter((item) => !item.is_unavailable);

    if (savedItems.length === 0) {
      showPopup({
        type: 'warning',
        title: 'Items Unavailable',
        message: 'The items from this order could not be loaded.',
        primaryText: 'Close',
        onPrimary: closePopup
      });
      return;
    }

    const exactItems =
      savedItems.map((item) => ({
        ...item,

        quantity:
          item.quantity ??
          item.qty ??
          1,

        store_id:
          item.store_id ||
          item.storeId ||
          order.store_id ||
          null,

        store_name:
          item.store_name ||
          item.storeName ||
          order.store_name ||
          'Store',
      }));

    setSelectedOrder(null);

    const checkoutParams = {
      itemsToCheckout:
        exactItems,

      reorder: true,

      reorderFromOrderId:
        order.id,
    };

    const parentNavigation =
      navigation.getParent?.();

    if (parentNavigation) {
      parentNavigation.navigate(
        'Checkout',
        checkoutParams
      );
    } else {
      navigation.navigate(
        'Checkout',
        checkoutParams
      );
    }
  };

  const fetchOrders =
    useCallback(async () => {
      if (!userId) return;

      try {
        const {
          data: storeOrders,
        } = await supabase
          .from('orders')
          .select('*')
          .eq(
            'customer_id',
            userId
          )
          .neq(
            'status',
            'awaiting_payment'
          );

        let storeOrderIds =
          (storeOrders || []).map(
            (o) => o.id
          );

        let relatedRequests = [];

        let storeNamesMap = {};

        if (
          storeOrderIds.length >
          0
        ) {
          const {
            data: reqs,
          } = await supabase
            .from(
              'delivery_requests'
            )
            .select(
              'order_id, driver_id, eta_minutes, pickup_address, subtotal, actual_item_cost, evidence_url'
            )
            .in(
              'order_id',
              storeOrderIds
            );

          if (reqs) {
            relatedRequests =
              reqs;
          }

          const storeIds = [
            ...new Set(
              (storeOrders || [])
                .map(
                  (o) =>
                    o.store_id
                )
                .filter(Boolean)
            ),
          ];

          if (
            storeIds.length > 0
          ) {
            const {
              data: stores,
            } = await supabase
              .from('stores')
              .select(
                'id, name'
              )
              .in(
                'id',
                storeIds
              );

            if (stores) {
              stores.forEach((s) => {
                storeNamesMap[
                  s.id
                ] = s.name;
              });
            }
          }
        }

        const taggedStoreOrders =
          (
            storeOrders || []
          ).map((item) => {
            const req =
              relatedRequests.find(
                (r) =>
                  r.order_id ===
                  item.id
              );

            const actualDriverId =
              item.driver_id ||
              req?.driver_id ||
              null;

            return {
              ...item,

              resolved_driver_id:
                actualDriverId,

              order_type: 'store',

              order_type_label:
                'Store Order',

              store_name:
                storeNamesMap[
                  item.store_id
                ] ||
                'Store Order',

              eta_minutes:
                item.eta_minutes ||
                req?.eta_minutes ||
                0,

              pickup_address:
                item.pickup_address ||
                req?.pickup_address ||
                'Store Location',

              subtotal:
                item.subtotal ||
                req?.subtotal ||
                0,

              actual_item_cost:
                item.actual_item_cost ||
                req?.actual_item_cost ||
                0,

              evidence_url:
                item.evidence_url ||
                req?.evidence_url ||
                null,
            };
          });

        const {
          data: customRequests,
        } = await supabase
          .from(
            'delivery_requests'
          )
          .select('*')
          .eq(
            'customer_id',
            userId
          )
          .is(
            'order_id',
            null
          )
          .neq(
            'request_type',
            'store_order'
          )
          .neq(
            'status',
            'awaiting_payment'
          );

        const taggedCustomRequests =
          (
            customRequests || []
          ).map((item) => ({
            ...item,

            resolved_driver_id:
              item.driver_id ||
              null,

            order_type:
              'custom',

            order_type_label:
              'Custom Request',

            eta_minutes:
              item.eta_minutes ||
              0,
          }));

        const {
          data: refundReqs,
        } = await supabase
          .from(
            'financial_requests'
          )
          .select(
            'status, reference_number'
          )
          .eq(
            'user_id',
            userId
          )
          .eq(
            'request_type',
            'refund'
          );

        const combined = [
          ...taggedStoreOrders,
          ...taggedCustomRequests,
        ].map((item) => {
          const shortId =
            String(item.id)
              .substring(0, 5)
              .toUpperCase();

          const refundMatch =
            (
              refundReqs || []
            ).find(
              (r) =>
                r.reference_number &&
                r.reference_number.includes(
                  shortId
                )
            );

          return {
            ...item,

            refund_status:
              refundMatch
                ? refundMatch.status
                : null,
          };
        });

        const driverIds = [
          ...new Set(
            combined
              .map(
                (o) =>
                  o.resolved_driver_id
              )
              .filter(Boolean)
          ),
        ];

        let driverProfiles = [];

        if (
          driverIds.length > 0
        ) {
          const {
            data: drivers,
            error: dErr,
          } = await supabase
            .from(
              'profiles'
            )
            .select(
              'id, full_name, phone'
            )
            .in(
              'id',
              driverIds
            );

          if (dErr) {
            console.error(
              'Driver fetch error:',
              dErr
            );
          }

          if (drivers) {
            driverProfiles =
              drivers;
          }
        }

        const finalCombined =
          combined
            .map((item) => ({
              ...item,

              driver_info:
                driverProfiles.find(
                  (d) =>
                    d.id ===
                    item.resolved_driver_id
                ) ||
                null,
            }))
            .sort(
              (a, b) =>
                new Date(
                  b.created_at
                ) -
                new Date(
                  a.created_at
                )
            );

        setDeliveries(
          finalCombined
        );
      } catch (err) {
        console.error(
          'Error fetching order history:',
          err.message
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }, [userId]);

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

  // ✨ SUPABASE REALTIME LISTENER FOR ORDER UPDATES ✨
  useEffect(() => {
    if (!userId) return;

    // Added Date.now() to make the channel name unique per render
    const ordersChannel = supabase
      .channel(`order-history-orders-${userId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*', 
          schema: 'public',
          table: 'orders',
          filter: `customer_id=eq.${userId}`,
        },
        () => {
          fetchOrders(); 
        }
      )
      .subscribe();

    const requestsChannel = supabase
      .channel(`order-history-requests-${userId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*', 
          schema: 'public',
          table: 'delivery_requests',
          filter: `customer_id=eq.${userId}`,
        },
        () => {
          fetchOrders(); 
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(requestsChannel);
    };
  }, [userId, fetchOrders]);

  const filteredDeliveries =
    useMemo(() => {
      if (
        activeFilter === 'All'
      ) {
        return deliveries;
      }

      return deliveries.filter(
        (item) => {
          const status =
            item.status
              ?.toLowerCase()
              ?.trim() ||
            'pending';

          const isCompleted =
            status ===
              'completed' ||
            status ===
              'delivered';

          const isCancelled =
            status ===
            'cancelled';

          if (
            activeFilter ===
            'Completed'
          ) {
            return isCompleted;
          }

          if (
            activeFilter ===
            'Cancelled'
          ) {
            return isCancelled;
          }

          if (
            activeFilter ===
            'Active'
          ) {
            return (
              !isCompleted &&
              !isCancelled
            );
          }

          return true;
        }
      );
    }, [
      deliveries,
      activeFilter,
    ]);

  const processCancelOrRefund =
    async () => {
      if (!orderToCancel) return;

      const paymentLabel =
        getPaymentMethodLabel(
          orderToCancel
        );

      const pm = String(
        orderToCancel.payment_method ||
          ''
      ).toLowerCase();

      const isOnline =
        pm.includes('online') ||
        pm.includes('gcash') ||
        pm.includes('card') ||
        pm.includes(
          'paymongo'
        ) ||
        pm.includes('paid') ||
        paymentLabel.includes(
          'Online'
        );

      const summary =
        calculatePaymentSummary(
          orderToCancel
        );

      let totalPaid = Number(
        summary.total
      );

      if (
        isNaN(totalPaid) ||
        totalPaid <= 0
      ) {
        totalPaid = Number(
          orderToCancel.total_amount ||
            orderToCancel.delivery_fee ||
            0
        );
      }

      if (
        isOnline &&
        totalPaid > 0
      ) {
        if (
          !refundName.trim() ||
          !refundNumber.trim()
        ) {
          showPopup({
            type: 'warning',
            title: 'Required',
            message: 'Please enter your refund account name and number.',
            primaryText: 'OK',
            onPrimary: closePopup
          });

          return;
        }
      }

      try {
        setCancelling(true);

        if (
          modalAction === 'cancel'
        ) {
          if (
            orderToCancel.order_type ===
            'store'
          ) {
            await supabase
              .from('orders')
              .update({
                status:
                  'cancelled',
              })
              .eq(
                'id',
                orderToCancel.id
              );

            await supabase
              .from(
                'delivery_requests'
              )
              .update({
                status:
                  'cancelled',
              })
              .eq(
                'order_id',
                orderToCancel.id
              );
          } else {
            await supabase
              .from(
                'delivery_requests'
              )
              .update({
                status:
                  'cancelled',
              })
              .eq(
                'id',
                orderToCancel.id
              );
          }
        }

        if (
          isOnline &&
          totalPaid > 0
        ) {
          const {
            error: refundErr,
          } = await supabase
            .from(
              'financial_requests'
            )
            .insert([
              {
                user_id:
                  orderToCancel.customer_id,

                request_type:
                  'refund',

                amount:
                  totalPaid,

                status:
                  'pending',

                payment_method:
                  refundMethod,

                account_name:
                  refundName.trim(),

                account_number:
                  refundNumber.trim(),

                reference_number: `Order ID: ${String(
                  orderToCancel.id
                )
                  .substring(0, 5)
                  .toUpperCase()}`,
              },
            ]);

          if (refundErr) {
            console.error(
              'Failed to log refund request:',
              refundErr
            );

            showPopup({
              type: 'error',
              title: 'Database Error',
              message: `Failed to create refund request: ${refundErr.message}`,
              primaryText: 'Close',
              onPrimary: closePopup
            });

            return;
          }

          showPopup({
            type: 'success',
            title: 'Success',
            message: modalAction === 'claim'
              ? 'Your refund request has been submitted successfully to the Admin.'
              : 'Your order was cancelled. A refund request has been submitted.',
            primaryText: 'OK',
            onPrimary: closePopup
          });
        } else {
          showPopup({
            type: 'success',
            title: 'Order Cancelled',
            message: 'Your order has been cancelled.',
            primaryText: 'OK',
            onPrimary: closePopup
          });
        }

        setCancelModalVisible(
          false
        );

        setSelectedOrder(null);

        setOrderToCancel(null);

        setRefundName('');

        setRefundNumber('');

        setRefundMethod(
          'GCash'
        );

        fetchOrders();
      } catch (err) {
        showPopup({
          type: 'error',
          title: 'Error',
          message: 'Failed to process request. Please try again.',
          primaryText: 'Close',
          onPrimary: closePopup
        });
      } finally {
        setCancelling(false);
      }
    };

  const getStatusBadgeConfig = (status, item = {}) => {
    const normalizedStatus = status?.toLowerCase()?.trim() || 'pending';
    const hasDriver = !!item.resolved_driver_id;
    const isCustom = item.order_type === 'custom';

    const paymentLabel = getPaymentMethodLabel(item);
    const pm = String(item.payment_method || '').toLowerCase();
    const isOnline =
      pm.includes('online') ||
      pm.includes('gcash') ||
      pm.includes('card') ||
      pm.includes('paymongo') ||
      pm.includes('paid') ||
      paymentLabel.includes('Online');

    const reasonStr = String(item.cancellation_reason || '').toLowerCase();
    const notesStr = String(item.notes || '').toLowerCase();
    
    const isPrank = 
      reasonStr.includes('prank') || 
      reasonStr.includes('refused') || 
      reasonStr.includes('refuse') || 
      notesStr.includes('prank');
      
    const isNoShow = 
      reasonStr.includes('unavailable') || 
      notesStr.includes('unavailable');

    if (normalizedStatus === 'completed' || normalizedStatus === 'delivered') {
      return {
        label: 'Completed',
        bg: '#ECFDF5',
        text: '#047857',
        icon: 'checkmark-circle',
      };
    }

    if (normalizedStatus === 'cancelled') {
      
      if (isPrank) {
         return {
           label: isOnline ? 'Cancelled (Prank) • Non-Refundable' : 'Cancelled (Prank/Refused)',
           bg: '#FEF2F2',
           text: '#DC2626',
           icon: 'close-circle',
         };
      }
      
      if (isNoShow) {
         return {
           label: isOnline ? 'Cancelled (No-Show) • Non-Refundable' : 'Cancelled (No-Show)',
           bg: '#FFFBEB',
           text: '#D97706',
           icon: 'close-circle',
         };
      }

      if (item.refund_status === 'pending') {
        return {
          label: 'Cancelled • Refund Pending',
          bg: '#FFFBEB',
          text: '#D97706',
          icon: 'time-outline',
        };
      }

      if (item.refund_status === 'approved') {
        return {
          label: 'Cancelled • Refunded',
          bg: '#ECFDF5',
          text: '#059669',
          icon: 'checkmark-circle-outline',
        };
      }

      if (isOnline && !item.refund_status) {
        return {
          label: 'Cancelled • Action Required',
          bg: '#FEF2F2',
          text: '#DC2626',
          icon: 'alert-circle',
        };
      }

      return {
        label: 'Cancelled',
        bg: '#F3F4F6',
        text: '#4B5563',
        icon: 'close-circle',
      };
    }

    if (isCustom) {
      if (normalizedStatus === 'in_transit' || normalizedStatus === 'delivering') {
        return { label: 'In Transit', bg: '#EFF6FF', text: '#1D4ED8', icon: 'navigate' };
      }
      if (normalizedStatus === 'picked_up' || normalizedStatus === 'preparing' || normalizedStatus === 'ready_for_pickup') {
        return { label: 'Preparing Order', bg: '#E0F2FE', text: '#0284C7', icon: 'cube' };
      }
      if (normalizedStatus === 'accepted' || normalizedStatus === 'picking_up') {
        return { label: 'Rider Assigned', bg: '#F3E8FF', text: '#7C3AED', icon: 'checkmark-circle-outline' };
      }
      return { label: 'Waiting for Rider', bg: '#F3E8FF', text: '#7C3AED', icon: 'time' };
    }

    if (normalizedStatus === 'in_transit' || normalizedStatus === 'delivering') {
      return { label: 'Out for Delivery', bg: '#EFF6FF', text: '#1D4ED8', icon: 'navigate' };
    }

    if (normalizedStatus === 'picked_up') {
      return { label: 'Order Picked Up', bg: '#E0F2FE', text: '#0284C7', icon: 'cube-outline' };
    }

    if (normalizedStatus === 'picking_up') {
      return { label: 'Heading to Store', bg: '#EFF6FF', text: '#1D4ED8', icon: 'navigate-outline' };
    }

    if (normalizedStatus === 'ready_for_pickup') {
      return {
        label: hasDriver ? 'Order Ready • Waiting for Courier' : 'Order Ready • Pending Courier Assignment',
        bg: '#E0F2FE',
        text: '#0284C7',
        icon: 'cube',
      };
    }

    if (normalizedStatus === 'preparing') {
      return { label: 'Preparing Order', bg: '#E0F2FE', text: '#0284C7', icon: 'restaurant-outline' };
    }

    if (normalizedStatus === 'accepted' || normalizedStatus === 'pending' || normalizedStatus === 'paid') {
      if (hasDriver) {
        return { label: 'Rider Assigned • Awaiting Preparation', bg: '#FEF3C7', text: '#D97706', icon: 'checkmark-circle-outline' };
      }
      return {
        label: normalizedStatus === 'accepted' ? 'Accepted by Store' : 'Waiting for Store Acceptance',
        bg: '#FFFBEB',
        text: '#B45309',
        icon: 'time',
      };
    }

    return { label: 'Waiting for Store Acceptance', bg: '#FFFBEB', text: '#B45309', icon: 'time' };
  };

  const renderItem =
    useCallback(
      ({ item }) => {
        const badge =
          getStatusBadgeConfig(
            item.status,
            item
          );

        const isStoreOrder =
          item.order_type ===
          'store';

        const paymentLabel =
          getPaymentMethodLabel(
            item
          );

        const isOnline =
          paymentLabel.includes(
            'Online'
          );

        const pickup =
          item.pickup_address ||
          (isStoreOrder
            ? 'Store Location'
            : 'Pickup Address');

        const dropoff =
          item.delivery_address ||
          item.dropoff_address ||
          'Delivery Address';

        const computedSummary = calculatePaymentSummary(item);
        const amount = isStoreOrder ? computedSummary.total : (item.total_amount || item.delivery_fee || 0);

        const orderDate =
          item.created_at
            ? new Date(
                item.created_at
              ).toLocaleDateString(
                'en-US',
                {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute:
                    '2-digit',
                }
              )
            : '';

        const normalizedItemStatus =
          item.status
            ?.toLowerCase()
            ?.trim() ||
          '';

        const canBuyAgain =
          isStoreOrder &&
          [
            'completed',
            'delivered',
          ].includes(
            normalizedItemStatus
          ) &&
          parseOrderItems(
            item.items
          ).length > 0;

        const allParsedItems = parseOrderItems(item.items);
        
        const orderItems = allParsedItems.filter(i => !i.is_unavailable);

        const firstOrderItem =
          orderItems[0] || null;

        const orderItemImage =
          firstOrderItem?.image_url ||
          firstOrderItem?.image_pic ||
          firstOrderItem?.product_image ||
          firstOrderItem?.image ||
          firstOrderItem?.thumbnail ||
          null;

        const orderItemName =
          firstOrderItem?.name ||
          firstOrderItem?.title ||
          null;

        const extraItemCount =
          Math.max(
            orderItems.length - 1,
            0
          );

        return (
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() =>
              setSelectedOrder(
                item
              )
            }
            style={styles.card}
          >
            <View
              style={styles.orderPreviewRow}
            >
              <View
                style={
                  styles.orderItemImageWrap
                }
              >
                {orderItemImage ? (
                  <Image
                    source={{
                      uri: orderItemImage,
                    }}
                    style={
                      styles.orderItemImage
                    }
                  />
                ) : (
                  <View
                    style={
                      styles.orderItemImageFallback
                    }
                  >
                    <Ionicons
                      name={
                        isStoreOrder
                          ? 'fast-food-outline'
                          : 'cube-outline'
                      }
                      size={25}
                      color="#059669"
                    />
                  </View>
                )}

                {extraItemCount > 0 && (
                  <View
                    style={
                      styles.orderItemCountBadge
                    }
                  >
                    <Text
                      style={
                        styles.orderItemCountText
                      }
                    >
                      +{extraItemCount}
                    </Text>
                  </View>
                )}
              </View>

              <View
                style={
                  styles.orderPreviewContent
                }
              >
                <View
                  style={
                    styles.cardTopRow
                  }
                >
                  <View
                    style={[
                      styles.typeBadge,
                      isStoreOrder
                        ? styles.typeStore
                        : styles.typeCustom,
                    ]}
                  >
                    <Ionicons
                      name={
                        isStoreOrder
                          ? 'storefront-outline'
                          : 'paper-plane-outline'
                      }
                      size={11}
                      color={
                        isStoreOrder
                          ? '#0284C7'
                          : '#7C3AED'
                      }
                      style={{
                        marginRight: 4,
                      }}
                    />

                    <Text
                      style={[
                        styles.typeBadgeText,
                        {
                          color:
                            isStoreOrder
                              ? '#0284C7'
                              : '#7C3AED',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {
                        item.order_type_label
                      }
                    </Text>
                  </View>

                  <Text
                    style={
                      styles.orderDateText
                    }
                    numberOfLines={1}
                  >
                    {orderDate}
                  </Text>
                </View>

                <View
                  style={
                    styles.cardHeader
                  }
                >
                  <View
                    style={
                      styles.titleAccent
                    }
                  />

                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <Text
                      style={
                        styles.itemTitle
                      }
                      numberOfLines={2}
                    >
                      {getOrderTitle(
                        item
                      )}
                    </Text>

                    {isStoreOrder &&
                      orderItemName &&
                      orderItemName !==
                        getOrderTitle(
                          item
                        ) && (
                      <Text
                        style={
                          styles.orderItemPreviewName
                        }
                        numberOfLines={1}
                      >
                        {orderItemName}
                        {extraItemCount >
                        0
                          ? ` + ${extraItemCount} more`
                          : ''}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </View>

            <View
              style={
                styles.routeContainer
              }
            >
              {isStoreOrder && (
                <>
                  <View
                    style={
                      styles.addressRow
                    }
                  >
                    <View
                      style={
                        styles.pickupCircle
                      }
                    />

                    <View
                      style={
                        styles.addressContent
                      }
                    >
                      <Text
                        style={
                          styles.addressMiniLabel
                        }
                      >
                        PICKUP
                      </Text>

                      <Text
                        style={
                          styles.addressText
                        }
                        numberOfLines={
                          2
                        }
                      >
                        {pickup}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={
                      styles.routeConnectorLine
                    }
                  />
                </>
              )}

              <View
                style={
                  styles.addressRow
                }
              >
                <View
                  style={
                    styles.dropoffIcon
                  }
                >
                  <Ionicons
                    name="location"
                    size={12}
                    color="#EF4444"
                  />
                </View>

                <View
                  style={
                    styles.addressContent
                  }
                >
                  <Text
                    style={
                      styles.addressMiniLabel
                    }
                  >
                    DELIVERY TO
                  </Text>

                  <Text
                    style={
                      styles.addressText
                    }
                    numberOfLines={2}
                  >
                    {dropoff}
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={
                styles.cardFooter
              }
            >
              <View
                style={[
                  styles.badgeContainer,
                  {
                    backgroundColor:
                      badge.bg,
                    maxWidth: '58%',
                  },
                ]}
              >
                <Ionicons
                  name={badge.icon}
                  size={13}
                  color={
                    badge.text
                  }
                  style={{
                    marginRight: 5,
                  }}
                />

                <Text
                  style={[
                    styles.badgeText,
                    {
                      color:
                        badge.text,
                    },
                  ]}
                  numberOfLines={2}
                >
                  {badge.label}
                </Text>
              </View>

              <View
                style={
                  styles.amountContainer
                }
              >
                <Text
                  style={
                    styles.feeLabel
                  }
                >
                  TOTAL
                </Text>

                <Text
                  style={
                    styles.feeText
                  }
                >
                  ₱
                  {Number(
                    amount
                  ).toFixed(2)}
                </Text>

                {!isStoreOrder &&
                  (() => {
                    const parsed = parseCustomDescription(item);

                    const isItemCompleted =
                      [
                        'delivered',
                        'completed',
                      ].includes(
                        item.status
                          ?.toLowerCase()
                          ?.trim()
                      );

                    const finalCost = Number(item.actual_item_cost || item.subtotal || 0);
                    const estCost = Number(item.estimated_budget || parsed.cost || 0);

                    if (
                      parsed.type ===
                      'Item Request'
                    ) {
                      if (
                        isItemCompleted &&
                        finalCost > 0
                      ) {
                        return (
                          <Text
                            style={[
                              styles.estCostMiniText,
                              {
                                color:
                                  '#059669',
                              },
                            ]}
                          >
                            Final Cost:
                            {' '}
                            ₱
                            {finalCost.toFixed(
                              2
                            )}
                          </Text>
                        );
                      }

                      if (
                        estCost > 0
                      ) {
                        return (
                          <Text
                            style={
                              styles.estCostMiniText
                            }
                          >
                            Est. Cost:
                            {' '}
                            ₱
                            {estCost.toFixed(2)}
                          </Text>
                        );
                      }
                    }

                    return null;
                  })()}

                <View
                  style={
                    styles.paymentMethodMiniBadge
                  }
                >
                  <Ionicons
                    name={
                      isOnline
                        ? 'card-outline'
                        : 'cash-outline'
                    }
                    size={10}
                    color="#64748B"
                  />

                  <Text
                    style={
                      styles.paymentMethodMiniText
                    }
                  >
                    {isOnline
                      ? 'Online'
                      : 'COD'}
                  </Text>
                </View>
              </View>
            </View>

            {canBuyAgain && (
              <TouchableOpacity
                style={
                  styles.buyAgainButton
                }
                activeOpacity={
                  0.85
                }
                onPress={() =>
                  handleBuyAgain(
                    item
                  )
                }
              >
                <View
                  style={
                    styles.buyAgainLeft
                  }
                >
                  <View
                    style={
                      styles.buyAgainIcon
                    }
                  >
                    <Ionicons
                      name="refresh-outline"
                      size={17}
                      color="#059669"
                    />
                  </View>

                  <View>
                    <Text
                      style={
                        styles.buyAgainTitle
                      }
                    >
                      Buy Again
                    </Text>

                    <Text
                      style={
                        styles.buyAgainSub
                      }
                    >
                      Order the same items again
                    </Text>
                  </View>
                </View>

                <View
                  style={
                    styles.buyAgainArrow
                  }
                >
                  <Ionicons
                    name="arrow-forward"
                    size={16}
                    color="#059669"
                  />
                </View>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        );
      },
      [showPopup, closePopup]
    );

  const modalItems =
    selectedOrder
      ? parseOrderItems(
          selectedOrder.items
        )
      : [];

  const selectedStatus =
    selectedOrder
      ? getStatusBadgeConfig(
          selectedOrder.status,
          selectedOrder
        )
      : null;

  const paymentSummary =
    selectedOrder
      ? calculatePaymentSummary(
          selectedOrder
        )
      : null;

  const normalizedStatus =
    selectedOrder?.status
      ? selectedOrder.status
          .toLowerCase()
          .trim()
      : 'pending';

  const isSelectedActive =
    selectedOrder &&
    normalizedStatus !==
      'completed' &&
    normalizedStatus !==
      'delivered' &&
    normalizedStatus !==
      'cancelled';

  const canTrackOrder =
    selectedOrder &&
    ['picked_up', 'in_transit', 'delivering'].includes(normalizedStatus);

  const canBuyAgainSelected =
    selectedOrder?.order_type ===
      'store' &&
    [
      'completed',
      'delivered',
    ].includes(
      normalizedStatus
    ) &&
    modalItems.length > 0;

  let canCancel = false;

  if (selectedOrder) {
    const riderHasAccepted = !!selectedOrder.resolved_driver_id;

    if (
      [
        'cancelled',
        'completed',
        'delivered',
      ].includes(
        normalizedStatus
      )
    ) {
      canCancel = false;
    } else if (
      selectedOrder.order_type ===
      'custom'
    ) {
      canCancel = !riderHasAccepted;
    } else {
      canCancel = [
        'pending',
        'awaiting_payment',
        'paid',
        'accepted'
      ].includes(normalizedStatus);
    }
  }

  const isOnlinePayment =
    selectedOrder
      ? getPaymentMethodLabel(
          selectedOrder
        ).includes('Online') ||
        String(
          selectedOrder.payment_method ||
            ''
        )
          .toLowerCase()
          .includes(
            'online'
          )
      : false;

  const isSelectedCustomerFault = selectedOrder ? (
    String(selectedOrder.cancellation_reason || '').toLowerCase().includes('unavailable') ||
    String(selectedOrder.cancellation_reason || '').toLowerCase().includes('prank') ||
    String(selectedOrder.cancellation_reason || '').toLowerCase().includes('refused') ||
    String(selectedOrder.cancellation_reason || '').toLowerCase().includes('refuse') ||
    String(selectedOrder.notes || '').toLowerCase().includes('unavailable') ||
    String(selectedOrder.notes || '').toLowerCase().includes('prank')
  ) : false;

  const canClaimRefund =
    selectedOrder &&
    normalizedStatus ===
      'cancelled' &&
    isOnlinePayment &&
    !selectedOrder.refund_status && 
    !isSelectedCustomerFault;

  const filterTabs = [
    'All',
    'Active',
    'Completed',
    'Cancelled',
  ];

  const qrDataPayload =
    selectedOrder
      ? selectedOrder.id.toString()
      : '';

  return (
    <SafeAreaView
      style={styles.container}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#047857"
        translucent={false}
      />

      <Animated.View
        style={[
          styles.headerAnimatedWrapper,
          {
            opacity: headerOpacity,
            transform: [
              {
                translateY:
                  headerTranslateY,
              },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={[
            '#047857',
            '#059669',
            '#10B981',
          ]}
          start={{
            x: 0,
            y: 0,
          }}
          end={{
            x: 1,
            y: 1,
          }}
          style={
            styles.screenHeader
          }
        >
          <View
            style={
              styles.headerGlow
            }
          />

          <View
            style={
              styles.titleContainer
            }
          >
            <View
              style={
                styles.headerLabel
              }
            >
              <View
                style={
                  styles.headerLabelDot
                }
              />

              <Text
                style={
                  styles.headerLabelText
                }
              >
                ORDER CENTER
              </Text>
            </View>

            <Text
              style={
                styles.screenTitle
              }
            >
              My Orders
            </Text>

            <Text
              style={
                styles.screenSub
              }
            >
              Track deliveries and
              order history
            </Text>
          </View>

          <TouchableOpacity
            style={
              styles.homeActionBtn
            }
            onPress={
              handleGoHome
            }
            activeOpacity={
              0.85
            }
          >
            <Ionicons
              name="home-outline"
              size={16}
              color="#059669"
            />

            <Text
              style={
                styles.homeActionBtnText
              }
            >
              Home
            </Text>
          </TouchableOpacity>
        </LinearGradient>
      </Animated.View>

      <Animated.View
        style={[
          styles.filterTabsContainer,
          {
            opacity: filterOpacity,
            transform: [
              {
                translateY:
                  filterTranslateY,
              },
            ],
          },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.filterScroll
          }
        >
          {filterTabs.map(
            (tab) => (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.filterChip,
                  activeFilter ===
                    tab &&
                    styles.activeFilterChip,
                ]}
                onPress={() =>
                  setActiveFilter(
                    tab
                  )
                }
                activeOpacity={
                  0.75
                }
              >
                {activeFilter ===
                  tab && (
                  <View
                    style={
                      styles.filterDot
                    }
                  />
                )}

                <Text
                  style={[
                    styles.filterChipText,
                    activeFilter ===
                      tab &&
                      styles.activeFilterChipText,
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            )
          )}
        </ScrollView>
      </Animated.View>

      {loading &&
      !refreshing ? (
        <View
          style={
            styles.centerContainer
          }
        >
          <View
            style={
              styles.loadingCard
            }
          >
            <ActivityIndicator
              size="large"
              color="#059669"
            />

            <Text
              style={
                styles.loadingText
              }
            >
              Loading your
              orders...
            </Text>

            <Text
              style={
                styles.loadingSubText
              }
            >
              Please wait a moment
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={
            filteredDeliveries
          }
          keyExtractor={(item) =>
            `${item.order_type}-${item.id}`
          }
          renderItem={
            renderItem
          }
          contentContainerStyle={[
            styles.listContainer,
            filteredDeliveries.length ===
              0 && {
              flex: 1,
              justifyContent:
                'center',
            },
          ]}
          showsVerticalScrollIndicator={
            false
          }
          ListEmptyComponent={
            <View
              style={
                styles.emptyContainer
              }
            >
              <View
                style={
                  styles.emptyIconBg
                }
              >
                <Ionicons
                  name="receipt-outline"
                  size={38}
                  color="#059669"
                />
              </View>

              <Text
                style={
                  styles.emptyTitle
                }
              >
                No Orders Found
              </Text>

              <Text
                style={
                  styles.emptySub
                }
              >
                {activeFilter ===
                'All'
                  ? 'Your active store orders and custom delivery requests will appear here.'
                  : `You have no ${activeFilter.toLowerCase()} orders right now.`}
              </Text>

              <TouchableOpacity
                style={
                  styles.emptyActionBtn
                }
                onPress={
                  handleGoHome
                }
                activeOpacity={
                  0.85
                }
              >
                <Ionicons
                  name="storefront-outline"
                  size={17}
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.emptyActionText
                  }
                >
                  Browse Stores &
                  Items
                </Text>
              </TouchableOpacity>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={
                refreshing
              }
              onRefresh={() => {
                setRefreshing(
                  true
                );

                fetchOrders();
              }}
              colors={[
                '#059669',
              ]}
              tintColor="#059669"
            />
          }
        />
      )}

      {/* ORDER DETAILS MODAL */}

      <Modal
        visible={
          !!selectedOrder
        }
        transparent
        animationType="slide"
        onRequestClose={() =>
          setSelectedOrder(
            null
          )
        }
      >
        <View
          style={
            styles.modalOverlay
          }
        >
          <View
            style={
              styles.modernModalCard
            }
          >
            {selectedOrder &&
              paymentSummary && (
                <View
                  style={
                    styles.modalInnerContainer
                  }
                >
                  <View
                    style={
                      styles.modernModalHeader
                    }
                  >
                    <View
                      style={
                        styles.modalTitleArea
                      }
                    >
                      <View
                        style={
                          styles.modalTitleAccent
                        }
                      />

                      <View
                        style={{
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <Text
                          style={
                            styles.modernModalOrderTitle
                          }
                          numberOfLines={
                            2
                          }
                        >
                          {getOrderTitle(
                            selectedOrder
                          )}
                        </Text>

                        <Text
                          style={
                            styles.modernModalSubtitle
                          }
                        >
                          Order ID: {selectedOrder.id
                            ?.substring(
                              0,
                              5
                            )
                            ?.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() =>
                        setSelectedOrder(
                          null
                        )
                      }
                      style={
                        styles.modernCloseBtn
                      }
                      activeOpacity={
                        0.7
                      }
                    >
                      <Ionicons
                        name="close"
                        size={19}
                        color="#111827"
                      />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    style={
                      styles.modalScrollView
                    }
                    showsVerticalScrollIndicator={
                      false
                    }
                  >
                    <View
                      style={
                        styles.modalBadgesRow
                      }
                    >
                      <View
                        style={[
                          styles.modalTypeBadge,
                          selectedOrder.order_type ===
                            'store'
                            ? styles.typeStore
                            : styles.typeCustom,
                        ]}
                      >
                        <Ionicons
                          name={
                            selectedOrder.order_type ===
                            'store'
                              ? 'storefront-outline'
                              : 'paper-plane-outline'
                          }
                          size={12}
                          color={
                            selectedOrder.order_type ===
                            'store'
                              ? '#0284C7'
                              : '#7C3AED'
                          }
                        />

                        <Text
                          style={[
                            styles.typeBadgeText,
                            {
                              color:
                                selectedOrder.order_type ===
                                'store'
                                  ? '#0284C7'
                                  : '#7C3AED',
                            },
                          ]}
                        >
                          {selectedOrder.order_type ===
                          'store'
                            ? 'Store Order'
                            : 'Custom Request'}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.badgeContainer,
                          {
                            backgroundColor:
                              selectedStatus?.bg,
                            flex: 1,
                            paddingVertical: 7,
                          },
                        ]}
                      >
                        <Ionicons
                          name={
                            selectedStatus?.icon
                          }
                          size={12}
                          color={
                            selectedStatus?.text
                          }
                          style={{
                            marginRight: 5,
                          }}
                        />

                        <Text
                          style={[
                            styles.badgeText,
                            {
                              color:
                                selectedStatus?.text,
                            },
                          ]}
                          numberOfLines={
                            2
                          }
                        >
                          {
                            selectedStatus?.label
                          }
                        </Text>
                      </View>
                    </View>

                    {normalizedStatus !==
                      'cancelled' && (
                      <View
                        style={
                          styles.modernProgressSection
                        }
                      >
                        <View
                          style={
                            styles.sectionHeaderRow
                          }
                        >
                          <View>
                            <Text
                              style={
                                styles.modernSectionHeading
                              }
                            >
                              Order
                              Progress
                            </Text>

                            <Text
                              style={
                                styles.sectionSubText
                              }
                            >
                              Current delivery
                              status
                            </Text>
                          </View>

                          <View
                            style={
                              styles.progressStatusPill
                            }
                          >
                            <View
                              style={
                                styles.progressStatusDot
                              }
                            />

                            <Text
                              style={
                                styles.progressStatusText
                              }
                            >
                              LIVE
                            </Text>
                          </View>
                        </View>

                        <View
                          style={
                            styles.progressBarContainer
                          }
                        >
                          {(() => {
                            const isStore =
                              selectedOrder.order_type ===
                              'store';

                            let step =
                              0;

                            if (
                              [
                                'completed',
                                'delivered',
                              ].includes(
                                normalizedStatus
                              )
                            ) {
                              step =
                                3;
                            } else if (
                              [
                                'in_transit',
                                'delivering',
                              ].includes(
                                normalizedStatus
                              )
                            ) {
                              step =
                                2;
                            } else if (
                              [
                                'picked_up',
                                'picking_up',
                                'preparing',
                                'ready_for_pickup',
                              ].includes(
                                normalizedStatus
                              ) ||
                              (!isStore &&
                                normalizedStatus ===
                                  'accepted')
                            ) {
                              step =
                                1;
                            }

                            return (
                              <>
                                <View
                                  style={
                                    styles.progressLineBackground
                                  }
                                />

                                <View
                                  style={[
                                    styles.progressLineActive,
                                    {
                                      width: `${Math.max(
                                        0,
                                        (step /
                                          3) *
                                          100
                                      )}%`,
                                    },
                                  ]}
                                />

                                <View
                                  style={
                                    styles.progressStepWrapper
                                  }
                                >
                                  <View
                                    style={[
                                      styles.progressDot,
                                      step >=
                                        0 &&
                                        styles.activeDot,
                                    ]}
                                  >
                                    <Ionicons
                                      name="time-outline"
                                      size={13}
                                      color={
                                        step >=
                                        0
                                          ? '#FFFFFF'
                                          : '#9CA3AF'
                                      }
                                    />
                                  </View>

                                  <Text
                                    style={[
                                      styles.progressLabel,
                                      step >=
                                        0 &&
                                        styles.activeLabel,
                                    ]}
                                  >
                                    {isStore
                                      ? 'Store\nAcceptance'
                                      : 'Waiting\nfor Rider'}
                                  </Text>
                                </View>

                                <View
                                  style={
                                    styles.progressStepWrapper
                                  }
                                >
                                  <View
                                    style={[
                                      styles.progressDot,
                                      step >=
                                        1 &&
                                        styles.activeDot,
                                    ]}
                                  >
                                    <Ionicons
                                      name={
                                        isStore
                                          ? 'restaurant-outline'
                                          : 'checkmark-outline'
                                      }
                                      size={13}
                                      color={
                                        step >=
                                        1
                                          ? '#FFFFFF'
                                          : '#9CA3AF'
                                      }
                                    />
                                  </View>

                                  <Text
                                    style={[
                                      styles.progressLabel,
                                      step >=
                                        1 &&
                                        styles.activeLabel,
                                    ]}
                                  >
                                    {isStore
                                      ? 'Preparing\nOrder'
                                      : 'Rider\nAssigned'}
                                  </Text>
                                </View>

                                <View
                                  style={
                                    styles.progressStepWrapper
                                  }
                                >
                                  <View
                                    style={[
                                      styles.progressDot,
                                      step >=
                                        2 &&
                                        styles.activeDot,
                                    ]}
                                  >
                                    <Ionicons
                                      name="navigate-outline"
                                      size={13}
                                      color={
                                        step >=
                                        2
                                          ? '#FFFFFF'
                                          : '#9CA3AF'
                                      }
                                    />
                                  </View>

                                  <Text
                                    style={[
                                      styles.progressLabel,
                                      step >=
                                        2 &&
                                        styles.activeLabel,
                                    ]}
                                  >
                                    {isStore
                                      ? 'Out for\nDelivery'
                                      : 'In\nTransit'}
                                  </Text>
                                </View>

                                <View
                                  style={
                                    styles.progressStepWrapper
                                  }
                                >
                                  <View
                                    style={[
                                      styles.progressDot,
                                      step >=
                                        3 &&
                                        styles.activeDot,
                                    ]}
                                  >
                                    <Ionicons
                                      name="checkmark-circle-outline"
                                      size={13}
                                      color={
                                        step >=
                                        3
                                          ? '#FFFFFF'
                                          : '#9CA3AF'
                                      }
                                    />
                                  </View>

                                  <Text
                                    style={[
                                      styles.progressLabel,
                                      step >=
                                        3 &&
                                        styles.activeLabel,
                                    ]}
                                  >
                                    Completed
                                  </Text>
                                </View>
                              </>
                            );
                          })()}
                        </View>
                      </View>
                    )}

                    {isSelectedActive && (
                      <View
                        style={
                          styles.modernQrCard
                        }
                      >
                        <View
                          style={
                            styles.qrHeader
                          }
                        >
                          <View
                            style={
                              styles.qrIconBox
                            }
                          >
                            <Ionicons
                              name="qr-code-outline"
                              size={20}
                              color="#059669"
                            />
                          </View>

                          <View
                            style={{
                              flex: 1,
                            }}
                          >
                            <Text
                              style={
                                styles.modernQrTitle
                              }
                            >
                              Handover QR
                              Code
                            </Text>

                            <Text
                              style={
                                styles.qrSmallText
                              }
                            >
                              Secure order
                              verification
                            </Text>
                          </View>
                        </View>

                        <Text
                          style={
                            styles.modernQrInstructions
                          }
                        >
                          Present this
                          code to your
                          rider upon
                          delivery arrival
                          to complete
                          your order.
                        </Text>

                        <View
                          style={
                            styles.modernQrWrapper
                          }
                        >
                          {qrDataPayload ? (
                            <QRCode
                              value={
                                qrDataPayload
                              }
                              size={
                                140
                              }
                              color="#111827"
                              backgroundColor="#FFFFFF"
                            />
                          ) : null}
                        </View>
                      </View>
                    )}

                    {selectedOrder.order_type ===
                      'store' && (
                      <View
                        style={
                          styles.modernDetailCard
                        }
                      >
                        <Text
                          style={
                            styles.modernSectionHeading
                          }
                        >
                          Store
                          Information
                        </Text>

                        <View
                          style={
                            styles.infoRow
                          }
                        >
                          <View
                            style={
                              styles.infoIconBox
                            }
                          >
                            <Ionicons
                              name="storefront-outline"
                              size={16}
                              color="#059669"
                            />
                          </View>

                          <Text
                            style={
                              styles.infoText
                            }
                          >
                            {selectedOrder?.store_name ||
                              selectedOrder?.store
                                ?.name ||
                              'Store Location'}
                          </Text>
                        </View>

                        <View
                          style={
                            styles.infoRow
                          }
                        >
                          <View
                            style={
                              styles.infoIconBox
                            }
                          >
                            <Ionicons
                              name="location-outline"
                              size={16}
                              color="#059669"
                            />
                          </View>

                          <Text
                            style={
                              styles.infoText
                            }
                          >
                            {selectedOrder?.pickup_address ||
                              'Address not provided'}
                          </Text>
                        </View>
                      </View>
                    )}

                    {selectedOrder?.driver_info && (
                      <View
                        style={
                          styles.modernDetailCard
                        }
                      >
                        <Text
                          style={
                            styles.modernSectionHeading
                          }
                        >
                          Rider
                          Information
                        </Text>

                        <View
                          style={
                            styles.infoRow
                          }
                        >
                          <View
                            style={
                              styles.infoIconBox
                            }
                          >
                            <Ionicons
                              name="person-outline"
                              size={16}
                              color="#059669"
                            />
                          </View>

                          <Text
                            style={
                              styles.infoText
                            }
                          >
                            {selectedOrder
                              .driver_info
                              .full_name ||
                              'Delivery Rider'}
                          </Text>
                        </View>

                        {selectedOrder
                          .driver_info
                          .phone && (
                          <TouchableOpacity
                            style={
                              styles.infoRow
                            }
                            onPress={() =>
                              handleCallPhone(
                                selectedOrder
                                  .driver_info
                                  .phone
                              )
                            }
                          >
                            <View
                              style={
                                styles.infoIconBox
                              }
                            >
                              <Ionicons
                                name="call-outline"
                                size={16}
                                color="#059669"
                              />
                            </View>

                            <Text
                              style={[
                                styles.infoText,
                                {
                                  color:
                                    '#0284C7',
                                  textDecorationLine:
                                    'underline',
                                },
                              ]}
                            >
                              {
                                selectedOrder
                                  .driver_info
                                  .phone
                              }
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {modalItems.length >
                      0 && (
                      <View
                        style={
                          styles.modernDetailCard
                        }
                      >
                        <View
                          style={
                            styles.sectionHeaderRow
                          }
                        >
                          <Text
                            style={
                              styles.modernSectionHeading
                            }
                          >
                            Items
                            Purchased
                          </Text>

                          <View
                            style={
                              styles.itemCountBadge
                            }
                          >
                            <Text
                              style={
                                styles.itemCountText
                              }
                            >
                              {
                                modalItems.length
                              }
                            </Text>
                          </View>
                        </View>

                        {modalItems.map(
                          (prod, index) => {
                            const isUnavailable = prod.is_unavailable === true;
                            return (
                              <View
                                key={index}
                                style={[
                                  styles.modalItemRow,
                                  isUnavailable && { opacity: 0.5 },
                                ]}
                              >
                                <View style={styles.modalItemQtyBox}>
                                  <Text
                                    style={[
                                      styles.modalItemQty,
                                      isUnavailable && { textDecorationLine: 'line-through' },
                                    ]}
                                  >
                                    {prod.quantity ?? prod.qty ?? 1}x
                                  </Text>
                                </View>

                                <Text
                                  style={[
                                    styles.modalItemName,
                                    isUnavailable && { textDecorationLine: 'line-through' },
                                  ]}
                                >
                                  {prod.name || prod.title || 'Product'} {isUnavailable ? '(Unavailable)' : ''}
                                </Text>

                                <Text
                                  style={[
                                    styles.modalItemPrice,
                                    isUnavailable && { textDecorationLine: 'line-through' },
                                  ]}
                                >
                                  ₱
                                  {(
                                    Number(prod.price || 0) *
                                    Number(prod.quantity ?? prod.qty ?? 1)
                                  ).toFixed(2)}
                                </Text>
                              </View>
                            );
                          }
                        )}
                      </View>
                    )}

                    {selectedOrder.order_type ===
                      'custom' &&
                      (() => {
                        const parsedCustom = parseCustomDescription(selectedOrder);

                        return (
                          <View
                            style={
                              styles.modernDetailCard
                            }
                          >
                            <Text
                              style={
                                styles.modernSectionHeading
                              }
                            >
                              Request
                              Details
                            </Text>

                            <View
                              style={
                                styles.customDetailBlock
                              }
                            >
                              <Text
                                style={
                                  styles.customDetailLabel
                                }
                              >
                                Item Request
                              </Text>

                              {parsedCustom.details.map(
                                (
                                  detailItem,
                                  idx
                                ) => (
                                  <View
                                    key={
                                      idx
                                    }
                                    style={
                                      styles.bulletRow
                                    }
                                  >
                                    <View
                                      style={
                                        styles.bulletDot
                                      }
                                    />

                                    <Text
                                      style={
                                        styles.customBulletValue
                                      }
                                    >
                                      {
                                        detailItem
                                      }
                                    </Text>
                                  </View>
                                )
                              )}
                            </View>

                            {parsedCustom.cost && (
                              <View
                                style={
                                  styles.customDetailRow
                                }
                              >
                                <Text
                                  style={
                                    styles.customDetailLabel
                                  }
                                >
                                  Estimated
                                  Item
                                  Cost
                                </Text>

                                <Text
                                  style={[
                                    styles.customDetailValue,
                                    {
                                      color:
                                        '#059669',
                                      fontWeight:
                                        '800',
                                    },
                                  ]}
                                >
                                  ₱
                                  {
                                    parsedCustom.cost
                                  }
                                </Text>
                              </View>
                            )}

                            <View
                              style={
                                styles.customDetailRow
                              }
                            >
                              <Text
                                style={
                                  styles.customDetailLabel
                                }
                              >
                                Payment
                                Method
                              </Text>

                              <Text
                                style={
                                  styles.customDetailValue
                                }
                              >
                                {
                                  parsedCustom.payment
                                }
                              </Text>
                            </View>

                            {parsedCustom.instructions && (
                              <View
                                style={[
                                  styles.customDetailRow,
                                  {
                                    borderBottomWidth: 0,
                                    paddingBottom: 0,
                                  },
                                ]}
                              >
                                <Text
                                  style={
                                    styles.customDetailLabel
                                  }
                                >
                                  Rider
                                  Instruction
                                </Text>

                                <Text
                                  style={[
                                    styles.customDetailValue,
                                    {
                                      color:
                                        '#D97706',
                                      fontWeight:
                                        '700',
                                    },
                                  ]}
                                >
                                  {
                                    parsedCustom.instructions
                                  }
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })()}

                    <View
                      style={
                        styles.modernDetailCard
                      }
                    >
                      <Text
                        style={
                          styles.modernSectionHeading
                        }
                      >
                        Delivery Route
                      </Text>

                      <View
                        style={
                          styles.addressBox
                        }
                      >
                        {selectedOrder.order_type ===
                          'store' && (
                          <>
                            <View
                              style={
                                styles.addressRow
                              }
                            >
                              <View
                                style={[
                                  styles.routeIconBox,
                                  {
                                    backgroundColor:
                                      '#ECFDF5',
                                  },
                                ]}
                              >
                                <Ionicons
                                  name="radio-button-on"
                                  size={14}
                                  color="#059669"
                                />
                              </View>

                              <View
                                style={
                                  styles.routeTextArea
                                }
                              >
                                <Text
                                  style={
                                    styles.addressLabel
                                  }
                                >
                                  Pickup
                                  Location
                                </Text>

                                <Text
                                  style={
                                    styles.addressSub
                                  }
                                >
                                  {selectedOrder.pickup_address ||
                                    'Store Location'}
                                </Text>
                              </View>
                            </View>

                            <View
                              style={
                                styles.modalRouteLine
                              }
                            />
                          </>
                        )}

                        <View
                          style={
                            styles.addressRow
                          }
                        >
                          <View
                            style={[
                              styles.routeIconBox,
                              {
                                backgroundColor:
                                  '#FEF2F2',
                              },
                            ]}
                          >
                            <Ionicons
                              name="location"
                              size={14}
                              color="#EF4444"
                            />
                          </View>

                          <View
                            style={
                              styles.routeTextArea
                            }
                          >
                            <Text
                              style={
                                styles.addressLabel
                              }
                            >
                              Dropoff
                              Location
                            </Text>

                            <Text
                              style={
                                styles.addressSub
                              }
                            >
                              {selectedOrder.delivery_address ||
                                selectedOrder.dropoff_address ||
                                'Not specified'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    <View
                      style={
                        styles.modernDetailCard
                      }
                    >
                      <Text
                        style={
                          styles.modernSectionHeading
                        }
                      >
                        Payment
                        Summary
                      </Text>

                      <View
                        style={
                          styles.breakdownRow
                        }
                      >
                        <Text
                          style={
                            styles.breakdownLabel
                          }
                        >
                          Method
                        </Text>

                        <View
                          style={
                            styles.paymentMethodLarge
                          }
                        >
                          <Ionicons
                            name={
                              getPaymentMethodLabel(
                                selectedOrder
                              ).includes(
                                'Online'
                              )
                                ? 'card-outline'
                                : 'cash-outline'
                            }
                            size={14}
                            color="#059669"
                          />

                          <Text
                            style={
                              styles.breakdownValueGreen
                            }
                          >
                            {getPaymentMethodLabel(
                              selectedOrder
                            )}
                          </Text>
                        </View>
                      </View>

                      {selectedOrder.order_type ===
                        'store' && (
                        <View
                          style={
                            styles.breakdownRow
                          }
                        >
                          <Text
                            style={
                              styles.breakdownLabel
                            }
                          >
                            Products
                            Price
                          </Text>

                          <Text
                            style={
                              styles.breakdownValue
                            }
                          >
                            ₱
                            {paymentSummary.itemsPrice.toFixed(
                              2
                            )}
                          </Text>
                        </View>
                      )}

                      {(() => {
                        const parsedCustom =
                          selectedOrder.order_type === 'custom'
                            ? parseCustomDescription(selectedOrder)
                            : null;

                        const actualItemCost = Number(
                          selectedOrder.actual_item_cost ||
                          0
                        );

                        const estimatedItemCost = Number(
                          selectedOrder.estimated_budget ||
                          parsedCustom?.cost ||
                          0
                        );

                        if (actualItemCost > 0) {
                          return (
                            <View
                              style={
                                styles.breakdownRow
                              }
                            >
                              <Text
                                style={
                                  styles.breakdownLabel
                                }
                              >
                                Actual Item
                                Cost
                              </Text>

                              <Text
                                style={[
                                  styles.breakdownValue,
                                  {
                                    color: '#059669',
                                  },
                                ]}
                              >
                                ₱
                                {actualItemCost.toFixed(2)}
                              </Text>
                            </View>
                          );
                        }

                        if (
                          selectedOrder.order_type === 'custom' &&
                          parsedCustom?.type === 'Item Request' &&
                          estimatedItemCost > 0
                        ) {
                          return (
                            <View
                              style={
                                styles.breakdownRow
                              }
                            >
                              <Text
                                style={
                                  styles.breakdownLabel
                                }
                              >
                                Est. Item
                                Cost
                              </Text>

                              <Text
                                style={
                                  styles.breakdownValue
                                }
                              >
                                ₱
                                {estimatedItemCost.toFixed(2)}
                              </Text>
                            </View>
                          );
                        }

                        return null;
                      })()}

                      <View
                        style={
                          styles.breakdownRow
                        }
                      >
                        <Text
                          style={
                            styles.breakdownLabel
                          }
                        >
                          Delivery
                          Fee
                        </Text>

                        <Text
                          style={
                            styles.breakdownValue
                          }
                        >
                          ₱
                          {paymentSummary.deliveryFee.toFixed(
                            2
                          )}
                        </Text>
                      </View>

                      {selectedOrder.refund_status && (
                        <>
                          <View
                            style={
                              styles.summaryDivider
                            }
                          />

                          <View
                            style={
                              styles.breakdownRow
                            }
                          >
                            <Text
                              style={
                                styles.breakdownLabel
                              }
                            >
                              Refund
                              Status
                            </Text>

                            <Text
                              style={[
                                styles.breakdownValue,
                                {
                                  color:
                                    selectedOrder.refund_status ===
                                    'approved'
                                      ? '#059669'
                                      : '#D97706',
                                },
                              ]}
                            >
                              {selectedOrder.refund_status ===
                              'approved'
                                ? 'Refunded to Account'
                                : 'Pending Admin Approval'}
                            </Text>
                          </View>
                        </>
                      )}

                      <View
                        style={
                          styles.summaryDivider
                        }
                      />

                      <View
                        style={
                          styles.summaryRow
                        }
                      >
                        <Text
                          style={
                            styles.summaryLabel
                          }
                        >
                          Total
                          Amount
                        </Text>

                        <Text
                          style={
                            styles.summaryValue
                          }
                        >
                          ₱
                          {paymentSummary.total.toFixed(
                            2
                          )}
                        </Text>
                      </View>

                      {normalizedStatus === 'cancelled' &&
                        selectedOrder.evidence_url && (
                          <View style={{ marginTop: 16 }}>
                            <Text
                              style={[
                                styles.breakdownLabel,
                                { marginBottom: 8 },
                              ]}
                            >
                              Cancellation Evidence
                            </Text>

                            <TouchableOpacity
                              onPress={() =>
                                setEvidenceModalVisible(true)
                              }
                              activeOpacity={0.85}
                              style={{
                                borderWidth: 1,
                                borderColor: '#E2E8F0',
                                borderRadius: 12,
                                padding: 8,
                                backgroundColor: '#F8FAFC',
                                flexDirection: 'row',
                                alignItems: 'center',
                              }}
                            >
                              <Image
                                source={{
                                  uri: selectedOrder.evidence_url,
                                }}
                                style={{
                                  width: 58,
                                  height: 58,
                                  borderRadius: 8,
                                  backgroundColor: '#E2E8F0',
                                }}
                                resizeMode="cover"
                              />

                              <View
                                style={{
                                  flex: 1,
                                  marginLeft: 10,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 13,
                                    fontWeight: '700',
                                    color: '#1E293B',
                                  }}
                                >
                                  Cancellation Evidence
                                </Text>

                                <Text
                                  style={{
                                    fontSize: 11,
                                    color: '#64748B',
                                    marginTop: 2,
                                  }}
                                >
                                  Tap the image to view full size
                                </Text>
                              </View>

                              <Ionicons
                                name="expand-outline"
                                size={19}
                                color="#64748B"
                                style={{ marginRight: 4 }}
                              />
                            </TouchableOpacity>
                          </View>
                        )}

                      {selectedOrder.receipt_url && (
                        <View style={{ marginTop: 16 }}>
                          <Text
                            style={[
                              styles.breakdownLabel,
                              { marginBottom: 8 },
                            ]}
                          >
                            Proof of Purchase
                          </Text>

                          <TouchableOpacity
                            onPress={() =>
                              setProofPurchaseModalVisible(true)
                            }
                            activeOpacity={0.85}
                            style={{
                              borderWidth: 1,
                              borderColor: '#E2E8F0',
                              borderRadius: 12,
                              padding: 8,
                              backgroundColor: '#F8FAFC',
                              flexDirection: 'row',
                              alignItems: 'center',
                            }}
                          >
                            <Image
                              source={{
                                uri: selectedOrder.receipt_url,
                              }}
                              style={{
                                width: 58,
                                height: 58,
                                borderRadius: 8,
                                backgroundColor: '#E2E8F0',
                              }}
                              resizeMode="cover"
                            />

                            <View
                              style={{
                                flex: 1,
                                marginLeft: 10,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight: '700',
                                  color: '#1E293B',
                                }}
                              >
                                Proof of Purchase
                              </Text>

                              <Text
                                style={{
                                  fontSize: 11,
                                  color: '#64748B',
                                  marginTop: 2,
                                }}
                              >
                                Tap the image to view full size
                              </Text>
                            </View>

                            <Ionicons
                              name="expand-outline"
                              size={19}
                              color="#64748B"
                              style={{ marginRight: 4 }}
                            />
                          </TouchableOpacity>
                        </View>
                      )}

                    </View>
                  </ScrollView>

                  {/* MODAL FOOTER */}

                  <View
                    style={
                      styles.modernModalFooter
                    }
                  >
                    {canTrackOrder && (
                     <TouchableOpacity
                        style={styles.modernTrackBtn}
                        onPress={() => {
                          const orderToTrack = selectedOrder;
                          setSelectedOrder(null);
                          
                          const parentNav = navigation.getParent?.();
                          if (parentNav) {
                            parentNav.navigate('OrderTracking', { deliveryId: orderToTrack.id });
                          } else {
                            navigation.navigate('OrderTracking', { deliveryId: orderToTrack.id });
                          }
                        }}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="navigate-circle-outline" size={19} color="#FFFFFF" />
                        <Text style={styles.trackBtnText}>Track Order</Text>
                      </TouchableOpacity>
                    )}

                    {canBuyAgainSelected && (
                      <TouchableOpacity
                        style={
                          styles.buyAgainModalBtn
                        }
                        onPress={() =>
                          handleBuyAgain(
                            selectedOrder
                          )
                        }
                        activeOpacity={
                          0.85
                        }
                      >
                        <Ionicons
                          name="refresh-outline"
                          size={17}
                          color="#FFFFFF"
                        />

                        <Text
                          style={
                            styles.buyAgainModalText
                          }
                        >
                          Buy Again
                        </Text>
                      </TouchableOpacity>
                    )}

                    {canCancel && (
                      <TouchableOpacity
                        style={
                          styles.modernCancelBtn
                        }
                        onPress={() => {
                          const orderToCancelRef =
                            selectedOrder;

                          setSelectedOrder(
                            null
                          );

                          setOrderToCancel(
                            orderToCancelRef
                          );

                          setModalAction(
                            'cancel'
                          );

                          setCancelModalVisible(
                            true
                          );
                        }}
                        activeOpacity={
                          0.85
                        }
                      >
                        <Ionicons
                          name="close-circle-outline"
                          size={17}
                          color="#DC2626"
                        />

                        <Text
                          style={
                            styles.cancelBtnText
                          }
                        >
                          Cancel Order
                        </Text>
                      </TouchableOpacity>
                    )}

                    {canClaimRefund && (
                      <TouchableOpacity
                        style={
                          styles.modernTrackBtn
                        }
                        onPress={() => {
                          const orderToCancelRef =
                            selectedOrder;

                          setSelectedOrder(
                            null
                          );

                          setOrderToCancel(
                            orderToCancelRef
                          );

                          setModalAction(
                            'claim'
                          );

                          setCancelModalVisible(
                            true
                          );
                        }}
                        activeOpacity={
                          0.85
                        }
                      >
                        <Ionicons
                          name="wallet-outline"
                          size={17}
                          color="#FFFFFF"
                        />

                        <Text
                          style={
                            styles.trackBtnText
                          }
                        >
                          Claim Refund
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={evidenceModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setEvidenceModalVisible(false)
        }
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.92)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() =>
              setEvidenceModalVisible(false)
            }
            style={{
              position: 'absolute',
              top: Platform.OS === 'ios' ? 54 : 24,
              right: 20,
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: 'rgba(255,255,255,0.16)',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <Ionicons
              name="close"
              size={25}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          {selectedOrder?.evidence_url && (
            <Image
              source={{
                uri: selectedOrder.evidence_url,
              }}
              style={{
                width: '92%',
                height: '75%',
              }}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      <Modal
        visible={proofPurchaseModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setProofPurchaseModalVisible(false)
        }
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.92)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() =>
              setProofPurchaseModalVisible(false)
            }
            style={{
              position: 'absolute',
              top: Platform.OS === 'ios' ? 54 : 24,
              right: 20,
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: 'rgba(255,255,255,0.16)',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <Ionicons
              name="close"
              size={25}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          {selectedOrder?.receipt_url && (
            <Image
              source={{
                uri: selectedOrder.receipt_url,
              }}
              style={{
                width: '92%',
                height: '75%',
              }}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      <Modal
        visible={
          cancelModalVisible
        }
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCancelModalVisible(
            false
          );

          setOrderToCancel(
            null
          );

          setRefundName('');

          setRefundNumber('');

          setRefundMethod(
            'GCash'
          );
        }}
      >
        <View
          style={
            styles.cancelModalOverlay
          }
        >
          <View
            style={
              styles.cancelModalCard
            }
          >
            <View
              style={[
                styles.cancelIconCircle,
                modalAction ===
                  'claim' && {
                  backgroundColor:
                    '#ECFDF5',
                  borderColor:
                    '#A7F3D0',
                },
              ]}
            >
              <Ionicons
                name={
                  modalAction ===
                  'claim'
                    ? 'wallet-outline'
                    : 'alert-circle-outline'
                }
                size={30}
                color={
                  modalAction ===
                  'claim'
                    ? '#059669'
                    : '#DC2626'
                }
              />
            </View>

            <Text
              style={
                styles.cancelModalTitle
              }
            >
              {modalAction ===
              'claim'
                ? 'Claim Your Refund'
                : 'Cancel Order?'}
            </Text>

            <Text
              style={
                styles.cancelModalSub
              }
            >
              {modalAction ===
              'claim'
                ? 'Your order was cancelled by the system. Please provide your exact details so we can transfer your money back.'
                : 'Are you sure you want to cancel this order? This action cannot be undone once processed.'}
            </Text>

            {orderToCancel &&
              getPaymentMethodLabel(
                orderToCancel
              ).includes(
                'Online'
              ) && (
                <View
                  style={{
                    width: '100%',
                    marginBottom: 20,
                  }}
                >
                  <Text
                    style={
                      styles.inputLabel
                    }
                  >
                    Select Refund
                    Method
                  </Text>

                  <View
                    style={
                      styles.platformRow
                    }
                  >
                    <TouchableOpacity
                      style={[
                        styles.platformBtn,
                        refundMethod ===
                          'GCash' &&
                          styles.platformBtnActive,
                      ]}
                      onPress={() =>
                        setRefundMethod(
                          'GCash'
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.platformTxt,
                          refundMethod ===
                            'GCash' &&
                            styles.platformTxtActive,
                        ]}
                      >
                        GCash
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.platformBtn,
                        refundMethod ===
                          'Maya' &&
                          styles.platformBtnActive,
                      ]}
                      onPress={() =>
                        setRefundMethod(
                          'Maya'
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.platformTxt,
                          refundMethod ===
                            'Maya' &&
                            styles.platformTxtActive,
                        ]}
                      >
                        Maya
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text
                    style={
                      styles.inputLabel
                    }
                  >
                    Account Name
                  </Text>

                  <TextInput
                    style={
                      styles.refundInput
                    }
                    placeholder="e.g. Juan Dela Cruz"
                    placeholderTextColor="#9CA3AF"
                    value={
                      refundName
                    }
                    onChangeText={
                      setRefundName
                    }
                  />

                  <Text
                    style={
                      styles.inputLabel
                    }
                  >
                    Account Number
                  </Text>

                  <TextInput
                    style={
                      styles.refundInput
                    }
                    placeholder="e.g. 09123456789"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    value={
                      refundNumber
                    }
                    onChangeText={
                      setRefundNumber
                    }
                  />
                </View>
              )}

            <View
              style={
                styles.cancelModalBtnRow
              }
            >
              <TouchableOpacity
                style={
                  styles.cancelKeepBtn
                }
                activeOpacity={
                  0.8
                }
                onPress={() => {
                  setCancelModalVisible(
                    false
                  );

                  setOrderToCancel(
                    null
                  );

                  setRefundName('');

                  setRefundNumber('');

                  setRefundMethod(
                    'GCash'
                  );
                }}
              >
                <Text
                  style={
                    styles.cancelKeepBtnText
                  }
                >
                  {modalAction ===
                  'claim'
                    ? 'Close'
                    : 'Keep Order'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.cancelConfirmBtn,
                  modalAction ===
                    'claim' && {
                    backgroundColor:
                      '#059669',
                    shadowColor:
                      '#059669',
                  },
                  cancelling && {
                    opacity: 0.7,
                  },
                ]}
                activeOpacity={
                  0.8
                }
                onPress={
                  processCancelOrRefund
                }
                disabled={
                  cancelling
                }
              >
                {cancelling ? (
                  <ActivityIndicator
                    size="small"
                    color="#FFFFFF"
                  />
                ) : (
                  <Text
                    style={
                      styles.cancelConfirmBtnText
                    }
                  >
                    {modalAction ===
                    'claim'
                      ? 'Submit Claim'
                      : 'Yes, Cancel'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#F4F7F6',
    },

    headerAnimatedWrapper: {
      width: '100%',
    },

    screenHeader: {
      paddingHorizontal: 20,
      paddingTop:
        Platform.OS ===
        'android'
          ? (StatusBar.currentHeight ||
              20) + 8
          : 14,
      paddingBottom: 19,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      elevation: 6,
      shadowColor:
        '#047857',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.17,
      shadowRadius: 9,
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
      overflow: 'hidden',
    },

    headerGlow: {
      position: 'absolute',
      width: 190,
      height: 190,
      borderRadius: 95,
      backgroundColor:
        'rgba(255,255,255,0.07)',
      right: -70,
      top: -92,
    },

    titleContainer: {
      flex: 1,
      marginRight: 12,
    },

    headerLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 5,
    },

    headerLabelDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor:
        '#A7F3D0',
      marginRight: 6,
    },

    headerLabelText: {
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.4,
      color:
        '#A7F3D0',
    },

    screenTitle: {
      fontSize: 24,
      lineHeight: 29,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing:
        -0.6,
    },

    screenSub: {
      fontSize: 12,
      color:
        '#D1FAE5',
      fontWeight: '500',
      marginTop: 3,
    },

    homeActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor:
        '#FFFFFF',
      minHeight: 40,
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        'rgba(255,255,255,0.22)',
      elevation: 3,
      shadowColor:
        '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.12,
      shadowRadius: 5,
    },

    homeActionBtnText: {
      color: '#059669',
      fontWeight: '900',
      fontSize: 12,
      marginLeft: 5,
    },

    filterTabsContainer: {
      backgroundColor:
        '#FFFFFF',
      paddingTop: 11,
      paddingBottom: 11,
      borderBottomWidth: 1,
      borderBottomColor:
        '#E8EFEC',
      shadowColor:
        '#0F172A',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.035,
      shadowRadius: 4,
      elevation: 1,
    },

    filterScroll: {
      paddingHorizontal: 16,
      gap: 8,
    },

    filterChip: {
      minWidth: 74,
      minHeight: 36,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 11,
      backgroundColor:
        '#F7F9F8',
      borderWidth: 1,
      borderColor:
        '#E1E7E4',
      alignItems:
        'center',
      justifyContent:
        'center',
      flexDirection: 'row',
    },

    activeFilterChip: {
      backgroundColor:
        '#059669',
      borderColor:
        '#059669',
      shadowColor:
        '#059669',
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity:
        0.16,
      shadowRadius: 5,
      elevation: 2,
    },

    filterDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor:
        '#FFFFFF',
      marginRight: 6,
    },

    filterChipText: {
      fontSize: 12,
      fontWeight: '800',
      color:
        '#64748B',
    },

    activeFilterChipText: {
      color: '#FFFFFF',
    },

    centerContainer: {
      flex: 1,
      justifyContent:
        'center',
      alignItems:
        'center',
    },

    loadingCard: {
      alignItems:
        'center',
      backgroundColor:
        '#FFFFFF',
      paddingHorizontal: 30,
      paddingVertical: 25,
      borderRadius: 22,
      borderWidth: 1,
      borderColor:
        '#E1E8E4',
      shadowColor:
        '#0F172A',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.06,
      shadowRadius: 9,
      elevation: 2,
    },

    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color:
        '#1F2937',
      fontWeight: '800',
    },

    loadingSubText: {
      marginTop: 3,
      fontSize: 11,
      color:
        '#94A3B8',
    },

    listContainer: {
      paddingHorizontal: 16,
      paddingTop: 15,
      paddingBottom: 110,
    },

    card: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 18,
      padding: 15,
      marginBottom: 14,
      borderWidth: 1,
      borderColor:
        '#E1E8E4',
      elevation: 2,
      shadowColor:
        '#0F172A',
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity:
        0.065,
      shadowRadius: 8,
    },

    orderPreviewRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 12,
    },

    orderItemImageWrap: {
      width: 72,
      height: 72,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: '#ECFDF5',
      borderWidth: 1,
      borderColor: '#D1FAE5',
      marginRight: 12,
      position: 'relative',
      flexShrink: 0,
    },

    orderItemImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },

    orderItemImageFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ECFDF5',
    },

    orderItemCountBadge: {
      position: 'absolute',
      right: 5,
      bottom: 5,
      minWidth: 23,
      height: 20,
      paddingHorizontal: 5,
      borderRadius: 8,
      backgroundColor:
        'rgba(15,23,42,0.78)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    orderItemCountText: {
      color: '#FFFFFF',
      fontSize: 8.5,
      fontWeight: '900',
    },

    orderPreviewContent: {
      flex: 1,
      minWidth: 0,
    },

    orderItemPreviewName: {
      marginTop: 3,
      fontSize: 10.5,
      lineHeight: 14,
      color: '#64748B',
      fontWeight: '600',
    },

    cardTopRow: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      marginBottom: 11,
    },

    typeBadge: {
      flexDirection: 'row',
      alignItems:
        'center',
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 8,
    },

    typeStore: {
      backgroundColor:
        '#E0F2FE',
    },

    typeCustom: {
      backgroundColor:
        '#F3E8FF',
    },

    typeBadgeText: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.2,
    },

    orderDateText: {
      fontSize: 10,
      color:
        '#94A3B8',
      fontWeight: '600',
    },

    cardHeader: {
      flexDirection: 'row',
      alignItems:
        'center',
      marginBottom: 13,
    },

    titleAccent: {
      width: 4,
      height: 24,
      borderRadius: 2,
      backgroundColor:
        '#059669',
      marginRight: 9,
    },

    itemTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '900',
      color:
        '#111827',
      letterSpacing:
        -0.2,
    },

    routeContainer: {
      marginVertical: 2,
      backgroundColor:
        '#F8FBF9',
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        '#E7EEEA',
    },

    addressRow: {
      flexDirection: 'row',
      alignItems:
        'center',
    },

    addressContent: {
      flex: 1,
      marginLeft: 9,
    },

    addressMiniLabel: {
      fontSize: 8.5,
      fontWeight: '900',
      color:
        '#94A3B8',
      letterSpacing: 0.7,
      marginBottom: 2,
    },

    pickupCircle: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor:
        '#059669',
      marginHorizontal: 2,
    },

    dropoffIcon: {
      width: 15,
      height: 15,
      borderRadius: 7.5,
      backgroundColor:
        '#FEF2F2',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    routeConnectorLine: {
      width: 2,
      height: 10,
      backgroundColor:
        '#D1D5DB',
      marginLeft: 6,
      marginVertical: 3,
    },

    addressText: {
      fontSize: 12.5,
      color:
        '#374151',
      fontWeight: '600',
      lineHeight: 17,
    },

    cardFooter: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      paddingTop: 12,
      marginTop: 12,
      borderTopWidth: 1,
      borderTopColor:
        '#EDF2EF',
    },

    badgeContainer: {
      flexDirection: 'row',
      alignItems:
        'center',
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 8,
    },

    badgeText: {
      fontSize: 10.5,
      fontWeight: '800',
      flexShrink: 1,
    },

    amountContainer: {
      alignItems:
        'flex-end',
      marginLeft: 8,
    },

    feeLabel: {
      fontSize: 8.5,
      color:
        '#94A3B8',
      fontWeight: '900',
      letterSpacing: 0.7,
    },

    feeText: {
      fontSize: 16,
      fontWeight: '900',
      color:
        '#059669',
      marginTop: 1,
    },

    estCostMiniText: {
      fontSize: 9.5,
      color:
        '#D97706',
      fontWeight: '800',
      marginTop: 2,
    },

    paymentMethodMiniBadge: {
      flexDirection: 'row',
      alignItems:
        'center',
      marginTop: 4,
      backgroundColor:
        '#F1F5F3',
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 5,
    },

    paymentMethodMiniText: {
      fontSize: 8.5,
      color:
        '#64748B',
      marginLeft: 3,
      fontWeight: '800',
    },

    buyAgainButton: {
      marginTop: 12,
      minHeight: 54,
      borderRadius: 14,
      backgroundColor:
        '#F0FDF4',
      borderWidth: 1,
      borderColor:
        '#A7F3D0',
      paddingHorizontal: 12,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
    },

    buyAgainLeft: {
      flexDirection:
        'row',
      alignItems:
        'center',
      flex: 1,
    },

    buyAgainIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor:
        '#FFFFFF',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginRight: 9,
      borderWidth: 1,
      borderColor:
        '#D1FAE5',
    },

    buyAgainTitle: {
      fontSize: 12.5,
      fontWeight: '900',
      color:
        '#047857',
    },

    buyAgainSub: {
      fontSize: 9.5,
      color:
        '#64748B',
      fontWeight: '600',
      marginTop: 2,
    },

    buyAgainArrow: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor:
        '#FFFFFF',
      alignItems:
        'center',
      justifyContent:
        'center',
      borderWidth: 1,
      borderColor:
        '#D1FAE5',
    },

    emptyContainer: {
      alignItems:
        'center',
      paddingHorizontal: 30,
    },

    emptyIconBg: {
      width: 86,
      height: 86,
      borderRadius: 27,
      backgroundColor:
        '#ECFDF5',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginBottom: 17,
      borderWidth: 1,
      borderColor:
        '#D1FAE5',
      shadowColor:
        '#059669',
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity: 0.08,
      shadowRadius: 7,
      elevation: 1,
    },

    emptyTitle: {
      fontSize: 20,
      fontWeight: '900',
      color:
        '#111827',
      marginBottom: 7,
    },

    emptySub: {
      fontSize: 13,
      color:
        '#64748B',
      textAlign:
        'center',
      lineHeight: 20,
      marginBottom: 21,
      fontWeight: '500',
    },

    emptyActionBtn: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#059669',
      paddingHorizontal: 20,
      paddingVertical: 12,
      minHeight: 44,
      borderRadius: 12,
      elevation: 3,
      shadowColor:
        '#059669',
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity: 0.16,
      shadowRadius: 5,
    },

    emptyActionText: {
      color: '#FFFFFF',
      fontWeight:
        '900',
      fontSize: 13,
      marginLeft: 7,
    },

    modalOverlay: {
      flex: 1,
      backgroundColor:
        'rgba(15, 23, 42, 0.62)',
      justifyContent:
        'flex-end',
    },

    modernModalCard: {
      backgroundColor:
        '#F8FAFC',
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 17,
      paddingTop: 15,
      paddingBottom: 22,
      maxHeight: '92%',
      shadowColor:
        '#000',
      shadowOffset: {
        width: 0,
        height: -5,
      },
      shadowOpacity: 0.2,
      shadowRadius: 15,
      elevation: 12,
    },

    modalInnerContainer: {
      flexShrink: 1,
      flexDirection:
        'column',
    },

    modernModalHeader: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      marginBottom: 14,
      paddingBottom: 13,
      borderBottomWidth: 1,
      borderBottomColor:
        '#E8EDF0',
    },

    modalTitleArea: {
      flexDirection:
        'row',
      flex: 1,
      alignItems:
        'center',
      marginRight: 12,
    },

    modalTitleAccent: {
      width: 4,
      height: 34,
      backgroundColor:
        '#059669',
      borderRadius: 2,
      marginRight: 10,
    },

    modernModalOrderTitle: {
      fontSize: 19,
      fontWeight:
        '900',
      color:
        '#111827',
      letterSpacing:
        -0.4,
    },

    modernModalSubtitle: {
      fontSize: 10.5,
      color:
        '#64748B',
      marginTop: 3,
      fontWeight: '700',
    },

    modernCloseBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor:
        '#FFFFFF',
      borderWidth: 1,
      borderColor:
        '#E2E8F0',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    modalScrollView: {
      flexGrow: 0,
      flexShrink: 1,
    },

    modalBadgesRow: {
      flexDirection:
        'row',
      gap: 8,
      marginBottom: 14,
      alignItems:
        'center',
    },

    modalTypeBadge: {
      flexDirection:
        'row',
      alignItems:
        'center',
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 9,
    },

    modernDetailCard: {
      marginBottom: 11,
      backgroundColor:
        '#FFFFFF',
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor:
        '#E2EAE5',
      shadowColor:
        '#0F172A',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.025,
      shadowRadius: 5,
      elevation: 1,
    },

    modernSectionHeading: {
      fontSize: 11,
      fontWeight: '900',
      color:
        '#334155',
      textTransform:
        'uppercase',
      marginBottom: 10,
      letterSpacing: 0.7,
    },

    sectionHeaderRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    sectionSubText: {
      fontSize: 9.5,
      color:
        '#94A3B8',
      fontWeight: '600',
      marginTop: -7,
      marginBottom: 4,
    },

    modernProgressSection: {
      marginBottom: 11,
      backgroundColor:
        '#FFFFFF',
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor:
        '#E2EAE5',
    },

    progressStatusPill: {
      flexDirection:
        'row',
      alignItems:
        'center',
      backgroundColor:
        '#ECFDF5',
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: 8,
    },

    progressStatusDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor:
        '#059669',
      marginRight: 4,
    },

    progressStatusText: {
      fontSize: 8,
      fontWeight:
        '900',
      color:
        '#059669',
      letterSpacing: 0.7,
    },

    progressBarContainer: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'flex-start',
      position:
        'relative',
      marginTop: 12,
      paddingHorizontal: 7,
    },

    progressLineBackground: {
      position: 'absolute',
      top: 15,
      left: 24,
      right: 24,
      height: 3,
      backgroundColor:
        '#E2E8F0',
      zIndex: 1,
    },

    progressLineActive: {
      position: 'absolute',
      top: 15,
      left: 24,
      height: 3,
      backgroundColor:
        '#059669',
      zIndex: 2,
    },

    progressStepWrapper: {
      alignItems:
        'center',
      zIndex: 3,
      width: 58,
    },

    progressDot: {
      width: 31,
      height: 31,
      borderRadius: 16,
      backgroundColor:
        '#FFFFFF',
      borderWidth: 2,
      borderColor:
        '#CBD5E1',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginBottom: 6,
      shadowColor:
        '#000',
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 2,
    },

    activeDot: {
      backgroundColor:
        '#059669',
      borderColor:
        '#059669',
    },

    progressLabel: {
      fontSize: 8.5,
      fontWeight: '700',
      color:
        '#94A3B8',
      textAlign:
        'center',
      lineHeight: 12,
    },

    activeLabel: {
      color:
        '#059669',
      fontWeight:
        '900',
    },

    modernQrCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 16,
      padding: 15,
      marginBottom: 11,
      borderWidth: 1,
      borderColor:
        '#DDE8E3',
      alignItems:
        'center',
      shadowColor:
        '#0F172A',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.03,
      shadowRadius: 5,
      elevation: 1,
    },

    qrHeader: {
      width: '100%',
      flexDirection:
        'row',
      alignItems:
        'center',
      marginBottom: 10,
    },

    qrIconBox: {
      width: 38,
      height: 38,
      borderRadius: 11,
      backgroundColor:
        '#ECFDF5',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginRight: 10,
    },

    modernQrTitle: {
      fontSize: 13,
      fontWeight:
        '900',
      color:
        '#111827',
    },

    qrSmallText: {
      fontSize: 9.5,
      color:
        '#94A3B8',
      fontWeight: '600',
      marginTop: 2,
    },

    modernQrInstructions: {
      fontSize: 11.5,
      color:
        '#64748B',
      textAlign:
        'center',
      marginBottom: 14,
      paddingHorizontal: 8,
      fontWeight: '500',
      lineHeight: 17,
    },

    modernQrWrapper: {
      padding: 13,
      backgroundColor:
        '#FFFFFF',
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        '#E2E8F0',
      shadowColor:
        '#000',
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity: 0.07,
      shadowRadius: 7,
      elevation: 3,
    },

    infoRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      marginBottom: 7,
    },

    infoIconBox: {
      width: 29,
      height: 29,
      borderRadius: 9,
      backgroundColor:
        '#ECFDF5',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    infoText: {
      fontSize: 12.5,
      color:
        '#374151',
      marginLeft: 9,
      flex: 1,
      fontWeight: '600',
      lineHeight: 18,
    },

    itemCountBadge: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      borderRadius: 11,
      backgroundColor:
        '#ECFDF5',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    itemCountText: {
      fontSize: 9,
      color:
        '#059669',
      fontWeight:
        '900',
    },

    modalItemRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      marginBottom: 9,
      paddingBottom: 9,
      borderBottomWidth: 1,
      borderBottomColor:
        '#F1F5F9',
    },

    modalItemQtyBox: {
      minWidth: 32,
      height: 27,
      paddingHorizontal: 5,
      borderRadius: 8,
      backgroundColor:
        '#ECFDF5',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginRight: 9,
    },

    modalItemQty: {
      fontSize: 10,
      fontWeight: '900',
      color:
        '#059669',
    },

    modalItemName: {
      fontSize: 12.5,
      fontWeight: '700',
      color:
        '#1E293B',
      flex: 1,
    },

    modalItemPrice: {
      fontSize: 12.5,
      fontWeight: '900',
      color:
        '#0F172A',
      marginLeft: 8,
    },

    addressBox: {
      gap: 5,
    },

    routeIconBox: {
      width: 29,
      height: 29,
      borderRadius: 9,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    routeTextArea: {
      marginLeft: 9,
      flex: 1,
    },

    addressLabel: {
      fontSize: 8.5,
      color:
        '#94A3B8',
      fontWeight: '900',
      textTransform:
        'uppercase',
      letterSpacing: 0.6,
    },

    addressSub: {
      fontSize: 12.5,
      fontWeight: '700',
      color:
        '#0F172A',
      marginTop: 2,
      lineHeight: 18,
    },

    modalRouteLine: {
      width: 2,
      height: 15,
      backgroundColor:
        '#CBD5E1',
      marginLeft: 14,
      marginVertical: 3,
    },

    breakdownRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      marginBottom: 9,
      gap: 12,
    },

    breakdownLabel: {
      fontSize: 12.5,
      color:
        '#64748B',
      fontWeight: '600',
      flex: 1,
    },

    breakdownValue: {
      fontSize: 12.5,
      color:
        '#0F172A',
      fontWeight: '800',
      textAlign:
        'right',
    },

    breakdownValueGreen: {
      fontSize: 11.5,
      color:
        '#059669',
      fontWeight: '800',
      textAlign:
        'right',
      marginLeft: 4,
    },

    paymentMethodLarge: {
      flexDirection:
        'row',
      alignItems:
        'center',
      flexShrink: 1,
    },

    summaryDivider: {
      height: 1,
      backgroundColor:
        '#E2E8F0',
      marginVertical: 10,
    },

    summaryRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    summaryLabel: {
      fontSize: 14,
      fontWeight: '900',
      color:
        '#0F172A',
    },

    summaryValue: {
      fontSize: 19,
      fontWeight: '900',
      color:
        '#059669',
    },

    customDetailRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'flex-start',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor:
        '#E2E8F0',
      gap: 12,
    },

    customDetailBlock: {
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor:
        '#E2E8F0',
    },

    customDetailLabel: {
      fontSize: 11.5,
      color:
        '#64748B',
      fontWeight: '800',
      flex: 1,
    },

    customDetailValue: {
      fontSize: 12,
      color:
        '#0F172A',
      fontWeight: '600',
      flex: 1.5,
      textAlign:
        'right',
      lineHeight: 17,
    },

    customBulletValue: {
      fontSize: 12,
      color:
        '#0F172A',
      fontWeight: '600',
      flex: 1,
      lineHeight: 17,
    },

    bulletRow: {
      flexDirection:
        'row',
      alignItems:
        'flex-start',
      marginTop: 5,
      paddingLeft: 4,
    },

    bulletDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor:
        '#059669',
      marginRight: 8,
      marginTop: 6,
    },

    modernModalFooter: {
      paddingTop: 13,
      gap: 9,
      flexShrink: 0,
      borderTopWidth: 1,
      borderTopColor:
        '#E3EAE6',
      marginTop: 8,
    },

    buyAgainModalBtn: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#059669',
      paddingVertical: 14,
      borderRadius: 14,
      shadowColor:
        '#059669',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.22,
      shadowRadius: 7,
      elevation: 4,
    },

    buyAgainModalText: {
      color: '#FFFFFF',
      fontWeight:
        '900',
      fontSize: 13.5,
      marginLeft: 7,
    },

    modernTrackBtn: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#059669',
      paddingVertical: 14,
      borderRadius: 14,
      shadowColor:
        '#059669',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.22,
      shadowRadius: 7,
      elevation: 4,
    },

    trackBtnText: {
      color: '#FFFFFF',
      fontWeight:
        '900',
      fontSize: 13.5,
      marginLeft: 7,
    },

    modernCancelBtn: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#FFF5F5',
      borderWidth: 1,
      borderColor:
        '#FECACA',
      paddingVertical: 13,
      borderRadius: 14,
    },

    cancelBtnText: {
      color:
        '#DC2626',
      fontWeight:
        '900',
      fontSize: 13.5,
      marginLeft: 7,
    },

    cancelModalOverlay: {
      flex: 1,
      backgroundColor:
        'rgba(15, 23, 42, 0.62)',
      justifyContent:
        'center',
      paddingHorizontal: 20,
    },

    cancelModalCard: {
      width: '100%',
      backgroundColor:
        '#FFFFFF',
      borderRadius: 22,
      padding: 22,
      alignItems:
        'center',
      shadowColor:
        '#000',
      shadowOffset: {
        width: 0,
        height: 10,
      },
      shadowOpacity: 0.25,
      shadowRadius: 15,
      elevation: 10,
    },

    cancelIconCircle: {
      width: 66,
      height: 66,
      borderRadius: 33,
      backgroundColor:
        '#FEF2F2',
      justifyContent:
        'center',
      alignItems:
        'center',
      marginBottom: 15,
      borderWidth: 1.5,
      borderColor:
        '#FECACA',
    },

    cancelModalTitle: {
      fontSize: 20,
      fontWeight:
        '900',
      color:
        '#111827',
      textAlign:
        'center',
      marginBottom: 8,
    },

    cancelModalSub: {
      fontSize: 12.5,
      color:
        '#64748B',
      textAlign:
        'center',
      lineHeight: 18,
      fontWeight:
        '500',
      marginBottom: 22,
      paddingHorizontal: 7,
    },

    inputLabel: {
      fontSize: 10,
      fontWeight:
        '900',
      color:
        '#4B5563',
      marginBottom: 7,
      textTransform:
        'uppercase',
      letterSpacing: 0.5,
    },

    refundInput: {
      backgroundColor:
        '#F8FAFC',
      borderRadius: 11,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 13,
      color:
        '#111827',
      marginBottom: 13,
      borderWidth: 1,
      borderColor:
        '#E2E8F0',
    },

    platformRow: {
      flexDirection:
        'row',
      gap: 9,
      marginBottom: 14,
    },

    platformBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor:
        '#F3F4F6',
      alignItems:
        'center',
      borderWidth: 1,
      borderColor:
        '#E5E7EB',
    },

    platformBtnActive: {
      backgroundColor:
        '#ECFDF5',
      borderColor:
        '#059669',
    },

    platformTxt: {
      fontSize: 12.5,
      fontWeight:
        '800',
      color:
        '#64748B',
    },

    platformTxtActive: {
      color:
        '#059669',
    },

    cancelModalBtnRow: {
      flexDirection:
        'row',
      gap: 9,
      width: '100%',
    },

    cancelKeepBtn: {
      flex: 1,
      backgroundColor:
        '#F3F4F6',
      paddingVertical: 13,
      borderRadius: 13,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    cancelKeepBtnText: {
      color:
        '#4B5563',
      fontWeight:
        '800',
      fontSize: 13,
    },

    cancelConfirmBtn: {
      flex: 1,
      backgroundColor:
        '#DC2626',
      paddingVertical: 13,
      borderRadius: 13,
      alignItems:
        'center',
      justifyContent:
        'center',
      shadowColor:
        '#DC2626',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.22,
      shadowRadius: 6,
      elevation: 3,
    },

    cancelConfirmBtnText: {
      color: '#FFFFFF',
      fontWeight:
        '900',
      fontSize: 13,
    },

    // MODERN POPUP REPLACING RAW ALERTS
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