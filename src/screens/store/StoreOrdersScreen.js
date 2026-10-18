import React, { useEffect, useState, useCallback, useMemo, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';

const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  const values = [Number(lat1), Number(lon1), Number(lat2), Number(lon2)];

  if (!values.every(Number.isFinite)) return 0;

  const [safeLat1, safeLon1, safeLat2, safeLon2] = values;

  const R = 6371;
  const dLat = (safeLat2 - safeLat1) * (Math.PI / 180);
  const dLon = (safeLon2 - safeLon1) * (Math.PI / 180);

  let a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(safeLat1 * (Math.PI / 180)) *
      Math.cos(safeLat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  a = Math.min(1, Math.max(0, a));

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

const formatCurrency = (amount) => {
  const numericValue = Number(amount) || 0;
  return `₱${numericValue.toFixed(2)}`;
};

const formatTimeAgo = (dateString) => {
  if (!dateString) return '';

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diffInMinutes = Math.floor((now - date) / 60000);

  if (diffInMinutes < 1) return 'Just now';

  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);

  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }

  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
};

const parseOrderItems = (itemsData) => {
  if (!itemsData) return [];

  if (Array.isArray(itemsData)) {
    return itemsData;
  }

  if (typeof itemsData === 'string') {
    try {
      const parsed = JSON.parse(itemsData);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  return [];
};

const isPenaltyItem = (item) => {
  if (!item) return false;

  return Boolean(
    item.is_penalty ||
      String(item.name || '')
        .toLowerCase()
        .includes('penalty')
  );
};

const getCleanItems = (order) => {
  return parseOrderItems(order?.items).filter(
    (item) => !isPenaltyItem(item)
  );
};

const getCustomerName = (order) => {
  return (
    order?.customer?.full_name ||
    order?.profiles?.full_name ||
    order?.customer_name ||
    'Customer'
  );
};

const getCustomerPhone = (order) => {
  return (
    order?.customer?.phone_number ||
    order?.customer?.phone ||
    order?.profiles?.phone_number ||
    order?.profiles?.phone ||
    order?.customer_phone ||
    order?.phone_number ||
    null
  );
};

const getCancellationDetails = (order) => {
  if (!order) {
    return {
      label: 'Cancelled',
      reason: null,
    };
  }

  let who = 'Customer';

  if (order.cancelled_by) {
    const raw = String(order.cancelled_by);
    who = raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  const reason =
    order.cancellation_reason ||
    order.cancel_reason ||
    order.notes ||
    null;

  const reasonString = String(reason || '').toLowerCase();

  if (
    reasonString.includes('unavailable') ||
    reasonString.includes('prank') ||
    reasonString.includes('refuse') ||
    reasonString.includes('no-show') ||
    reasonString.includes('no show')
  ) {
    return {
      who,
      label: 'Cancelled (Issue / No-Show)',
      reason,
    };
  }

  return {
    who,
    label: `Cancelled by ${who}`,
    reason,
  };
};

const getPaymentMethodLabel = (order) => {
  if (!order) return 'Cash on Delivery';

  const method = String(order.payment_method || '').toLowerCase();

  if (
    method === 'online' ||
    method === 'gcash' ||
    method === 'card' ||
    method === 'online_payment' ||
    method === 'paid_online'
  ) {
    return 'Paid Online (GCash/Card)';
  }

  return 'Cash on Delivery';
};

const getOrderItemCount = (order) => {
  return getCleanItems(order).reduce(
    (total, item) =>
      total + Number(item.quantity || item.qty || 1),
    0
  );
};

const getShortOrderId = (id) => {
  return (
    String(id || '')
      .substring(0, 5)
      .toUpperCase() || '-----'
  );
};

const getStatusMeta = (status) => {
  switch (status) {
    case 'pending':
    case 'paid':
      return {
        label: 'New Order',
        shortLabel: 'New',
        bg: '#FFF7ED',
        border: '#FED7AA',
        text: '#C2410C',
        accent: '#F97316',
        icon: 'notifications-outline',
      };

    case 'accepted':
      return {
        label: 'Waiting for Driver',
        shortLabel: 'Waiting',
        bg: '#EFF6FF',
        border: '#BFDBFE',
        text: '#2563EB',
        accent: '#3B82F6',
        icon: 'time-outline',
      };

    case 'preparing':
      return {
        label: 'Preparing',
        shortLabel: 'Preparing',
        bg: '#FFFBEB',
        border: '#FDE68A',
        text: '#B45309',
        accent: '#F59E0B',
        icon: 'restaurant-outline',
      };

    case 'ready_for_pickup':
      return {
        label: 'Ready for Pickup',
        shortLabel: 'Ready',
        bg: '#ECFDF5',
        border: '#A7F3D0',
        text: '#047857',
        accent: '#10B981',
        icon: 'checkmark-circle-outline',
      };

    case 'picked_up':
      return {
        label: 'Picked Up',
        shortLabel: 'Picked Up',
        bg: '#EFF6FF',
        border: '#BFDBFE',
        text: '#2563EB',
        accent: '#3B82F6',
        icon: 'cube-outline',
      };

    case 'in_transit':
      return {
        label: 'In Transit',
        shortLabel: 'In Transit',
        bg: '#EEF2FF',
        border: '#C7D2FE',
        text: '#4338CA',
        accent: '#6366F1',
        icon: 'navigate-outline',
      };

    case 'completed':
      return {
        label: 'Completed',
        shortLabel: 'Completed',
        bg: '#F3F4F6',
        border: '#E5E7EB',
        text: '#374151',
        accent: '#9CA3AF',
        icon: 'checkmark-done-outline',
      };

    case 'cancelled':
      return {
        label: 'Cancelled',
        shortLabel: 'Cancelled',
        bg: '#FEF2F2',
        border: '#FECACA',
        text: '#DC2626',
        accent: '#EF4444',
        icon: 'close-circle-outline',
      };

    default:
      return {
        label: status || 'Unknown',
        shortLabel: status || 'Unknown',
        bg: '#F3F4F6',
        border: '#E5E7EB',
        text: '#6B7280',
        accent: '#6B7280',
        icon: 'help-circle-outline',
      };
  }
};

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
        label: 'CONFIRMATION',
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

const StatusBadge = memo(({ status }) => {
  const badge = getStatusMeta(status);

  return (
    <View
      style={[
        styles.badgeContainer,
        {
          backgroundColor: badge.bg,
          borderColor: badge.border,
        },
      ]}
    >
      <Ionicons
        name={badge.icon}
        size={11}
        color={badge.text}
      />

      <Text
        style={[
          styles.badgeText,
          {
            color: badge.text,
          },
        ]}
        numberOfLines={1}
      >
        {badge.shortLabel}
      </Text>
    </View>
  );
});

const TABS = [
  {
    id: 'pending',
    label: 'New Orders',
    shortLabel: 'New Orders',
    icon: 'notifications-outline',
  },
  {
    id: 'accepted',
    label: 'Waiting for Driver',
    shortLabel: 'Waiting',
    icon: 'time-outline',
  },
  {
    id: 'preparing',
    label: 'Preparing',
    shortLabel: 'Preparing',
    icon: 'restaurant-outline',
  },
  {
    id: 'ready',
    label: 'Ready for Pickup',
    shortLabel: 'Ready',
    icon: 'checkmark-circle-outline',
  },
  {
    id: 'picked_up',
    label: 'In Transit',
    shortLabel: 'In Transit',
    icon: 'cube-outline',
  },
  {
    id: 'completed',
    label: 'Completed',
    shortLabel: 'Completed',
    icon: 'checkmark-done-outline',
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    shortLabel: 'Cancelled',
    icon: 'close-circle-outline',
  },
];

const STATUS_STEPS = [
  {
    id: 'accepted',
    label: 'Accepted',
  },
  {
    id: 'preparing',
    label: 'Preparing',
  },
  {
    id: 'ready_for_pickup',
    label: 'Ready',
  },
  {
    id: 'picked_up',
    label: 'Picked Up',
  },
  {
    id: 'in_transit',
    label: 'In Transit',
  },
  {
    id: 'completed',
    label: 'Completed',
  },
];

const getCurrentStepIndex = (status) => {
  switch (status) {
    case 'accepted':
      return 0;

    case 'preparing':
      return 1;

    case 'ready_for_pickup':
      return 2;

    case 'picked_up':
      return 3;

    case 'in_transit':
      return 4;

    case 'completed':
      return 5;

    default:
      return -1;
  }
};

export default function StoreOrdersScreen() {
  const { profile } = useAuth();

  const [store, setStore] = useState(null);
  const [orders, setOrders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [updatingId, setUpdatingId] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const selectedOrderRef = useRef(selectedOrder);

  useEffect(() => {
    selectedOrderRef.current = selectedOrder;
  }, [selectedOrder]);

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

  const loadStoreAndOrders = useCallback(async () => {
    try {
      if (!profile?.id) return;

      let storeData = null;

      const { data: storeByOwner } = await supabase
        .from('stores')
        .select('*')
        .eq('owner_id', profile.id)
        .maybeSingle();

      if (storeByOwner) {
        storeData = storeByOwner;
      } else {
        const { data: storeByUser } = await supabase
          .from('stores')
          .select('*')
          .or(
            `user_id.eq.${profile.id},vendor_id.eq.${profile.id}`
          )
          .maybeSingle();

        if (storeByUser) {
          storeData = storeByUser;
        }
      }

      setStore(
        storeData || {
          name: profile?.full_name || 'My Store',
        }
      );

      if (!storeData?.id) {
        setOrders([]);
        return;
      }

      let fetchedOrders = [];
      let ordersError = null;

      const primaryQuery = await supabase
        .from('orders')
        .select(
          '*, customer:profiles!customer_id(*)'
        )
        .eq('store_id', storeData.id)
        .order('created_at', {
          ascending: false,
        });

      if (primaryQuery.error) {
        const fallbackQuery = await supabase
          .from('orders')
          .select('*')
          .eq('store_id', storeData.id)
          .order('created_at', {
            ascending: false,
          });

        fetchedOrders = fallbackQuery.data || [];
        ordersError = fallbackQuery.error;
      } else {
        fetchedOrders = primaryQuery.data || [];
      }

      if (ordersError) {
        console.error(
          'Orders Load Error:',
          ordersError
        );
        setOrders([]);
        return;
      }

      const filtered = fetchedOrders.filter(
        (order) => order.status !== 'awaiting_payment'
      );

      const orderIds = filtered.map(
        (order) => order.id
      );

      let relatedRequests = [];

      if (orderIds.length > 0) {
        const { data: requests } = await supabase
          .from('delivery_requests')
          .select('order_id, driver_id, status')
          .in('order_id', orderIds);

        if (requests) {
          relatedRequests = requests;
        }
      }

      const resolvedOrders = filtered.map(
        (order) => {
          const activeRequest = relatedRequests.find(
            (item) => item.order_id === order.id && item.driver_id
          );

          return {
            ...order,
            resolved_driver_id:
              order.driver_id ||
              activeRequest?.driver_id ||
              null,
          };
        }
      );

      const driverIds = [
        ...new Set(
          resolvedOrders
            .map(
              (order) =>
                order.resolved_driver_id
            )
            .filter(Boolean)
        ),
      ];

     let driverProfiles = [];

      if (driverIds.length > 0) {
        const { data: profilesData, error: profilesLookupError } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', driverIds);

        if (profilesLookupError) {
          console.error('Driver profiles lookup error:', profilesLookupError);
        }

        const { data: vehiclesData } = await supabase
          .from('drivers')
          .select('user_id, vehicle_type, plate_number')
          .in('user_id', driverIds);

        driverProfiles = driverIds.map(id => {
           const p = profilesData?.find(prof => prof.id === id) || {};
           const v = vehiclesData?.find(veh => veh.user_id === id) || {};

           return {
             id: id,
             full_name: p.full_name || 'Delivery Driver',
             phone: p.phone || '',
             vehicle_type: v.vehicle_type || 'Vehicle',
             plate_number: v.plate_number || 'No Plate'
           };
        });
      }

      const finalOrders = resolvedOrders.map(
        (order) => ({
          ...order,
          driver_id:
            order.resolved_driver_id,
          driver_info:
            driverProfiles.find(
              (driver) =>
                driver.id ===
                order.resolved_driver_id
            ) || null,
        })
      );

      setOrders(finalOrders);

      if (selectedOrderRef.current?.id) {
        const refreshedOrder =
          finalOrders.find(
            (order) =>
              order.id ===
              selectedOrderRef.current.id
          );

        if (refreshedOrder) {
          setSelectedOrder(refreshedOrder);
        } else {
          setSelectedOrder(null);
        }
      }
    } catch (error) {
      console.error(
        'Load Store Orders Error:',
        error?.message || error
      );
    } finally {
      setRefreshing(false);
    }
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      loadStoreAndOrders();
    }, [loadStoreAndOrders])
  );

  // ✨ SUPABASE REALTIME SUBSCRIPTION FOR LIVE UPDATES ✨
  useEffect(() => {
    if (!store?.id) return;

    const storeOrdersChannel = supabase
      .channel(`store_dashboard_orders_${store.id}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${store.id}`,
        },
        () => {
          loadStoreAndOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(storeOrdersChannel);
    };
  }, [store?.id, loadStoreAndOrders]);

  const onRefresh = async () => {
    if (refreshing) return;

    setRefreshing(true);
    await loadStoreAndOrders();
  };

  const handleUpdateStatus = async (
    orderId,
    newStatus,
    additionalFields = {}
  ) => {
    if (!orderId || updatingId) return;

    const targetOrder = orders.find(
      (order) => order.id === orderId
    );

    if (!targetOrder) {
      showPopup({
        type: 'warning',
        title: 'Order Not Found',
        message:
          'This order is no longer available. Please refresh.',
        primaryText: 'Got It',
      });

      return;
    }

    setUpdatingId(orderId);

    try {
      const updateData = {
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...additionalFields,
      };

      if (newStatus === 'accepted') {
        const storeId =
          targetOrder.store_id || store?.id;

        if (!storeId) {
          throw new Error(
            'Store information is missing.'
          );
        }

        let freshAddress = store?.address;
        let freshLat = store?.lat;
        let freshLng = store?.lng;

        const { data: latestStore } =
          await supabase
            .from('stores')
            .select(
              'address, lat, lng, name'
            )
            .eq('id', storeId)
            .maybeSingle();

        if (latestStore) {
          freshAddress =
            latestStore.address ||
            freshAddress;

          freshLat =
            latestStore.lat ?? freshLat;

          freshLng =
            latestStore.lng ?? freshLng;
        }

        let parsedItems = [];

        try {
          parsedItems =
            typeof targetOrder.items ===
            'string'
              ? JSON.parse(targetOrder.items)
              : targetOrder.items;
        } catch (error) {
          parsedItems = [];
        }

        if (!Array.isArray(parsedItems)) {
          parsedItems = [];
        }

        const activeItemsForDriver = parsedItems.filter(item => !item.is_unavailable);
        const itemDescription =
          activeItemsForDriver.length > 0
            ? activeItemsForDriver
                .map(
                  (item) =>
                    `${
                      item.qty ||
                      item.quantity ||
                      1
                    }x ${
                      item.name ||
                      item.title ||
                      'Item'
                    }`
                )
                .join(', ')
            : targetOrder.description ||
              'Store Order';

        const rawPickupLat = parseFloat(
          targetOrder.pickup_lat
        );

        const rawPickupLng = parseFloat(
          targetOrder.pickup_lng
        );

        const rawStoreLat = parseFloat(
          freshLat
        );

        const rawStoreLng = parseFloat(
          freshLng
        );

        const rawDeliveryLat = parseFloat(
          targetOrder.delivery_lat
        );

        const rawDropoffLat = parseFloat(
          targetOrder.dropoff_lat
        );

        const rawDeliveryLng = parseFloat(
          targetOrder.delivery_lng
        );

        const rawDropoffLng = parseFloat(
          targetOrder.dropoff_lng
        );

        const pickupLat =
          Number.isFinite(rawPickupLat)
            ? rawPickupLat
            : Number.isFinite(rawStoreLat)
            ? rawStoreLat
            : 0;

        const pickupLng =
          Number.isFinite(rawPickupLng)
            ? rawPickupLng
            : Number.isFinite(rawStoreLng)
            ? rawStoreLng
            : 0;

        const deliveryLat =
          Number.isFinite(rawDeliveryLat)
            ? rawDeliveryLat
            : Number.isFinite(rawDropoffLat)
            ? rawDropoffLat
            : 0;

        const deliveryLng =
          Number.isFinite(rawDeliveryLng)
            ? rawDeliveryLng
            : Number.isFinite(rawDropoffLng)
            ? rawDropoffLng
            : 0;

        const distance =
          calculateDistanceKm(
            pickupLat,
            pickupLng,
            deliveryLat,
            deliveryLng
          );

        const deliveryPayload = {
          order_id: targetOrder.id,
          store_id: storeId,
          request_type: 'store_order',
          customer_id:
            targetOrder.customer_id,
          pickup_address:
            freshAddress ||
            targetOrder.pickup_address ||
            'Store Location',
          dropoff_address:
            targetOrder.delivery_address ||
            targetOrder.dropoff_address ||
            'Customer Location',
          pickup_lat: pickupLat,
          pickup_lng: pickupLng,
          dropoff_lat: deliveryLat,
          dropoff_lng: deliveryLng,
          distance_km: Number(
            Number.isFinite(distance)
              ? distance.toFixed(2)
              : 0
          ),
          item_description: itemDescription,
          delivery_fee: Number(
            targetOrder.delivery_fee ?? 50
          ),
          app_fee:
            targetOrder.app_fee != null
              ? Number(targetOrder.app_fee)
              : null,
          subtotal: Number(
            targetOrder.subtotal ?? 0
          ),
          total_amount: Number(
            targetOrder.total_amount ??
              targetOrder.amount ??
              0
          ),
          payment_method:
            targetOrder.payment_method ||
            'cod',
          status: 'pending',
          notes: targetOrder.delivery_instructions || targetOrder.notes || '',
        };

        const {
          data: existingRequests,
        } = await supabase
          .from('delivery_requests')
          .select(
            'id, status, driver_id'
          )
          .eq(
            'order_id',
            targetOrder.id
          )
          .eq(
            'request_type',
            'store_order'
          )
          .order('created_at', {
            ascending: false,
          })
          .limit(1);

        const existing =
          existingRequests?.[0];

        const existingIsActive =
          existing &&
          ![
            'cancelled',
            'completed',
            'declined',
          ].includes(existing.status);

        if (!existingIsActive) {
          const { error: deliveryError } =
            await supabase
              .from('delivery_requests')
              .insert(
                deliveryPayload
              );

          if (deliveryError) {
            throw new Error(
              `${deliveryError.message} (Code: ${
                deliveryError.code ||
                'UNKNOWN'
              })`
            );
          }
        }

        const { error: orderError } =
          await supabase
            .from('orders')
            .update(updateData)
            .eq('id', orderId);

        if (orderError) {
          throw orderError;
        }

        // ─── START NOTIFY ONLINE & VERIFIED DRIVERS VIA TEXTBEE EDGE FUNCTION ───
        try {
          console.log('📢 Fetching online & verified drivers for SMS alert...');
          
          // 1. Fetch drivers from drivers table where is_verified = true
          const { data: verifiedDrivers, error: driversErr } = await supabase
            .from('drivers')
            .select('user_id')
            .eq('is_verified', true);

          if (driversErr) {
            console.log('❌ Error fetching verified drivers:', driversErr);
          } else if (verifiedDrivers && verifiedDrivers.length > 0) {
            const verifiedDriverIds = verifiedDrivers.map(d => d.user_id);

            // 2. Fetch profiles where id is in verifiedDriverIds and is_online = true
            const { data: onlineProfiles, error: profilesErr } = await supabase
              .from('profiles')
              .select('id, phone')
              .in('id', verifiedDriverIds)
              .eq('is_online', true);

            if (profilesErr) {
              console.log('❌ Error fetching driver profiles:', profilesErr);
            } else if (onlineProfiles && onlineProfiles.length > 0) {
              console.log(`🚀 Found ${onlineProfiles.length} eligible online & verified driver(s). Sending SMS...`);

              // 3. Blast TextBee notification to each online & verified driver via notify-driver
              for (const driverProfile of onlineProfiles) {
                if (driverProfile.phone) {
                  supabase.functions.invoke('notify-driver', {
                    body: {
                      phone: driverProfile.phone,
                      storeName: store?.name || latestStore?.name || 'A store'
                    }
                  }).catch(err => console.log('Driver SMS trigger error:', err));
                }
              }
            } else {
              console.log('⚠️ No online drivers found among verified drivers.');
            }
          } else {
            console.log('⚠️ No verified drivers found.');
          }
        } catch (smsBlastErr) {
          console.log('❌ Error during driver SMS notification blast:', smsBlastErr);
        }
        // ─── END NOTIFY ONLINE & VERIFIED DRIVERS ─────────────────────────────

        showPopup({
          type: 'success',
          title: 'Order Accepted',
          message:
            'The order has been accepted and sent to available delivery drivers.',
          primaryText: 'Done',
        });
      } else {
        const { error: orderError } =
          await supabase
            .from('orders')
            .update(updateData)
            .eq('id', orderId);

        if (orderError) {
          throw orderError;
        }
      }

      setOrders((previous) =>
        previous.map((order) =>
          order.id === orderId
            ? {
                ...order,
                ...updateData,
              }
            : order
        )
      );

      if (
        selectedOrderRef.current?.id ===
        orderId
      ) {
        setSelectedOrder((previous) =>
          previous
            ? {
                ...previous,
                ...updateData,
              }
            : null
        );
      }
    } catch (error) {
      console.error(
        'Update Order Error:',
        error
      );

      showPopup({
        type: 'error',
        title: 'Update Failed',
        message:
          error?.message ||
          'Unable to update this order. Please try again.',
        primaryText: 'Close',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmCancelOrder = (orderId) => {
    showPopup({
      type: 'warning',
      title: 'Decline Order?',
      message:
        'Are you sure you want to decline this order? This action will cancel the order for the customer.',
      primaryText: 'Yes, Decline',
      secondaryText: 'Keep Order',
      onSecondary: closePopup,
      onPrimary: async () => {
        closePopup();

        await handleUpdateStatus(
          orderId,
          'cancelled',
          {
            cancelled_by: 'Store',
          }
        );
      },
    });
  };

  const processCancelSpecificItem = async (order, targetProduct) => {
    if (!order?.id || updatingId) return;
    setUpdatingId(order.id);

    try {
      let currentItems = parseOrderItems(order.items);
      
      const itemIndex = currentItems.findIndex(i => 
        (i.name === targetProduct.name || i.title === targetProduct.title) && 
        !i.is_unavailable
      );

      if (itemIndex === -1) throw new Error("Item not found or already cancelled.");

      currentItems[itemIndex] = { ...currentItems[itemIndex], is_unavailable: true };

      const activeItems = currentItems.filter(item => !item.is_unavailable && !isPenaltyItem(item));
      
      if (activeItems.length === 0) {
        setUpdatingId(null);
        return confirmCancelOrder(order.id); 
      }

      const newSubtotal = activeItems.reduce((sum, item) => sum + ((Number(item.price) || 0) * Number(item.qty || item.quantity || 1)), 0);

      const deliveryFee = Number(order.delivery_fee || 0);
      const appFee = Number(order.app_fee || 0);
      const newTotalAmount = newSubtotal + deliveryFee + appFee;

      const updateData = {
        items: currentItems,
        subtotal: newSubtotal,
        total_amount: newTotalAmount,
        ...(order.amount !== undefined ? { amount: newTotalAmount } : {}),
        updated_at: new Date().toISOString(),
      };

      const { error: orderError } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', order.id);

      if (orderError) throw orderError;

      const newItemDescription = activeItems.length > 0 
        ? activeItems.map(item => `${item.qty || item.quantity || 1}x ${item.name || item.title || 'Item'}`).join(', ')
        : order.description || 'Store Order';

      if (['accepted', 'preparing', 'ready_for_pickup'].includes(order.status)) {
         await supabase
          .from('delivery_requests')
          .update({ 
             subtotal: newSubtotal, 
             total_amount: newTotalAmount,
             item_description: newItemDescription 
          })
          .eq('order_id', order.id)
          .eq('request_type', 'store_order');
      }

      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...updateData } : o)));
      if (selectedOrderRef.current?.id === order.id) {
        setSelectedOrder((prev) => prev ? { ...prev, ...updateData } : null);
      }

      showPopup({
        type: 'success',
        title: 'Item Removed',
        message: 'The item was removed and the order total was updated.',
        primaryText: 'Done',
      });

    } catch (error) {
      showPopup({
        type: 'error',
        title: 'Update Failed',
        message: error?.message || 'Could not update the order items.',
        primaryText: 'Close',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmCancelSpecificItem = (order, itemObj) => {
    const qty = Number(itemObj.quantity || itemObj.qty || 1);
    showPopup({
      type: 'warning',
      title: 'Remove Item?',
      message: `Are you sure you want to mark ${qty}x ${itemObj.name || itemObj.title} as unavailable? The order total will be reduced.`,
      primaryText: 'Yes, Remove',
      secondaryText: 'Keep Item',
      onSecondary: closePopup,
      onPrimary: async () => {
        closePopup();
        await processCancelSpecificItem(order, itemObj);
      },
    });
  };

  const counts = useMemo(() => {
    const result = {
      pending: 0,
      accepted: 0,
      preparing: 0,
      ready: 0,
      picked_up: 0,
      completed: 0,
      cancelled: 0,
    };

    orders.forEach((order) => {
      switch (order.status) {
        case 'pending':
        case 'paid':
          result.pending += 1;
          break;

        case 'accepted':
          result.accepted += 1;
          break;

        case 'preparing':
          result.preparing += 1;
          break;

        case 'ready_for_pickup':
          result.ready += 1;
          break;

        case 'picked_up':
        case 'in_transit':
          result.picked_up += 1;
          break;

        case 'completed':
          result.completed += 1;
          break;

        case 'cancelled':
          result.cancelled += 1;
          break;

        default:
          break;
      }
    });

    return result;
  }, [orders]);

  const totalActive =
    counts.pending +
    counts.accepted +
    counts.preparing +
    counts.ready +
    counts.picked_up;

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      switch (activeTab) {
        case 'pending':
          return (
            order.status === 'pending' ||
            order.status === 'paid'
          );

        case 'accepted':
          return order.status === 'accepted';

        case 'preparing':
          return order.status === 'preparing';

        case 'ready':
          return (
            order.status ===
            'ready_for_pickup'
          );

        case 'picked_up':
          return (
            order.status === 'picked_up' ||
            order.status === 'in_transit'
          );

        case 'completed':
          return order.status === 'completed';

        case 'cancelled':
          return order.status === 'cancelled';

        default:
          return true;
      }
    });
  }, [orders, activeTab]);

  const handleCallCustomer = (phone) => {
    if (!phone) return;

    Linking.openURL(`tel:${phone}`).catch(
      () => {
        showPopup({
          type: 'error',
          title: 'Unable to Call',
          message:
            'Your device could not start the phone call.',
          primaryText: 'Close',
        });
      }
    );
  };

  const storeInitial = (
    store?.name ||
    profile?.full_name ||
    'S'
  )
    .trim()
    .charAt(0)
    .toUpperCase();

  const activeTabData = TABS.find(
    (tab) => tab.id === activeTab
  );

  const currentTabCount =
    counts[activeTab] || 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#123B32"
      />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.storeAvatar}>
            <Text style={styles.storeAvatarText}>
              {storeInitial}
            </Text>

            <View
              style={styles.avatarOnlineDot}
            />
          </View>

          <View style={styles.headerTextWrap}>
            <Text style={styles.storeTag}>
              STORE OWNER
            </Text>

            <Text
              style={styles.storeName}
              numberOfLines={1}
            >
              {store?.name || 'Your Store'}
            </Text>

            <View
              style={styles.headerStatusRow}
            >
              <View style={styles.onlineDot} />

              <Text
                style={styles.headerStatusText}
              >
                Order management is active
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.headerSummary}>
          <Text
            style={
              styles.headerSummaryNumber
            }
          >
            {totalActive}
          </Text>

          <Text
            style={
              styles.headerSummaryLabel
            }
          >
            ACTIVE
          </Text>
        </View>
      </View>

      <View style={styles.ordersWorkspace}>
        <View style={styles.verticalTabRail}>
          <View
            style={styles.verticalRailHeader}
          >
            <View
              style={
                styles.verticalRailHeaderIcon
              }
            >
              <Ionicons
                name="git-commit"
                size={15}
                color="#059669"
              />
            </View>

            <Text
              style={
                styles.verticalRailHeaderText
              }
            >
              STAGES
            </Text>
          </View>

          <ScrollView
            style={styles.verticalTabsScroll}
            contentContainerStyle={
              styles.verticalTabScrollContent
            }
            showsVerticalScrollIndicator={
              false
            }
          >
            {TABS.map((tab) => {
              const isActive =
                activeTab === tab.id;

              const count =
                counts[tab.id] || 0;

              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.verticalTab,
                    isActive &&
                      styles.verticalTabActive,
                  ]}
                  onPress={() =>
                    setActiveTab(tab.id)
                  }
                  activeOpacity={0.8}
                >
                  {isActive && (
                    <View
                      style={
                        styles.verticalActiveIndicator
                      }
                    />
                  )}

                  <View
                    style={[
                      styles.verticalTabIcon,
                      isActive &&
                        styles.verticalTabIconActive,
                    ]}
                  >
                    <Ionicons
                      name={tab.icon}
                      size={18}
                      color={
                        isActive
                          ? '#059669'
                          : '#64748B'
                      }
                    />
                  </View>

                  <Text
                    style={[
                      styles.verticalTabText,
                      isActive &&
                        styles.verticalTabTextActive,
                    ]}
                    numberOfLines={2}
                  >
                    {tab.shortLabel}
                  </Text>

                  {count > 0 && (
                    <View
                      style={[
                        styles.verticalTabCount,
                        isActive &&
                          styles.verticalTabCountActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.verticalTabCountText,
                          isActive &&
                            styles.verticalTabCountTextActive,
                        ]}
                      >
                        {count}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View
            style={styles.verticalRailFooter}
          >
            <View
              style={styles.verticalRailFooterDot}
            />

            <Text
              style={
                styles.verticalRailFooterText
              }
            >
              PIPELINE
            </Text>
          </View>
        </View>

        <FlatList
          style={styles.ordersList}
          data={filteredOrders}
          keyExtractor={(item) =>
            String(item.id)
          }
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={9}
          removeClippedSubviews={
            Platform.OS === 'android'
          }
          contentContainerStyle={[
            styles.listContent,
            filteredOrders.length === 0 &&
              styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#059669']}
              tintColor="#059669"
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View
                style={
                  styles.dashboardSummaryRow
                }
              >
                <View
                  style={[
                    styles.dashboardSummaryCard,
                    styles.dashboardSummaryCardGreen,
                  ]}
                >
                  <View
                    style={
                      styles.dashboardSummaryIcon
                    }
                  >
                    <Ionicons
                      name="layers-outline"
                      size={16}
                      color="#059669"
                    />
                  </View>

                  <View
                    style={
                      styles.dashboardSummaryTextWrap
                    }
                  >
                    <Text
                      style={
                        styles.dashboardSummaryNumber
                      }
                    >
                      {totalActive}
                    </Text>

                    <Text
                      style={
                        styles.dashboardSummaryLabel
                      }
                    >
                      Active
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.dashboardSummaryCard,
                    styles.dashboardSummaryCardOrange,
                  ]}
                >
                  <View
                    style={[
                      styles.dashboardSummaryIcon,
                      styles.dashboardSummaryIconOrange,
                    ]}
                  >
                    <Ionicons
                      name="notifications-outline"
                      size={16}
                      color="#D97706"
                    />
                  </View>

                  <View
                    style={
                      styles.dashboardSummaryTextWrap
                    }
                  >
                    <Text
                      style={
                        styles.dashboardSummaryNumber
                      }
                    >
                      {counts.pending}
                    </Text>

                    <Text
                      style={
                        styles.dashboardSummaryLabel
                      }
                    >
                      New
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.dashboardSummaryCard,
                    styles.dashboardSummaryCardBlue,
                  ]}
                >
                  <View
                    style={[
                      styles.dashboardSummaryIcon,
                      styles.dashboardSummaryIconBlue,
                    ]}
                  >
                    <Ionicons
                      name="checkmark-done-outline"
                      size={16}
                      color="#2563EB"
                    />
                  </View>

                  <View
                    style={
                      styles.dashboardSummaryTextWrap
                    }
                  >
                    <Text
                      style={
                        styles.dashboardSummaryNumber
                      }
                    >
                      {counts.completed}
                    </Text>

                    <Text
                      style={
                        styles.dashboardSummaryLabel
                      }
                    >
                      Done
                    </Text>
                  </View>
                </View>
              </View>

              <View
                style={styles.listHeaderTop}
              >
                <View
                  style={{
                    flex: 1,
                    paddingRight: 8,
                  }}
                >
                  <Text
                    style={styles.listHeaderTitle}
                    numberOfLines={1}
                  >
                    {activeTabData?.label ||
                      'Orders'}
                  </Text>

                  <Text
                    style={
                      styles.listHeaderSubtitle
                    }
                    numberOfLines={1}
                  >
                    {filteredOrders.length}{' '}
                    {filteredOrders.length ===
                    1
                      ? 'order'
                      : 'orders'}{' '}
                    in this stage
                  </Text>
                </View>

                <View
                  style={styles.currentTabBadge}
                >
                  <Ionicons
                    name={
                      activeTabData?.icon ||
                      'layers-outline'
                    }
                    size={13}
                    color="#047857"
                  />

                  <Text
                    style={
                      styles.currentTabBadgeText
                    }
                  >
                    {currentTabCount}
                  </Text>
                </View>
              </View>

              {filteredOrders.length ===
                0 && (
                <View
                  style={
                    styles.emptyContainer
                  }
                >
                  <View
                    style={
                      styles.emptyIconCircle
                    }
                  >
                    <Ionicons
                      name="receipt-outline"
                      size={28}
                      color="#059669"
                    />
                  </View>

                  <Text
                    style={styles.emptyTitle}
                  >
                    No Orders in Stage
                  </Text>

                  <Text
                    style={
                      styles.emptySubtitle
                    }
                  >
                    Orders in the{' '}
                    {activeTabData?.label?.toLowerCase() ||
                      'current'}{' '}
                    stage will appear here.
                  </Text>

                  <TouchableOpacity
                    style={
                      styles.emptyRefreshBtn
                    }
                    onPress={onRefresh}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="refresh-outline"
                      size={15}
                      color="#059669"
                    />

                    <Text
                      style={
                        styles.emptyRefreshText
                      }
                    >
                      Refresh
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const cleanItems =
              getCleanItems(item);

            const cancellation =
              getCancellationDetails(item);

            const paymentLabel =
              getPaymentMethodLabel(item);

            const isOnline =
              paymentLabel.includes('Online');

            const previewItems =
              cleanItems.slice(0, 3);

            const remainingItems = Math.max(
              0,
              cleanItems.length - 3
            );

            const meta =
              getStatusMeta(item.status);

            return (
              <View
                style={[
                  styles.cardContainer,
                  styles.orderCard,
                ]}
              >
                <View
                  style={[
                    styles.cardAccentBar,
                    {
                      backgroundColor:
                        meta.accent,
                    },
                  ]}
                />

                <TouchableOpacity
                  activeOpacity={0.72}
                  delayPressIn={85}
                  onPress={() =>
                    setSelectedOrder(item)
                  }
                >
                  <View
                    style={styles.cardHeader}
                  >
                    <View
                      style={
                        styles.orderIdBlock
                      }
                    >
                      <View
                        style={
                          styles.orderIconBox
                        }
                      >
                        <Ionicons
                          name="receipt"
                          size={14}
                          color="#047857"
                        />
                      </View>

                      <View
                        style={{
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <View
                          style={{
                            flexDirection:
                              'row',
                            alignItems:
                              'center',
                          }}
                        >
                          <Text
                            style={
                              styles.orderIdText
                            }
                            numberOfLines={1}
                          >
                            #{getShortOrderId(
                              item.id
                            )}
                          </Text>

                          <Ionicons
                            name="chevron-forward"
                            size={12}
                            color="#64748B"
                            style={{
                              marginLeft: 3,
                            }}
                          />
                        </View>

                        <Text
                          style={
                            styles.timeAgoText
                          }
                          numberOfLines={1}
                        >
                          {formatTimeAgo(
                            item.created_at
                          )}
                        </Text>
                      </View>
                    </View>

                    <StatusBadge
                      status={item.status}
                    />
                  </View>

                  {item.status ===
                    'cancelled' && (
                    <View
                      style={
                        styles.cardCancellationBanner
                      }
                    >
                      <View
                        style={
                          styles.cancelledIcon
                        }
                      >
                        <Ionicons
                          name="alert-circle"
                          size={14}
                          color="#DC2626"
                        />
                      </View>

                      <View
                        style={
                          styles.cancelledContent
                        }
                      >
                        <Text
                          style={
                            styles.cardCancellationText
                          }
                          numberOfLines={2}
                        >
                          {cancellation.label}
                        </Text>

                        {cancellation.reason ? (
                          <Text
                            style={
                              styles.cardCancellationReasonText
                            }
                            numberOfLines={3}
                          >
                            Reason:{' '}
                            {cancellation.reason}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  )}

                  <View
                    style={
                      styles.customerSection
                    }
                  >
                    <View
                      style={
                        styles.customerIcon
                      }
                    >
                      <Ionicons
                        name="person"
                        size={13}
                        color="#059669"
                      />
                    </View>

                    <View
                      style={{
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <Text
                        style={
                          styles.customerName
                        }
                        numberOfLines={1}
                      >
                        {getCustomerName(item)}
                      </Text>

                      <View
                        style={
                          styles.customerMetaRow
                        }
                      >
                        <Ionicons
                          name="location"
                          size={11}
                          color="#059669"
                        />

                        <Text
                          style={
                            styles.customerAddress
                          }
                          numberOfLines={2}
                        >
                          {item.delivery_address ||
                            item.dropoff_address ||
                            'No delivery address'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {previewItems.length >
                  0 ? (
                    <View
                      style={
                        styles.itemsSummaryBox
                      }
                    >
                      <View
                        style={
                          styles.itemsSummaryHeader
                        }
                      >
                        <Text
                          style={
                            styles.itemsSummaryTitle
                          }
                        >
                          ORDER ITEMS
                        </Text>

                        <Text
                          style={
                            styles.itemCountText
                          }
                        >
                          {getOrderItemCount(
                            item
                          )}{' '}
                          {getOrderItemCount(
                            item
                          ) === 1
                            ? 'item'
                            : 'items'}
                        </Text>
                      </View>

                      {previewItems.map(
                        (
                          product,
                          index
                        ) => {
                          const quantity =
                            Number(
                              product.quantity ||
                                product.qty ||
                                1
                            );

                          const price =
                            Number(
                              product.price
                            ) || 0;

                          return (
                            <View
                              key={`${item.id}-preview-${index}`}
                              style={
                                styles.summaryItemRow
                              }
                            >
                              <View
                                style={
                                  styles.quantityPill
                                }
                              >
                                <Text
                                  style={
                                    styles.quantityPillText
                                  }
                                >
                                  {quantity}x
                                </Text>
                              </View>

                              <Text
                                style={
                                  styles.summaryItemText
                                }
                                numberOfLines={1}
                              >
                                {product.name ||
                                  product.title ||
                                  'Item'}
                              </Text>

                              <Text
                                style={
                                  styles.summaryItemPrice
                                }
                                numberOfLines={
                                  1
                                }
                              >
                                {formatCurrency(
                                  price *
                                    quantity
                                )}
                              </Text>
                            </View>
                          );
                        }
                      )}

                      {remainingItems >
                        0 && (
                        <Text
                          style={
                            styles.moreItemsText
                          }
                        >
                          +{remainingItems}{' '}
                          more{' '}
                          {remainingItems ===
                          1
                            ? 'item'
                            : 'items'}
                        </Text>
                      )}
                    </View>
                  ) : item.description ? (
                    <View
                      style={
                        styles.itemsSummaryBox
                      }
                    >
                      <Text
                        style={
                          styles.itemsSummaryTitle
                        }
                      >
                        ORDER DETAILS
                      </Text>

                      <Text
                        style={
                          styles.descriptionText
                        }
                        numberOfLines={3}
                      >
                        {item.description}
                      </Text>
                    </View>
                  ) : null}

                  {item.status ===
                    'accepted' && (
                    <View
                      style={[
                        styles.driverStatusBox,
                        item.driver_id
                          ? styles.driverAssignedBox
                          : styles.driverWaitingBox,
                      ]}
                    >
                      <View
                        style={[
                          styles.driverStatusIcon,
                          {
                            backgroundColor:
                              item.driver_id
                                ? '#A7F3D0'
                                : '#FDE68A',
                          },
                        ]}
                      >
                        <Ionicons
                          name={
                            item.driver_id
                              ? 'person-circle'
                              : 'time'
                          }
                          size={15}
                          color={
                            item.driver_id
                              ? '#047857'
                              : '#B45309'
                          }
                        />
                      </View>

                      <View
                        style={{
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <Text
                          style={
                            item.driver_id
                              ? styles.driverAssignedTitle
                              : styles.driverWaitingTitle
                          }
                          numberOfLines={1}
                        >
                          {item.driver_id
                            ? 'Driver Assigned'
                            : 'Waiting for Driver'}
                        </Text>

                        <Text
                          style={
                            styles.driverStatusSubtext
                          }
                          numberOfLines={2}
                        >
                          {item.driver_id
                            ? item.driver_info
                                ?.full_name ||
                              'Driver assigned'
                            : 'Preparation can begin once a driver accepts.'}
                        </Text>
                      </View>

                      {item.driver_id && (
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color="#059669"
                        />
                      )}
                    </View>
                  )}
                </TouchableOpacity>

                <View
                  style={styles.cardFooter}
                >
                  <View
                    style={styles.totalBlock}
                  >
                    <View
                      style={
                        styles.totalHeadingRow
                      }
                    >
                      <Text
                        style={
                          styles.totalLabel
                        }
                      >
                        STORE PAYOUT
                      </Text>

                      <View
                        style={
                          styles.paymentMethodMiniBadge
                        }
                      >
                        <Ionicons
                          name={
                            isOnline
                              ? 'card'
                              : 'cash'
                          }
                          size={10}
                          color="#047857"
                        />

                        <Text
                          style={
                            styles.paymentMethodMiniText
                          }
                        >
                          {isOnline
                            ? 'Paid Online'
                            : 'COD'}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={styles.totalPrice}
                    >
                      {formatCurrency(
                        item.subtotal ??
                          item.total_amount ??
                          item.amount ??
                          0
                      )}
                    </Text>
                  </View>

                  {(item.status ===
                    'pending' ||
                    item.status ===
                      'paid') && (
                    <View
                      style={
                        styles.pendingActionRow
                      }
                    >
                      <TouchableOpacity
                        style={
                          styles.declineActionBtn
                        }
                        onPress={() =>
                          confirmCancelOrder(
                            item.id
                          )
                        }
                        disabled={
                          updatingId ===
                          item.id
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name="close"
                          size={16}
                          color="#DC2626"
                        />

                        <Text
                          style={
                            styles.declineActionText
                          }
                        >
                          Decline
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={
                          styles.acceptActionBtn
                        }
                        onPress={() =>
                          handleUpdateStatus(
                            item.id,
                            'accepted'
                          )
                        }
                        disabled={
                          updatingId ===
                          item.id
                        }
                        activeOpacity={0.85}
                      >
                        {updatingId ===
                        item.id ? (
                          <ActivityIndicator
                            size="small"
                            color="#FFFFFF"
                          />
                        ) : (
                          <>
                            <Text
                              style={
                                styles.acceptActionText
                              }
                            >
                              Accept Order
                            </Text>

                            <Ionicons
                              name="arrow-forward"
                              size={14}
                              color="#FFFFFF"
                            />
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {item.status ===
                    'accepted' && (
                    <View
                      style={
                        styles.fullCardAction
                      }
                    >
                      <TouchableOpacity
                        style={[
                          styles.singleActionBtn,
                          {
                            backgroundColor:
                              item.driver_id
                                ? '#059669'
                                : '#CBD5E1',
                          },
                        ]}
                        onPress={() =>
                          handleUpdateStatus(
                            item.id,
                            'preparing'
                          )
                        }
                        disabled={
                          !item.driver_id ||
                          updatingId ===
                            item.id
                        }
                        activeOpacity={0.85}
                      >
                        {updatingId ===
                        item.id ? (
                          <ActivityIndicator
                            size="small"
                            color="#FFFFFF"
                          />
                        ) : (
                          <>
                            <Ionicons
                              name={item.driver_id ? "restaurant" : "time"}
                              size={15}
                              color="#FFFFFF"
                            />

                            <Text
                              style={
                                styles.singleActionText
                              }
                            >
                              {item.driver_id
                                ? 'Start Preparing'
                                : 'Waiting for Driver'}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {item.status ===
                    'preparing' && (
                    <View
                      style={
                        styles.fullCardAction
                      }
                    >
                      <TouchableOpacity
                        style={[
                          styles.fullModalActionBtn,
                          {
                            backgroundColor:
                              '#D97706',
                          },
                        ]}
                        onPress={() =>
                          handleUpdateStatus(
                            item.id,
                            'ready_for_pickup'
                          )
                        }
                        disabled={
                          updatingId ===
                          item.id
                        }
                        activeOpacity={0.85}
                      >
                        {updatingId ===
                        item.id ? (
                          <ActivityIndicator
                            size="small"
                            color="#FFFFFF"
                          />
                        ) : (
                          <>
                            <Ionicons
                              name="checkmark-circle"
                              size={17}
                              color="#FFFFFF"
                            />

                            <Text
                              style={
                                styles.modalActionBtnText
                              }
                            >
                              Mark Ready for Pickup
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {item.status ===
                    'ready_for_pickup' && (
                    <View
                      style={
                        styles.modalStatusNotice
                      }
                    >
                      <View
                        style={
                          styles.modalStatusIcon
                        }
                      >
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
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
                            styles.modalStatusTitle
                          }
                        >
                          Ready for Pickup
                        </Text>

                        <Text
                          style={
                            styles.modalStatusText
                          }
                        >
                          The order is ready for the
                          assigned driver.
                        </Text>
                      </View>
                    </View>
                  )}

                  {(item.status ===
                    'picked_up' ||
                    item.status ===
                      'in_transit') && (
                    <View
                      style={[
                        styles.modalStatusNotice,
                        styles.modalBlueNotice,
                      ]}
                    >
                      <View
                        style={
                          styles.modalStatusIcon
                        }
                      >
                        <Ionicons
                          name={
                            item.status ===
                            'in_transit'
                              ? 'navigate'
                              : 'cube'
                          }
                          size={18}
                          color="#2563EB"
                        />
                      </View>

                      <View
                        style={{
                          flex: 1,
                        }}
                      >
                        <Text
                          style={[
                            styles.modalStatusTitle,
                            {
                              color: '#2563EB',
                            },
                          ]}
                        >
                          {item.status ===
                          'in_transit'
                            ? 'In Transit'
                            : 'Order Picked Up'}
                        </Text>

                        <Text
                          style={
                            styles.modalStatusText
                          }
                        >
                          {item.status ===
                          'in_transit'
                            ? 'The order is currently being delivered.'
                            : 'The delivery driver has collected the order.'}
                        </Text>
                      </View>
                    </View>
                  )}

                  {item.status ===
                    'completed' && (
                    <View
                      style={
                        styles.modalStatusNotice
                      }
                    >
                      <View
                        style={
                          styles.modalStatusIcon
                        }
                      >
                        <Ionicons
                          name="checkmark-done"
                          size={18}
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
                            styles.modalStatusTitle
                          }
                        >
                          Order Completed
                        </Text>

                        <Text
                          style={
                            styles.modalStatusText
                          }
                        >
                          This order has successfully
                          completed its delivery.
                        </Text>
                      </View>
                    </View>
                  )}

                  {item.status ===
                    'cancelled' && (
                    <View
                      style={[
                        styles.modalStatusNotice,
                        styles.modalRedNotice,
                      ]}
                    >
                      <View
                        style={
                          styles.modalStatusIcon
                        }
                      >
                        <Ionicons
                          name="close-circle"
                          size={18}
                          color="#DC2626"
                        />
                      </View>

                      <View
                        style={{
                          flex: 1,
                        }}
                      >
                        <Text
                          style={[
                            styles.modalStatusTitle,
                            {
                              color: '#DC2626',
                            },
                          ]}
                        >
                          Order Cancelled
                        </Text>

                        <Text
                          style={
                            styles.modalStatusText
                          }
                        >
                          This order is no longer active.
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      </View>

      <Modal
        visible={!!selectedOrder}
        animationType="slide"
        transparent
        onRequestClose={() =>
          setSelectedOrder(null)
        }
      >
        <View
          style={styles.modalOverlay}
        >
          <View
            style={styles.modalContent}
          >
            <View
              style={styles.modalHandle}
            />

            <View
              style={styles.modalHeader}
            >
              <View
                style={{
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <View
                  style={
                    styles.modalOrderNumberRow
                  }
                >
                  <View
                    style={
                      styles.modalOrderIcon
                    }
                  >
                    <Ionicons
                      name="receipt"
                      size={15}
                      color="#059669"
                    />
                  </View>

                  <Text
                    style={
                      styles.modalOrderNumber
                    }
                  >
                    #{getShortOrderId(
                      selectedOrder?.id
                    )}
                  </Text>
                </View>

                <Text
                  style={styles.modalTitle}
                >
                  Order Details
                </Text>

                <Text
                  style={
                    styles.modalSubTitle
                  }
                >
                  {formatTimeAgo(
                    selectedOrder?.created_at
                  )}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() =>
                  setSelectedOrder(null)
                }
                style={styles.closeBtn}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="close"
                  size={21}
                  color="#1E293B"
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={
                false
              }
              style={styles.modalBody}
              contentContainerStyle={{
                paddingBottom: 16,
              }}
            >
              {selectedOrder?.status ===
                'cancelled' && (
                <View
                  style={[
                    styles.sectionBox,
                    styles.modalCancelledBox,
                  ]}
                >
                  <View
                    style={
                      styles.cancelledHeaderRow
                    }
                  >
                    <View
                      style={
                        styles.modalCancelledIcon
                      }
                    >
                      <Ionicons
                        name="close-circle"
                        size={18}
                        color="#DC2626"
                      />
                    </View>

                    <View
                      style={{
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <Text
                        style={
                          styles.cancelledTitle
                        }
                      >
                        Order Cancelled
                      </Text>

                      <Text
                        style={
                          styles.cancelledWhoText
                        }
                      >
                        {
                          getCancellationDetails(
                            selectedOrder
                          ).label
                        }
                      </Text>
                    </View>
                  </View>

                  {getCancellationDetails(
                    selectedOrder
                  ).reason ? (
                    <View
                      style={
                        styles.reasonBox
                      }
                    >
                      <Text
                        style={
                          styles.reasonLabel
                        }
                      >
                        Cancellation Reason
                      </Text>

                      <Text
                        style={
                          styles.cancelledReasonText
                        }
                      >
                        "
                        {
                          getCancellationDetails(
                            selectedOrder
                          ).reason
                        }
                        "
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}

              {selectedOrder?.status !==
                'cancelled' && (
                <View
                  style={styles.sectionBox}
                >
                  <View
                    style={
                      styles.sectionTitleRow
                    }
                  >
                    <View
                      style={{
                        flex: 1,
                        minWidth: 0,
                        paddingRight: 8,
                      }}
                    >
                      <Text
                        style={
                          styles.sectionTitle
                        }
                      >
                        Order Status
                      </Text>

                      <Text
                        style={
                          styles.sectionSubtitle
                        }
                      >
                        Current order progress
                      </Text>
                    </View>

                    <StatusBadge
                      status={
                        selectedOrder?.status
                      }
                    />
                  </View>

                  {(selectedOrder?.status ===
                    'pending' ||
                    selectedOrder?.status ===
                      'paid') && (
                    <View
                      style={
                        styles.pendingNotice
                      }
                    >
                      <Ionicons
                        name="notifications"
                        size={16}
                        color="#C2410C"
                      />

                      <Text
                        style={
                          styles.pendingNoticeText
                        }
                      >
                        This order is waiting for
                        your store to accept it.
                      </Text>
                    </View>
                  )}

                  {selectedOrder?.status !==
                    'pending' &&
                    selectedOrder?.status !==
                      'paid' && (
                      <View
                        style={
                          styles.timeline
                        }
                      >
                        {STATUS_STEPS.map(
                          (step, index) => {
                            const currentIndex =
                              getCurrentStepIndex(
                                selectedOrder?.status
                              );

                            const completed =
                              index <=
                              currentIndex;

                            const isLast =
                              index ===
                              STATUS_STEPS.length -
                                1;

                            return (
                              <View
                                key={step.id}
                                style={
                                  styles.timelineItem
                                }
                              >
                                <View
                                  style={
                                    styles.timelineVisual
                                  }
                                >
                                  <View
                                    style={[
                                      styles.timelineDot,
                                      completed &&
                                        styles.timelineDotActive,
                                    ]}
                                  >
                                    {completed && (
                                      <Ionicons
                                        name="checkmark"
                                        size={10}
                                        color="#FFFFFF"
                                      />
                                    )}
                                  </View>

                                  {!isLast && (
                                    <View
                                      style={[
                                        styles.timelineLine,
                                        index <
                                          currentIndex &&
                                          styles.timelineLineActive,
                                      ]}
                                    />
                                  )}
                                </View>

                                <Text
                                  style={[
                                    styles.timelineLabel,
                                    completed &&
                                      styles.timelineLabelActive,
                                  ]}
                                >
                                  {step.label}
                                </Text>
                              </View>
                            );
                          }
                        )}
                      </View>
                    )}
                </View>
              )}

              <View
                style={styles.sectionBox}
              >
                <Text
                  style={styles.sectionTitle}
                >
                  Customer Information
                </Text>

                <View
                  style={styles.infoCard}
                >
                  <View
                    style={
                      styles.infoIconCircle
                    }
                  >
                    <Ionicons
                      name="person"
                      size={17}
                      color="#059669"
                    />
                  </View>

                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <Text
                      style={
                        styles.infoCardLabel
                      }
                    >
                      Customer
                    </Text>

                    <Text
                      style={
                        styles.infoCardValue
                      }
                    >
                      {getCustomerName(
                        selectedOrder
                      )}
                    </Text>
                  </View>
                </View>

                {getCustomerPhone(
                  selectedOrder
                ) && (
                  <TouchableOpacity
                    style={styles.infoCard}
                    onPress={() =>
                      handleCallCustomer(
                        getCustomerPhone(
                          selectedOrder
                        )
                      )
                    }
                    activeOpacity={0.8}
                  >
                    <View
                      style={
                        styles.infoIconCircle
                      }
                    >
                      <Ionicons
                        name="call"
                        size={17}
                        color="#059669"
                      />
                    </View>

                    <View
                      style={{
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <Text
                        style={
                          styles.infoCardLabel
                        }
                      >
                        Phone Number
                      </Text>

                      <Text
                        style={
                          styles.infoCardValueLink
                        }
                      >
                        {getCustomerPhone(
                          selectedOrder
                        )}
                      </Text>
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                )}

                <View
                  style={styles.infoCard}
                >
                  <View
                    style={
                      styles.infoIconCircle
                    }
                  >
                    <Ionicons
                      name="location"
                      size={17}
                      color="#059669"
                    />
                  </View>

                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <Text
                      style={
                        styles.infoCardLabel
                      }
                    >
                      Delivery Address
                    </Text>

                    <Text
                      style={
                        styles.infoCardValue
                      }
                    >
                      {selectedOrder?.delivery_address ||
                        selectedOrder?.dropoff_address ||
                        'No address provided'}
                    </Text>
                  </View>
                </View>
              </View>

              {selectedOrder?.delivery_instructions ? (
                <View
                  style={styles.sectionBox}
                >
                  <Text
                    style={
                      styles.sectionTitle
                    }
                  >
                    Delivery Instructions
                  </Text>

                  <View
                    style={
                      styles.instructionsBox
                    }
                  >
                    <Ionicons
                      name="document-text"
                      size={17}
                      color="#D97706"
                    />

                    <Text
                      style={styles.notesText}
                    >
                      {
                        selectedOrder.delivery_instructions
                      }
                    </Text>
                  </View>
                </View>
              ) : null}

              {selectedOrder?.driver_info && (
                <View style={styles.sectionBox}>
                  <View style={styles.driverSectionHeader}>
                    <View style={styles.driverSectionIcon}>
                      <Ionicons name="bicycle" size={15} color="#059669" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.sectionTitle}>Delivery Driver</Text>
                      <Text style={styles.sectionSubtitle}>Assigned to this order</Text>
                    </View>
                  </View>

                  <View style={styles.driverCard}>
                    <View style={styles.driverAvatar}>
                      <Ionicons name="person" size={19} color="#059669" />
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.driverName} numberOfLines={1}>
                        {selectedOrder.driver_info.full_name || 'Delivery Driver'}
                      </Text>

                      <View style={styles.driverStatusRow}>
                        <View style={styles.driverStatusDot} />
                        <Text style={styles.driverStatus}>
                          {selectedOrder.driver_info.vehicle_type || 'Vehicle'} • {selectedOrder.driver_info.plate_number || 'No Plate'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {selectedOrder.driver_info.phone ? (
                    <TouchableOpacity
                      style={styles.infoCard}
                      onPress={() => handleCallCustomer(selectedOrder.driver_info.phone)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.infoIconCircle}>
                        <Ionicons name="call" size={17} color="#059669" />
                      </View>

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.infoCardLabel}>Driver Phone</Text>
                        <Text style={styles.infoCardValueLink}>
                          {selectedOrder.driver_info.phone}
                        </Text>
                      </View>

                      <Ionicons name="chevron-forward" size={16} color="#64748B" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}

              <View
                style={styles.sectionBox}
              >
                <View
                  style={
                    styles.sectionTitleRow
                  }
                >
                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <Text
                      style={
                        styles.sectionTitle
                      }
                    >
                      Ordered Items
                    </Text>

                    <Text
                      style={
                        styles.sectionSubtitle
                      }
                    >
                      {getOrderItemCount(
                        selectedOrder
                      )}{' '}
                      {getOrderItemCount(
                        selectedOrder
                      ) === 1
                        ? 'item'
                        : 'items'}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.itemCountBadge
                    }
                  >
                    <Text
                      style={
                        styles.itemCountBadgeText
                      }
                    >
                      {
                        getCleanItems(
                          selectedOrder
                        ).length
                      }
                    </Text>
                  </View>
                </View>

                {getCleanItems(selectedOrder).length > 0 ? (
                  getCleanItems(selectedOrder).map(
                    (product, index) => {
                      const quantity = Number(product.quantity || product.qty || 1);
                      const unitPrice = Number(product.price) || 0;
                      const isUnavailable = product.is_unavailable === true;

                      return (
                        <View
                          key={`${selectedOrder.id}-item-${index}`}
                          style={[
                            styles.itemDetailRow,
                            isUnavailable && { opacity: 0.5 }
                          ]}
                        >
                          <View style={styles.itemDetailQty}>
                            <Text style={[styles.itemDetailQtyText, isUnavailable && { textDecorationLine: 'line-through' }]}>
                              {quantity}x
                            </Text>
                          </View>

                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              style={[styles.itemDetailName, isUnavailable && { textDecorationLine: 'line-through' }]}
                              numberOfLines={2}
                            >
                              {product.name || product.title || 'Item'}
                            </Text>
                            <Text style={[styles.itemUnitPrice, isUnavailable && { textDecorationLine: 'line-through' }]}>
                              {formatCurrency(unitPrice)} each
                            </Text>
                          </View>

                          <Text style={[styles.itemPrice, isUnavailable && { textDecorationLine: 'line-through' }]}>
                            {formatCurrency(unitPrice * quantity)}
                          </Text>

                          {!isUnavailable && ['pending', 'paid', 'accepted', 'preparing'].includes(selectedOrder.status) && (
                            <TouchableOpacity 
                              style={styles.cancelSpecificItemBtn}
                              onPress={() => confirmCancelSpecificItem(selectedOrder, product)}
                              disabled={updatingId === selectedOrder.id}
                            >
                              <Ionicons name="close-circle" size={20} color="#DC2626" />
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    }
                  )
                ) : (
                  <Text
                    style={styles.infoText}
                  >
                    {selectedOrder?.description ||
                      'No items listed'}
                  </Text>
                )}
              </View>

              <View
                style={styles.sectionBox}
              >
                <Text
                  style={styles.sectionTitle}
                >
                  Payment Summary
                </Text>

                <View
                  style={
                    styles.paymentMethodCard
                  }
                >
                  <View
                    style={
                      styles.paymentIconCircle
                    }
                  >
                    <Ionicons
                      name={
                        getPaymentMethodLabel(
                          selectedOrder
                        ).includes('Online')
                          ? 'card'
                          : 'cash'
                      }
                      size={17}
                      color="#059669"
                    />
                  </View>

                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <Text
                      style={
                        styles.infoCardLabel
                      }
                    >
                      Payment Method
                    </Text>

                    <Text
                      style={
                        styles.paymentMethodValue
                      }
                    >
                      {getPaymentMethodLabel(
                        selectedOrder
                      )}
                    </Text>
                  </View>
                </View>

                <View
                  style={
                    styles.paymentBreakdown
                  }
                >
                  <View
                    style={
                      styles.paymentRow
                    }
                  >
                    <Text
                      style={
                        styles.paymentLabel
                      }
                    >
                      Subtotal
                    </Text>

                    <Text
                      style={
                        styles.paymentValue
                      }
                    >
                      {formatCurrency(
                        selectedOrder?.subtotal ??
                          0
                      )}
                    </Text>
                  </View>

                  {selectedOrder?.delivery_fee !=
                    null && (
                    <View
                      style={
                        styles.paymentRow
                      }
                    >
                      <Text
                        style={
                          styles.paymentLabel
                        }
                      >
                        Delivery Fee
                      </Text>

                      <Text
                        style={
                          styles.paymentValue
                        }
                      >
                        {formatCurrency(
                          selectedOrder.delivery_fee
                        )}
                      </Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.paymentRow,
                      styles.paymentTotalRow,
                    ]}
                  >
                    <Text
                      style={
                        styles.paymentTotalLabel
                      }
                    >
                      Store Payout
                    </Text>

                    <Text
                      style={
                        styles.paymentTotalValue
                      }
                    >
                      {formatCurrency(
                        selectedOrder?.subtotal ??
                          selectedOrder?.total_amount ??
                          selectedOrder?.amount ??
                          0
                      )}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View
              style={styles.modalFooter}
            >
              {(selectedOrder?.status ===
                'pending' ||
                selectedOrder?.status ===
                  'paid') && (
                <View
                  style={
                    styles.modalActionRow
                  }
                >
                  <TouchableOpacity
                    style={[
                      styles.modalActionBtn,
                      styles.modalCancelBtn,
                    ]}
                    onPress={() =>
                      confirmCancelOrder(
                        selectedOrder.id
                      )
                    }
                    disabled={
                      updatingId ===
                      selectedOrder.id
                    }
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="close"
                      size={17}
                      color="#DC2626"
                    />

                    <Text
                      style={
                        styles.modalCancelBtnText
                      }
                    >
                      Decline
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modalActionBtn,
                      styles.modalAcceptBtn,
                    ]}
                    onPress={() =>
                      handleUpdateStatus(
                        selectedOrder.id,
                        'accepted'
                      )
                    }
                    disabled={
                      updatingId ===
                      selectedOrder.id
                    }
                    activeOpacity={0.85}
                  >
                    {updatingId ===
                    selectedOrder.id ? (
                      <ActivityIndicator
                        size="small"
                        color="#FFFFFF"
                      />
                    ) : (
                      <>
                        <Text
                          style={
                            styles.modalActionBtnText
                          }
                        >
                          Accept Order
                        </Text>

                        <Ionicons
                          name="arrow-forward"
                          size={16}
                          color="#FFFFFF"
                        />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {selectedOrder?.status === 'accepted' && (
                <View style={styles.fullCardAction}>
                  <TouchableOpacity
                    style={[
                      styles.fullModalActionBtn,
                      {
                        backgroundColor: selectedOrder?.driver_id ? '#059669' : '#94A3B8',
                      },
                    ]}
                    onPress={() => handleUpdateStatus(selectedOrder.id, 'preparing')}
                    disabled={!selectedOrder?.driver_id || updatingId === selectedOrder.id}
                    activeOpacity={0.85}
                  >
                    {updatingId === selectedOrder.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons
                          name={selectedOrder?.driver_id ? "restaurant" : "time"}
                          size={17}
                          color="#FFFFFF"
                        />
                        <Text style={styles.modalActionBtnText}>
                          {selectedOrder?.driver_id ? 'Driver Assigned - Start Preparing' : 'Waiting for Driver to Accept...'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {selectedOrder?.status ===
                'preparing' && (
                <TouchableOpacity
                  style={[
                    styles.fullModalActionBtn,
                    {
                      backgroundColor:
                        '#D97706',
                    },
                  ]}
                  onPress={() =>
                    handleUpdateStatus(
                      selectedOrder.id,
                      'ready_for_pickup'
                    )
                  }
                  disabled={
                    updatingId ===
                    selectedOrder.id
                  }
                  activeOpacity={0.85}
                >
                  {updatingId ===
                  selectedOrder.id ? (
                    <ActivityIndicator
                      size="small"
                      color="#FFFFFF"
                    />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle"
                        size={17}
                        color="#FFFFFF"
                      />

                      <Text
                        style={
                          styles.modalActionBtnText
                        }
                      >
                        Mark Ready for Pickup
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {selectedOrder?.status ===
                'ready_for_pickup' && (
                <View
                  style={
                    styles.modalStatusNotice
                  }
                >
                  <View
                    style={
                      styles.modalStatusIcon
                    }
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
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
                        styles.modalStatusTitle
                      }
                    >
                      Ready for Pickup
                    </Text>

                    <Text
                      style={
                        styles.modalStatusText
                      }
                    >
                      The order is ready for the
                      assigned driver.
                    </Text>
                  </View>
                </View>
              )}

              {(selectedOrder?.status ===
                'picked_up' ||
                selectedOrder?.status ===
                  'in_transit') && (
                <View
                  style={[
                    styles.modalStatusNotice,
                    styles.modalBlueNotice,
                  ]}
                >
                  <View
                    style={
                      styles.modalStatusIcon
                    }
                  >
                    <Ionicons
                      name={
                        selectedOrder?.status ===
                        'in_transit'
                          ? 'navigate'
                          : 'cube'
                      }
                      size={18}
                      color="#2563EB"
                    />
                  </View>

                  <View
                    style={{
                      flex: 1,
                    }}
                  >
                    <Text
                      style={[
                        styles.modalStatusTitle,
                        {
                          color: '#2563EB',
                        },
                      ]}
                    >
                      {selectedOrder?.status ===
                      'in_transit'
                        ? 'In Transit'
                        : 'Order Picked Up'}
                    </Text>

                    <Text
                      style={
                        styles.modalStatusText
                      }
                    >
                      {selectedOrder?.status ===
                      'in_transit'
                        ? 'The order is currently being delivered.'
                        : 'The delivery driver has collected the order.'}
                    </Text>
                  </View>
                </View>
              )}

              {selectedOrder?.status ===
                'completed' && (
                <View
                  style={
                    styles.modalStatusNotice
                  }
                >
                  <View
                    style={
                      styles.modalStatusIcon
                    }
                  >
                    <Ionicons
                      name="checkmark-done"
                      size={18}
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
                        styles.modalStatusTitle
                      }
                    >
                      Order Completed
                    </Text>

                    <Text
                      style={
                        styles.modalStatusText
                      }
                    >
                      This order has successfully
                      completed its delivery.
                    </Text>
                  </View>
                </View>
              )}

              {selectedOrder?.status ===
                'cancelled' && (
                <View
                  style={[
                    styles.modalStatusNotice,
                    styles.modalRedNotice,
                  ]}
                >
                  <View
                    style={
                      styles.modalStatusIcon
                    }
                  >
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color="#DC2626"
                    />
                  </View>

                  <View
                    style={{
                      flex: 1,
                    }}
                  >
                    <Text
                      style={[
                        styles.modalStatusTitle,
                        {
                          color: '#DC2626',
                        },
                      ]}
                    >
                      Order Cancelled
                    </Text>

                    <Text
                      style={
                        styles.modalStatusText
                      }
                    >
                      This order is no longer active.
                    </Text>
                  </View>
                </View>
              )}
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
        onPrimary={
          popup.onPrimary || closePopup
        }
        onSecondary={
          popup.onSecondary || closePopup
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F6F4',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop:
      Platform.OS === 'android'
        ? (StatusBar.currentHeight || 20) + 5
        : 12,
    paddingBottom: 13,
    backgroundColor: '#123B32',
    borderBottomWidth: 1,
    borderBottomColor: '#0D3029',
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },

  storeAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    position: 'relative',
  },

  storeAvatarText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#047857',
  },

  avatarOnlineDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    right: -1,
    bottom: -1,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },

  storeTag: {
    fontSize: 9,
    fontWeight: '900',
    color: '#A7F3D0',
    letterSpacing: 1.2,
    marginBottom: 2,
  },

  storeName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },

  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
    marginRight: 5,
  },

  headerStatusText: {
    fontSize: 10.5,
    color: '#D1E5DD',
    fontWeight: '600',
  },

  headerSummary: {
    minWidth: 56,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  headerSummaryNumber: {
    fontSize: 18,
    lineHeight: 18,
    color: '#047857',
    fontWeight: '900',
  },

  headerSummaryLabel: {
    fontSize: 7,
    color: '#059669',
    fontWeight: '900',
    letterSpacing: 0.8,
    marginTop: 2,
  },

  ordersWorkspace: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    backgroundColor: '#F2F6F4',
  },

  verticalTabRail: {
    width: 92,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#DDE7E2',
    paddingTop: 12,
    paddingBottom: 10,
  },

  verticalRailHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EFEB',
    marginHorizontal: 8,
    marginBottom: 8,
  },

  verticalRailHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },

  verticalRailHeaderText: {
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '900',
    color: '#059669',
  },

  verticalTabsScroll: {
    flex: 1,
  },

  verticalTabScrollContent: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },

  verticalTab: {
    minHeight: 70,
    borderRadius: 12,
    backgroundColor: '#F5F8F6',
    borderWidth: 1,
    borderColor: '#E1EAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 5,
    position: 'relative',
  },

  verticalTabActive: {
    backgroundColor: '#E4F6EC',
    borderColor: '#8DD7B2',
    shadowColor: '#059669',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },

  verticalActiveIndicator: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: '#059669',
  },

  verticalTabIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  verticalTabIconActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },

  verticalTabText: {
    fontSize: 9.5,
    lineHeight: 12,
    textAlign: 'center',
    color: '#52635B',
    fontWeight: '800',
    maxWidth: 88,
  },

  verticalTabTextActive: {
    color: '#047857',
    fontWeight: '900',
  },

  verticalTabCount: {
    minWidth: 22,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    marginTop: 4,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  verticalTabCountActive: {
    backgroundColor: '#059669',
  },

  verticalTabCountText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#334155',
  },

  verticalTabCountTextActive: {
    color: '#FFFFFF',
  },

  verticalRailFooter: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  verticalRailFooterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },

  verticalRailFooterText: {
    fontSize: 8,
    letterSpacing: 0.8,
    color: '#059669',
    fontWeight: '900',
  },

  ordersList: {
    flex: 1,
    minWidth: 0,
  },

  listContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 36,
  },

  listContentEmpty: {
    flexGrow: 1,
  },

  listHeader: {
    marginBottom: 6,
  },

  dashboardSummaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },

  dashboardSummaryCard: {
    flex: 1,
    minHeight: 70,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 10,
    flexDirection: 'column', // Changed to column
    alignItems: 'center',    // Centers everything horizontally
    justifyContent: 'center',
  },

  dashboardSummaryCardGreen: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },

  dashboardSummaryCardOrange: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },

  dashboardSummaryCardBlue: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },

  dashboardSummaryIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: 'transparent', // Removed white background for cleaner look
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4, // Spacing before the number
  },

  dashboardSummaryIconOrange: {
    backgroundColor: 'transparent',
  },

  dashboardSummaryIconBlue: {
    backgroundColor: 'transparent',
  },

  dashboardSummaryTextWrap: {
    alignItems: 'center', // Centers number and label
    justifyContent: 'center',
  },

  dashboardSummaryNumber: {
    fontSize: 18, // Slightly larger to stand out
    color: '#0F172A',
    fontWeight: '900',
  },

  dashboardSummaryLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },

  listHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 34,
    marginBottom: 10,
  },

  listHeaderTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },

  listHeaderSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },

  currentTabBadge: {
    minWidth: 36,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 4,
  },

  currentTabBadgeText: {
    fontSize: 10,
    color: '#047857',
    fontWeight: '900',
  },

  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#DDE7E2',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
    position: 'relative',
  },

  cardAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },

  orderCard: {
    marginBottom: 12,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingLeft: 4,
  },

  orderIdBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 6,
  },

  orderIconBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },

  orderIdText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },

  timeAgoText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },

  badgeContainer: {
    maxWidth: '46%',
    minHeight: 27,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexShrink: 0,
  },

  badgeText: {
    flexShrink: 1,
    fontSize: 8,
    fontWeight: '900',
  },

  customerSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingLeft: 4,
  },

  customerIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 1,
  },

  customerName: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '900',
  },

  customerMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 2,
  },

  customerAddress: {
    flex: 1,
    fontSize: 10.5,
    lineHeight: 14,
    color: '#64748B',
    marginLeft: 3,
    fontWeight: '500',
  },

  itemsSummaryBox: {
    backgroundColor: '#F5F8F6',
    borderRadius: 10,
    padding: 11,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: '#E1EAE5',
    marginLeft: 4,
  },

  itemsSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },

  itemsSummaryTitle: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  itemCountText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },

  summaryItemRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },

  quantityPill: {
    minWidth: 26,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },

  quantityPillText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#047857',
  },

  summaryItemText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    color: '#1E293B',
    fontWeight: '700',
  },

  summaryItemPrice: {
    maxWidth: 68,
    fontSize: 9.5,
    color: '#1E293B',
    fontWeight: '800',
    marginLeft: 6,
  },

  moreItemsText: {
    fontSize: 9,
    color: '#059669',
    fontWeight: '800',
    marginTop: 2,
    marginLeft: 32,
  },

  descriptionText: {
    fontSize: 11.5,
    lineHeight: 16,
    color: '#1E293B',
    fontWeight: '600',
  },

  cardCancellationBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginLeft: 4,
  },

  cancelledIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelledContent: {
    flex: 1,
    minWidth: 0,
    marginLeft: 8,
  },

  cardCancellationText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#DC2626',
    lineHeight: 14,
  },

  cardCancellationReasonText: {
    fontSize: 9,
    lineHeight: 13,
    color: '#991B1B',
    marginTop: 3,
    fontStyle: 'italic',
    fontWeight: '600',
  },

  driverStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    marginLeft: 4,
  },

  driverWaitingBox: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },

  driverAssignedBox: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },

  driverStatusIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  driverAssignedTitle: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    color: '#047857',
  },

  driverWaitingTitle: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    color: '#B45309',
  },

  driverStatusSubtext: {
    fontSize: 8.5,
    lineHeight: 12,
    color: '#64748B',
    marginTop: 2,
  },

  cardFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingLeft: 4,
  },

  totalBlock: {
    width: '100%',
    minWidth: 0,
  },

  totalHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  totalLabel: {
    fontSize: 8,
    color: '#64748B',
    fontWeight: '800',
  },

  totalPrice: {
    fontSize: 20,
    fontWeight: '900',
    color: '#047857',
    marginTop: 2,
  },

  paymentMethodMiniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
    marginLeft: 6,
  },

  paymentMethodMiniText: {
    fontSize: 8,
    color: '#047857',
    fontWeight: '800',
  },

  pendingActionRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 10,
  },

  declineActionBtn: {
    flex: 0.85,
    minHeight: 44,
    borderRadius: 9,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },

  declineActionText: {
    fontSize: 10.5,
    color: '#DC2626',
    fontWeight: '900',
  },

  acceptActionBtn: {
    flex: 1.6,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  acceptActionText: {
    fontSize: 10.5,
    color: '#FFFFFF',
    fontWeight: '900',
  },

  fullCardAction: {
    width: '100%',
    marginTop: 10,
  },

  singleActionBtn: {
    width: '100%',
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  singleActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 58,
  },

  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },

  emptySubtitle: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 4,
    maxWidth: 220,
  },

  emptyRefreshBtn: {
    marginTop: 14,
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  emptyRefreshText: {
    fontSize: 9.5,
    color: '#059669',
    fontWeight: '800',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },

  modalContent: {
    backgroundColor: '#F7F9F8',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '95%',
    paddingTop: 10,
    paddingHorizontal: 16,
  },

  modalHandle: {
    alignSelf: 'center',
    width: 46,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    marginBottom: 10,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },

  modalOrderNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },

  modalOrderIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  modalOrderNumber: {
    fontSize: 12,
    fontWeight: '900',
    color: '#059669',
  },

  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },

  modalSubTitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },

  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginLeft: 12,
  },

  modalBody: {
    paddingTop: 14,
  },

  modalFooter: {
    paddingTop: 10,
    paddingBottom:
      Platform.OS === 'ios' ? 12 : 14,
    backgroundColor: '#F8FAFC',
  },

  sectionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.025,
    shadowRadius: 5,
    elevation: 1,
  },

  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },

  sectionSubtitle: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },

  pendingNotice: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  pendingNoticeText: {
    flex: 1,
    fontSize: 10,
    color: '#9A3412',
    lineHeight: 15,
    fontWeight: '600',
  },

  timeline: {
    marginTop: 6,
  },

  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 36,
  },

  timelineVisual: {
    width: 24,
    alignItems: 'center',
  },

  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },

  timelineDotActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },

  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 18,
    backgroundColor: '#E2E8F0',
    marginVertical: 2,
  },

  timelineLineActive: {
    backgroundColor: '#6EE7B7',
  },

  timelineLabel: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    marginLeft: 8,
    paddingTop: 2,
  },

  timelineLabelActive: {
    color: '#047857',
    fontWeight: '800',
  },

  infoCard: {
    minHeight: 56,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },

  infoIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  infoCardLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '700',
    marginBottom: 2,
  },

  infoCardValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '800',
    lineHeight: 16,
  },

  infoCardValueLink: {
    fontSize: 12,
    color: '#0284C7',
    fontWeight: '800',
    textDecorationLine: 'underline',
  },

  infoText: {
    fontSize: 12.5,
    color: '#1E293B',
    lineHeight: 18,
    fontWeight: '600',
  },

  instructionsBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 11,
    gap: 9,
    marginTop: 9,
  },

  notesText: {
    flex: 1,
    fontSize: 11.5,
    color: '#92400E',
    fontStyle: 'italic',
    lineHeight: 17,
    fontWeight: '600',
  },

  driverSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },

  driverSectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 10,
  },

  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  driverName: {
    fontSize: 13,
    fontWeight: '900',
    color: '#047857',
  },

  driverStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },

  driverStatusDot: {
    width: 6.5,
    height: 6.5,
    borderRadius: 3.25,
    backgroundColor: '#10B981',
    marginRight: 6,
  },

  driverStatus: {
    fontSize: 10,
    color: '#64748B',
  },

  itemCountBadge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },

  itemCountBadgeText: {
    fontSize: 9.5,
    color: '#059669',
    fontWeight: '900',
  },

  itemDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },

  itemDetailQty: {
    width: 42,
    height: 31,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  itemDetailQtyText: {
    fontSize: 10,
    color: '#047857',
    fontWeight: '900',
  },

  itemDetailName: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '800',
  },

  itemUnitPrice: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },

  itemPrice: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1E293B',
    marginLeft: 10,
  },

  cancelSpecificItemBtn: {
    paddingLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  paymentMethodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 9,
  },

  paymentIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  paymentMethodValue: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '900',
  },

  paymentBreakdown: {
    marginTop: 12,
  },

  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },

  paymentLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },

  paymentValue: {
    fontSize: 11,
    color: '#1E293B',
    fontWeight: '700',
  },

  paymentTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
    marginTop: 4,
    marginBottom: 0,
  },

  paymentTotalLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },

  paymentTotalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
  },

  modalCancelledBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },

  cancelledHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  modalCancelledIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  cancelledTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#DC2626',
  },

  cancelledWhoText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#991B1B',
    marginTop: 2,
  },

  reasonBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  reasonLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#9F1239',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },

  cancelledReasonText: {
    fontSize: 11,
    color: '#7F1D1D',
    fontStyle: 'italic',
    lineHeight: 16,
    fontWeight: '600',
  },

  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
  },

  modalActionBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },

  modalCancelBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  modalCancelBtnText: {
    color: '#DC2626',
    fontSize: 12.5,
    fontWeight: '900',
  },

  modalAcceptBtn: {
    flex: 1.7,
    backgroundColor: '#059669',
  },

  modalActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '900',
  },

  fullModalActionBtn: {
    width: '100%',
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },

  modalWaitingNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 11,
    padding: 10,
    marginBottom: 9,
    gap: 8,
  },

  modalWaitingNoticeText: {
    flex: 1,
    fontSize: 10,
    color: '#92400E',
    lineHeight: 15,
    fontWeight: '600',
  },

  modalStatusNotice: {
    minHeight: 62,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },

  modalStatusIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalStatusTitle: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '900',
  },

  modalStatusText: {
    fontSize: 10,
    color: '#64748B',
    lineHeight: 15,
    marginTop: 2,
    fontWeight: '600',
  },

  modalBlueNotice: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },

  modalRedNotice: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },

  popupOverlay: {
    flex: 1,
    backgroundColor:
      'rgba(15, 23, 42, 0.65)',
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
    shadowOffset: {
      width: 0,
      height: 14,
    },
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