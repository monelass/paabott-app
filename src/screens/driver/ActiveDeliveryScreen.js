import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  memo,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Linking,
  Platform,
  Modal,
  TextInput,
  StatusBar,
  Image,
} from 'react-native';

import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Camera, CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker'; 

import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';

import {
  updateDeliveryStatus,
  pingDriverLocation,
} from '../../services/deliveryService';

import OsmMap from '../../components/OsmMap';
import { colors } from '../../theme/colors';
import { distributeOrderFunds } from '../../services/financeService';

/* =========================================================
   STORE ORDER PROCESS
========================================================= */

const NEXT_STATUS = {
  accepted: 'picked_up',
  preparing: 'picked_up',
  ready_for_pickup: 'picked_up',
  picked_up: 'in_transit',
  in_transit: 'delivered',
};

const ACTION_LABEL = {
  accepted: 'Mark as Picked Up',
  preparing: 'Mark as Picked Up',
  ready_for_pickup: 'Mark as Picked Up',
  picked_up: 'Start In Transit',
  in_transit: 'Complete Delivery (Scan QR)',
};

/* =========================================================
   CUSTOM REQUEST PROCESS
========================================================= */

const CUSTOM_NEXT_STATUS = {
  accepted: 'picked_up',
  picked_up: 'in_transit',
  in_transit: 'delivered',
};

const CUSTOM_ACTION_LABEL = {
  accepted: 'Prepare the order',
  picked_up: 'Start In Transit',
  in_transit: 'Complete Delivery (Scan QR)',
};

/* =========================================================
   ETA
========================================================= */

const calculateETA = (
  lat1,
  lon1,
  lat2,
  lon2
) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) {
    return 0;
  }

  const R = 6371;

  const dLat =
    (lat2 - lat1) *
    (Math.PI / 180);

  const dLon =
    (lon2 - lon1) *
    (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) *
      Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  const straightDistanceKm = R * c;
  const roadMultiplier = 1.3;
  const actualDistanceKm =
    straightDistanceKm *
    roadMultiplier;

  const averageSpeedKmh = 25;

  const timeInHours =
    actualDistanceKm /
    averageSpeedKmh;

  const timeInMinutes = Math.ceil(
    timeInHours * 60
  );

  return Math.max(
    5,
    timeInMinutes + 5
  );
};

/* =========================================================
   PLATFORM COMMISSION
========================================================= */

const getPlatformCommissionRate =
  async () => {
    try {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq(
          'key',
          'platform_commission_rate'
        )
        .maybeSingle();

      if (data && data.value) {
        const parsedRate = Number(
          data.value
        );

        return isNaN(parsedRate)
          ? 0.10
          : parsedRate;
      }
    } catch (err) {}

    return 0.10;
  };

/* =========================================================
   CUSTOM REQUEST PARSER
========================================================= */

const parseCustomDescription = (job) => {
  if (!job) {
    return {
      type: 'Custom Request',
      details: 'General Item Request',
      cost: null,
      payment: 'Cash on Delivery (COD)',
      instructions: null,
    };
  }

  const rawText = job.item_description || job.description || '';
  let type = 'Custom Request';

  if (rawText.includes('PACKAGE PICKUP') || job.request_type === 'pickup_item') {
    type = 'Pakuha';
  } else if (rawText.includes('ITEM REQUEST') || job.request_type === 'request_item') {
    type = 'Pabakal';
  }

  let cost = job.estimated_budget;
  let instructions = job.notes;

  if (cost == null || cost === 0) {
    const costMatch = rawText.match(/ESTIMATED ITEM COST: ₱([0-9.]+)/);
    if (costMatch) {
      cost = costMatch[1];
    }
  }

  let payment = 'Cash on Delivery (COD)';
  const payMatch = rawText.match(/PAYMENT METHOD: ([^\n]+)/);
  if (payMatch) {
    payment = payMatch[1].trim();
  }

  if (!instructions) {
    const instMatch = rawText.match(/RIDER INSTRUCTIONS: ([^\n]+)/);
    if (instMatch) {
      instructions = instMatch[1].trim();
    }
  }

  let cleanDetails = rawText
    .replace(/\[(PACKAGE PICKUP|ITEM REQUEST|ESTIMATED ITEM COST:[^\]]+)\]/g, '')
    .replace(/💳 PAYMENT METHOD: [^\n]+/g, '')
    .replace(/RIDER INSTRUCTIONS: [^\n]+/g, '')
    .trim();

  return {
    type,
    details: cleanDetails || rawText,
    cost,
    payment,
    instructions,
  };
};

/* =========================================================
   MODERN POPUP
========================================================= */

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

/* =========================================================
   SCREEN
========================================================= */

