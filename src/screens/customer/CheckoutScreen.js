import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StatusBar,
  SafeAreaView,
  Modal,
} from 'react-native';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { supabase } from '../../config/supabase';
import OsmMap from '../../components/OsmMap';
import { Button, Input } from '../../components/UI';
import { createPaymentLink } from '../../services/paymongoService';

// Calculate distance in kilometers using the Haversine formula
const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;

  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

export default function CheckoutScreen({ navigation, route }) {
  const { profile } = useAuth();
  const cartContext = useCart();

  const cartItems = cartContext?.cartItems || [];
  const clearCart = cartContext?.clearCart;
  const itemsToCheckout = route.params?.itemsToCheckout || cartItems;

  const [deliveryAddress, setDeliveryAddress] = useState('Loading location...');
  const [userLocation, setUserLocation] = useState(null);
  const [deliveryInstructions, setDeliveryInstructions] = useState('');

  const [liveStreetDetails, setLiveStreetDetails] = useState('');
  const [locationMode, setLocationMode] = useState('saved');

  const [paymentMethod, setPaymentMethod] = useState('cod');

  const [submitting, setSubmitting] = useState(false);
  const [locatingUser, setLocatingUser] = useState(true);
  const [enableScroll, setEnableScroll] = useState(true);

  // ✨ NEW STATE FOR NO-SHOW PENALTY
  const [penaltyBalance, setPenaltyBalance] = useState(0);

  // Dynamic Delivery Fee States
  const [baseDeliveryFee, setBaseDeliveryFee] = useState(50.00);
  const [baseDistanceKm, setBaseDistanceKm] = useState(1.5);
  const [excessFeePerKm, setExcessFeePerKm] = useState(10.0);
  const [adminCenter, setAdminCenter] = useState({
    lat: 10.2021,
    lng: 122.8613,
  });
  const [maxRadiusKm, setMaxRadiusKm] = useState(15);
  const [storeCoordsMap, setStoreCoordsMap] = useState({});
  const [appCommissionRate, setAppCommissionRate] = useState(0.30);
  // Minimum subtotal (items only, excludes delivery fee) set by admin
  const [minimumCheckout, setMinimumCheckout] = useState(0);

  // Success Modal
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [checkoutAlert, setCheckoutAlert] = useState(null);

  const showCheckoutAlert = useCallback(
    (title, message, buttons) => {
      setCheckoutAlert({
        title,
        message,
        buttons: buttons?.length ? buttons : [{ text: 'OK' }],
      });
    },
    []
  );

  const locationSubscription = useRef(null);
  const paymentProcessed = useRef(false);

  const pendingOrderIds = useRef([]);

  // ✨ FETCH PENALTY BALANCE
  useEffect(() => {
    const fetchPenalty = async () => {
      try {
        let userId = profile?.id;
        if (!userId) {
          const { data: { session } } = await supabase.auth.getSession();
          userId = session?.user?.id;
        }

        if (userId) {
          const { data } = await supabase
            .from('profiles')
            .select('outstanding_penalty')
            .eq('id', userId)
            .single();

          if (data && data.outstanding_penalty > 0) {
            setPenaltyBalance(Number(data.outstanding_penalty));
            setPaymentMethod('online');
          }
        }
      } catch (err) {
        console.error('Error fetching penalty:', err);
      }
    };

    fetchPenalty();
  }, [profile?.id]);

  // Fetch dynamic admin configuration
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data } = await supabase
          .from('settings')
          .select('key, value');

        if (data) {
          const cMap = {};

          data.forEach((s) => {
            cMap[s.key] = s.value;
          });

          setBaseDeliveryFee(
            parseFloat(cMap['delivery_fee_amount']) || 50
          );

          setBaseDistanceKm(
            parseFloat(cMap['delivery_fee_base_distance_km']) || 1.5
          );

          setExcessFeePerKm(
            parseFloat(cMap['delivery_fee_per_excess_km']) || 10
          );

          setMaxRadiusKm(
            parseFloat(cMap['perimeter_radius_km']) || 15
          );

          setAdminCenter({
            lat: parseFloat(cMap['perimeter_lat']) || 10.2021,
            lng: parseFloat(cMap['perimeter_lng']) || 122.8613,
          });

          setAppCommissionRate(
            parseFloat(cMap['platform_commission_rate']) || 0.30
          );

          setMinimumCheckout(
            Math.max(0, parseFloat(cMap['minimum_checkout_amount']) || 0)
          );
        }
      } catch (err) {}
    };

    fetchConfig();
  }, []);

  const groupedItemsByStore = itemsToCheckout.reduce((acc, item) => {
    const storeKey =
      item.store_id ||
      item.storeId ||
      item.vendor_id ||
      item.owner_id ||
      'unassigned';

    if (!acc[storeKey]) {
      acc[storeKey] = {
        storeId: storeKey,
        storeName:
          item.store_name ||
          item.storeName ||
          item.store?.name ||
          'Store Merchant',
        items: [],
      };
    }

    acc[storeKey].items.push(item);

    return acc;
  }, {});

  const storeGroups = Object.values(groupedItemsByStore);

  // Fetch store coordinates
  useEffect(() => {
    const fetchStores = async () => {
      const storeKeys = Object.keys(groupedItemsByStore).filter(
        (k) => k !== 'unassigned'
      );

      if (storeKeys.length === 0) return;

      const { data } = await supabase
        .from('stores')
        .select('id, owner_id, lat, lng, latitude, longitude');

      if (data) {
        const map = {};

        data.forEach((s) => {
          const coords = {
            lat: Number(s.lat || s.latitude),
            lng: Number(s.lng || s.longitude),
          };

          if (coords.lat && coords.lng) {
            map[s.id] = coords;

            if (s.owner_id) {
              map[s.owner_id] = coords;
            }
          }
        });

        setStoreCoordsMap(map);
      }
    };

    fetchStores();
  }, []);

  // Remove abandoned awaiting_payment orders
  useFocusEffect(
    useCallback(() => {
      const clearAbandonedOrders = async () => {
        try {
          let userId = profile?.id;

          if (!userId) {
            const {
              data: { session },
            } = await supabase.auth.getSession();

            userId = session?.user?.id;
          }

          if (userId) {
            const { data: unpaidOrders } = await supabase
              .from('orders')
              .select('id')
              .eq('customer_id', userId)
              .eq('status', 'awaiting_payment');

            if (unpaidOrders && unpaidOrders.length > 0) {
              const orderIds = unpaidOrders.map((o) => o.id);

              await supabase
                .from('delivery_requests')
                .delete()
                .in('order_id', orderIds);

              await supabase
                .from('orders')
                .delete()
                .in('id', orderIds);

              console.log(
                'Abandoned checkout wiped clean on return:',
                orderIds
              );
            }
          }
        } catch (err) {
          console.error(
            'Failed to clear abandoned orders on focus:',
            err
          );
        }
      };

      clearAbandonedOrders();
    }, [profile?.id])
  );

  const subtotal = itemsToCheckout.reduce(
    (sum, item) =>
      sum +
      (parseFloat(item.price) || 0) *
        (item.quantity || 1),
    0
  );

  // Minimum checkout check (subtotal only, no delivery fee / penalty)
  const belowMinimum = minimumCheckout > 0 && subtotal < minimumCheckout;
  const minimumShortfall = Math.max(0, minimumCheckout - subtotal);

  // Calculate delivery fees
  const calculatedFees = useMemo(() => {
    let totalFee = 0;
    const feesMap = {};

    storeGroups.forEach((group) => {
      let fee = baseDeliveryFee;

      if (userLocation) {
        const coords =
          storeCoordsMap[group.storeId] || adminCenter;

        const dist = calculateDistanceKm(
          coords.lat,
          coords.lng,
          userLocation.lat,
          userLocation.lng
        );

        if (dist > baseDistanceKm) {
          fee +=
            (dist - baseDistanceKm) *
            excessFeePerKm;
        }
      }

      const roundedFee =
        Math.round(fee * 100) / 100;

      feesMap[group.storeId] = roundedFee;
      totalFee += roundedFee;
    });

    return {
      totalFee,
      feesMap,
    };
  }, [
    userLocation,
    storeGroups,
    storeCoordsMap,
    baseDeliveryFee,
    baseDistanceKm,
    excessFeePerKm,
    adminCenter,
  ]);

  const totalDeliveryFee = calculatedFees.totalFee;

  // ✨ INTEGRATE PENALTY INTO GRAND TOTAL
  const grandTotal = subtotal + totalDeliveryFee + penaltyBalance;

  const fetchReadableAddress = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        {
          headers: {
            'User-Agent': 'PaabotApp/1.0',
          },
        }
      );

      const data = await response.json();

      if (data && data.display_name) {
        return data.display_name
          .split(',')
          .slice(0, 3)
          .join(',')
          .trim();
      }
    } catch (error) {}

    return `Drop-off Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  };

  const startRealtimeTracking = async () => {
    try {
      setLocatingUser(true);

      const { status } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        showCheckoutAlert(
          'Permission Denied',
          'Please enable location permissions.'
        );

        setLocationMode('saved');
        setLocatingUser(false);

        return;
      }

      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }

      locationSubscription.current =
        await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 3000,
            distanceInterval: 5,
          },
          async (location) => {
            const newCoords = {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
            };

            setUserLocation(newCoords);

            const liveArea =
              await fetchReadableAddress(
                newCoords.lat,
                newCoords.lng
              );

            setDeliveryAddress(
              `(Live) ${liveArea}`
            );

            setLocatingUser(false);
          }
        );
    } catch (error) {
      showCheckoutAlert(
        'Location Error',
        'Could not acquire location.'
      );

      setLocatingUser(false);
    }
  };

  const fetchSavedLocation = async () => {
    try {
      setLocatingUser(true);
      setLiveStreetDetails('');

      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      let userId = profile?.id;

      if (!userId) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        userId = session?.user?.id;
      }

      if (userId) {
        const { data, error } = await supabase
          .from('profiles')
          .select(
            'current_lat, current_lng, address_details'
          )
          .eq('id', userId)
          .single();

        if (
          !error &&
          data &&
          data.current_lat &&
          data.current_lng
        ) {
          const coords = {
            lat: data.current_lat,
            lng: data.current_lng,
          };

          setUserLocation(coords);

          const baseArea =
            await fetchReadableAddress(
              coords.lat,
              coords.lng
            );

          const fullAddress =
            data.address_details
              ? `${data.address_details}, ${baseArea}`
              : baseArea;

          setDeliveryAddress(fullAddress);
        } else {
          setUserLocation(null);

          setDeliveryAddress(
            'No saved location. Tap "Change" or select Live GPS.'
          );
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLocatingUser(false);
    }
  };

  useEffect(() => {
    if (locationMode === 'saved') {
      fetchSavedLocation();
    } else if (locationMode === 'live') {
      startRealtimeTracking();
    }

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, [locationMode, profile?.id]);

  useEffect(() => {
    const handleSuccessRedirect = async () => {
      if (!paymentProcessed.current) {
        paymentProcessed.current = true;

        try {
          const savedIds = await AsyncStorage.getItem('pending_checkout_orders');
          const savedAmount = await AsyncStorage.getItem('pending_checkout_amount');

          const orderIds = savedIds ? JSON.parse(savedIds) : pendingOrderIds.current;
          const amountToLog = savedAmount ? parseFloat(savedAmount) : grandTotal;

          if (orderIds && orderIds.length > 0) {
            
            // 🌟 1. INSTANTLY SHOW YOUR SUCCESS MODAL & CLEAR CART
            if (typeof clearCart === 'function') {
              clearCart();
            }
            setSuccessModalVisible(true);

            console.log('✅ Payment success! Updating orders to pending:', orderIds);

            // 🌟 2. BACKGROUND TASKS
            await supabase.from('orders').update({ status: 'pending' }).in('id', orderIds);
            await supabase.from('delivery_requests').update({ status: 'pending' }).in('order_id', orderIds);

            // Send Store SMS safely once on return
            try {
              const { data: fetchedOrders } = await supabase.from('orders').select('store_id').in('id', orderIds);
              if (fetchedOrders && fetchedOrders.length > 0) {
                const uniqueStoreIds = [...new Set(fetchedOrders.map(o => o.store_id).filter(Boolean))];
                if (uniqueStoreIds.length > 0) {
                  const { data: storesData } = await supabase.from('stores').select('phone').in('id', uniqueStoreIds);
                  if (storesData && storesData.length > 0) {
                    const customerName = profile?.full_name || 'A customer';
                    for (const store of storesData) {
                      if (store.phone) {
                        supabase.functions.invoke('notify-store', {
                          body: { phone: store.phone, customerName }
                        }).catch(e => {});
                      }
                    }
                  }
                }
              }
            } catch (smsErr) {}

            // Log Transaction
            await supabase.from('paymongo_transactions').insert([{
              paymongo_event_id: `manual_log_${Date.now()}`,
              checkout_session_id: orderIds[0],
              amount: amountToLog,
              status: 'paid',
              payment_method_used: 'online',
              customer_email: profile?.email || 'customer@paabot.com',
              raw_payload: {
                source: 'mobile_app_direct_log',
                order_ids: orderIds,
              },
            }]);

            // Clear Penalty if applicable
            if (penaltyBalance > 0) {
              let userId = profile?.id;
              if (!userId) {
                const { data: { session } } = await supabase.auth.getSession();
                userId = session?.user?.id;
              }
              if (userId) {
                await supabase.rpc('clear_user_penalty', { target_user_id: userId });
                await supabase.from('orders').update({ penalty_paid: true }).eq('customer_id', userId).eq('status', 'cancelled').or('penalty_paid.is.null,penalty_paid.eq.false');
                await supabase.from('delivery_requests').update({ penalty_paid: true }).eq('customer_id', userId).eq('status', 'cancelled').or('penalty_paid.is.null,penalty_paid.eq.false');
              }
            }

            // Clear Cache
            await AsyncStorage.removeItem('pending_checkout_orders');
            await AsyncStorage.removeItem('pending_checkout_amount');
          } else {
            paymentProcessed.current = false;
          }
        } catch (logErr) {
          console.error('Failed to log transaction:', logErr);
        }
      }
    };

    const cleanupCancelledOrders = async () => {
      try {
        const savedIds = await AsyncStorage.getItem('pending_checkout_orders');
        const orderIds = savedIds ? JSON.parse(savedIds) : pendingOrderIds.current;

        if (orderIds && orderIds.length > 0) {
          await supabase.from('delivery_requests').delete().in('order_id', orderIds);
          await supabase.from('orders').delete().in('id', orderIds);
          pendingOrderIds.current = [];
          await AsyncStorage.removeItem('pending_checkout_orders');
          await AsyncStorage.removeItem('pending_checkout_amount');
          return true; 
        }
        return false;
      } catch (e) {
        console.error('Failed to cleanup cancelled order', e);
        return false;
      }
    };

    const handleDeepLink = async (event) => {
      if (event?.url?.includes('order-success')) {
        handleSuccessRedirect();
      } else if (event?.url?.includes('checkout-cancelled')) {
        const didCleanup = await cleanupCancelledOrders();
        if (didCleanup) {
          showCheckoutAlert('Payment Cancelled', 'You cancelled the payment. No order was placed.');
        }
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    Linking.getInitialURL()
      .then(async (url) => {
        if (url?.includes('order-success')) {
          handleSuccessRedirect();
        } else if (url?.includes('checkout-cancelled')) {
          const didCleanup = await cleanupCancelledOrders();
          if (didCleanup) {
            showCheckoutAlert('Payment Cancelled', 'You cancelled the payment. No order was placed.');
          }
        }
      })
      .catch((err) => console.error('Failed to get initial URL:', err));

    return () => {
      subscription.remove();
    };
  }, [navigation, grandTotal, profile, penaltyBalance, showCheckoutAlert]);

  const handlePlaceOrder = async () => {
    if (!userLocation) {
      showCheckoutAlert(
        'Missing Location',
        'Please provide a valid delivery address before placing your order.'
      );
      return;
    }

    if (itemsToCheckout.length === 0) {
      showCheckoutAlert(
        'Empty Order',
        'No items found for checkout.'
      );
      return;
    }

    if (belowMinimum) {
      showCheckoutAlert(
        'Minimum Order Not Met',
        `The minimum order is ₱${minimumCheckout.toFixed(2)} (delivery fee not included). Please add ₱${minimumShortfall.toFixed(2)} more worth of items.`
      );
      return;
    }

    setSubmitting(true);

    try {
      const distanceToHub =
        calculateDistanceKm(
          adminCenter.lat,
          adminCenter.lng,
          userLocation.lat,
          userLocation.lng
        );

      if (distanceToHub > maxRadiusKm) {
        setSubmitting(false);

        showCheckoutAlert(
          'Out of Service Range',
          `Sorry! Your delivery address is approximately ${distanceToHub.toFixed(
            1
          )} km away. We only deliver within a ${maxRadiusKm} km radius from our hub.`
        );

        return;
      }

      let finalDeliveryAddress =
        deliveryAddress;

      if (locationMode === 'live') {
        const cleanBaseAddress =
          deliveryAddress.replace(
            '(Live) ',
            ''
          );

        if (liveStreetDetails.trim()) {
          finalDeliveryAddress = `${liveStreetDetails.trim()}, ${cleanBaseAddress}`;
        } else {
          finalDeliveryAddress =
            cleanBaseAddress;
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const customerUserId =
        profile?.id || user?.id;

      const createdOrderIds = [];

      const initialStatus =
        paymentMethod === 'cod'
          ? 'pending'
          : 'awaiting_payment';

      let remainingPenaltyToAllocate = penaltyBalance;

      for (const group of storeGroups) {
        const rawStoreKey = group.storeId;

        let currentStoreId = null;
        let storeOwnerId = null;
        let storeName = group.storeName;

        let storeAddress =
          'Store Merchant Location';

        let storeCoords = {
          lat: userLocation.lat,
          lng: userLocation.lng,
        };
        
        let storePhone = null;

        if (
          rawStoreKey &&
          rawStoreKey !== 'unassigned'
        ) {
          const { data: storeData } =
            await supabase
              .from('stores')
              .select('*')
              .eq('id', rawStoreKey)
              .maybeSingle();

          if (storeData) {
            currentStoreId = storeData.id;

            storeOwnerId =
              storeData.owner_id ||
              storeData.user_id ||
              storeData.vendor_id;

            storeName =
              storeData.name || storeName;

            storeAddress =
              storeData.address ||
              storeName;
              
            storePhone = storeData.phone;

            if (
              storeData.lat &&
              storeData.lng
            ) {
              storeCoords = {
                lat: Number(storeData.lat),
                lng: Number(storeData.lng),
              };
            } else if (
              storeData.latitude &&
              storeData.longitude
            ) {
              storeCoords = {
                lat: Number(
                  storeData.latitude
                ),
                lng: Number(
                  storeData.longitude
                ),
              };
            }
          } else {
            const {
              data: fallbackStore,
            } = await supabase
              .from('stores')
              .select('*')
              .eq('owner_id', rawStoreKey)
              .maybeSingle();

            if (fallbackStore) {
              currentStoreId =
                fallbackStore.id;

              storeOwnerId =
                fallbackStore.owner_id;

              storeName =
                fallbackStore.name ||
                storeName;

              storeAddress =
                fallbackStore.address ||
                storeName;
                
              storePhone = fallbackStore.phone;

              if (
                fallbackStore.lat &&
                fallbackStore.lng
              ) {
                storeCoords = {
                  lat: Number(
                    fallbackStore.lat
                  ),
                  lng: Number(
                    fallbackStore.lng
                  ),
                };
              }
            } else {
              currentStoreId = rawStoreKey;
            }
          }
        }

        const storeSubtotal =
          group.items.reduce(
            (sum, item) =>
              sum +
              (parseFloat(item.price) ||
                0) *
                (item.quantity || 1),
            0
          );

        const storeDeliveryFee =
          calculatedFees.feesMap[
            rawStoreKey
          ] || baseDeliveryFee;

        let penaltyAppliedHere = 0;
        if (remainingPenaltyToAllocate > 0) {
          penaltyAppliedHere = remainingPenaltyToAllocate;
          remainingPenaltyToAllocate = 0;
        }

        const storeTotalAmount =
          storeSubtotal +
          storeDeliveryFee +
          penaltyAppliedHere;

        const safeDeliveryFee =
          parseFloat(storeDeliveryFee) ||
          50.00;

        const safeCommissionRate =
          parseFloat(appCommissionRate) ||
          0.30;

        const frozenAppFee = Number(
          (
            safeDeliveryFee *
            safeCommissionRate
          ).toFixed(2)
        );

        const finalCalculatedDist =
          calculateDistanceKm(
            storeCoords.lat,
            storeCoords.lng,
            userLocation.lat,
            userLocation.lng
          );

        const itemsDescription =
          group.items
            .map(
              (i) =>
                `${i.quantity || 1}x ${i.name}`
            )
            .join(', ');

        const fullDescription =
          deliveryInstructions.trim()
            ? `${itemsDescription} | Note: ${deliveryInstructions.trim()}`
            : itemsDescription;

        const {
          data: newOrder,
          error: orderError,
        } = await supabase
          .from('orders')
          .insert([
            {
              customer_id:
                customerUserId,

              store_id:
                currentStoreId,

              vendor_id:
                storeOwnerId,

              items:
                group.items,

              description:
                fullDescription,

              status:
                initialStatus,

              payment_method:
                paymentMethod,

              subtotal:
                storeSubtotal,

              delivery_fee:
                storeDeliveryFee,

              app_fee:
                frozenAppFee,

              total_amount:
                storeTotalAmount,

              pickup_address:
                storeAddress,

              pickup_lat:
                storeCoords.lat,

              pickup_lng:
                storeCoords.lng,

              delivery_address:
                finalDeliveryAddress,

              delivery_lat:
                userLocation.lat,

              delivery_lng:
                userLocation.lng,

              delivery_instructions:
                deliveryInstructions.trim(),
            },
          ])
          .select()
          .single();

        if (orderError) {
          throw orderError;
        }

        createdOrderIds.push(
          newOrder.id
        );

        await supabase
          .from('delivery_requests')
          .insert([
            {
              order_id:
                newOrder.id,

              store_id:
                currentStoreId,

              customer_id:
                customerUserId,

              customer_name:
                profile?.full_name ||
                'Customer',

              customer_phone:
                profile?.phone || '',

              request_type:
                'store_order',

              status:
                initialStatus,

              payment_method:
                paymentMethod,

              item_description:
                itemsDescription,

              notes:
                deliveryInstructions.trim(),

              item_details:
                group.items.map(
                  (item) => ({
                    name: item.name,
                    qty:
                      item.quantity || 1,
                    price: item.price,
                  })
                ),

              pickup_address:
                storeAddress,

              pickup_lat:
                storeCoords.lat,

              pickup_lng:
                storeCoords.lng,

              dropoff_address:
                finalDeliveryAddress,

              dropoff_lat:
                userLocation.lat,

              dropoff_lng:
                userLocation.lng,

              distance_km:
                finalCalculatedDist.toFixed(
                  2
                ),

              subtotal:
                storeSubtotal,

              delivery_fee:
                storeDeliveryFee,

              app_fee:
                frozenAppFee,

              total_amount:
                storeTotalAmount,
            },
          ]);

        // ─── START SMS NOTIFICATION LOGIC FOR COD ───
        if (paymentMethod === 'cod') {
          console.log('🚀 Preparing to invoke notify-store Edge Function for COD...');
          try {
            if (storePhone) {
              const customerName = profile?.full_name || 'A customer';
              supabase.functions.invoke('notify-store', {
                body: { phone: storePhone, customerName }
              }).catch(e => console.log('❌ Edge Function Catch Error:', e));
            }
          } catch (err) {
            console.log('❌ Edge Function Sync Error:', err);
          }
        } else {
          console.log('⏳ Online Payment: Handled globally upon return.');
        }
        // ─── END SMS NOTIFICATION LOGIC ───
      }

      pendingOrderIds.current =
        createdOrderIds;

      await AsyncStorage.setItem(
        'pending_checkout_orders',
        JSON.stringify(
          createdOrderIds
        )
      );

      await AsyncStorage.setItem(
        'pending_checkout_amount',
        grandTotal.toString()
      );

      if (paymentMethod === 'online') {
        const dynamicReturnUrl =
          Linking.createURL(
            'order-success'
          );

        const cancelReturnUrl =
          Linking.createURL(
            'checkout-cancelled'
          );

        const payMongoAmount = Number(Number(grandTotal).toFixed(2));

        const checkoutUrl =
          await createPaymentLink(
            payMongoAmount,
            `Order ID: ${createdOrderIds[0]}`,
            dynamicReturnUrl,
            profile?.email,
            profile?.full_name,
            cancelReturnUrl
          );

        showCheckoutAlert(
          'Payment Required',
          'You will be securely redirected to Paymongo to complete your payment.',
          [
            {
              text: 'Open Paymongo',
              onPress: () =>
                Linking.openURL(
                  checkoutUrl
                ),
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: async () => {
                try {
                  const savedIds =
                    await AsyncStorage.getItem(
                      'pending_checkout_orders'
                    );

                  const orderIds =
                    savedIds
                      ? JSON.parse(
                          savedIds
                        )
                      : pendingOrderIds.current;

                  if (
                    orderIds &&
                    orderIds.length > 0
                  ) {
                    await supabase
                      .from(
                        'delivery_requests'
                      )
                      .delete()
                      .in(
                        'order_id',
                        orderIds
                      );

                    await supabase
                      .from('orders')
                      .delete()
                      .in(
                        'id',
                        orderIds
                      );

                    pendingOrderIds.current =
                      [];

                    await AsyncStorage.removeItem(
                      'pending_checkout_orders'
                    );

                    await AsyncStorage.removeItem(
                      'pending_checkout_amount'
                    );
                  }
                } catch (e) {}
              },
            },
          ]
        );
      } else {
        if (
          typeof clearCart ===
          'function'
        ) {
          clearCart();
        }

        setSuccessModalVisible(true);
      }
    } catch (err) {
      console.error(
        'Checkout error:',
        err
      );

      showCheckoutAlert(
        'Error',
        err.message ||
          'An error occurred while submitting your order.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const alertTitleLower = String(checkoutAlert?.title || '').toLowerCase();
  const isCheckoutAlertWarning = /error|denied|missing|empty|disabled|minimum|range/.test(
    alertTitleLower
  );
  const checkoutAlertIcon =
    alertTitleLower === 'payment required'
      ? 'card-outline'
      : isCheckoutAlertWarning
        ? 'alert-circle-outline'
        : 'information-circle-outline';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#059669"
      />

      {/* Header */}
      <LinearGradient
        colors={[
          '#047857',
          '#059669',
          '#10B981',
        ]}
        style={styles.headerGradient}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() =>
              navigation.goBack()
            }
            style={styles.backBtn}
            activeOpacity={0.8}
          >
            <Ionicons
              name="arrow-back"
              size={21}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          <View style={styles.headerTextContainer}>
            <Text style={styles.title}>
              Checkout
            </Text>

            <Text
              style={styles.headerSubtitle}
            >
              Review your order before placing it
            </Text>
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <ScrollView
          showsVerticalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.scrollContent
          }
          scrollEnabled={
            enableScroll
          }
        >
          {/* Map */}
          <View
            style={styles.mapSection}
            onTouchStart={() =>
              setEnableScroll(false)
            }
            onTouchEnd={() =>
              setEnableScroll(true)
            }
            onTouchCancel={() =>
              setEnableScroll(true)
            }
          >
            <View style={styles.mapHeader}>
              <View>
                <Text style={styles.mapTitle}>
                  Delivery Location
                </Text>

                <Text
                  style={
                    styles.mapSubtitle
                  }
                >
                  Confirm where your order should be delivered
                </Text>
              </View>

              <View style={styles.mapIcon}>
                <Ionicons
                  name="location-outline"
                  size={18}
                  color="#059669"
                />
              </View>
            </View>

            <View style={styles.mapCard}>
              <OsmMap
                center={
                  userLocation || {
                    lat: 10.32,
                    lng: 123.89,
                  }
                }
                zoom={16}
                markers={[
                  userLocation && {
                    lat: userLocation.lat,
                    lng: userLocation.lng,
                    label: 'Delivery Point',
                  },
                ].filter(Boolean)}
              />

              {locatingUser && (
                <View
                  style={
                    styles.loadingOverlay
                  }
                >
                  <ActivityIndicator
                    size="small"
                    color="#059669"
                  />

                  <Text
                    style={
                      styles.loadingText
                    }
                  >
                    Finding your location...
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.mainCard}>

            {/* ✨ PENALTY BANNER */}
            {penaltyBalance > 0 && (
              <View
                style={{
                  backgroundColor: '#FEF2F2',
                  padding: 12,
                  borderRadius: 12,
                  marginBottom: 15,
                  borderWidth: 1,
                  borderColor: '#FCA5A5',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 4,
                  }}
                >
                  <Ionicons
                    name="warning"
                    size={16}
                    color="#DC2626"
                  />

                  <Text
                    style={{
                      color: '#DC2626',
                      fontWeight: '800',
                      marginLeft: 6,
                      fontSize: 12.5,
                    }}
                  >
                    Outstanding Balance Detected
                  </Text>
                </View>

                <Text
                  style={{
                    color: '#991B1B',
                    fontSize: 11.5,
                    lineHeight: 16,
                  }}
                >
                  You missed a previous COD delivery. A ₱{penaltyBalance.toFixed(2)} penalty has been added to your total. Cash on Delivery is temporarily disabled.
                </Text>
              </View>
            )}

            {/* Delivery Destination */}
            <View
              style={
                styles.sectionHeaderRow
              }
            >
              <View
                style={
                  styles.sectionTitleGroup
                }
              >
                <View
                  style={
                    styles.sectionIcon
                  }
                >
                  <Ionicons
                    name="location-outline"
                    size={17}
                    color="#059669"
                  />
                </View>

                <View
                  style={
                    styles.sectionTitleContainer
                  }
                >
                  <Text
                    style={
                      styles.sectionTitle
                    }
                  >
                    Delivery Destination
                  </Text>

                  <Text
                    style={
                      styles.sectionSubtitle
                    }
                  >
                    Where should we deliver your order?
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() =>
                  navigation.navigate(
                    'SavedAddresses'
                  )
                }
                activeOpacity={0.7}
                style={
                  styles.changeButton
                }
              >
                <Text
                  style={
                    styles.changeAddressBtn
                  }
                >
                  Change
                </Text>
              </TouchableOpacity>
            </View>

            {/* Location Mode */}
            <View
              style={
                styles.modeToggleContainer
              }
            >
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  locationMode ===
                    'saved' &&
                    styles.modeBtnActive,
                ]}
                onPress={() =>
                  setLocationMode(
                    'saved'
                  )
                }
                activeOpacity={0.8}
              >
                <Ionicons
                  name="bookmark-outline"
                  size={16}
                  color={
                    locationMode ===
                    'saved'
                      ? '#FFFFFF'
                      : '#6B7280'
                  }
                />

                <Text
                  style={[
                    styles.modeBtnText,
                    locationMode ===
                      'saved' &&
                      styles.modeBtnTextActive,
                  ]}
                >
                  Saved Address
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  locationMode ===
                    'live' &&
                    styles.modeBtnActive,
                ]}
                onPress={() =>
                  setLocationMode(
                    'live'
                  )
                }
                activeOpacity={0.8}
              >
                <Ionicons
                  name="navigate-outline"
                  size={16}
                  color={
                    locationMode ===
                    'live'
                      ? '#FFFFFF'
                      : '#6B7280'
                  }
                />

                <Text
                  style={[
                    styles.modeBtnText,
                    locationMode ===
                      'live' &&
                      styles.modeBtnTextActive,
                  ]}
                >
                  Live GPS
                </Text>
              </TouchableOpacity>
            </View>

            {/* Address */}
            <View
              style={[
                styles.addressCard,
                !userLocation &&
                  styles.addressCardError,
              ]}
            >
              <View
                style={[
                  styles.addressIcon,
                  !userLocation &&
                    styles.addressIconError,
                ]}
              >
                <Ionicons
                  name={
                    userLocation
                      ? 'location-sharp'
                      : 'alert-circle-outline'
                  }
                  size={17}
                  color={
                    userLocation
                      ? '#059669'
                      : '#DC2626'
                  }
                />
              </View>

              <View
                style={
                  styles.addressTextContainer
                }
              >
                <Text
                  style={
                    styles.addressLabel
                  }
                >
                  Delivery address
                </Text>

                <Text
                  style={[
                    styles.addressText,
                    !userLocation &&
                      styles.addressTextError,
                  ]}
                  numberOfLines={3}
                >
                  {deliveryAddress}
                </Text>
              </View>
            </View>

            {/* Live GPS Details */}
            {locationMode ===
              'live' &&
              userLocation && (
                <View
                  style={
                    styles.inputSpacing
                  }
                >
                  <Input
                    label="Street, Building or Landmark (Optional)"
                    value={
                      liveStreetDetails
                    }
                    onChangeText={
                      setLiveStreetDetails
                    }
                    placeholder="e.g. Blk 3 Lot 4, Near Clubhouse"
                  />
                </View>
              )}

            <View
              style={styles.divider}
            />

            {/* Order Breakdown */}
            <View
              style={
                styles.sectionTitleGroup
              }
            >
              <View
                style={styles.sectionIcon}
              >
                <Ionicons
                  name="basket-outline"
                  size={17}
                  color="#059669"
                />
              </View>

              <View
                style={
                  styles.sectionTitleContainer
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Your Order
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  {storeGroups.length}{' '}
                  store
                  {storeGroups.length >
                  1
                    ? 's'
                    : ''}
                </Text>
              </View>
            </View>

            {storeGroups.map(
              (group, gIndex) => (
                <View
                  key={gIndex}
                  style={
                    styles.storeGroupCard
                  }
                >
                  <View
                    style={
                      styles.storeHeader
                    }
                  >
                    <View
                      style={
                        styles.storeIcon
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
                        styles.storeHeaderText
                      }
                      numberOfLines={2}
                    >
                      {group.storeName}
                    </Text>
                  </View>

                  {group.items.map(
                    (item, index) => (
                      <View
                        key={index}
                        style={
                          styles.itemRow
                        }
                      >
                        {item.image_url ? (
                          <Image
                            source={{
                              uri: item.image_url,
                            }}
                            style={
                              styles.itemImage
                            }
                          />
                        ) : (
                          <View
                            style={
                              styles.itemPlaceholder
                            }
                          >
                            <Ionicons
                              name="fast-food-outline"
                              size={19}
                              color="#9CA3AF"
                            />
                          </View>
                        )}

                        <View
                          style={
                            styles.itemInfo
                          }
                        >
                          <Text
                            style={
                              styles.itemName
                            }
                            numberOfLines={2}
                          >
                            {item.name}
                          </Text>

                          <Text
                            style={
                              styles.itemQty
                            }
                          >
                            Qty: {item.quantity || 1}
                          </Text>
                        </View>

                        <Text
                          style={
                            styles.itemPrice
                          }
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={
                            0.7
                          }
                        >
                          ₱
                          {(
                            parseFloat(
                              item.price ||
                                0
                            ) *
                            (item.quantity ||
                              1)
                          ).toFixed(2)}
                        </Text>
                      </View>
                    )
                  )}
                </View>
              )
            )}

            {/* Delivery Instructions */}
            <View
              style={
                styles.inputSpacing
              }
            >
              <Input
                label="Delivery Instructions (Optional)"
                value={
                  deliveryInstructions
                }
                onChangeText={
                  setDeliveryInstructions
                }
                placeholder="e.g. Leave at front door, call upon arrival"
                multiline
              />
            </View>

            <View
              style={styles.divider}
            />

            {/* Payment Method */}
            <View
              style={
                styles.sectionTitleGroup
              }
            >
              <View
                style={styles.sectionIcon}
              >
                <Ionicons
                  name="card-outline"
                  size={17}
                  color="#059669"
                />
              </View>

              <View
                style={
                  styles.sectionTitleContainer
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Payment Method
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Choose how you want to pay
                </Text>
              </View>
            </View>

            <View
              style={
                styles.paymentMethodContainer
              }
            >
              {/* COD */}
              <TouchableOpacity
                style={[
                  styles.radioOption,
                  paymentMethod ===
                    'cod' &&
                    styles.radioOptionSelected,
                  penaltyBalance > 0 && {
                    opacity: 0.5,
                  },
                ]}
                onPress={() => {
                  if (penaltyBalance > 0) {
                    showCheckoutAlert(
                      'COD Disabled',
                      'Please pay via GCash/Card to clear your outstanding penalty.'
                    );
                    return;
                  }

                  setPaymentMethod('cod');
                }}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.paymentIcon,
                    paymentMethod ===
                      'cod' &&
                      styles.paymentIconActive,
                  ]}
                >
                  <Ionicons
                    name="cash-outline"
                    size={19}
                    color={
                      paymentMethod ===
                      'cod'
                        ? '#059669'
                        : '#6B7280'
                    }
                  />
                </View>

                <View
                  style={
                    styles.paymentTextContainer
                  }
                >
                  <Text
                    style={
                      styles.radioText
                    }
                  >
                    Cash on Delivery
                  </Text>

                  <Text
                    style={
                      styles.paymentSubtext
                    }
                  >
                    Pay when your order arrives
                  </Text>
                </View>

                <Ionicons
                  name={
                    paymentMethod ===
                    'cod'
                      ? 'radio-button-on'
                      : 'radio-button-off'
                  }
                  size={21}
                  color={
                    paymentMethod ===
                    'cod'
                      ? '#059669'
                      : '#B0B7B3'
                  }
                />
              </TouchableOpacity>

              {/* Online */}
              <TouchableOpacity
                style={[
                  styles.radioOption,
                  paymentMethod ===
                    'online' &&
                    styles.radioOptionSelected,
                ]}
                onPress={() =>
                  setPaymentMethod(
                    'online'
                  )
                }
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.paymentIcon,
                    paymentMethod ===
                      'online' &&
                      styles.paymentIconActive,
                  ]}
                >
                  <Ionicons
                    name="card-outline"
                    size={19}
                    color={
                      paymentMethod ===
                      'online'
                        ? '#059669'
                        : '#6B7280'
                    }
                  />
                </View>

                <View
                  style={
                    styles.paymentTextContainer
                  }
                >
                  <Text
                    style={
                      styles.radioText
                    }
                  >
                    GCash / PayMaya / Card
                  </Text>

                  <Text
                    style={
                      styles.paymentSubtext
                    }
                  >
                    Pay securely online
                  </Text>
                </View>

                <Ionicons
                  name={
                    paymentMethod ===
                    'online'
                      ? 'radio-button-on'
                      : 'radio-button-off'
                  }
                  size={21}
                  color={
                    paymentMethod ===
                    'online'
                      ? '#059669'
                      : '#B0B7B3'
                  }
                />
              </TouchableOpacity>
            </View>

            {/* Summary */}
            <View
              style={
                styles.summaryCard
              }
            >
              <Text
                style={
                  styles.summaryTitle
                }
              >
                Order Total
              </Text>

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
                  Subtotal
                </Text>

                <Text
                  style={
                    styles.summaryValue
                  }
                >
                  ₱
                  {subtotal.toFixed(
                    2
                  )}
                </Text>
              </View>

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
                  Delivery Fee
                </Text>

                <Text
                  style={
                    styles.summaryValue
                  }
                >
                  ₱
                  {totalDeliveryFee.toFixed(
                    2
                  )}
                </Text>
              </View>

              {/* ✨ PENALTY ROW */}
              {penaltyBalance > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    Previous Penalty
                  </Text>

                  <Text
                    style={[
                      styles.summaryValue,
                      { color: '#DC2626' },
                    ]}
                  >
                    ₱{penaltyBalance.toFixed(2)}
                  </Text>
                </View>
              )}

              <View
                style={
                  styles.summaryDivider
                }
              />

              <View
                style={
                  styles.grandTotalRow
                }
              >
                <View>
                  <Text
                    style={
                      styles.grandTotalLabel
                    }
                  >
                    Grand Total
                  </Text>

                  <Text
                    style={
                      styles.grandTotalSubtext
                    }
                  >
                    Final amount to pay
                  </Text>
                </View>

                <Text
                  style={
                    styles.grandTotalValue
                  }
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={
                    0.65
                  }
                >
                  ₱
                  {grandTotal.toFixed(
                    2
                  )}
                </Text>
              </View>
            </View>

            {/* Minimum checkout notice */}
            {belowMinimum && (
              <View
                style={{
                  backgroundColor: '#FFFBEB',
                  padding: 12,
                  borderRadius: 12,
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: '#FCD34D',
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="information-circle" size={18} color="#D97706" />
                <Text
                  style={{
                    color: '#92400E',
                    fontSize: 12,
                    lineHeight: 17,
                    marginLeft: 8,
                    flex: 1,
                  }}
                >
                  Minimum order is ₱{minimumCheckout.toFixed(2)} (delivery fee not included). Add ₱{minimumShortfall.toFixed(2)} more to place your order.
                </Text>
              </View>
            )}

            {/* Place Order */}
            <View
              style={
                styles.placeOrderContainer
              }
            >
              <Button
                title={
                  submitting
                    ? 'Processing Order...'
                    : `Place Order (₱${grandTotal.toFixed(
                        2
                      )})`
                }
                onPress={
                  handlePlaceOrder
                }
                loading={
                  submitting
                }
                disabled={
                  submitting ||
                  locatingUser ||
                  itemsToCheckout.length ===
                    0 ||
                  !userLocation ||
                  belowMinimum
                }
              />
            </View>

            <Text
              style={
                styles.bottomNote
              }
            >
              Please check your delivery address and order details before placing your order.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Checkout Alert */}
      <Modal
        visible={Boolean(checkoutAlert)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          const cancelButton = checkoutAlert?.buttons?.find(
            (button) => button.style === 'cancel'
          );

          setCheckoutAlert(null);
          cancelButton?.onPress?.();
        }}
      >
        <View style={styles.alertModalOverlay}>
          <View style={styles.alertModalCard}>
            <View
              style={[
                styles.alertModalIcon,
                isCheckoutAlertWarning &&
                  styles.alertModalIconWarning,
                alertTitleLower === 'payment required' &&
                  styles.alertModalIconPayment,
              ]}
            >
              <Ionicons
                name={checkoutAlertIcon}
                size={27}
                color={
                  isCheckoutAlertWarning
                    ? '#B86A08'
                    : '#087A55'
                }
              />
            </View>

            <Text style={styles.alertModalEyebrow}>
              CHECKOUT NOTICE
            </Text>

            <Text style={styles.alertModalTitle}>
              {checkoutAlert?.title}
            </Text>

            <Text style={styles.alertModalMessage}>
              {checkoutAlert?.message}
            </Text>

            <View style={styles.alertModalActions}>
              {(checkoutAlert?.buttons || []).map((button, index) => {
                const isCancel = button.style === 'cancel';

                return (
                  <TouchableOpacity
                    key={`${button.text}-${index}`}
                    style={[
                      styles.alertModalButton,
                      isCancel
                        ? styles.alertModalButtonSecondary
                        : styles.alertModalButtonPrimary,
                    ]}
                    activeOpacity={0.84}
                    onPress={() => {
                      setCheckoutAlert(null);
                      button.onPress?.();
                    }}
                  >
                    <Text
                      style={[
                        styles.alertModalButtonText,
                        isCancel
                          ? styles.alertModalButtonTextSecondary
                          : styles.alertModalButtonTextPrimary,
                      ]}
                    >
                      {button.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={
          successModalVisible
        }
        transparent={true}
        animationType="fade"
      >
        <View
          style={
            styles.modalOverlay
          }
        >
          <View
            style={
              styles.successModalCard
            }
          >
            <View
              style={
                styles.successIconCircle
              }
            >
              <Ionicons
                name="checkmark"
                size={36}
                color="#FFFFFF"
              />
            </View>

            <Text
              style={
                styles.successModalTitle
              }
            >
              Order Placed
            </Text>

            <Text
              style={
                styles.successModalSub
              }
            >
              Your order has been sent to the store. You can check its status in your order history.
            </Text>

            <TouchableOpacity
              style={
                styles.successModalSuccessBtn
              }
              activeOpacity={0.85}
              onPress={() => {
                setSuccessModalVisible(
                  false
                );

                try {
                  navigation.replace(
                    'OrderHistory'
                  );
                } catch (e) {
                  navigation.navigate(
                    'OrderHistory'
                  );
                }
              }}
            >
              <Text
                style={
                  styles.successModalBtnText
                }
              >
                View Order History
              </Text>

              <Ionicons
                name="arrow-forward"
                size={16}
                color="#FFFFFF"
                style={{
                  marginLeft: 6,
                }}
              />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F6',
  },

  /* Header */
  headerGradient: {
    paddingHorizontal: 18,
    paddingTop:
      Platform.OS === 'android'
        ? 12
        : 8,
    paddingBottom: 17,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    elevation: 4,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor:
      'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  headerTextContainer: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },

  headerSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 2,
  },

  /* Scroll */
  scrollContent: {
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 35,
  },

  /* Map Section */
  mapSection: {
    marginBottom: 15,
  },

  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
    paddingHorizontal: 2,
  },

  mapTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },

  mapSubtitle: {
    fontSize: 11,
    color: '#8A938E',
    marginTop: 2,
  },

  mapIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EAF7F1',
    alignItems: 'center',
    justifyContent: 'center',
  },

  mapCard: {
    height: 195,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E8E5',
    position: 'relative',
    elevation: 2,
  },

  loadingOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    elevation: 3,
  },

  loadingText: {
    marginLeft: 6,
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
  },

  /* Main Card */
  mainCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 17,
    borderWidth: 1,
    borderColor: '#E4E9E6',
    elevation: 2,
  },

  /* Section Headers */
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 13,
  },

  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginBottom: 11,
  },

  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#EAF7F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  sectionTitleContainer: {
    flex: 1,
    minWidth: 0,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },

  sectionSubtitle: {
    fontSize: 10.5,
    color: '#8A938E',
    marginTop: 2,
  },

  changeButton: {
    paddingVertical: 6,
    paddingHorizontal: 2,
  },

  changeAddressBtn: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#059669',
  },

  /* Location Mode */
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F4F2',
    borderRadius: 11,
    padding: 3,
    marginBottom: 12,
  },

  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
  },

  modeBtnActive: {
    backgroundColor: '#059669',
    elevation: 2,
  },

  modeBtnText: {
    marginLeft: 5,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#6B7280',
  },

  modeBtnTextActive: {
    color: '#FFFFFF',
  },

  /* Address */
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FAF6',
    borderWidth: 1,
    borderColor: '#C9EBDD',
    borderRadius: 13,
    padding: 11,
  },

  addressCardError: {
    backgroundColor: '#FEF4F4',
    borderColor: '#F3C4C4',
  },

  addressIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  addressIconError: {
    backgroundColor: '#FFFFFF',
  },

  addressTextContainer: {
    flex: 1,
    minWidth: 0,
  },

  addressLabel: {
    fontSize: 9.5,
    color: '#6B7280',
    fontWeight: '700',
    marginBottom: 2,
  },

  addressText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#14532D',
    fontWeight: '600',
  },

  addressTextError: {
    color: '#DC2626',
  },

  inputSpacing: {
    marginTop: 12,
    marginBottom: 4,
  },

  divider: {
    height: 1,
    backgroundColor: '#EEF1EF',
    marginVertical: 15,
  },

  /* Store Group */
  storeGroupCard: {
    backgroundColor: '#FAFBFA',
    borderWidth: 1,
    borderColor: '#E7EBE8',
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 10,
  },

  storeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 9,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEA',
  },

  storeIcon: {
    width: 29,
    height: 29,
    borderRadius: 8,
    backgroundColor: '#EAF7F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },

  storeHeaderText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1F2937',
    lineHeight: 17,
  },

  /* Items */
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },

  itemImage: {
    width: 45,
    height: 45,
    borderRadius: 10,
    resizeMode: 'cover',
    backgroundColor: '#EEF1EF',
  },

  itemPlaceholder: {
    width: 45,
    height: 45,
    borderRadius: 10,
    backgroundColor: '#EEF1EF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  itemInfo: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 10,
  },

  itemName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 17,
  },

  itemQty: {
    fontSize: 10.5,
    color: '#8A938E',
    marginTop: 3,
  },

  itemPrice: {
    maxWidth: 82,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#059669',
    textAlign: 'right',
  },

  /* Payment */
  paymentMethodContainer: {
    marginBottom: 4,
  },

  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    backgroundColor: '#FAFBFA',
    borderRadius: 13,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#E5E9E7',
  },

  radioOptionSelected: {
    backgroundColor: '#F0FAF6',
    borderColor: '#A9DFC9',
  },

  paymentIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EEF1EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  paymentIconActive: {
    backgroundColor: '#FFFFFF',
  },

  paymentTextContainer: {
    flex: 1,
    minWidth: 0,
  },

  radioText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#111827',
  },

  paymentSubtext: {
    fontSize: 10.5,
    color: '#8A938E',
    marginTop: 2,
  },

  /* Summary */
  summaryCard: {
    backgroundColor: '#F8FAF9',
    borderRadius: 14,
    padding: 14,
    marginTop: 5,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: '#E3E9E5',
  },

  summaryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 10,
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },

  summaryLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },

  summaryValue: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '700',
  },

  summaryDivider: {
    height: 1,
    backgroundColor: '#E1E7E3',
    marginVertical: 7,
  },

  grandTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  grandTotalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },

  grandTotalSubtext: {
    fontSize: 9.5,
    color: '#8A938E',
    marginTop: 2,
  },

  grandTotalValue: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
    textAlign: 'right',
    fontSize: 19,
    fontWeight: '900',
    color: '#059669',
  },

  /* Place Order */
  placeOrderContainer: {
    marginTop: 2,
  },

  bottomNote: {
    fontSize: 9.5,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 9,
    paddingHorizontal: 12,
  },

  /* Checkout Alert */
  alertModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(13, 35, 28, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  alertModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E1EAE4',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#10271E',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },

  alertModalIcon: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: '#E8F4EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },

  alertModalIconWarning: {
    backgroundColor: '#FFF2DB',
  },

  alertModalIconPayment: {
    backgroundColor: '#E4F3EA',
  },

  alertModalEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#688074',
    marginBottom: 4,
  },

  alertModalTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    color: '#18372A',
    textAlign: 'center',
  },

  alertModalMessage: {
    fontSize: 13,
    lineHeight: 20,
    color: '#65756C',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },

  alertModalActions: {
    width: '100%',
    gap: 9,
  },

  alertModalButton: {
    width: '100%',
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  alertModalButtonPrimary: {
    backgroundColor: '#087A55',
  },

  alertModalButtonSecondary: {
    backgroundColor: '#F3F6F4',
    borderWidth: 1,
    borderColor: '#DCE6E0',
  },

  alertModalButtonText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },

  alertModalButtonTextPrimary: {
    color: '#FFFFFF',
  },

  alertModalButtonTextSecondary: {
    color: '#42564A',
  },

  /* Success Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  successModalCard: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 25,
    paddingBottom: 22,
    alignItems: 'center',
    elevation: 10,
  },

  successIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },

  successModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 7,
  },

  successModalSub: {
    fontSize: 12.5,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 21,
    paddingHorizontal: 5,
  },

  successModalSuccessBtn: {
    width: '100%',
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingHorizontal: 15,
  },

  successModalBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});