export default function ActiveDeliveryScreen({
  route,
  navigation,
}) {
  const {
    deliveryId,
    deliveryData,
  } = route.params || {};

  const { profile } = useAuth();

  const [delivery, setDelivery] =
    useState(deliveryData || null);

  const [driverLoc, setDriverLoc] =
    useState(null);

  const [loadingAction, setLoadingAction] =
    useState(false);

  const [cancelling, setCancelling] =
    useState(false);

  const [reportingUnavailable, setReportingUnavailable] =
    useState(false);

  const [reportingPrank, setReportingPrank] = useState(false);

  const [showReasonModal, setShowReasonModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('unavailable');

  const [loading, setLoading] =
    useState(!deliveryData);

  const [liveEta, setLiveEta] =
    useState(
      deliveryData?.eta_minutes || 0
    );

  const watchRef = useRef(null);
  const deliveryRef = useRef(delivery);

  const [showScanner, setShowScanner] =
    useState(false);

  const [scanned, setScanned] =
    useState(false);

  const [
    exactPriceModal,
    setExactPriceModal,
  ] = useState(false);

  const [
    exactItemCost,
    setExactItemCost,
  ] = useState('');

  const [
    isPriceVerified,
    setIsPriceVerified,
  ] = useState(false);

  const [receiptImage, setReceiptImage] = useState(null);

  const [
    showCancelModal,
    setShowCancelModal,
  ] = useState(false);

  const [
    showCancelSuccessModal,
    setShowCancelSuccessModal,
  ] = useState(false);

  // 🌟 ROUTE LINE STATE
  const [routeCoordinates, setRouteCoordinates] = useState([]);

  // 🌟 MODERN POPUP STATE
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

  /* =======================================================
     COORDINATES
  ======================================================= */

  const pickupLat =
    Number(delivery?.pickup_lat) ||
    Number(delivery?.pickup?.lat) ||
    10.2021;

  const pickupLng =
    Number(delivery?.pickup_lng) ||
    Number(delivery?.pickup?.lng) ||
    122.8613;

  const pickupAddress =
    delivery?.pickup_address ||
    delivery?.pickup?.address ||
    (delivery?.request_type === 'custom' ? 'Pickup Location' : 'Store Location');

  const dropoffLat =
    Number(delivery?.dropoff_lat) ||
    Number(delivery?.delivery_lat) ||
    Number(delivery?.dropoff?.lat) ||
    10.2021;

  const dropoffLng =
    Number(delivery?.dropoff_lng) ||
    Number(delivery?.delivery_lng) ||
    Number(delivery?.dropoff?.lng) ||
    122.8613;

  const dropoffAddress =
    delivery?.delivery_address ||
    delivery?.dropoff_address ||
    delivery?.dropoff?.address ||
    'Customer Location';

  /* =======================================================
     ORDER TYPE CLASSIFICATION & CLEAN DATA
  ======================================================= */

  const isStoreOrder =
    delivery?.request_type === 'store_order' ||
    !!delivery?.order_id ||
    !!delivery?.store_id;

  const rawDesc = delivery?.item_description || delivery?.description || '';
  
  const isPackagePickup = rawDesc.includes('[PACKAGE PICKUP]') || delivery?.request_type === 'pickup_item';
  const isPabakal = !isStoreOrder && (rawDesc.includes('[ITEM REQUEST]') || delivery?.request_type === 'request_item');
  const showPickup = isStoreOrder || isPackagePickup;

  const customRequest = parseCustomDescription(delivery);

  /* =======================================================
     KEEP DELIVERY REF UPDATED
  ======================================================= */

  useEffect(() => {
    deliveryRef.current = delivery;
  }, [delivery]);

  /* =======================================================
     FETCH DELIVERY
  ======================================================= */

  const fetchDelivery =
    useCallback(async () => {
      if (
        !deliveryId ||
        deliveryId
          .toString()
          .startsWith('sample-job-')
      ) {
        setLoading(false);
        return;
      }

      try {
        let { data } =
          await supabase
            .from('delivery_requests')
            .select(
              '*, orders(status)'
            )
            .eq(
              'id',
              deliveryId
            )
            .maybeSingle();

        if (!data) {
          const {
            data: orderData,
          } = await supabase
            .from('orders')
            .select('*')
            .eq(
              'id',
              deliveryId
            )
            .maybeSingle();

          if (orderData) {
            data = {
              ...orderData,
              request_type:
                'store_order',
              delivery_address:
                orderData.delivery_address ||
                orderData.address,
              pickup_address:
                orderData.pickup_address ||
                'Store Location',
            };
          }
        }

        if (data) {
          if (data.customer_id) {
            const {
              data: customerProfile,
            } = await supabase
              .from('profiles')
              .select(
                'full_name, phone'
              )
              .eq(
                'id',
                data.customer_id
              )
              .maybeSingle();

            if (customerProfile) {
              data.customer_name =
                customerProfile.full_name;

              data.customer_phone =
                customerProfile.phone;
            }
          }

          if (data.store_id) {
            const {
              data: storeDetails,
            } = await supabase
              .from('stores')
              .select('name')
              .eq(
                'id',
                data.store_id
              )
              .maybeSingle();

            if (storeDetails) {
              data.store_name =
                storeDetails.name;
            }
          }

          setDelivery(data);
        }
      } catch (err) {
        console.error(
          'Error fetching active delivery:',
          err.message
        );
      } finally {
        setLoading(false);
      }
    }, [deliveryId]);

  /* =======================================================
     LIVE DRIVER LOCATION
  ======================================================= */

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const {
          status,
        } =
          await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          return;
        }

        watchRef.current =
          await Location.watchPositionAsync(
            {
              accuracy:
                Location.Accuracy.Highest,
              timeInterval: 3000,
              distanceInterval: 2,
            },
            (loc) => {
              if (!isMounted) return;

              const coords = {
                lat:
                  loc.coords.latitude,
                lng:
                  loc.coords.longitude,
              };

              setDriverLoc(coords);

              const currentDelivery =
                deliveryRef.current;

              const currentStatus = (
                currentDelivery?.status ||
                'accepted'
              ).toLowerCase();

              let newEta = 0;

              if (
                [
                  'accepted',
                  'preparing',
                  'ready_for_pickup',
                ].includes(
                  currentStatus
                )
              ) {
                newEta =
                  calculateETA(
                    coords.lat,
                    coords.lng,
                    pickupLat,
                    pickupLng
                  );
              } else if (
                [
                  'picked_up',
                  'in_transit',
                ].includes(
                  currentStatus
                )
              ) {
                newEta =
                  calculateETA(
                    coords.lat,
                    coords.lng,
                    dropoffLat,
                    dropoffLng
                  );
              }

              if (newEta > 0) {
                setLiveEta(newEta);

                if (
                  deliveryId &&
                  !deliveryId
                    .toString()
                    .startsWith(
                      'sample-job-'
                    )
                ) {
                  const isStoreOrderCheck =
                    currentDelivery?.request_type ===
                      'store_order' ||
                    !!currentDelivery?.order_id ||
                    !!currentDelivery?.store_id;

                  const targetOrderId =
                    currentDelivery?.order_id ||
                    (isStoreOrderCheck
                      ? currentDelivery?.id
                      : null);

                  if (
                    isStoreOrderCheck &&
                    targetOrderId
                  ) {
                    supabase
                      .from(
                        'delivery_requests'
                      )
                      .update({
                        eta_minutes:
                          newEta,
                      })
                      .eq(
                        'order_id',
                        targetOrderId
                      )
                      .then();
                  } else {
                    supabase
                      .from(
                        'delivery_requests'
                      )
                      .update({
                        eta_minutes:
                          newEta,
                      })
                      .eq(
                        'id',
                        deliveryId
                      )
                      .then();
                  }
                }
              }

              if (
                profile?.id &&
                deliveryId &&
                !deliveryId
                  .toString()
                  .startsWith(
                    'sample-job-'
                  )
              ) {
                pingDriverLocation(
                  profile.id,
                  coords.lat,
                  coords.lng
                );
              }
            }
          );
      } catch (error) {
        console.error(
          'Location tracking error:',
          error
        );
      }
    })();

    return () => {
      isMounted = false;

      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
    };
  }, [
    profile?.id,
    deliveryId,
    pickupLat,
    pickupLng,
    dropoffLat,
    dropoffLng,
  ]);

  /* =======================================================
     FETCH + REALTIME
  ======================================================= */

  useEffect(() => {
    fetchDelivery();

    let deliveryChannel;
    let orderChannel;

    if (
      deliveryId &&
      !deliveryId
        .toString()
        .startsWith('sample-job-')
    ) {
      deliveryChannel =
        supabase
          .channel(
            `delivery-${deliveryId}`
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table:
                'delivery_requests',
              filter:
                `id=eq.${deliveryId}`,
            },
            (payload) => {
              setDelivery(
                (prev) => ({
                  ...prev,
                  ...payload.new,
                })
              );
            }
          )
          .subscribe();
    }

    if (profile?.id) {
      orderChannel =
        supabase
          .channel(
            `active_delivery_order_${profile.id}`
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'orders',
              filter:
                `driver_id=eq.${profile.id}`,
            },
            (payload) => {
              const newStatus =
                payload.new.status;

              if (
                newStatus ===
                  'ready_for_pickup' &&
                deliveryRef.current?.status ===
                  'accepted'
              ) {
                showPopup({
                  type: 'success',
                  title: 'Order Ready!',
                  message: 'The store has finished preparing the order. It is ready for pickup!',
                  primaryText: 'Got it!',
                  onPrimary: closePopup
                });
              }

              setDelivery(
                (prev) => ({
                  ...prev,
                  orders: {
                    status:
                      newStatus,
                  },
                })
              );
            }
          )
          .subscribe();
    }

    return () => {
      if (deliveryChannel) {
        supabase.removeChannel(
          deliveryChannel
        );
      }

      if (orderChannel) {
        supabase.removeChannel(
          orderChannel
        );
      }
    };
  }, [
    deliveryId,
    fetchDelivery,
    profile?.id,
  ]);

  /* =======================================================
     ETA REFRESH
  ======================================================= */

  useEffect(() => {
    const currentStatus = (
      delivery?.status ||
      'accepted'
    ).toLowerCase();

    let newEta = 0;

    if (driverLoc) {
      if (
        [
          'accepted',
          'preparing',
          'ready_for_pickup',
        ].includes(
          currentStatus
        )
      ) {
        newEta =
          calculateETA(
            driverLoc.lat,
            driverLoc.lng,
            pickupLat,
            pickupLng
          );
      } else if (
        [
          'picked_up',
          'in_transit',
        ].includes(
          currentStatus
        )
      ) {
        newEta =
          calculateETA(
            driverLoc.lat,
            driverLoc.lng,
            dropoffLat,
            dropoffLng
          );
      }
    } else {
      newEta =
        delivery?.eta_minutes ||
        calculateETA(
          pickupLat,
          pickupLng,
          dropoffLat,
          dropoffLng
        );
    }

    if (newEta > 0) {
      setLiveEta(newEta);
    }
  }, [
    driverLoc,
    delivery?.status,
    pickupLat,
    pickupLng,
    dropoffLat,
    dropoffLng,
    delivery?.eta_minutes,
  ]);

  /* ======================================================= 
     🌟 FETCH ROUTE LINE (OSRM API)
  ======================================================= */ 
  useEffect(() => {
    if (!driverLoc?.lat || !driverLoc?.lng) return;

    const fetchRouteCoordinates = async () => {
      const statusCheck = (delivery?.status || 'accepted').toLowerCase();
      const isHeadingToDropoff = ['picked_up', 'in_transit'].includes(statusCheck);

      const targetLat = isHeadingToDropoff ? dropoffLat : pickupLat;
      const targetLng = isHeadingToDropoff ? dropoffLng : pickupLng;

      try {
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${driverLoc.lng},${driverLoc.lat};${targetLng},${targetLat}?geometries=geojson`
        );
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          const mappedCoords = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
          setRouteCoordinates(mappedCoords);
        }
      } catch (error) {
        console.error("Failed to fetch route line:", error);
      }
    };

    fetchRouteCoordinates();
  }, [delivery?.status, driverLoc?.lat, driverLoc?.lng, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  /* =======================================================
     CANCEL DELIVERY
  ======================================================= */

  const handleCancelDelivery = () => {
    setShowCancelModal(true);
  };

  const confirmCancelDelivery =
    async () => {
      if (!delivery) return;

      setCancelling(true);

      try {
        const isStoreOrderCheck =
          delivery.request_type ===
            'store_order' ||
          !!delivery.order_id ||
          !!delivery.store_id;

        const targetOrderId =
          delivery.order_id ||
          (isStoreOrderCheck
            ? delivery.id
            : null);

        const drQueryId =
          targetOrderId ||
          delivery.id;

        const {
          error: drError,
        } = await supabase
          .from(
            'delivery_requests'
          )
          .update({
            driver_id: null,
            status: 'pending',
          })
          .or(
            `id.eq.${delivery.id},order_id.eq.${drQueryId}`
          )
          .select();

        if (drError) {
          throw drError;
        }

        if (
          isStoreOrderCheck &&
          targetOrderId
        ) {
          const {
            error: orderError,
          } = await supabase
            .from('orders')
            .update({
              driver_id: null,
            })
            .eq(
              'id',
              targetOrderId
            );

          if (orderError) {
            throw orderError;
          }
        }

        setShowCancelModal(false);
        setShowCancelSuccessModal(true);
      } catch (error) {
        console.error(
          'Cancel Error:',
          error
        );

        setShowCancelModal(false);

        showPopup({
          type: 'error',
          title: 'Unable to Cancel',
          message: 'We could not cancel this delivery. Please check your connection and try again.',
          primaryText: 'Close',
          onPrimary: closePopup
        });
      } finally {
        setCancelling(false);
      }
    };

  const handleCancelSuccessContinue =
    () => {
      setShowCancelSuccessModal(false);

      navigation.navigate(
        'DriverTabs',
        {
          screen:
            'HomeTab',
        }
      );
    };

  /* =======================================================
     ✨ EXECUTE CANCELLATION AND COMPENSATION LOGIC
  ======================================================= */

  const executeWalletCompensationAndCancel = async (cancelReason, logNote, uploadedEvidenceUrl = null) => {
    if (!delivery) return;

    try {
      const isStoreOrderCheck =
        delivery.request_type === 'store_order' ||
        !!delivery.order_id ||
        !!delivery.store_id;

      const targetOrderId =
        delivery.order_id ||
        (isStoreOrderCheck ? delivery.id : null);

      const drQueryId = targetOrderId || delivery.id;

      const drUpdatePayload = {
        status: 'cancelled',
        cancellation_reason: cancelReason,
        notes: logNote,
        cancelled_by: profile?.id,
      };

      if (uploadedEvidenceUrl) {
        drUpdatePayload.evidence_url = uploadedEvidenceUrl;
      }

      const { error: drError } = await supabase
        .from('delivery_requests')
        .update(drUpdatePayload)
        .or(`id.eq.${delivery.id},order_id.eq.${drQueryId}`);

      if (drError) throw drError;

      if (isStoreOrderCheck && targetOrderId) {
        const orderUpdatePayload = {
          status: 'cancelled',
          cancellation_reason: cancelReason,
          cancelled_by: profile?.id,
        };

        if (uploadedEvidenceUrl) {
          orderUpdatePayload.evidence_url = uploadedEvidenceUrl;
        }

        const { error: orderError } = await supabase
          .from('orders')
          .update(orderUpdatePayload)
          .eq('id', targetOrderId);

        if (orderError) throw orderError;
      }

      const pm = String(delivery?.payment_method || '').toLowerCase();
      const isCOD = pm.includes('cod') || pm === 'cash on delivery';

      if (delivery.customer_id) {
        // ✨ FIXED: Added fallback to delivery_fee if total_amount/total_price is 0 or empty (common for Pakuha)
        const computedTotal = Number(delivery?.total_amount || delivery?.total_price || 0);
        const fallbackFee = Number(delivery?.delivery_fee || delivery?.fee || 0);
        
        const penaltyAmount = isCOD ? (computedTotal > 0 ? computedTotal : fallbackFee) : 0;

        const { error: penaltyError } = await supabase.rpc('add_user_penalty', {
          target_user_id: delivery.customer_id,
          penalty_amount: penaltyAmount,
        });
        if (penaltyError) console.error('Failed to add penalty/offense:', penaltyError);
      }

      if (profile?.id) {
        try {
          const fee = Number(delivery?.delivery_fee || delivery?.fee || 0);
          const commRate = await getPlatformCommissionRate();
          const platformComm = Number((fee * commRate).toFixed(2));
          const riderEarnings = Number((fee - platformComm).toFixed(2));

          let outOfPocket = 0;
          if (!isStoreOrderCheck) {
             outOfPocket = Number(delivery?.actual_item_cost || delivery?.subtotal || 0);
          }

          const totalAdminPayoutToRider = riderEarnings + outOfPocket;

          let { data: riderWallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('user_id', profile.id)
            .maybeSingle();

          if (!riderWallet) {
            const { data: newRider } = await supabase
              .from('wallets')
              .insert({
                user_id: profile.id,
                role: 'rider',
                available_balance: 0,
                cash_on_hand: 0,
              })
              .select()
              .single();
            riderWallet = newRider;
          }

          if (riderWallet && totalAdminPayoutToRider > 0) {
            const updatedAvailableBalance = Number((Number(riderWallet.available_balance || 0) + totalAdminPayoutToRider).toFixed(2));

            await supabase
              .from('wallets')
              .update({ available_balance: updatedAvailableBalance })
              .eq('id', riderWallet.id);

            await supabase
              .from('ledger_transactions')
              .insert([
                {
                  wallet_id: riderWallet.id,
                  amount: totalAdminPayoutToRider,
                  transaction_type: 'earning',
                  payment_reference: `Admin Reimbursement (Order #${String(delivery.id).slice(-4)} cancelled - ${cancelReason})`,
                },
              ]);
          }

          const storeSubtotal = Number(delivery?.subtotal || 0);
          const storeId = delivery?.store_id;

          if (isStoreOrderCheck && storeSubtotal > 0 && storeId) {
            const { error: storeRpcErr } = await supabase.rpc('compensate_store_for_cancellation', {
              target_store_id: storeId,
              payout_amount: storeSubtotal,
              order_reference: `Merchant Guarantee (Order #${String(delivery.id).slice(-4)} cancelled - ${cancelReason})`,
            });
            if (storeRpcErr) console.error('Failed to compensate store:', storeRpcErr);
          }
        } catch (walletErr) {
          console.error('Error executing wallet compensations:', walletErr);
        }
      }

      showPopup({
        type: 'success',
        title: 'Action Successful',
        message: 'The delivery has been securely cancelled. Your compensation has been processed and logged.',
        primaryText: 'Done',
        onPrimary: () => {
          closePopup();
          navigation.navigate('DriverTabs', { screen: 'HomeTab' });
        }
      });

    } catch (error) {
      console.error('Cancellation/Compensation Error:', error);
      showPopup({
        type: 'error',
        title: 'Action Failed',
        message: 'Could not update the delivery status. Please check your connection.',
        primaryText: 'Close',
        onPrimary: closePopup
      });
    }
  };

  /* =======================================================
     ✨ PROCESS ISSUE CANCELLATION (NO-SHOW & PRANK) - BOTH REQUIRE PHOTO
  ======================================================= */

  const processCancellation = async () => {
    setShowReasonModal(false);

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showPopup({
          type: 'warning',
          title: 'Permission Required',
          message: 'We need camera access to capture evidence of the issue.',
          primaryText: 'OK',
          onPrimary: closePopup
        });
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        allowsEditing: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        if (cancelReason === 'unavailable') {
          setReportingUnavailable(true);
        } else {
          setReportingPrank(true);
        }

        const imageUri = result.assets[0].uri;

        const response = await fetch(imageUri);
        const arrayBuffer = await response.arrayBuffer();
        const fileExt = imageUri.split('.').pop() || 'jpg';
        const prefix = cancelReason === 'unavailable' ? 'noshow' : 'prank';
        const fileName = `${prefix}_${delivery?.id || 'unknown'}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('delivery_evidence')
          .upload(fileName, arrayBuffer, {
            contentType: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
          });

        if (uploadError) {
          throw new Error(`Upload Failed: ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from('delivery_evidence')
          .getPublicUrl(fileName);

        const evidenceUrl = publicUrlData.publicUrl;

        const reasonTitle = cancelReason === 'unavailable' 
          ? 'Customer was unavailable at the delivery location.' 
          : 'Prank Order / Refused to Pay';
          
        const logNote = cancelReason === 'unavailable'
          ? 'System: Customer was unavailable at the drop-off location with photographic evidence.'
          : 'System: Rider reported a prank order with photographic evidence.';

        await executeWalletCompensationAndCancel(
          reasonTitle,
          logNote,
          evidenceUrl
        );
      }
    } catch (error) {
      console.error('Issue Reporting Error:', error);
      showPopup({
        type: 'error',
        title: 'Report Failed',
        message: error.message || 'An error occurred while uploading your evidence.',
        primaryText: 'Close',
        onPrimary: closePopup
      });
    } finally {
      setReportingUnavailable(false);
      setReportingPrank(false);
    }
  };


  /* =======================================================
     STATUS
  ======================================================= */

  const handleNextStatus =
    async () => {
      if (!delivery) return;

      const currentStatus = (
        delivery.status ||
        'accepted'
      ).toLowerCase();

      const activeNextStatusMap =
        isStoreOrder
          ? NEXT_STATUS
          : CUSTOM_NEXT_STATUS;

      const nextStatus =
        activeNextStatusMap[
          currentStatus
        ];

      if (!nextStatus) return;

      if (nextStatus === 'in_transit' && isPabakal) {
         setExactItemCost('');
         setIsPriceVerified(false);
         setReceiptImage(null);
         setExactPriceModal(true);
         return;
      }

      if (
        nextStatus ===
        'delivered'
      ) {
        const {
          status,
        } =
          await Camera.requestCameraPermissionsAsync();

        if (status === 'granted') {
          setScanned(false);
          setShowScanner(true);
        } else {
          showPopup({
            type: 'warning',
            title: 'Permission Required',
            message: 'Camera access is required to scan the completion QR code.',
            primaryText: 'OK',
            onPrimary: closePopup
          });
        }

        return;
      }

      await executeStatusUpdate(
        nextStatus,
        isStoreOrder
      );
    };

  /* =======================================================
     QR SCANNER
  ======================================================= */

  const handleBarCodeScanned = ({
    type,
    data,
  }) => {
    setScanned(true);

    if (
      data === delivery.id ||
      data === delivery.order_id
    ) {
      setShowScanner(false);

      executeStatusUpdate(
        'delivered',
        isStoreOrder
      );

    } else {
      showPopup({
        type: 'error',
        title: 'Invalid QR Code',
        message: 'This QR code does not match the current delivery.',
        primaryText: 'Try Again',
        onPrimary: () => {
          closePopup();
          setScanned(false);
        }
      });
    }
  };

  /* =======================================================
     EXACT PRICE (MODIFIED FOR "ON THE WAY" TRANSIT)
  ======================================================= */

  const takeReceiptPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showPopup({
        type: 'warning',
        title: 'Permission Required',
        message: 'We need camera access to capture the receipt.',
        primaryText: 'OK',
        onPrimary: closePopup
      });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setReceiptImage(result.assets[0].uri);
    }
  };

  const submitExactPriceAndStartTransit =
    async () => {
      if (!isPriceVerified) {
        showPopup({
          type: 'warning',
          title: 'Verification Required',
          message: 'Please confirm that the exact final cost is true and accurate by checking the box.',
          primaryText: 'OK',
          onPrimary: closePopup
        });
        return;
      }

      if (!receiptImage) {
        showPopup({
          type: 'warning',
          title: 'Receipt Required',
          message: 'Please attach a photo of the physical receipt for the customer.',
          primaryText: 'OK',
          onPrimary: closePopup
        });
        return;
      }

      const parsedCost =
        parseFloat(exactItemCost);

      if (
        isNaN(parsedCost) ||
        parsedCost < 0
      ) {
        showPopup({
          type: 'error',
          title: 'Invalid Amount',
          message: 'Please enter a valid item cost.',
          primaryText: 'OK',
          onPrimary: closePopup
        });
        return;
      }

      setLoadingAction(true);

      try {
        const response = await fetch(receiptImage);
        const arrayBuffer = await response.arrayBuffer();
        const fileExt = receiptImage.split('.').pop() || 'jpg';
        const fileName = `receipt_${delivery?.id || 'unknown'}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('delivery_evidence') 
          .upload(fileName, arrayBuffer, {
            contentType: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
          });

        if (uploadError) throw new Error(`Upload Failed: ${uploadError.message}`);

        const { data: publicUrlData } = supabase.storage
          .from('delivery_evidence')
          .getPublicUrl(fileName);

        const receiptUrl = publicUrlData.publicUrl;

        const fee = Number(
          delivery?.delivery_fee ||
            delivery?.fee ||
            0
        );

        const finalParsedCost =
          Number(
            parsedCost.toFixed(2)
          );

        const newTotalAmount =
          Number(
            (
              finalParsedCost + fee
            ).toFixed(2)
          );

        const { error: updateError } = await supabase
          .from(
            'delivery_requests'
          )
          .update({
            subtotal: finalParsedCost,
            actual_item_cost: finalParsedCost, 
            total_amount: newTotalAmount,
            receipt_url: receiptUrl
          })
          .eq(
            'id',
            delivery.id
          );
          
        if (updateError) {
          throw new Error(`Database Error: ${updateError.message}`);
        }

        setDelivery(
          (prev) => ({
            ...prev,
            subtotal: finalParsedCost,
            actual_item_cost: finalParsedCost,
            total_amount: newTotalAmount,
            receipt_url: receiptUrl
          })
        );

        setExactPriceModal(false);

        await executeStatusUpdate(
          'in_transit',
          false
        );

      } catch (err) {
        showPopup({
          type: 'error',
          title: 'Error',
          message: err.message || 'Failed to update final price.',
          primaryText: 'Close',
          onPrimary: closePopup
        });
        setLoadingAction(false);
      }
    };

  /* =======================================================
     EXECUTE STATUS UPDATE
  ======================================================= */

  const executeStatusUpdate =
    async (
      nextStatus,
      isStoreOrderCheck,
      updatedPricing = null
    ) => {
      setLoadingAction(true);

      const currentTime =
        new Date().toISOString();

      if (
        deliveryId
          ?.toString()
          .startsWith(
            'sample-job-'
          )
      ) {
        setTimeout(() => {
          setLoadingAction(false);

          if (
            nextStatus ===
            'delivered'
          ) {
            showPopup({
              type: 'success',
              title: 'Delivery Completed',
              message: 'Great job! You have finished this delivery.',
              primaryText: 'OK',
              onPrimary: () => {
                closePopup();
                navigation.navigate('DriverTabs', { screen: 'HomeTab' });
              }
            });
          } else {
            setDelivery(
              (prev) => ({
                ...prev,
                status:
                  nextStatus,
              })
            );
          }
        }, 500);

        return;
      }

      await updateDeliveryStatus(
        delivery.id,
        nextStatus
      );

      const targetOrderId =
        delivery.order_id ||
        (
          delivery.request_type ===
          'store_order'
            ? delivery.id
            : null
        );

      let immediateEta = 0;

      if (
        nextStatus ===
          'accepted' ||
        nextStatus ===
          'preparing' ||
        nextStatus ===
          'ready_for_pickup'
      ) {
        immediateEta =
          calculateETA(
            driverLoc?.lat,
            driverLoc?.lng,
            pickupLat,
            pickupLng
          );
      } else if (
        nextStatus ===
          'picked_up' ||
        nextStatus ===
          'in_transit'
      ) {
        immediateEta =
          calculateETA(
            pickupLat,
            pickupLng,
            dropoffLat,
            dropoffLng
          );
      }

      let drPayload = {
        status:
          nextStatus,
        eta_minutes:
          immediateEta > 0
            ? immediateEta
            : liveEta,
      };

      if (
        nextStatus ===
        'picked_up'
      ) {
        drPayload.picked_up_at =
          currentTime;
      } else if (
        nextStatus ===
        'delivered'
      ) {
        drPayload.delivered_at =
          currentTime;

        drPayload.eta_minutes = 0;

        const currentRate =
          await getPlatformCommissionRate();

        const baseFee =
          Number(
            delivery?.delivery_fee ||
              delivery?.fee ||
              0
          );

        drPayload.app_fee =
          Number(
            (
              baseFee *
              currentRate
            ).toFixed(2)
          );
      }

      if (
        isStoreOrderCheck &&
        targetOrderId
      ) {
        await supabase
          .from(
            'delivery_requests'
          )
          .update(
            drPayload
          )
          .eq(
            'order_id',
            targetOrderId
          );
      } else {
        await supabase
          .from(
            'delivery_requests'
          )
          .update(
            drPayload
          )
          .eq(
            'id',
            delivery.id
          );
      }

      // 🌟✨ TEXT CUSTOMER WHEN STATUS CHANGES TO IN_TRANSIT (OUT FOR DELIVERY) ✨🌟
      if (nextStatus === 'in_transit') {
        try {
          const customerPhone = delivery?.customer_phone;
          const customerName = delivery?.customer_name || 'Customer';
          const driverName = profile?.full_name || 'Your assigned driver';
          
          const pm = String(delivery?.payment_method || '').toLowerCase();
          const isOnlinePayment = pm.includes('online') || pm.includes('gcash') || pm.includes('card') || delivery?.status === 'paid';

          let amountToCollect = 0;

          if (!isOnlinePayment) {
            if (isStoreOrderCheck) {
              // 1. Store Order: Use total amount
              amountToCollect = Number(delivery?.total_amount || delivery?.total_price || 0);
            } else if (isPackagePickup) {
              // 2. Pakuha: Only collect the delivery fee
              amountToCollect = Number(delivery?.delivery_fee || delivery?.fee || 0);
            } else if (isPabakal) {
              // 3. Pabakal: Collect Item Cost + Delivery Fee
              const itemCost = Number(exactItemCost || delivery?.actual_item_cost || delivery?.subtotal || 0);
              const fee = Number(delivery?.delivery_fee || delivery?.fee || 0);
              amountToCollect = itemCost + fee;
            } else {
              amountToCollect = Number(delivery?.total_amount || delivery?.total_price || 0);
            }
          }

          // 📋 SIMULATED LOG FOR TESTING (Shows in your Expo terminal)
          const previewMessage = `PAABOT: Hi ${customerName}, your delivery is out for delivery and your driver is on the way. Your rider is ${driverName}. Total amount to pay: ₱${Number(amountToCollect).toFixed(2)}. Thank you!`;
          
          console.log('\n==================== [SMS PREVIEW] ====================');
          console.log('Recipient Phone :', customerPhone);
          console.log('Order Category  :', isStoreOrderCheck ? 'Store Order' : (isPackagePickup ? 'Pakuha' : 'Pabakal'));
          console.log('Payment Method  :', isOnlinePayment ? 'Paid Online' : 'Cash on Delivery (COD)');
          console.log('Amount to Pay   :', `₱${Number(amountToCollect).toFixed(2)}`);
          console.log('Message Text    :', previewMessage);
          console.log('=======================================================\n');

          if (customerPhone) {
            // Fire-and-forget: we don't await this so it never freezes the app UI
            supabase.functions.invoke('notify-customer', {
              body: {
                phone: customerPhone,
                customerName: customerName,
                driverName: driverName,
                statusMessage: 'out for delivery and your driver is on the way',
                totalAmount: amountToCollect
              }
            }).then(({ data, error }) => {
              if (error) console.log('❌ Customer SMS trigger error:', error);
              else console.log('✅ Customer SMS sent successfully:', data);
            }).catch(err => console.log('❌ Customer SMS network exception:', err));
          }
        } catch (smsCustErr) {
          console.log('❌ Error notifying customer via SMS:', smsCustErr);
        }
      }

      if (
        nextStatus ===
        'delivered'
      ) {
        if (
          isStoreOrderCheck &&
          targetOrderId
        ) {
          await distributeOrderFunds(
            delivery
          );

          await supabase
            .from('orders')
            .update({
              status:
                'completed',
              app_fee:
                drPayload.app_fee,
            })
            .eq(
              'id',
              targetOrderId
            );
        } else {
          const commissionRate =
            await getPlatformCommissionRate();

          const deliveryFee =
            Number(
              delivery?.delivery_fee ||
                delivery?.fee ||
                0
            );

          const platformCommission =
            Number(
              (
                deliveryFee *
                commissionRate
              ).toFixed(2)
            );

          const riderEarnings =
            Number(
              (
                deliveryFee -
                platformCommission
              ).toFixed(2)
            );

          const pm =
            String(
              delivery?.payment_method ||
                ''
            ).toLowerCase();

          const isOnlinePayment =
            pm.includes(
              'online'
            ) ||
            pm.includes(
              'gcash'
            ) ||
            pm.includes(
              'card'
            ) ||
            delivery?.status ===
              'paid';

          if (profile?.id) {
            try {
              let {
                data: riderWallet,
              } =
                await supabase
                  .from(
                    'wallets'
                  )
                  .select('*')
                  .eq(
                    'user_id',
                    profile.id
                  )
                  .maybeSingle();

              if (!riderWallet) {
                const {
                  data: newRider,
                } =
                  await supabase
                    .from(
                      'wallets'
                    )
                    .insert({
                      user_id:
                        profile.id,
                      role:
                        'rider',
                      available_balance:
                        0,
                      cash_on_hand:
                        0,
                    })
                    .select()
                    .single();

                riderWallet =
                  newRider;
              }

              if (riderWallet) {
                const {
                  data:
                    freshWallet,
                } =
                  await supabase
                    .from(
                      'wallets'
                    )
                    .select(
                      'cash_on_hand, available_balance'
                    )
                    .eq(
                      'id',
                      riderWallet.id
                    )
                    .single();

                if (
                  !isOnlinePayment
                ) {
                  const updatedCashOnHand =
                    Number(
                      (
                        Number(
                          freshWallet?.cash_on_hand ||
                            0
                        ) +
                        platformCommission
                      ).toFixed(
                        2
                      )
                    );

                  await supabase
                    .from(
                      'wallets'
                    )
                    .update({
                      cash_on_hand:
                        updatedCashOnHand,
                    })
                    .eq(
                      'id',
                      riderWallet.id
                    );

                  await supabase
                    .from(
                      'ledger_transactions'
                    )
                    .insert([
                      {
                        wallet_id:
                          riderWallet.id,
                        amount:
                          riderEarnings,
                        transaction_type:
                          'earning',
                        payment_reference:
                          `COD Earning (Req #${delivery.id
                            .toString()
                            .slice(
                              -4
                            )})`,
                      },
                      {
                        wallet_id:
                          riderWallet.id,
                        amount:
                          platformCommission,
                        transaction_type:
                          'remittance_due',
                        payment_reference:
                          `COD Collection (${Math.round(
                            commissionRate *
                              100
                          )}% App Fee)`,
                      },
                    ]);
                } else {
                  const updatedAvailableBalance =
                    Number(
                      (
                        Number(
                          freshWallet?.available_balance ||
                            0
                        ) +
                        riderEarnings
                      ).toFixed(
                        2
                      )
                    );

                  await supabase
                    .from(
                      'wallets'
                    )
                    .update({
                      available_balance:
                        updatedAvailableBalance,
                    })
                    .eq(
                      'id',
                      riderWallet.id
                    );

                  await supabase
                    .from(
                      'ledger_transactions'
                    )
                    .insert([
                      {
                        wallet_id:
                          riderWallet.id,
                        amount:
                          riderEarnings,
                        transaction_type:
                          'earning',
                        payment_reference:
                          `Online Earning (Req #${delivery.id
                            .toString()
                            .slice(
                              -4
                            )})`,
                      },
                    ]);
                }
              }
            } catch (
              finErr
            ) {
              console.error(
                'Finance update error:',
                finErr
              );
            }
          }
        }
      } else if (
        targetOrderId &&
        isStoreOrderCheck
      ) {
        const orderNewStatus =
          nextStatus ===
          'picked_up'
            ? 'picked_up'
            : 'in_transit';

        await supabase
          .from('orders')
          .update({
            status:
              orderNewStatus,
          })
          .eq(
            'id',
            targetOrderId
          );
      }

      setLoadingAction(false);

      if (
        nextStatus ===
        'delivered'
      ) {
        showPopup({
          type: 'success',
          title: 'Delivery Completed',
          message: 'Great job! You have finished this delivery.',
          primaryText: 'OK',
          onPrimary: () => {
            closePopup();
            navigation.navigate('DriverTabs', { screen: 'HomeTab' });
          }
        });
      } else {
        setDelivery(
          (prev) => ({
            ...prev,
            status:
              nextStatus,
            eta_minutes:
              drPayload.eta_minutes,
          })
        );

        if (
          immediateEta > 0
        ) {
          setLiveEta(
            immediateEta
          );
        }
      }
    };

  /* =======================================================
     PHONE
  ======================================================= */

  const makeCall = (phone) => {
    if (phone) {
      Linking.openURL(
        `tel:${phone}`
      );
    }
  };

  /* =======================================================
     EXTERNAL NAVIGATION
  ======================================================= */

  const openExternalNavigation =
    async (
      lat,
      lng,
      label
    ) => {
      if (!lat || !lng) {
        showPopup({
          type: 'error',
          title: 'Location Unavailable',
          message: 'The destination location is not available right now.',
          primaryText: 'Close',
          onPrimary: closePopup
        });
        return;
      }

      const safeLabel =
        label || 'Destination';

      const encodedLabel =
        encodeURIComponent(
          safeLabel
        );

      const iosScheme =
        `maps:0,0?q=${encodedLabel}@${lat},${lng}`;

      const androidScheme =
        `geo:0,0?q=${lat},${lng}(${encodedLabel})`;

      const fallbackUrl =
        `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`; 
 
      try { 
        const scheme = 
          Platform.OS === 'ios' 
            ? iosScheme 
            : androidScheme; 
 
        await Linking.openURL( 
          scheme 
        ); 
      } catch (error) { 
        try { 
          await Linking.openURL( 
            fallbackUrl 
          ); 
        } catch ( 
          fallbackError 
        ) { 
          showPopup({
            type: 'error',
            title: 'Navigation Unavailable',
            message: 'We could not open a navigation app on this device.',
            primaryText: 'Close',
            onPrimary: closePopup
          });
        } 
      } 
    }; 
 
  /* ======================================================= 
     LOADING 
  ======================================================= */ 
 
  if (loading) { 
    return ( 
      <SafeAreaView 
        style={ 
          styles.loadingScreen 
        } 
      > 
        <View style={styles.loadingIcon}> 
          <Ionicons 
            name="cube-outline" 
            size={30} 
            color={ 
              colors?.primary || 
              '#059669' 
            } 
          /> 
        </View> 
 
        <ActivityIndicator 
          size="small" 
          color={ 
            colors?.primary || 
            '#059669' 
          } 
        /> 
 
        <Text style={styles.loadingTitle}> 
          Preparing delivery 
        </Text> 
 
        <Text style={styles.loadingSubtext}> 
          Getting the latest route and order details 
        </Text> 
      </SafeAreaView> 
    ); 
  } 
 
  /* ======================================================= 
     DISPLAY VALUES 
  ======================================================= */ 
 
  const currentStatus = ( 
    delivery?.status || 
    'accepted' 
  ).toLowerCase(); 
 
  let rawStoreStatus = ''; 
 
  if (delivery?.orders) { 
    rawStoreStatus = 
      Array.isArray( 
        delivery.orders 
      ) 
        ? delivery.orders[0] 
            ?.status || '' 
        : delivery.orders.status || 
          ''; 
  } 
 
  const storeStatus = 
    rawStoreStatus.toLowerCase(); 
 
  const isStoreStillPreparing = 
    isStoreOrder && 
    [ 
      'accepted', 
      'preparing', 
    ].includes( 
      currentStatus 
    ) && 
    storeStatus !== 
      'ready_for_pickup'; 
 
  const isRiderInInitialPhase = 
    currentStatus === 
    'accepted'; 
 
  const isStorePreparing = 
    storeStatus === 
      'preparing' || 
    storeStatus === 
      'ready_for_pickup'; 
 
  const canCancelDelivery = 
    isStoreOrder 
      ? !isStorePreparing 
      : isRiderInInitialPhase; 
 
  const activeNextStatusMap = 
    isStoreOrder 
      ? NEXT_STATUS 
      : CUSTOM_NEXT_STATUS; 
 
  const activeActionLabelMap = 
    isStoreOrder 
      ? ACTION_LABEL 
      : CUSTOM_ACTION_LABEL; 
 
  let headerStatusDisplay = 
    currentStatus; 
 
  if ( 
    !isStoreOrder && 
    currentStatus === 
      'picked_up' 
  ) { 
    headerStatusDisplay = 
      'please prepare the order'; 
  } 
 
  const isOnlinePayment = 
    delivery?.payment_method === 
      'online' || 
    delivery?.status === 
      'paid'; 
 
  const statusColor = 
    currentStatus === 
    'accepted' 
      ? '#2563EB' 
      : currentStatus === 
        'preparing' 
        ? '#D97706' 
        : currentStatus === 
            'ready_for_pickup' 
          ? '#059669' 
          : currentStatus === 
              'picked_up' 
            ? '#7C3AED' 
            : currentStatus === 
                'in_transit' 
              ? '#0891B2' 
              : '#059669'; 
 
  // ✨ GRAB THE CORRECT ID AND FORMAT AS 5 CHARACTERS ✨
  const activeId = (delivery?.request_type === 'store_order' && delivery?.order_id) ? delivery?.order_id : delivery?.id;
  const shortId = activeId ? String(activeId).substring(0, 5).toUpperCase() : '';

  /* ======================================================= 
     MAIN UI 
  ======================================================= */ 
 
  return ( 
    <SafeAreaView style={styles.container}> 
      <StatusBar 
        barStyle="dark-content" 
        backgroundColor="#F7F9F8" 
      /> 
 
      {/* =================================================== 
          HEADER 
      =================================================== */} 
 
      <View style={styles.header}> 
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => 
            navigation.goBack() 
          } 
          activeOpacity={0.8} 
        > 
          <Ionicons 
            name="arrow-back" 
            size={21} 
            color="#1F2937" 
          /> 
        </TouchableOpacity> 
 
        <View style={styles.headerCenter}> 
          <Text style={styles.headerEyebrow}> 
            ACTIVE DELIVERY 
          </Text> 
 
          <Text 
            style={styles.headerTitle} 
            numberOfLines={1} 
          > 
            {isStoreOrder 
              ? delivery?.store_name || 
                'Store Order' 
              : customRequest.type} 
            {' • #'}{shortId}
          </Text> 
        </View> 
 
        <View 
          style={[ 
            styles.headerStatus, 
            { 
              backgroundColor: 
                `${statusColor}12`, 
              borderColor: 
                `${statusColor}28`, 
            }, 
          ]} 
        > 
          <View 
            style={[ 
              styles.headerStatusDot, 
              { 
                backgroundColor: 
                  statusColor, 
              }, 
            ]} 
          /> 
 
          <Text 
            style={[ 
              styles.headerStatusText, 
              { 
                color: 
                  statusColor, 
              }, 
            ]} 
            numberOfLines={1} 
          > 
            {headerStatusDisplay 
              .replace( 
                /_/g, 
                ' ' 
              ) 
              .toUpperCase()} 
          </Text> 
        </View> 
      </View> 
 
      {/* =================================================== 
          CONTENT 
      =================================================== */} 
 
      <ScrollView 
        style={styles.scroll} 
        contentContainerStyle={ 
          styles.scrollContent 
        } 
        showsVerticalScrollIndicator={false} 
        keyboardShouldPersistTaps="handled" 
        nestedScrollEnabled 
      > 
        {/* ETA */} 
        <View style={styles.etaCard}> 
          <View style={styles.etaLeft}> 
            <View style={styles.etaIcon}> 
              <Ionicons 
                name="time-outline" 
                size={22} 
                color="#B45309" 
              /> 
            </View> 
 
            <View style={styles.etaText}> 
              <Text style={styles.etaLabel}> 
                ESTIMATED ARRIVAL 
              </Text> 
 
              {liveEta > 0 ? ( 
                <View style={styles.etaRow}> 
                  <Text style={styles.etaNumber}> 
                    {liveEta} 
                  </Text> 
 
                  <Text style={styles.etaMinutes}> 
                    min 
                  </Text> 
 
                  <Text style={styles.etaApprox}> 
                    approximately 
                  </Text> 
                </View> 
              ) : ( 
                <Text style={styles.etaCalculating}> 
                  Calculating arrival... 
                </Text> 
              )} 
            </View> 
          </View> 
 
          {liveEta > 0 && ( 
            <View style={styles.liveBadge}> 
              <View style={styles.liveDot} /> 
 
              <Text style={styles.liveText}> 
                LIVE 
              </Text> 
            </View> 
          )} 
        </View> 
 
        {/* PROGRESS */} 
        <View style={styles.progressCard}> 
          <View style={styles.progressHeader}> 
            <View style={styles.progressTitleBlock}> 
              <Text style={styles.sectionEyebrow}> 
                DELIVERY STATUS 
              </Text> 
 
              <Text style={styles.progressTitle}> 
                {currentStatus === 
                'accepted' 
                  ? 'Accepted' 
                  : currentStatus === 
                    'preparing' 
                  ? 'Preparing' 
                  : currentStatus === 
                    'ready_for_pickup' 
                  ? 'Ready for Pickup' 
                  : currentStatus === 
                    'picked_up' 
                  ? 'Picked Up' 
                  : currentStatus === 
                    'in_transit' 
                  ? 'In Transit' 
                  : 'Completed'} 
              </Text> 
            </View> 
 
            <View 
              style={[ 
                styles.statusBadge, 
                { 
                  backgroundColor: 
                    `${statusColor}12`, 
                }, 
              ]} 
            > 
              <Ionicons 
                name={ 
                  currentStatus === 
                  'accepted' 
                    ? 'checkmark-circle-outline' 
                    : currentStatus === 
                      'preparing' 
                    ? 'time-outline' 
                    : currentStatus === 
                      'ready_for_pickup' 
                    ? 'checkmark-done-outline' 
                    : currentStatus === 
                      'picked_up' 
                    ? 'cube-outline' 
                    : currentStatus === 
                      'in_transit' 
                    ? 'navigate-outline' 
                    : 'checkmark-circle' 
                } 
                size={16} 
                color={ 
                  statusColor 
                } 
              /> 
 
              <Text 
                style={[ 
                  styles.statusBadgeText, 
                  { 
                    color: 
                      statusColor, 
                  }, 
                ]} 
              > 
                {currentStatus === 
                'accepted' 
                  ? 'Accepted' 
                  : currentStatus === 
                    'preparing' 
                  ? 'Preparing' 
                  : currentStatus === 
                    'ready_for_pickup' 
                  ? 'Ready' 
                  : currentStatus === 
                    'picked_up' 
                  ? 'Picked Up' 
                  : currentStatus === 
                    'in_transit' 
                  ? 'On the Way' 
                  : 'Complete'} 
              </Text> 
            </View> 
          </View> 
 
          <View style={styles.progressTrack}> 
            <View 
              style={[ 
                styles.progressFill, 
                { 
                  width: 
                    currentStatus === 
                    'accepted' 
                      ? '25%' 
                      : currentStatus === 
                        'preparing' 
                      ? '40%' 
                      : currentStatus === 
                        'ready_for_pickup' 
                      ? '50%' 
                      : currentStatus === 
                        'picked_up' 
                      ? '68%' 
                      : currentStatus === 
                        'in_transit' 
                      ? '88%' 
                      : '100%', 
                }, 
              ]} 
            /> 
          </View> 
 
          <View style={styles.progressLabels}> 
            <Text style={styles.progressLabel}> 
              Accepted 
            </Text> 
 
            <Text style={styles.progressLabel}> 
              Pickup 
            </Text> 
 
            <Text style={styles.progressLabel}> 
              Transit 
            </Text> 
 
            <Text style={styles.progressLabel}> 
              Complete 
            </Text> 
          </View> 
        </View> 
 
        {/* STORE PREPARING */} 
        {isStoreOrder && 
          [ 
            'accepted', 
            'preparing', 
          ].includes( 
            currentStatus 
          ) && 
          storeStatus !== 
            'ready_for_pickup' && ( 
            <View 
              style={ 
                styles.infoBannerAmber 
              } 
            > 
              <View 
                style={ 
                  styles.infoBannerIconAmber 
                } 
              > 
                <ActivityIndicator 
                  size="small" 
                  color="#D97706" 
                /> 
              </View> 
 
              <View 
                style={ 
                  styles.infoBannerContent 
                } 
              > 
                <Text 
                  style={ 
                    styles.infoBannerTitle 
                  } 
                > 
                  Store is preparing the order 
                </Text> 
 
                <Text 
                  style={ 
                    styles.infoBannerText 
                  } 
                > 
                  You can continue when the store marks it ready. 
                </Text> 
              </View> 
            </View> 
          )} 
 
        {/* STORE READY */} 
        {isStoreOrder && 
          [ 
            'accepted', 
            'preparing', 
            'ready_for_pickup', 
          ].includes( 
            currentStatus 
          ) && 
          storeStatus === 
            'ready_for_pickup' && ( 
            <View 
              style={ 
                styles.infoBannerGreen 
              } 
            > 
              <View 
                style={ 
                  styles.infoBannerIconGreen 
                } 
              > 
                <Ionicons 
                  name="checkmark" 
                  size={19} 
                  color="#059669" 
                /> 
              </View> 
 
              <View 
                style={ 
                  styles.infoBannerContent 
                } 
              > 
                <Text 
                  style={ 
                    styles.infoBannerTitleGreen 
                  } 
                > 
                  Order is ready 
                </Text> 
 
                <Text 
                  style={ 
                    styles.infoBannerText 
                  } 
                > 
                  Head to the store and collect the order. 
                </Text> 
              </View> 
            </View> 
          )} 
 
        {/* MAP */} 
        <View style={styles.mapCard}> 
          <View style={styles.mapHeader}> 
            <View> 
              <Text style={styles.mapTitle}> 
                Delivery Map 
              </Text> 
 
              <Text style={styles.mapSubtitle}> 
                Follow the live route 
              </Text> 
            </View> 
 
            <View style={styles.mapLiveBadge}> 
              <View 
                style={ 
                  styles.mapLiveDot 
                } 
              /> 
 
              <Text 
                style={ 
                  styles.mapLiveText 
                } 
              > 
                LIVE 
              </Text> 
            </View> 
          </View> 
 
          <View style={styles.mapFrame}> 
            <OsmMap 
              center={{ 
                lat: driverLoc?.lat || (showPickup ? pickupLat : dropoffLat), 
                lng: driverLoc?.lng || (showPickup ? pickupLng : dropoffLng), 
              }} 
              zoom={14} 
              route={routeCoordinates} 
              markers={[ 
                driverLoc && { 
                  lat: driverLoc.lat, 
                  lng: driverLoc.lng, 
                  label: 'You', 
                  color: '#2563EB', 
                }, 
 
                showPickup && { 
                  lat: pickupLat, 
                  lng: pickupLng, 
                  label: isStoreOrder ? 'Store Pickup' : 'Pakuha Pickup', 
                  color: '#059669', 
                }, 
 
                { 
                  lat: dropoffLat, 
                  lng: dropoffLng, 
                  label: 'Drop-off', 
                  color: '#EF4444', 
                }, 
              ].filter(Boolean)} 
            /> 
          </View> 
 
          <View style={styles.mapLegend}> 
            <View 
              style={styles.legendItem} 
            > 
              <View 
                style={[ 
                  styles.legendDot, 
                  { 
                    backgroundColor: 
                      '#2563EB', 
                  }, 
                ]} 
              /> 
 
              <Text 
                style={ 
                  styles.legendText 
                } 
              > 
                Current 
              </Text> 
            </View> 
 
            {showPickup && ( 
              <View 
                style={styles.legendItem} 
              > 
                <View 
                  style={[ 
                    styles.legendDot, 
                    { 
                      backgroundColor: 
                        '#059669', 
                    }, 
                  ]} 
                /> 
 
                <Text 
                  style={ 
                    styles.legendText 
                  } 
                > 
                  Pickup 
                </Text> 
              </View> 
            )} 
 
            <View 
              style={styles.legendItem} 
            > 
              <View 
                style={[ 
                  styles.legendDot, 
                  { 
                    backgroundColor: 
                      '#EF4444', 
                  }, 
                ]} 
              /> 
 
              <Text 
                style={ 
                  styles.legendText 
                } 
              > 
                Drop-off 
              </Text> 
            </View> 
          </View> 
        </View> 
 
        {/* DELIVERY DETAILS */} 
        <View style={styles.card}> 
          <Text style={styles.sectionEyebrow}> 
            DELIVERY DETAILS 
          </Text> 
 
          <Text style={styles.cardTitle}> 
            {showPickup 
              ? 'Pickup and drop-off' 
              : 'Drop-off destination'} 
          </Text> 
 
          {/* PICKUP */} 
          {showPickup && ( 
            <> 
              <View style={styles.routeRow}> 
                <View 
                  style={[ 
                    styles.routeIcon, 
                    { 
                      backgroundColor: 
                        '#EAF7F1', 
                    }, 
                  ]} 
                > 
                  <Ionicons 
                    name={isStoreOrder ? "storefront-outline" : "cube-outline"} 
                    size={19} 
                    color="#059669" 
                  /> 
                </View> 
 
                <View 
                  style={ 
                    styles.routeContent 
                  } 
                > 
                  <Text 
                    style={ 
                      styles.routeLabel 
                    } 
                  > 
                    PICK UP 
                  </Text> 
 
                  <Text 
                    style={ 
                      styles.routeTitle 
                    } 
                    numberOfLines={1} 
                  > 
                    {isStoreOrder 
                      ? (delivery?.store_name || 'Store Location') 
                      : 'Pakuha Location'} 
                  </Text> 
 
                  <Text 
                    style={ 
                      styles.routeAddress 
                    } 
                    numberOfLines={2} 
                  > 
                    {pickupAddress} 
                  </Text> 
                </View> 
 
                <TouchableOpacity 
                  style={ 
                    styles.routeButton 
                  } 
                  onPress={() => 
                    openExternalNavigation( 
                      pickupLat, 
                      pickupLng, 
                      isStoreOrder 
                        ? delivery?.store_name || pickupAddress || 'Store Pickup' 
                        : 'Pakuha Location' 
                    ) 
                  } 
                  activeOpacity={0.8} 
                > 
                  <Ionicons 
                    name="map-outline" 
                    size={18} 
                    color="#059669" 
                  /> 
                </TouchableOpacity> 
              </View> 
 
              <View 
                style={ 
                  styles.routeConnector 
                } 
              /> 
            </> 
          )} 
 
          {/* DROP OFF */} 
          <View style={styles.routeRow}> 
            <View 
              style={[ 
                styles.routeIcon, 
                { 
                  backgroundColor: 
                    '#FEF2F2', 
                }, 
              ]} 
            > 
              <Ionicons 
                name="location-outline" 
                size={19} 
                color="#EF4444" 
              /> 
            </View> 
 
            <View 
              style={ 
                styles.routeContent 
              } 
            > 
              <Text 
                style={ 
                  styles.routeLabel 
                } 
              > 
                DROP OFF 
              </Text> 
 
              <Text 
                style={ 
                  styles.routeTitle 
                } 
                numberOfLines={1} 
              > 
                {delivery?.customer_name || 
                  'Customer'} 
              </Text> 
 
              <Text 
                style={ 
                  styles.routeAddress 
                } 
                numberOfLines={3} 
              > 
                {dropoffAddress} 
              </Text> 
            </View> 
 
            <TouchableOpacity 
              style={ 
                styles.routeButton 
              } 
              onPress={() => 
                openExternalNavigation( 
                  dropoffLat, 
                  dropoffLng, 
                  delivery?.customer_name 
                    ? `Customer - ${delivery.customer_name}` 
                    : dropoffAddress || 
                      'Customer Drop-off' 
                ) 
              } 
              activeOpacity={0.8} 
            > 
              <Ionicons 
                name="map-outline" 
                size={18} 
                color="#2563EB" 
              /> 
            </TouchableOpacity> 
          </View> 
        </View> 
 
        {/* CUSTOMER */} 
        <View style={styles.customerCard}> 
          <View 
            style={ 
              styles.customerLeft 
            } 
          > 
            <View 
              style={ 
                styles.customerAvatar 
              } 
            > 
              <Ionicons 
                name="person-outline" 
                size={20} 
                color="#2563EB" 
              /> 
            </View> 
 
            <View 
              style={ 
                styles.customerInfo 
              } 
            > 
              <Text 
                style={ 
                  styles.sectionEyebrow 
                } 
              > 
                CUSTOMER 
              </Text> 
 
              <Text 
                style={ 
                  styles.customerName 
                } 
                numberOfLines={1} 
              > 
                {delivery?.customer_name || 
                  'Customer'} 
              </Text> 
 
              <Text 
                style={ 
                  styles.customerPhone 
                } 
                numberOfLines={1} 
              > 
                {delivery?.customer_phone || 
                  'No phone provided'} 
              </Text> 
            </View> 
          </View> 
 
          {delivery?.customer_phone && ( 
            <TouchableOpacity 
              style={ 
                styles.callButton 
              } 
              onPress={() => 
                makeCall( 
                  delivery.customer_phone 
                ) 
              } 
              activeOpacity={0.8} 
            > 
              <Ionicons 
                name="call" 
                size={18} 
                color="#FFFFFF" 
              /> 
            </TouchableOpacity> 
          )} 
        </View> 
 
        {/* ORDER */} 
        <View style={styles.card}> 
          <View 
            style={ 
              styles.cardHeader 
            } 
          > 
            <View> 
              <Text 
                style={ 
                  styles.sectionEyebrow 
                } 
              > 
                ORDER 
              </Text> 
 
              <Text 
                style={ 
                  styles.cardTitle 
                } 
              > 
                What to deliver 
              </Text> 
            </View> 
 
            <View 
              style={ 
                styles.orderIcon 
              } 
            > 
              <Ionicons 
                name="cube-outline" 
                size={18} 
                color="#059669" 
              /> 
            </View> 
          </View> 
 
          {delivery?.item_details && 
          delivery.item_details.length > 
            0 ? ( 
            <View 
              style={ 
                styles.itemList 
              } 
            > 
              {delivery.item_details.map( 
                (item, index) => ( 
                  <View 
                    key={ 
                      item.id || 
                      index.toString() 
                    } 
                    style={ 
                      styles.itemRow 
                    } 
                  > 
                    <View 
                      style={ 
                        styles.qtyBadge 
                      } 
                    > 
                      <Text 
                        style={ 
                          styles.qtyText 
                        } 
                      > 
                        {item.qty}x 
                      </Text> 
                    </View> 
 
                    <Text 
                      style={ 
                        styles.itemName 
                      } 
                      numberOfLines={2} 
                    > 
                      {item.name} 
                    </Text> 
                  </View> 
                ) 
              )} 
            </View> 
          ) : ( 
            <View 
              style={ 
                styles.itemList 
              } 
            > 
              {customRequest.details 
                .split(',') 
                .map( 
                  ( 
                    line, 
                    index 
                  ) => { 
                    const value = 
                      line.trim(); 
 
                    if (!value) { 
                      return null; 
                    } 
 
                    return ( 
                      <View 
                        key={ 
                          index 
                        } 
                        style={ 
                          styles.itemRow 
                        } 
                      > 
                        <View 
                          style={ 
                            styles.qtyBadge 
                          } 
                        > 
                          <Ionicons 
                            name="ellipse" 
                            size={6} 
                            color="#059669" 
                          /> 
                        </View> 
 
                        <Text 
                          style={ 
                            styles.itemName 
                          } 
                        > 
                          {value} 
                        </Text> 
                      </View> 
                    ); 
                  } 
                )} 
            </View> 
          )} 
 
          {customRequest.cost > 0 && (
            <View style={[styles.instructionBox, { marginTop: 0, marginBottom: 11, backgroundColor: '#FFF8E8', borderColor: '#FDE68A' }]}>
              <Ionicons name="wallet-outline" size={18} color="#D97706" />
              <View style={styles.instructionContent}>
                <Text style={styles.instructionLabel}>ESTIMATED ITEM COST</Text>
                <Text style={[styles.instructionText, { fontWeight: '800', color: '#92400E', fontSize: 14 }]}>
                  ₱{Number(customRequest.cost).toFixed(2)}
                </Text>
              </View>
            </View>
          )}
 
          {(delivery?.notes ||  
            customRequest.instructions) && ( 
            <View 
              style={ 
                styles.instructionBox 
              } 
            > 
              <Ionicons 
                name="information-circle-outline" 
                size={18} 
                color="#B45309" 
              /> 
 
              <View 
                style={ 
                  styles.instructionContent 
                } 
              > 
                <Text 
                  style={ 
                    styles.instructionLabel 
                  } 
                > 
                  INSTRUCTIONS 
                </Text> 
 
                <Text 
                  style={ 
                    styles.instructionText 
                  } 
                > 
                  {delivery?.notes ||  
                    customRequest.instructions} 
                </Text> 
              </View> 
            </View> 
          )} 
        </View> 
 
        {/* PAYMENT */} 
        <View style={styles.paymentCard}> 
          <View 
            style={ 
              styles.paymentLeft 
            } 
          > 
            <View 
              style={ 
                styles.paymentIcon 
              } 
            > 
              <Ionicons 
                name={ 
                  isOnlinePayment 
                    ? 'card-outline' 
                    : 'cash-outline' 
                } 
                size={19} 
                color="#059669" 
              /> 
            </View> 
 
            <View> 
              <Text 
                style={ 
                  styles.sectionEyebrow 
                } 
              > 
                PAYMENT 
              </Text> 
 
              <Text 
                style={ 
                  styles.paymentTitle 
                } 
              > 
                {isOnlinePayment 
                  ? 'Paid Online' 
                  : 'Cash on Delivery'} 
              </Text> 
 
              <Text 
                style={ 
                  styles.paymentSubtext 
                } 
              > 
                {isOnlinePayment 
                  ? 'No cash collection needed' 
                  : 'Collect from customer'} 
              </Text> 
            </View> 
          </View> 
 
          <View 
            style={ 
              styles.paymentAmountBlock 
            } 
          > 
            <Text 
              style={ 
                styles.paymentAmountLabel 
              } 
            > 
              {isOnlinePayment 
                ? 'ORDER VALUE' 
                : 'COLLECT'} 
            </Text> 
 
            <Text 
              style={ 
                styles.paymentAmount 
              } 
            > 
              ₱ 
              {(() => {
                if (isOnlinePayment) return '0.00';
                if (isStoreOrder) return Number(delivery?.total_amount || delivery?.total_price || 0).toFixed(2);
                if (isPackagePickup) return Number(delivery?.delivery_fee || delivery?.fee || 0).toFixed(2);
                if (isPabakal) {
                  const currentTotal = Number(delivery?.total_amount || delivery?.total_price || 0);
                  if (currentTotal > 0) return currentTotal.toFixed(2);
                  const estItemCost = Number(delivery?.estimated_budget || delivery?.actual_item_cost || 0);
                  const dFee = Number(delivery?.delivery_fee || delivery?.fee || 0);
                  return (estItemCost + dFee).toFixed(2);
                }
                return Number(delivery?.total_amount || delivery?.total_price || 0).toFixed(2);
              })()} 
            </Text> 
          </View> 
        </View> 
 
        <View style={styles.bottomSpace} /> 
      </ScrollView> 
 
      {/* =================================================== 
          STICKY ACTION FOOTER 
      =================================================== */} 
 
      {activeNextStatusMap[ 
        currentStatus 
      ] && ( 
        <View style={styles.footer}> 
          <View 
            style={ 
              styles.footerHintRow 
            } 
          > 
            <Ionicons 
              name={ 
                currentStatus === 
                'in_transit' 
                  ? 'qr-code-outline' 
                  : 'checkmark-circle-outline' 
              } 
              size={17} 
              color="#059669" 
            /> 
 
            <Text 
              style={ 
                styles.footerHint 
              } 
              numberOfLines={2} 
            > 
              {isStoreStillPreparing 
                ? 'Waiting for the store to finish preparing the order.' 
                : currentStatus === 
                  'in_transit' 
                ? 'Scan the customer QR code after arrival.' 
                : 'Complete this step when you are ready.'} 
            </Text> 
          </View> 
 
          <TouchableOpacity 
            style={[ 
              styles.mainAction, 
              isStoreStillPreparing && 
                styles.mainActionDisabled, 
            ]} 
            onPress={ 
              handleNextStatus 
            } 
            disabled={ 
              loadingAction || 
              isStoreStillPreparing 
            } 
            activeOpacity={0.85} 
          > 
            {loadingAction ? ( 
              <ActivityIndicator 
                size="small" 
                color="#FFFFFF" 
              /> 
            ) : ( 
              <> 
                <View 
                  style={ 
                    styles.mainActionText 
                  } 
                > 
                  <Text 
                    style={ 
                      styles.mainActionEyebrow 
                    } 
                  > 
                    NEXT STEP 
                  </Text> 
 
                  <Text 
                    style={ 
                      styles.mainActionTitle 
                    } 
                    numberOfLines={1} 
                  > 
                    {isStoreStillPreparing 
                      ? 'Waiting for Store' 
                      : activeActionLabelMap[ 
                          currentStatus 
                        ]} 
                  </Text> 
                </View> 
 
                {!isStoreStillPreparing && ( 
                  <View 
                    style={ 
                      styles.mainActionCircle 
                    } 
                  > 
                    <Ionicons 
                      name={ 
                        currentStatus === 
                        'in_transit' 
                          ? 'qr-code-outline' 
                          : 'arrow-forward' 
                      } 
                      size={19} 
                      color="#059669" 
                    /> 
                  </View> 
                )} 
              </> 
            )} 
          </TouchableOpacity> 
 
          {isRiderInInitialPhase ? ( 
            canCancelDelivery ? ( 
              <TouchableOpacity 
                style={ 
                  styles.secondaryAction 
                } 
                onPress={ 
                  handleCancelDelivery 
                } 
                disabled={ 
                  cancelling || 
                  loadingAction 
                } 
                activeOpacity={0.8} 
              > 
                {cancelling ? ( 
                  <ActivityIndicator 
                    size="small" 
                    color="#EF4444" 
                  /> 
                ) : ( 
                  <> 
                    <Ionicons 
                      name="close-circle-outline" 
                      size={17} 
                      color="#EF4444" 
                    /> 
 
                    <Text 
                      style={ 
                        styles.secondaryActionText 
                      } 
                    > 
                      Cancel Delivery 
                    </Text> 
                  </> 
                )} 
              </TouchableOpacity> 
            ) : ( 
              <View 
                style={[ 
                  styles.secondaryAction, 
                  styles.secondaryDisabled, 
                ]} 
              > 
                <Ionicons 
                  name="lock-closed-outline" 
                  size={15} 
                  color="#94A3B8" 
                /> 
 
                <Text 
                  style={[ 
                    styles.secondaryActionText, 
                    styles.secondaryDisabledText, 
                  ]} 
                > 
                  Store is preparing 
                </Text> 
              </View> 
            ) 
          ) : currentStatus === 
            'in_transit' ? ( 
              <View style={styles.actionRowContainer}>
                {/* Standard Unavailable Button */}
                <TouchableOpacity 
                  style={[ 
                    styles.halfAction, 
                    styles.unavailableAction, 
                  ]} 
                  onPress={() => setShowReasonModal(true)} 
                  disabled={ 
                    reportingUnavailable || 
                    reportingPrank ||
                    loadingAction 
                  } 
                  activeOpacity={0.8} 
                > 
                  {reportingUnavailable || reportingPrank ? ( 
                    <ActivityIndicator 
                      size="small" 
                      color="#D97706" 
                    /> 
                  ) : ( 
                    <> 
                      <Ionicons 
                        name="warning-outline" 
                        size={17} 
                        color="#D97706" 
                      /> 
                      <Text 
                        style={[ 
                          styles.secondaryActionText, 
                          styles.unavailableText, 
                        ]} 
                      > 
                        Report Issue / Cancel
                      </Text> 
                    </> 
                  )} 
                </TouchableOpacity>
              </View>
          ) : null} 
        </View> 
      )} 
 
      {/* =================================================== 
          QR SCANNER 
      =================================================== */} 
 
      <Modal 
        visible={showScanner} 
        animationType="slide" 
        transparent={false} 
        onRequestClose={() => 
          setShowScanner(false) 
        } 
      > 
        <View 
          style={ 
            styles.scannerContainer 
          } 
        > 
          <CameraView 
            style={ 
              StyleSheet.absoluteFillObject 
            } 
            facing="back" 
            onBarcodeScanned={ 
              scanned 
                ? undefined 
                : handleBarCodeScanned 
            } 
            barcodeScannerSettings={{ 
              barcodeTypes: ['qr'], 
            }} 
          /> 
 
          <View 
            style={ 
              styles.scannerOverlay 
            } 
          > 
            <View 
              style={ 
                styles.scannerTopBar 
              } 
            > 
              <View 
                style={ 
                  styles.scannerTopContent 
                } 
              > 
                <View 
                  style={ 
                    styles.scannerModePill 
                  } 
                > 
                  <View 
                    style={ 
                      styles.scannerLiveDot 
                    } 
                  /> 
 
                  <Text 
                    style={ 
                      styles.scannerModeText 
                    } 
                  > 
                    COMPLETION MODE 
                  </Text> 
                </View> 
 
                <Text 
                  style={ 
                    styles.scannerTitle 
                  } 
                > 
                  Scan Customer QR 
                </Text> 
 
                <Text 
                  style={ 
                    styles.scannerSubtitle 
                  } 
                > 
                  Center the code inside the frame 
                </Text> 
              </View> 
 
              <TouchableOpacity 
                style={ 
                  styles.scannerCloseButton 
                } 
                onPress={() => 
                  setShowScanner(false) 
                } 
              > 
                <Ionicons 
                  name="close" 
                  size={23} 
                  color="#FFFFFF" 
                /> 
              </TouchableOpacity> 
            </View> 
 
            <View 
              style={ 
                styles.qrFrame 
              } 
            > 
              <View 
                style={ 
                  styles.qrTopLeft 
                } 
              /> 
 
              <View 
                style={ 
                  styles.qrTopRight 
                } 
              /> 
 
              <View 
                style={ 
                  styles.qrBottomLeft 
                } 
              /> 
 
              <View 
                style={ 
                  styles.qrBottomRight 
                } 
              /> 
 
              <View 
                style={ 
                  styles.qrCenter 
                } 
              > 
                <Ionicons 
                  name="qr-code-outline" 
                  size={38} 
                  color="rgba(255,255,255,0.55)" 
                /> 
              </View> 
            </View> 
 
            <View 
              style={ 
                styles.scannerInstruction 
              } 
            > 
              <Ionicons 
                name="scan-outline" 
                size={19} 
                color="#FFFFFF" 
              /> 
 
              <Text 
                style={ 
                  styles.scannerInstructionText 
                } 
              > 
                Position the customer's QR code inside the frame 
              </Text> 
            </View> 
 
            <TouchableOpacity 
              style={ 
                styles.scannerCancel 
              } 
              onPress={() => 
                setShowScanner(false) 
              } 
              activeOpacity={0.85} 
            > 
              <Ionicons 
                name="close-circle-outline" 
                size={17} 
                color="#FFFFFF" 
              /> 
 
              <Text 
                style={ 
                  styles.scannerCancelText 
                } 
              > 
                Cancel Scan 
              </Text> 
            </TouchableOpacity> 
          </View> 
        </View> 
      </Modal> 
 
      {/* =================================================== 
          REASON SELECTION MODAL
      =================================================== */} 

      <Modal
        visible={showReasonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReasonModal(false)}
      >
        <View style={styles.modalOverlaySecondary}>
          <View style={styles.reasonModal}>
            <View style={styles.warningAccent} />
            
            <Text style={styles.modalEyebrowAmber}>REPORT ISSUE</Text>
            <Text style={styles.modalTitleLeft}>Cancellation Reason</Text>
            <Text style={styles.modalDescriptionLeft}>
              Please select the reason for cancelling this delivery. Camera evidence will be required to proceed.
            </Text>

            <TouchableOpacity 
              style={[styles.radioRow, cancelReason === 'unavailable' && styles.radioRowActive]} 
              onPress={() => setCancelReason('unavailable')}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={cancelReason === 'unavailable' ? 'radio-button-on' : 'radio-button-off'} 
                size={22} 
                color={cancelReason === 'unavailable' ? '#D97706' : '#9CA3AF'} 
              />
              <View style={styles.radioTextContainer}>
                <Text style={[styles.radioTitle, cancelReason === 'unavailable' && styles.radioTitleActive]}>Customer Unavailable</Text>
                <Text style={styles.radioSub}>Unreachable at the drop-off location. Requires camera proof.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.radioRow, cancelReason === 'prank' && styles.radioRowActive]} 
              onPress={() => setCancelReason('prank')}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={cancelReason === 'prank' ? 'radio-button-on' : 'radio-button-off'} 
                size={22} 
                color={cancelReason === 'prank' ? '#D97706' : '#9CA3AF'} 
              />
              <View style={styles.radioTextContainer}>
                <Text style={[styles.radioTitle, cancelReason === 'prank' && styles.radioTitleActive]}>Fake / Prank Order</Text>
                <Text style={styles.radioSub}>Customer refused to pay or fake address. Requires camera evidence.</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.keepButton} onPress={() => setShowReasonModal(false)}>
                <Text style={styles.keepButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmAmberButton} onPress={processCancellation}>
                <Text style={styles.confirmAmberText}>Take Photo & Proceed</Text>
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* =================================================== 
          CANCEL CONFIRMATION 
      =================================================== */} 
 
      <Modal 
        visible={showCancelModal} 
        transparent 
        animationType="fade" 
        onRequestClose={() => { 
          if (!cancelling) { 
            setShowCancelModal( 
              false 
            ); 
          } 
        }} 
      > 
        <View 
          style={ 
            styles.modalOverlaySecondary 
          } 
        > 
          <View 
            style={ 
              styles.cancelModal 
            } 
          > 
            <View 
              style={ 
                styles.cancelAccent 
              } 
            /> 
 
            <View 
              style={ 
                styles.cancelIcon 
              } 
            > 
              <Ionicons 
                name="close-circle-outline" 
                size={32} 
                color="#EF4444" 
              /> 
            </View> 
 
            <Text 
              style={ 
                styles.modalEyebrowRed 
              } 
            > 
              CANCEL DELIVERY 
            </Text> 
 
            <Text 
              style={ 
                styles.modalTitleAlert 
              } 
            > 
              Drop this delivery? 
            </Text> 
 
            <Text 
              style={ 
                styles.modalDescriptionAlert 
              } 
            > 
              Are you sure you want to cancel this delivery? It will be returned to the pool so another rider can accept it. 
            </Text> 
 
            <View 
              style={ 
                styles.warningBox 
              } 
            > 
              <Ionicons 
                name="information-circle-outline" 
                size={18} 
                color="#B45309" 
              /> 
 
              <View 
                style={ 
                  styles.warningContent 
                } 
              > 
                <Text 
                  style={ 
                    styles.warningTitle 
                  } 
                > 
                  Please note 
                </Text> 
 
                <Text 
                  style={ 
                    styles.warningText 
                  } 
                > 
                  Only cancel if you are unable to complete this delivery. 
                </Text> 
              </View> 
            </View> 
 
            <View 
              style={ 
                styles.modalButtons 
              } 
            > 
              <TouchableOpacity 
                style={ 
                  styles.keepButton 
                } 
                onPress={() => 
                  setShowCancelModal( 
                    false 
                  ) 
                } 
                disabled={ 
                  cancelling 
                } 
                activeOpacity={0.8} 
              > 
                <Text 
                  style={ 
                    styles.keepButtonText 
                  } 
                > 
                  Keep Delivery 
                </Text> 
              </TouchableOpacity> 
 
              <TouchableOpacity 
                style={ 
                  styles.confirmCancelButton 
                } 
                onPress={ 
                  confirmCancelDelivery 
                } 
                disabled={ 
                  cancelling 
                } 
                activeOpacity={0.85} 
              > 
                {cancelling ? ( 
                  <ActivityIndicator 
                    size="small" 
                    color="#FFFFFF" 
                  /> 
                ) : ( 
                  <> 
                    <Ionicons 
                      name="close-outline" 
                      size={18} 
                      color="#FFFFFF" 
                    /> 
 
                    <Text 
                      style={ 
                        styles.confirmCancelText 
                      } 
                    > 
                      Cancel Delivery 
                    </Text> 
                  </> 
                )} 
              </TouchableOpacity> 
            </View> 
          </View> 
        </View> 
      </Modal> 
 
      {/* =================================================== 
          CANCEL SUCCESS 
      =================================================== */} 
 
      <Modal 
        visible={ 
          showCancelSuccessModal 
        } 
        transparent 
        animationType="fade" 
        onRequestClose={ 
          handleCancelSuccessContinue 
        } 
      > 
        <View 
          style={ 
            styles.modalOverlaySecondary 
          } 
        > 
          <View 
            style={ 
              styles.successModal 
            } 
          > 
            <View 
              style={ 
                styles.successAccent 
              } 
            /> 
 
            <View 
              style={ 
                styles.successIcon 
              } 
            > 
              <Ionicons 
                name="checkmark" 
                size={38} 
                color="#059669" 
              /> 
            </View> 
 
            <Text 
              style={ 
                styles.modalEyebrowGreen 
              } 
            > 
              DELIVERY REMOVED 
            </Text> 
 
            <Text 
              style={ 
                styles.modalTitleAlert 
              } 
            > 
              Delivery Cancelled 
            </Text> 
 
            <Text 
              style={ 
                styles.modalDescriptionAlert 
              } 
            > 
              This delivery has been successfully removed from your tasks and is now available for another rider. 
            </Text> 
 
            <View 
              style={ 
                styles.successStatusBox 
              } 
            > 
              <Ionicons 
                name="refresh-circle-outline" 
                size={22} 
                color="#059669" 
              /> 
 
              <View 
                style={ 
                  styles.successStatusContent 
                } 
              > 
                <Text 
                  style={ 
                    styles.successStatusTitle 
                  } 
                > 
                  Task released 
                </Text> 
 
                <Text 
                  style={ 
                    styles.successStatusText 
                  } 
                > 
                  You can now accept another delivery from your dashboard. 
                </Text> 
              </View> 
            </View> 
 
            <TouchableOpacity 
              style={ 
                styles.successButton 
              } 
              onPress={ 
                handleCancelSuccessContinue 
              } 
              activeOpacity={0.85} 
            > 
              <Text 
                style={ 
                  styles.successButtonText 
                } 
              > 
                Back to Home 
              </Text> 
 
              <View 
                style={ 
                  styles.successButtonIcon 
                } 
              > 
                <Ionicons 
                  name="arrow-forward" 
                  size={17} 
                  color="#059669" 
                /> 
              </View> 
            </TouchableOpacity> 
          </View> 
        </View> 
      </Modal> 
 
      {/* =================================================== 
          EXACT PRICE (MODIFIED FOR "ON THE WAY" TRANSIT)
      =================================================== */} 
 
      <Modal 
        visible={ 
          exactPriceModal 
        } 
        transparent 
        animationType="fade" 
        onRequestClose={() => { 
          setExactPriceModal(false); 
          setIsPriceVerified(false); 
          setExactItemCost(''); 
          setReceiptImage(null);
        }} 
      > 
        <View style={styles.modalOverlaySecondary}> 
          <View style={styles.priceModal}> 
            <View style={styles.priceAccent} /> 
 
            <View style={styles.priceHeader}> 
              <View style={styles.priceIcon}> 
                <Ionicons 
                  name="receipt-outline" 
                  size={27} 
                  color="#059669" 
                /> 
              </View> 
 
              <TouchableOpacity 
                style={styles.modalClose} 
                onPress={() => { 
                  setExactPriceModal(false); 
                  setIsPriceVerified(false); 
                  setExactItemCost(''); 
                  setReceiptImage(null);
                }} 
              > 
                <Ionicons 
                  name="close" 
                  size={20} 
                  color="#6B7280" 
                /> 
              </TouchableOpacity> 
            </View> 
 
            <Text style={styles.modalEyebrowGreen}> 
              UPDATE BILL 
            </Text> 
 
            <Text style={styles.modalTitleLeft}> 
              Confirm Exact Cost 
            </Text> 
 
            <Text style={styles.modalDescriptionLeft}> 
              Enter the exact amount paid at the cashier and attach the receipt so the customer can prepare their cash.
            </Text> 
 
            <Text style={styles.inputLabel}> 
              FINAL ITEM COST 
            </Text> 
 
            <View style={styles.priceInput}> 
              <View style={styles.currencyBox}> 
                <Text style={styles.currencyText}> 
                  ₱ 
                </Text> 
              </View> 
 
              <TextInput 
                style={styles.priceTextInput} 
                keyboardType="numeric" 
                placeholder="0.00" 
                placeholderTextColor="#9CA3AF" 
                value={exactItemCost} 
                onChangeText={(text) => 
                  setExactItemCost(text.replace(/[^0-9.]/g, '')) 
                } 
              /> 
            </View> 

            <Text style={[styles.inputLabel, { marginTop: 4 }]}> 
              ATTACH RECEIPT PHOTO 
            </Text> 
            <TouchableOpacity
              style={{
                backgroundColor: '#F9FBFA',
                height: 120,
                borderRadius: 13,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: '#DCE5E1',
                borderStyle: 'dashed',
                marginBottom: 16
              }}
              onPress={takeReceiptPhoto}
              activeOpacity={0.7}
            >
              {receiptImage ? (
                <Image source={{ uri: receiptImage }} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
              ) : (
                <>
                  <Ionicons name="camera" size={32} color="#9CA3AF" />
                  <Text style={{ color: '#9CA3AF', marginTop: 8, fontSize: 11, fontWeight: '700' }}>Tap to capture receipt</Text>
                </>
              )}
            </TouchableOpacity> 
 
            <TouchableOpacity 
              style={styles.checkboxRow} 
              onPress={() => setIsPriceVerified(!isPriceVerified)} 
              activeOpacity={0.8} 
            > 
              <View 
                style={[ 
                  styles.checkbox, 
                  isPriceVerified && styles.checkboxActive, 
                ]} 
              > 
                {isPriceVerified && ( 
                  <Ionicons 
                    name="checkmark" 
                    size={15} 
                    color="#FFFFFF" 
                  /> 
                )} 
              </View> 
 
              <Text style={styles.checkboxText}> 
                I confirm that the exact final cost above is true, accurate, and verified. 
              </Text> 
            </TouchableOpacity> 
 
            <View style={styles.modalButtons}> 
              <TouchableOpacity 
                style={styles.keepButton} 
                onPress={() => { 
                  setExactPriceModal(false); 
                  setIsPriceVerified(false); 
                  setExactItemCost(''); 
                  setReceiptImage(null);
                }} 
                activeOpacity={0.8} 
              > 
                <Text style={styles.keepButtonText}> 
                  Cancel 
                </Text> 
              </TouchableOpacity> 
 
              <TouchableOpacity 
                style={[ 
                  styles.confirmPriceButton, 
                  (!isPriceVerified || !receiptImage || exactItemCost.trim() === '') && styles.disabledButton, 
                ]} 
                onPress={submitExactPriceAndStartTransit} 
                disabled={loadingAction || !isPriceVerified || !receiptImage || exactItemCost.trim() === ''} 
                activeOpacity={0.85} 
              > 
                {loadingAction ? ( 
                  <ActivityIndicator 
                    size="small" 
                    color="#FFFFFF" 
                  /> 
                ) : ( 
                  <> 
                    <Text style={styles.confirmPriceText}> 
                      Update & Drive 
                    </Text> 
 
                    <Ionicons 
                      name="car" 
                      size={17} 
                      color="#FFFFFF" 
                    /> 
                  </> 
                )} 
              </TouchableOpacity> 
            </View> 
          </View> 
        </View> 
      </Modal> 

      {/* =================================================== 
          MODERN POPUP REPLACING RAW ALERTS
      =================================================== */} 
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
 
/* =========================================================== 
   STYLES 
=========================================================== */ 
 
const styles = StyleSheet.create({ 
  container: {
    flex: 1,
    backgroundColor: '#F4F7F5',
  }, 
 
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F7F5',
    paddingHorizontal: 28,
  }, 
 
  loadingIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: '#E8F6EF',
    borderWidth: 1,
    borderColor: '#CDEBDD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  }, 
 
  loadingTitle: {
    marginTop: 8,
    fontSize: 17,
    fontWeight: '900',
    color: '#12231B',
  }, 
 
  loadingSubtext: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: '#7B8A82',
    textAlign: 'center',
    maxWidth: 300,
  }, 
 
  /* ========================================================= 
     HEADER 
  ========================================================= */ 
 
  header: {
    minHeight: 78,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E7EEE9',
    shadowColor: '#14382B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  }, 
 
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F1F5F3',
    borderWidth: 1,
    borderColor: '#E3EBE6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  }, 
 
  headerCenter: { 
    flex: 1, 
    minWidth: 0, 
  }, 
 
  headerEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    color: '#82918A',
    letterSpacing: 1.1,
  }, 
 
  headerTitle: {
    marginTop: 3,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    color: '#10231B',
  }, 
 
  headerStatus: {
    maxWidth: 126,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginLeft: 10,
  }, 
 
  headerStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  }, 
 
  headerStatusText: {
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
  }, 
 
  /* ========================================================= 
     SCROLL 
  ========================================================= */ 
 
  scroll: { 
    flex: 1, 
  }, 
 
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 205,
  }, 
 
  /* ========================================================= 
     ETA 
  ========================================================= */ 
 
  etaCard: {
    minHeight: 94,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE5',
    borderRadius: 20,
    marginBottom: 12,
    shadowColor: '#14382B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  }, 
 
  etaLeft: { 
    flex: 1, 
    minWidth: 0, 
    flexDirection: 'row', 
    alignItems: 'center', 
  }, 
 
  etaIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#FFF4D9',
    borderWidth: 1,
    borderColor: '#F5E3B4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  }, 
 
  etaText: { 
    flex: 1, 
    minWidth: 0, 
  }, 
 
  etaLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#9A6B15',
    letterSpacing: 0.9,
  }, 
 
  etaRow: { 
    flexDirection: 'row', 
    alignItems: 'baseline', 
    marginTop: 1, 
  }, 
 
  etaNumber: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    color: '#15231D',
  }, 
 
  etaMinutes: {
    marginLeft: 5,
    fontSize: 14,
    fontWeight: '900',
    color: '#4B5B53',
  }, 
 
  etaApprox: {
    marginLeft: 7,
    fontSize: 10,
    color: '#8A9791',
  }, 
 
  etaCalculating: {
    marginTop: 5,
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5B53',
  }, 
 
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2FBF6',
    borderWidth: 1,
    borderColor: '#CFE9D9',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  }, 
 
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 5,
  }, 
 
  liveText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#15803D',
    letterSpacing: 0.3,
  }, 
 
  /* ========================================================= 
     PROGRESS 
  ========================================================= */ 
 
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2EAE5',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#14382B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  }, 
 
  progressHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
  }, 
 
  progressTitleBlock: { 
    flex: 1, 
    minWidth: 0, 
  }, 
 
  sectionEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    color: '#82918A',
    letterSpacing: 0.9,
  }, 
 
  progressTitle: {
    marginTop: 4,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    color: '#10231B',
  }, 
 
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 10,
  }, 
 
  statusBadgeText: {
    marginLeft: 5,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.2,
  }, 
 
  progressTrack: {
    height: 8,
    borderRadius: 6,
    backgroundColor: '#E8EFEB',
    marginTop: 18,
    overflow: 'hidden',
  }, 
 
  progressFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 6,
  }, 
 
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  }, 
 
  progressLabel: {
    fontSize: 8.5,
    color: '#91A099',
    fontWeight: '800',
  }, 
 
  /* ========================================================= 
     INFO BANNERS 
  ========================================================= */ 
 
  infoBannerAmber: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBF0',
    borderWidth: 1,
    borderColor: '#F3DFB0',
    borderRadius: 17,
    padding: 13,
    marginBottom: 12,
  }, 
 
  infoBannerGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1FBF5',
    borderWidth: 1,
    borderColor: '#CFEBD9',
    borderRadius: 17,
    padding: 13,
    marginBottom: 12,
  }, 
 
  infoBannerIconAmber: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#FFF2D2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  }, 
 
  infoBannerIconGreen: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#DCF5E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  }, 
 
  infoBannerContent: { 
    flex: 1, 
    minWidth: 0, 
  }, 
 
  infoBannerTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    color: '#92400E',
  }, 
 
  infoBannerTitleGreen: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    color: '#166534',
  }, 
 
  infoBannerText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: '#6B776F',
  }, 
 
  /* ========================================================= 
     MAP 
  ========================================================= */ 
 
  mapCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2EAE5',
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#14382B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  }, 
 
  mapHeader: {
    minHeight: 66,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  }, 
 
  mapTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#10231B',
  }, 
 
  mapSubtitle: {
    marginTop: 3,
    fontSize: 10.5,
    color: '#819089',
  }, 
 
  mapLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1FBF5',
    borderWidth: 1,
    borderColor: '#CFEBD9',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 7,
  }, 
 
  mapLiveDot: { 
    width: 6, 
    height: 6, 
    borderRadius: 3, 
    backgroundColor: '#22C55E', 
    marginRight: 5, 
  }, 
 
  mapLiveText: { 
    fontSize: 8, 
    fontWeight: '900', 
    color: '#15803D', 
  }, 
 
  mapFrame: {
    height: 250,
    marginHorizontal: 10,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E8EEEA',
  }, 
 
  mapLegend: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  }, 
 
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  }, 
 
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  }, 
 
  legendText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#6C7972',
  }, 
 
  /* ========================================================= 
     GENERAL CARD 
  ========================================================= */ 
 
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2EAE5',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#14382B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  }, 
 
  cardHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
  }, 
 
  cardTitle: {
    marginTop: 4,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    color: '#10231B',
  }, 
 
  /* ========================================================= 
     ROUTE 
  ========================================================= */ 
 
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  }, 
 
  routeIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  }, 
 
  routeContent: { 
    flex: 1, 
    minWidth: 0, 
  }, 
 
  routeLabel: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#98A49E',
    letterSpacing: 0.8,
  }, 
 
  routeTitle: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: '#1F2D26',
  }, 
 
  routeAddress: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: '#69776F',
  }, 
 
  routeButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#F1F7F4',
    borderWidth: 1,
    borderColor: '#D7E8DF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 9,
  }, 
 
  routeConnector: {
    width: 1,
    height: 18,
    backgroundColor: '#DCE7E1',
    marginLeft: 23,
    marginTop: 5,
  }, 
 
  /* ========================================================= 
     CUSTOMER 
  ========================================================= */ 
 
  customerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2EAE5',
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#14382B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  }, 
 
  customerLeft: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flex: 1, 
    minWidth: 0, 
  }, 
 
  customerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#EDF5FF',
    borderWidth: 1,
    borderColor: '#D8E7FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  }, 
 
  customerInfo: { 
    flex: 1, 
    minWidth: 0, 
  }, 
 
  customerName: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    color: '#10231B',
  }, 
 
  customerPhone: {
    marginTop: 3,
    fontSize: 11,
    color: '#718079',
  }, 
 
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  }, 
 
  /* ========================================================= 
     ORDER 
  ========================================================= */ 
 
  orderIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#E9F6F0',
    borderWidth: 1,
    borderColor: '#CFE9DB',
    alignItems: 'center',
    justifyContent: 'center',
  }, 
 
  itemList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF3F0',
  }, 
 
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF3F0',
  }, 
 
  qtyBadge: {
    width: 34,
    height: 29,
    borderRadius: 10,
    backgroundColor: '#F0F9F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  }, 
 
  qtyText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#059669',
  }, 
 
  itemName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#36443D',
  }, 
 
  instructionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF9EA',
    borderWidth: 1,
    borderColor: '#F5E3B5',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  }, 
 
  instructionContent: { 
    flex: 1, 
    minWidth: 0, 
    marginLeft: 8, 
  }, 
 
  instructionLabel: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.7,
  }, 
 
  instructionText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: '#69776F',
  }, 
 
  /* ========================================================= 
     PAYMENT 
  ========================================================= */ 
 
  paymentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2EAE5',
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#14382B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  }, 
 
  paymentLeft: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flex: 1, 
    minWidth: 0, 
  }, 
 
  paymentIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#E9F6F0',
    borderWidth: 1,
    borderColor: '#CFE9DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  }, 
 
  paymentTitle: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: '#1F2D26',
  }, 
 
  paymentSubtext: {
    marginTop: 3,
    fontSize: 10,
    color: '#7D8A84',
  }, 
 
  paymentAmountBlock: { 
    alignItems: 'flex-end', 
    marginLeft: 10, 
  }, 
 
  paymentAmountLabel: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#98A49E',
    letterSpacing: 0.8,
  }, 
 
  paymentAmount: {
    marginTop: 3,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    color: '#059669',
  }, 
 
  bottomSpace: {
    height: 24,
  }, 
 
  /* ========================================================= 
     STICKY FOOTER 
  ========================================================= */ 
 
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2EAE5',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 18 : 12,
    elevation: 20,
    shadowColor: '#14382B',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
  }, 
 
  footerHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  }, 
 
  footerHint: {
    flex: 1,
    minWidth: 0,
    marginLeft: 8,
    fontSize: 10,
    lineHeight: 15,
    color: '#68766F',
    fontWeight: '600',
  }, 
 
  mainAction: {
    minHeight: 60,
    borderRadius: 17,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 18,
    paddingRight: 9,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 5,
  }, 
 
  mainActionDisabled: {
    backgroundColor: '#A6CDBB',
    shadowOpacity: 0,
  }, 
 
  mainActionText: { 
    flex: 1, 
    minWidth: 0, 
  }, 
 
  mainActionEyebrow: {
    fontSize: 8.5,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.74)',
    letterSpacing: 0.8,
  }, 
 
  mainActionTitle: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    color: '#FFFFFF',
  }, 
 
  mainActionCircle: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  }, 
 
  secondaryAction: {
    minHeight: 46,
    marginTop: 9,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3C9C9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  }, 

  actionRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 9,
    marginTop: 9,
  },

  halfAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
 
  secondaryActionText: {
    marginLeft: 7,
    fontSize: 11,
    fontWeight: '900',
  }, 
 
  secondaryDisabled: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  }, 
 
  secondaryDisabledText: { 
    color: '#94A3B8', 
  }, 
 
  unavailableAction: {
    borderColor: '#F3D58A',
    backgroundColor: '#FFFBF0',
  }, 
 
  unavailableText: { 
    color: '#D97706', 
  }, 

  prankAction: {
    borderColor: '#F3C9C9',
    backgroundColor: '#FEF4F4',
  },

  prankText: {
    color: '#DC2626',
  },
 
  /* ========================================================= 
     REASON MODAL UI 
  ========================================================= */ 

  reasonModal: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 22,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 16,
  },
  warningAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#D97706',
  },
  modalEyebrowAmber: {
    fontSize: 8,
    fontWeight: '900',
    color: '#D97706',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 4,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 13,
    borderWidth: 1.5,
    borderColor: '#E2E8E4',
    borderRadius: 15,
    marginBottom: 10,
    backgroundColor: '#FAFCFB',
  },
  radioRowActive: {
    borderColor: '#F1C86A',
    backgroundColor: '#FFF9EA',
  },
  radioTextContainer: {
    marginLeft: 10,
    flex: 1,
  },
  radioTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: '#37453E',
  },
  radioTitleActive: {
    color: '#92400E',
  },
  radioSub: {
    fontSize: 11,
    lineHeight: 16,
    color: '#69776F',
    marginTop: 3,
  },
  confirmAmberButton: {
    flex: 1.35,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#D97706',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  confirmAmberText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '900',
  },

  /* ========================================================= 
     GENERAL MODAL 
  ========================================================= */ 
 
  modalOverlaySecondary: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.60)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  }, 
 
  /* ========================================================= 
     QR SCANNER 
  ========================================================= */ 
 
  scannerContainer: { 
    flex: 1, 
    backgroundColor: '#000000', 
  }, 
 
  scannerOverlay: { 
    flex: 1, 
    backgroundColor: 
      'rgba(0,0,0,0.42)', 
    justifyContent: 'center', 
    alignItems: 'center', 
  }, 
 
  scannerTopBar: { 
    position: 'absolute', 
    top: 
      Platform.OS === 'ios' 
        ? 55 
        : 30, 
    left: 20, 
    right: 20, 
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    justifyContent: 'space-between', 
  }, 
 
  scannerTopContent: { 
    flex: 1, 
    minWidth: 0, 
    marginRight: 12, 
  }, 
 
  scannerModePill: { 
    alignSelf: 'flex-start', 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 
      'rgba(16,185,129,0.22)', 
    borderWidth: 1, 
    borderColor: 
      'rgba(110,231,183,0.3)', 
    paddingHorizontal: 8, 
    paddingVertical: 5, 
    borderRadius: 7, 
    marginBottom: 7, 
  }, 
 
  scannerLiveDot: { 
    width: 6, 
    height: 6, 
    borderRadius: 3, 
    backgroundColor: '#34D399', 
    marginRight: 5, 
  }, 
 
  scannerModeText: { 
    fontSize: 7, 
    color: '#D1FAE5', 
    fontWeight: '900', 
    letterSpacing: 0.8, 
  }, 
 
  scannerTitle: { 
    color: '#FFFFFF', 
    fontSize: 20, 
    lineHeight: 25, 
    fontWeight: '900', 
  }, 
 
  scannerSubtitle: { 
    color: '#CBD5E1', 
    fontSize: 10.5, 
    lineHeight: 15, 
    fontWeight: '500', 
    marginTop: 2, 
  }, 
 
  scannerCloseButton: { 
    width: 42, 
    height: 42, 
    borderRadius: 14, 
    backgroundColor: 
      'rgba(255,255,255,0.16)', 
    alignItems: 'center', 
    justifyContent: 'center', 
  }, 
 
  qrFrame: { 
    width: 255, 
    height: 255, 
    position: 'relative', 
    alignItems: 'center', 
    justifyContent: 'center', 
  }, 
 
  qrTopLeft: { 
    position: 'absolute', 
    left: 0, 
    top: 0, 
    width: 46, 
    height: 46, 
    borderLeftWidth: 4, 
    borderTopWidth: 4, 
    borderColor: '#FFFFFF', 
    borderTopLeftRadius: 14, 
  }, 
 
  qrTopRight: { 
    position: 'absolute', 
    right: 0, 
    top: 0, 
    width: 46, 
    height: 46, 
    borderRightWidth: 4, 
    borderTopWidth: 4, 
    borderColor: '#FFFFFF', 
    borderTopRightRadius: 14, 
  }, 
 
  qrBottomLeft: { 
    position: 'absolute', 
    left: 0, 
    bottom: 0, 
    width: 46, 
    height: 46, 
    borderLeftWidth: 4, 
    borderBottomWidth: 4, 
    borderColor: '#FFFFFF', 
    borderBottomLeftRadius: 14, 
  }, 
 
  qrBottomRight: { 
    position: 'absolute', 
    right: 0, 
    bottom: 0, 
    width: 46, 
    height: 46, 
    borderRightWidth: 4, 
    borderBottomWidth: 4, 
    borderColor: '#FFFFFF', 
    borderBottomRightRadius: 14, 
  }, 
 
  qrCenter: { 
    width: 72, 
    height: 72, 
    borderRadius: 22, 
    backgroundColor: 
      'rgba(255,255,255,0.08)', 
    borderWidth: 1, 
    borderColor: 
      'rgba(255,255,255,0.12)', 
    alignItems: 'center', 
    justifyContent: 'center', 
  }, 
 
  scannerInstruction: { 
    position: 'absolute', 
    bottom: 125, 
    left: 32, 
    right: 32, 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 
      'rgba(5,15,11,0.72)', 
    paddingHorizontal: 13, 
    paddingVertical: 11, 
    borderRadius: 14, 
    borderWidth: 1, 
    borderColor: 
      'rgba(255,255,255,0.08)', 
  }, 
 
  scannerInstructionText: { 
    flex: 1, 
    marginLeft: 9, 
    color: '#FFFFFF', 
    fontSize: 10.5, 
    lineHeight: 16, 
    fontWeight: '600', 
  }, 
 
  scannerCancel: { 
    position: 'absolute', 
    bottom: 47, 
    minWidth: 145, 
    backgroundColor: '#EF4444', 
    paddingHorizontal: 22, 
    paddingVertical: 13, 
    borderRadius: 14, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
  }, 
 
  scannerCancelText: { 
    color: '#FFFFFF', 
    fontSize: 11.5, 
    fontWeight: '900', 
    marginLeft: 6, 
  }, 
 
  /* ========================================================= 
     CANCEL MODAL 
  ========================================================= */ 
 
  cancelModal: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 22,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 16,
  }, 
 
  cancelAccent: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    height: 4, 
    backgroundColor: '#EF4444', 
  }, 
 
  cancelIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  }, 
 
  modalEyebrowRed: { 
    fontSize: 8, 
    fontWeight: '900', 
    color: '#EF4444', 
    letterSpacing: 1, 
    textAlign: 'center', 
    marginBottom: 4, 
  }, 
 
  modalEyebrowGreen: { 
    fontSize: 8, 
    fontWeight: '900', 
    color: '#059669', 
    letterSpacing: 1, 
    marginBottom: 4, 
  }, 
 
  modalTitleAlert: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    color: '#17231E',
    textAlign: 'center',
    marginBottom: 8,
  }, 
 
  modalDescriptionAlert: {
    fontSize: 11.5,
    lineHeight: 18,
    color: '#6B7280',
    fontWeight: '500',
    textAlign: 'center',
    marginHorizontal: 8,
    marginBottom: 16,
  }, 
 
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF9EA',
    borderWidth: 1,
    borderColor: '#FDE9B5',
    borderRadius: 14,
    padding: 12,
    marginBottom: 17,
  }, 
 
  warningContent: { 
    flex: 1, 
    minWidth: 0, 
    marginLeft: 8, 
  }, 
 
  warningTitle: { 
    fontSize: 9, 
    fontWeight: '900', 
    color: '#92400E', 
    marginBottom: 2, 
  }, 
 
  warningText: { 
    fontSize: 9.5, 
    lineHeight: 14, 
    color: '#A16207', 
    fontWeight: '600', 
  }, 
 
  modalButtons: { 
    width: '100%', 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 9, 
  }, 
 
  keepButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#F3F6F4',
    borderWidth: 1,
    borderColor: '#DCE5E1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  }, 
 
  keepButtonText: { 
    fontSize: 10.5, 
    fontWeight: '800', 
    color: '#4B5563', 
  }, 
 
  confirmCancelButton: {
    flex: 1.35,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  }, 
 
  confirmCancelText: { 
    color: '#FFFFFF', 
    fontSize: 10.5, 
    fontWeight: '900', 
    marginLeft: 5, 
  }, 
 
  /* ========================================================= 
     SUCCESS MODAL 
  ========================================================= */ 
 
  successModal: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 22,
    paddingTop: 26,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 16,
  }, 
 
  successAccent: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    height: 4, 
    backgroundColor: '#059669', 
  }, 
 
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#B7EFD0',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 15,
  }, 
 
  successStatusBox: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#F0FDF4', 
    borderWidth: 1, 
    borderColor: '#BBF7D0', 
    borderRadius: 14, 
    padding: 11, 
    marginBottom: 17, 
  }, 
 
  successStatusContent: { 
    flex: 1, 
    minWidth: 0, 
    marginLeft: 9, 
  }, 
 
  successStatusTitle: { 
    fontSize: 9.5, 
    fontWeight: '900', 
    color: '#065F46', 
    marginBottom: 2, 
  }, 
 
  successStatusText: { 
    fontSize: 9.2, 
    lineHeight: 14, 
    color: '#047857', 
    fontWeight: '600', 
  }, 
 
  successButton: {
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 9,
    elevation: 4,
  }, 
 
  successButtonText: { 
    color: '#FFFFFF', 
    fontSize: 11.5, 
    fontWeight: '900', 
    marginRight: 9, 
  }, 
 
  successButtonIcon: { 
    width: 29, 
    height: 29, 
    borderRadius: 10, 
    backgroundColor: '#FFFFFF', 
    alignItems: 'center', 
    justifyContent: 'center', 
  }, 
 
  /* ========================================================= 
     PRICE MODAL 
  ========================================================= */ 
 
  priceModal: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 22,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 16,
  }, 
 
  priceAccent: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    height: 4, 
    backgroundColor: '#059669', 
  }, 
 
  priceHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 13, 
  }, 
 
  priceIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#EAF8F2',
    borderWidth: 1,
    borderColor: '#CFE9DB',
    alignItems: 'center',
    justifyContent: 'center',
  }, 
 
  modalClose: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F3F6F4',
    borderWidth: 1,
    borderColor: '#E2EAE5',
    alignItems: 'center',
    justifyContent: 'center',
  }, 
 
  modalTitleLeft: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    color: '#17231E',
    marginBottom: 7,
  }, 
 
  modalDescriptionLeft: {
    fontSize: 12,
    lineHeight: 18,
    color: '#68766F',
    marginBottom: 17,
  }, 
 
  inputLabel: { 
    fontSize: 8, 
    fontWeight: '900', 
    color: '#6B7280', 
    letterSpacing: 0.7, 
    marginBottom: 6, 
  }, 
 
  priceInput: {
    height: 56,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#DCE5E1',
    backgroundColor: '#F9FBFA',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  }, 
 
  currencyBox: { 
    width: 48, 
    height: '100%', 
    backgroundColor: '#EAF8F2', 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderTopLeftRadius: 13, 
    borderBottomLeftRadius: 13, 
  }, 
 
  currencyText: { 
    fontSize: 19, 
    fontWeight: '900', 
    color: '#059669', 
  }, 
 
  priceTextInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
  }, 
 
  checkboxRow: { 
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    marginBottom: 18, 
  }, 
 
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#C9D5CF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginRight: 9,
  }, 
 
  checkboxActive: { 
    backgroundColor: '#059669', 
    borderColor: '#059669', 
  }, 
 
  checkboxText: {
    flex: 1,
    fontSize: 10.8,
    lineHeight: 16,
    color: '#69776F',
    fontWeight: '600',
  }, 
 
  confirmPriceButton: {
    flex: 1.35,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 9,
    elevation: 4,
  }, 
 
  confirmPriceText: { 
    color: '#FFFFFF', 
    fontSize: 10.5, 
    fontWeight: '900', 
  }, 
 
  disabledButton: { 
    opacity: 0.45, 
  }, 

  /* =========================================================
     MODERN POPUP REPLACING RAW ALERTS
  ========================================================= */
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