import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import OsmMap from '../../components/OsmMap';
import { Button, Input } from '../../components/UI';
import { createCustomDeliveryRequest } from '../../services/deliveryService';

const LAST_LOCATION_KEY = 'lastDeliveryLocations';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ======================================================
// COORDINATE HELPERS
// ======================================================

const normalizeCoords = (coords) => {
  if (!coords) return null;

  if (coords.lat != null && coords.lng != null) {
    return {
      lat: Number(coords.lat),
      lng: Number(coords.lng),
    };
  }

  if (
    coords.latitude != null &&
    coords.longitude != null
  ) {
    return {
      lat: Number(coords.latitude),
      lng: Number(coords.longitude),
    };
  }

  return null;
};

const calculateDistanceKm = (
  lat1,
  lon1,
  lat2,
  lon2
) => {
  if (
    lat1 == null ||
    lon1 == null ||
    lat2 == null ||
    lon2 == null
  ) {
    return 0;
  }

  const R = 6371;

  const dLat =
    (Number(lat2) - Number(lat1)) *
    (Math.PI / 180);

  const dLon =
    (Number(lon2) - Number(lon1)) *
    (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) *
      Math.sin(dLat / 2) +
    Math.cos(Number(lat1) * (Math.PI / 180)) *
      Math.cos(Number(lat2) * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c =
    2 * Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
};

// ======================================================
// PROFILE VALUE HELPER
// ======================================================

const getProfileValue = (...values) => {
  const validValue = values.find(
    (value) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ''
  );

  return validValue
    ? String(validValue).trim()
    : 'Not provided';
};

export default function NewDeliveryRequestScreen({
  navigation,
  route: navRoute,
}) {
  const { profile } = useAuth();

  const initialCategory =
    navRoute?.params?.category || '';

  // --------------------------------------------------
  // REQUEST TYPE
  // --------------------------------------------------

  const [requestType, setRequestType] =
    useState('request_item');

  // --------------------------------------------------
  // MAP PICKER
  // --------------------------------------------------

  const [activePinMode, setActivePinMode] =
    useState(null);

  const [pinSessionId, setPinSessionId] =
    useState(0);

  const [tempPinCoords, setTempPinCoords] =
    useState(null);

  const [
    resolvingPinAddress,
    setResolvingPinAddress,
  ] = useState(false);

  const [fetchingGps, setFetchingGps] =
    useState(false);

  // --------------------------------------------------
  // DYNAMIC PRICING
  // --------------------------------------------------

  const [baseDeliveryFee, setBaseDeliveryFee] =
    useState(50);

  const [baseDistanceKm, setBaseDistanceKm] =
    useState(1.5);

  const [excessFeePerKm, setExcessFeePerKm] =
    useState(10);

  const [adminCenter, setAdminCenter] =
    useState({
      lat: 10.2021,
      lng: 122.8613,
    });

  const [maxRadiusKm, setMaxRadiusKm] =
    useState(15);

  const [calculatedFee, setCalculatedFee] =
    useState(50);

  const [
    appCommissionRate,
    setAppCommissionRate,
  ] = useState(0.3);

  // --------------------------------------------------
  // CUSTOM ALERT
  // --------------------------------------------------

  const [alertModal, setAlertModal] =
    useState({
      visible: false,
      title: '',
      message: '',
      type: 'success',
      buttons: [],
    });

  const showAlert = (
    title,
    message,
    type = 'success',
    buttons = [
      {
        text: 'OK',
        onPress: () => hideAlert(),
      },
    ]
  ) => {
    setAlertModal({
      visible: true,
      title,
      message,
      type,
      buttons,
    });
  };

  const hideAlert = () => {
    setAlertModal((prev) => ({
      ...prev,
      visible: false,
    }));
  };

  // --------------------------------------------------
  // FORM STATE
  // --------------------------------------------------

  const [pickupAddress, setPickupAddress] =
    useState('');

  const [dropoffAddress, setDropoffAddress] =
    useState('Fetching live location...');

  const [description, setDescription] =
    useState(
      initialCategory
        ? `${initialCategory} delivery order`
        : ''
    );

  const [itemCost, setItemCost] =
    useState('');

  const [riderInstructions, setRiderInstructions] =
    useState('');

  // --------------------------------------------------
  // COORDINATES
  // --------------------------------------------------

  const [pickupCoords, setPickupCoords] =
    useState(null);

  const [dropoffCoords, setDropoffCoords] =
    useState(null);

  const [submitting, setSubmitting] =
    useState(false);

  const [locatingUser, setLocatingUser] =
    useState(true);

  const [hasSavedDropoff, setHasSavedDropoff] =
    useState(false);

  const locationSubscription =
    useRef(null);

  const geocodeTimeout =
    useRef(null);

  const [penaltyBalance, setPenaltyBalance] =
    useState(0);

  // ✨ FETCH PENALTY BALANCE
  useEffect(() => {
    const fetchPenalty = async () => {
      try {
        let userId = profile?.id;

        if (!userId) {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          userId = session?.user?.id;
        }

        if (userId) {
          const { data } = await supabase
            .from('profiles')
            .select('outstanding_penalty')
            .eq('id', userId)
            .single();

          if (
            data &&
            data.outstanding_penalty > 0
          ) {
            setPenaltyBalance(
              Number(data.outstanding_penalty)
            );
          }
        }
      } catch (err) {
        console.error(
          'Error fetching penalty:',
          err
        );
      }
    };

    fetchPenalty();
  }, [profile?.id]);

  // ======================================================
  // ADMIN SETTINGS
  // ======================================================

  useEffect(() => {
    fetchAdminSettings();
  }, []);

  const fetchAdminSettings = async () => {
    try {
      const { data, error } =
        await supabase
          .from('settings')
          .select('key, value');

      if (error) {
        console.error(
          'Failed to load admin settings:',
          error
        );

        return null;
      }

      if (!data) return null;

      const configMap = {};

      data.forEach((s) => {
        configMap[s.key] = s.value;
      });

      const settings = {
        baseDeliveryFee:
          parseFloat(
            configMap['delivery_fee_amount']
          ) || 50,

        baseDistanceKm:
          parseFloat(
            configMap[
              'delivery_fee_base_distance_km'
            ]
          ) || 1.5,

        excessFeePerKm:
          parseFloat(
            configMap[
              'delivery_fee_per_excess_km'
            ]
          ) || 10,

        adminCenter: {
          lat:
            parseFloat(
              configMap['perimeter_lat']
            ) || 10.2021,

          lng:
            parseFloat(
              configMap['perimeter_lng']
            ) || 122.8613,
        },

        maxRadiusKm:
          parseFloat(
            configMap['perimeter_radius_km']
          ) || 15,

        appCommissionRate:
          parseFloat(
            configMap[
              'platform_commission_rate'
            ]
          ) || 0.3,
      };

      setBaseDeliveryFee(
        settings.baseDeliveryFee
      );
      setBaseDistanceKm(
        settings.baseDistanceKm
      );
      setExcessFeePerKm(
        settings.excessFeePerKm
      );
      setAdminCenter(
        settings.adminCenter
      );
      setMaxRadiusKm(
        settings.maxRadiusKm
      );
      setAppCommissionRate(
        settings.appCommissionRate
      );

      return settings;
    } catch (err) {
      console.error(
        'Failed to load admin delivery settings:',
        err
      );

      return null;
    }
  };

  // ======================================================
  // DELIVERY FEE CALCULATION
  // ======================================================

  useEffect(() => {
    const validDropoff =
      normalizeCoords(dropoffCoords);

    if (!validDropoff) {
      setCalculatedFee(
        Number(baseDeliveryFee) || 50
      );
      return;
    }

    let startCoords = normalizeCoords(
      adminCenter
    );

    if (requestType === 'pickup_item') {
      const validPickup =
        normalizeCoords(pickupCoords);

      if (!validPickup) {
        setCalculatedFee(
          Number(baseDeliveryFee) || 50
        );
        return;
      }

      startCoords = validPickup;
    }

    if (!startCoords) {
      setCalculatedFee(
        Number(baseDeliveryFee) || 50
      );
      return;
    }

    const dist = calculateDistanceKm(
      startCoords.lat,
      startCoords.lng,
      validDropoff.lat,
      validDropoff.lng
    );

    let fee =
      Number(baseDeliveryFee) || 50;

    const baseDistance =
      Number(baseDistanceKm) || 1.5;

    const extraPerKm =
      Number(excessFeePerKm) || 10;

    if (dist > baseDistance) {
      fee +=
        (dist - baseDistance) *
        extraPerKm;
    }

    const finalFee =
      Math.round(fee * 100) / 100;

    setCalculatedFee(finalFee);
  }, [
    requestType,
    pickupCoords?.lat,
    pickupCoords?.lng,
    dropoffCoords?.lat,
    dropoffCoords?.lng,
    baseDeliveryFee,
    baseDistanceKm,
    excessFeePerKm,
    adminCenter.lat,
    adminCenter.lng,
  ]);

  useEffect(() => {
    navigation.setOptions({
      gestureEnabled:
        activePinMode === null,
    });
  }, [
    activePinMode,
    navigation,
  ]);

  // ======================================================
  // REVERSE GEOCODING
  // ======================================================

  const fetchAddressFromCoords = async (
    lat,
    lng,
    targetField = 'dropoff'
  ) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&countrycodes=ph`,
        {
          headers: {
            'User-Agent':
              'DeliveryApp/1.0',
          },
        }
      );

      const data =
        await response.json();

      if (
        data &&
        data.address
      ) {
        const addr =
          data.address;

        const buildingOrShop =
          addr.amenity ||
          addr.shop ||
          addr.building ||
          addr.tourism ||
          addr.commercial ||
          addr.office ||
          '';

        const road =
          addr.road ||
          addr.suburb ||
          addr.neighbourhood ||
          '';

        const barangay =
          addr.quarter ||
          addr.neighbourhood ||
          addr.village ||
          addr.suburb ||
          '';

        const town =
          addr.city ||
          addr.town ||
          addr.municipality ||
          '';

        const formattedParts = [];

        if (buildingOrShop) {
          formattedParts.push(
            buildingOrShop
          );
        }

        if (road) {
          formattedParts.push(
            road
          );
        }

        if (
          barangay &&
          barangay !== road
        ) {
          formattedParts.push(
            barangay
          );
        }

        if (town) {
          formattedParts.push(
            town
          );
        }

        const formatted =
          formattedParts.length > 0
            ? formattedParts
                .join(', ')
                .trim()
            : data.display_name
            ? data.display_name
                .split(',')
                .slice(0, 3)
                .join(',')
                .trim()
            : `Pin (${lat.toFixed(
                4
              )}, ${lng.toFixed(4)})`;

        if (
          targetField === 'pickup'
        ) {
          setPickupAddress(
            formatted
          );
        } else {
          setDropoffAddress(
            formatted
          );
        }

        return formatted;
      }

      if (
        data &&
        data.display_name
      ) {
        const formatted =
          data.display_name
            .split(',')
            .slice(0, 3)
            .join(',')
            .trim();

        if (
          targetField === 'pickup'
        ) {
          setPickupAddress(
            formatted
          );
        } else {
          setDropoffAddress(
            formatted
          );
        }

        return formatted;
      }

      const fallback =
        `Pin (${lat.toFixed(
          4
        )}, ${lng.toFixed(4)})`;

      if (
        targetField === 'pickup'
      ) {
        setPickupAddress(
          fallback
        );
      } else {
        setDropoffAddress(
          fallback
        );
      }

      return fallback;
    } catch (error) {
      const fallback =
        `Pin (${lat.toFixed(
          4
        )}, ${lng.toFixed(4)})`;

      if (
        targetField === 'pickup'
      ) {
        setPickupAddress(
          fallback
        );
      } else {
        setDropoffAddress(
          fallback
        );
      }

      return fallback;
    }
  };

  // ======================================================
  // SAVE LOCATIONS
  // ======================================================

  const persistLocations = async (
    nextPickupAddr,
    nextPickupCoords,
    nextDropoffAddr,
    nextDropoffCoords
  ) => {
    try {
      await AsyncStorage.setItem(
        LAST_LOCATION_KEY,
        JSON.stringify({
          pickupAddress:
            nextPickupAddr,
          pickupCoords:
            nextPickupCoords,
          dropoffAddress:
            nextDropoffAddr,
          dropoffCoords:
            nextDropoffCoords,
        })
      );
    } catch (e) {
      console.warn(
        'Could not save location',
        e
      );
    }
  };

  // ======================================================
  // LOAD SAVED LOCATIONS
  // ======================================================

  useEffect(() => {
    (async () => {
      try {
        const saved =
          await AsyncStorage.getItem(
            LAST_LOCATION_KEY
          );

        if (!saved) return;

        const parsed =
          JSON.parse(saved);

        if (
          parsed?.pickupAddress
        ) {
          setPickupAddress(
            parsed.pickupAddress
          );
        }

        if (
          parsed?.pickupCoords
        ) {
          const normalizedPickup =
            normalizeCoords(
              parsed.pickupCoords
            );

          if (normalizedPickup) {
            setPickupCoords(
              normalizedPickup
            );
          }
        }

        if (
          parsed?.dropoffAddress
        ) {
          setDropoffAddress(
            parsed.dropoffAddress
          );

          setHasSavedDropoff(
            true
          );
        }

        if (
          parsed?.dropoffCoords
        ) {
          const normalizedDropoff =
            normalizeCoords(
              parsed.dropoffCoords
            );

          if (normalizedDropoff) {
            setDropoffCoords(
              normalizedDropoff
            );
          }
        }
      } catch (e) {
        console.warn(
          'Could not load saved location',
          e
        );
      }
    })();
  }, []);

  // ======================================================
  // REAL-TIME LOCATION
  // ======================================================

  useEffect(() => {
    let isMounted = true;

    const startRealtimeTracking =
      async () => {
        try {
          setLocatingUser(true);

          const { status } =
            await Location.requestForegroundPermissionsAsync();

          if (
            status !== 'granted'
          ) {
            showAlert(
              'Permission Denied',
              'Please enable location permissions in your device settings.',
              'warning'
            );

            setLocatingUser(false);

            return;
          }

          locationSubscription.current =
            await Location.watchPositionAsync(
              {
                accuracy:
                  Location.Accuracy.High,
                timeInterval: 3000,
                distanceInterval: 5,
              },
              (location) => {
                if (!isMounted)
                  return;

                if (
                  hasSavedDropoff
                ) {
                  setLocatingUser(
                    false
                  );

                  return;
                }

                const newCoords =
                  {
                    lat: location
                      .coords
                      .latitude,

                    lng: location
                      .coords
                      .longitude,
                  };

                setDropoffCoords(
                  newCoords
                );

                if (
                  !dropoffAddress.includes(
                    'Blk'
                  ) &&
                  !dropoffAddress.includes(
                    'Street'
                  )
                ) {
                  fetchAddressFromCoords(
                    newCoords.lat,
                    newCoords.lng,
                    'dropoff'
                  );
                }

                setLocatingUser(
                  false
                );
              }
            );
        } catch (error) {
          showAlert(
            'Location Error',
            'Could not start real-time tracking.',
            'error'
          );

          setLocatingUser(false);
        }
      };

    startRealtimeTracking();

    return () => {
      isMounted = false;

      if (
        locationSubscription.current
      ) {
        locationSubscription.current.remove();
      }

      if (
        geocodeTimeout.current
      ) {
        clearTimeout(
          geocodeTimeout.current
        );
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSavedDropoff]);

  // ======================================================
  // USE LIVE GPS
  // ======================================================

  const handleUseLiveGps =
    async () => {
      try {
        setFetchingGps(true);

        const { status } =
          await Location.requestForegroundPermissionsAsync();

        if (
          status !== 'granted'
        ) {
          showAlert(
            'Permission Denied',
            'Please enable location permissions in your device settings.',
            'warning'
          );

          return;
        }

        const currentLocation =
          await Location.getCurrentPositionAsync(
            {
              accuracy:
                Location.Accuracy.High,
            }
          );

        const currentCoords =
          {
            lat:
              currentLocation
                .coords
                .latitude,

            lng:
              currentLocation
                .coords
                .longitude,
          };

        const distToHub = calculateDistanceKm(
          adminCenter.lat,
          adminCenter.lng,
          currentCoords.lat,
          currentCoords.lng
        );

        if (distToHub > maxRadiusKm) {
          showAlert(
            'Out of Service Range',
            `Your live location is ${distToHub.toFixed(1)} km away. We only service areas within a ${maxRadiusKm} km radius from our hub.`,
            'warning'
          );
          return;
        }

        setDropoffCoords(
          currentCoords
        );

        setHasSavedDropoff(
          true
        );

        const addr =
          await fetchAddressFromCoords(
            currentCoords.lat,
            currentCoords.lng,
            'dropoff'
          );

        persistLocations(
          pickupAddress,
          pickupCoords,
          addr,
          currentCoords
        );

        showAlert(
          'Success',
          'Drop-off location updated to your current live GPS position.',
          'success'
        );
      } catch (error) {
        showAlert(
          'GPS Error',
          'Could not retrieve your current location. Please check your GPS signal.',
          'error'
        );
      } finally {
        setFetchingGps(
          false
        );
      }
    };

  // ======================================================
  // PRICE INPUT
  // ======================================================

  const handlePriceChange =
    (setter) => (text) => {
      const cleaned =
        text.replace(
          /[^0-9.]/g,
          ''
        );

      const parts =
        cleaned.split('.');

      if (
        parts.length > 2
      ) {
        setter(
          `${parts[0]}.${parts
            .slice(1)
            .join('')}`
        );
      } else {
        setter(cleaned);
      }
    };

  // ======================================================
  // VALIDATION & CLEAN DATA PAYLOAD
  // ======================================================

   // ======================================================
  // VALIDATION & CLEAN DATA PAYLOAD
  // ======================================================

  const validateInputs = () => {
    const isPickup =
      requestType === 'pickup_item';

    const missing = [];

    // Pickup location (Pakuha only)
    if (
      isPickup &&
      (!pickupAddress.trim() ||
        !normalizeCoords(pickupCoords))
    ) {
      missing.push('Pickup Location');
    }

    // Drop-off (also blocks the "Fetching..." placeholder text)
    const dropoffText =
      dropoffAddress.trim();

    if (
      !dropoffText ||
      dropoffText ===
        'Fetching live location...' ||
      !normalizeCoords(dropoffCoords)
    ) {
      missing.push(
        'Drop-off Destination'
      );
    }

    // Description
    if (!description.trim()) {
      missing.push(
        isPickup
          ? 'What should the rider pick up?'
          : 'What do you need?'
      );
    }

    // Rider instructions
    if (!riderInstructions.trim()) {
      missing.push(
        'Instructions for Rider'
      );
    }

    // Estimated item cost (Pabakal only)
    const parsedItemCost =
      parseFloat(itemCost);

    if (
      !isPickup &&
      (isNaN(parsedItemCost) ||
        parsedItemCost <= 0)
    ) {
      missing.push(
        'Estimated Item Cost'
      );
    }

    if (missing.length > 0) {
      showAlert(
        'Missing Info',
        `Please complete the following required fields:\n\n${missing
          .map((f) => `• ${f}`)
          .join('\n')}`,
        'warning'
      );
      return null;
    }

    return {
      cleanDescription:
        description.trim(),

      estimatedBudget:
        !isNaN(parsedItemCost) &&
        parsedItemCost > 0
          ? parsedItemCost
          : 0,

      riderNotes:
        riderInstructions.trim(),
    };
  };

  // ======================================================
  // SUBMIT (TRIGGERS CONFIRMATION POPUP FIRST)
  // ======================================================

  const handleSubmit = async () => {
    const validatedData =
      validateInputs();

    if (!validatedData) return;

    if (
      requestType === 'pickup_item' &&
      !normalizeCoords(pickupCoords)
    ) {
      showAlert(
        'Missing Pickup Location',
        'Please pin the package pickup location before submitting.',
        'warning'
      );
      return;
    }

    const latestSettings =
      await fetchAdminSettings();

    const currentAdminCenter =
      latestSettings?.adminCenter ??
      adminCenter;

    const currentMaxRadius =
      latestSettings?.maxRadiusKm ??
      maxRadiusKm;

    const validDropoff =
      normalizeCoords(dropoffCoords);

    if (!validDropoff) {
      showAlert(
        'Missing Info',
        'Drop-off coordinates are missing.',
        'warning'
      );
      return;
    }

    const dropoffDistToHub =
      calculateDistanceKm(
        currentAdminCenter.lat,
        currentAdminCenter.lng,
        validDropoff.lat,
        validDropoff.lng
      );

    if (
      dropoffDistToHub >
      currentMaxRadius
    ) {
      showAlert(
        'Out of Service Range',
        `Sorry! Your delivery destination is ${dropoffDistToHub.toFixed(1)} km away. We only deliver within a ${currentMaxRadius} km radius from our hub.`,
        'warning'
      );
      return;
    }

    let pickupDistToHub = 0;

    if (
      requestType === 'pickup_item'
    ) {
      const validPickup =
        normalizeCoords(
          pickupCoords
        );

      if (!validPickup) {
        showAlert(
          'Missing Pickup Location',
          'Please pin the package pickup location before submitting.',
          'warning'
        );
        return;
      }

      pickupDistToHub =
        calculateDistanceKm(
          currentAdminCenter.lat,
          currentAdminCenter.lng,
          validPickup.lat,
          validPickup.lng
        );

      if (
        pickupDistToHub >
        currentMaxRadius
      ) {
        showAlert(
          'Out of Service Range',
          `Sorry! Your pickup location is ${pickupDistToHub.toFixed(1)} km away. We only service areas within a ${currentMaxRadius} km radius from our hub.`,
          'warning'
        );
        return;
      }
    }

    // ==================================================
    // COMPLETE USER / DELIVERY DETAILS
    // ==================================================

    const customerName =
      getProfileValue(
        profile?.full_name,
        profile?.name,
        profile?.display_name,
        profile?.username
      );

    const customerPhone =
      getProfileValue(
        profile?.phone,
        profile?.phone_number,
        profile?.mobile_number,
        profile?.contact_number,
        profile?.contact
      );

    const customerEmail =
      getProfileValue(
        profile?.email
      );

    const serviceName =
      requestType === 'pickup_item'
        ? 'Pakuha'
        : 'Pabakal';

    const itemCostDisplay =
      validatedData.estimatedBudget >
      0
        ? `₱${validatedData.estimatedBudget.toFixed(
            2
          )}`
        : 'Not provided';

    const riderNotesDisplay =
      validatedData.riderNotes
        ? validatedData.riderNotes
        : 'None';

    let confirmationMessage = '';

    if (
      requestType === 'pickup_item'
    ) {
      confirmationMessage = [
        'CUSTOMER INFORMATION',
        '',
        `• Name: ${customerName}`,
        `• Phone: ${customerPhone}`,
        `• Email: ${customerEmail}`,
        '',
        'DELIVERY DETAILS',
        '',
        `• Service: ${serviceName}`,
        `• Pickup Location: ${pickupAddress}`,
        `• Drop-off Destination: ${dropoffAddress}`,
        `• Package Contents: ${validatedData.cleanDescription}`,
        `• Rider Instructions: ${riderNotesDisplay}`,
        `• Payment Method: Cash on Delivery`,
        `• Distance: ${calculateDistanceKm(
          normalizeCoords(pickupCoords)?.lat,
          normalizeCoords(pickupCoords)?.lng,
          validDropoff.lat,
          validDropoff.lng
        ).toFixed(2)} km`,
        `• Delivery Fee: ₱${calculatedFee.toFixed(
          2
        )}`,
        '',
        'Please review all the details above before confirming your request.',
      ].join('\n');
    } else {
      confirmationMessage = [
        'CUSTOMER INFORMATION',
        '',
        `• Name: ${customerName}`,
        `• Phone: ${customerPhone}`,
        `• Email: ${customerEmail}`,
        '',
        'DELIVERY DETAILS',
        '',
        `• Service: ${serviceName}`,
        `• Pickup: Any Nearby Store / Open Instruction`,
        `• Drop-off Destination: ${dropoffAddress}`,
        `• Items / Task: ${validatedData.cleanDescription}`,
        `• Estimated Item Cost: ${itemCostDisplay}`,
        `• Rider Instructions: ${riderNotesDisplay}`,
        `• Payment Method: Cash on Delivery`,
        `• Distance: ${calculateDistanceKm(
          currentAdminCenter.lat,
          currentAdminCenter.lng,
          validDropoff.lat,
          validDropoff.lng
        ).toFixed(2)} km`,
        `• Delivery Fee: ₱${calculatedFee.toFixed(
          2
        )}`,
        '',
        'Please review all the details above before confirming your request.',
      ].join('\n');
    }

    showAlert(
      'Confirm Delivery Request',
      confirmationMessage,
      'warning',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () =>
            hideAlert(),
        },
        {
          text: 'Confirm & Submit',
          primary: true,
          onPress: () => {
            hideAlert();
            executeOrderSubmission();
          },
        },
      ]
    );
  };

  // ======================================================
  // ACTUAL ORDER EXECUTION
  // ======================================================

  const executeOrderSubmission =
    async () => {
      const validatedData =
        validateInputs();

      if (!validatedData) return;

      setSubmitting(true);

      try {
        const latestSettings =
          await fetchAdminSettings();

        const currentBaseFee =
          latestSettings?.baseDeliveryFee ??
          baseDeliveryFee;

        const currentBaseDistance =
          latestSettings?.baseDistanceKm ??
          baseDistanceKm;

        const currentExcessFee =
          latestSettings?.excessFeePerKm ??
          excessFeePerKm;

        const currentAdminCenter =
          latestSettings?.adminCenter ??
          adminCenter;

        const currentCommission =
          latestSettings?.appCommissionRate ??
          appCommissionRate;

        const validDropoff =
          normalizeCoords(
            dropoffCoords
          );

        let startCoords =
          normalizeCoords(
            currentAdminCenter
          );

        if (
          requestType === 'pickup_item'
        ) {
          const validPickup =
            normalizeCoords(
              pickupCoords
            );

          startCoords =
            validPickup;
        }

        const dist =
          calculateDistanceKm(
            startCoords.lat,
            startCoords.lng,
            validDropoff.lat,
            validDropoff.lng
          );

        let finalCalculatedFee =
          Number(currentBaseFee) ||
          50;

        const baseDistance =
          Number(
            currentBaseDistance
          ) || 1.5;

        const excessFee =
          Number(
            currentExcessFee
          ) || 10;

        if (
          dist > baseDistance
        ) {
          finalCalculatedFee +=
            (dist - baseDistance) *
            excessFee;
        }

        finalCalculatedFee =
          Math.round(
            finalCalculatedFee *
              100
          ) / 100;

        const frozenAppFee =
          Number(
            (
              finalCalculatedFee *
              Number(
                currentCommission
              )
            ).toFixed(2)
          );

        const { error } =
          await supabase
            .from(
              'delivery_requests'
            )
            .insert({
              customer_id:
                profile?.id,

              request_type:
                'custom',

              item_description:
                requestType ===
                'pickup_item'
                  ? `[PACKAGE PICKUP] ${validatedData.cleanDescription}`
                  : `[ITEM REQUEST] ${validatedData.cleanDescription}`,

              estimated_budget:
                validatedData.estimatedBudget,

              notes:
                validatedData.riderNotes,

              pickup_address:
                requestType ===
                'pickup_item'
                  ? pickupAddress.trim()
                  : 'Any Nearby Store / Open Instruction',

              pickup_lat:
                requestType ===
                  'pickup_item' &&
                startCoords
                  ? startCoords.lat
                  : null,

              pickup_lng:
                requestType ===
                  'pickup_item' &&
                startCoords
                  ? startCoords.lng
                  : null,

              dropoff_address:
                dropoffAddress,

              dropoff_lat:
                validDropoff.lat,

              dropoff_lng:
                validDropoff.lng,

              distance_km:
                dist.toFixed(2),

              delivery_fee:
                finalCalculatedFee,

              app_fee:
                frozenAppFee,

              payment_method:
                'cod',

              status:
                'pending',
            });

        if (error)
          throw error;

        // ─── START NOTIFY ONLINE & VERIFIED DRIVERS VIA TEXTBEE EDGE FUNCTION ───
        try {
          console.log('📢 Fetching online & verified drivers for Custom Request alert...');
          
          const { data: verifiedDrivers, error: driversErr } = await supabase
            .from('drivers')
            .select('user_id')
            .eq('is_verified', true);

          if (driversErr) {
            console.log('❌ Error fetching verified drivers:', driversErr);
          } else if (verifiedDrivers && verifiedDrivers.length > 0) {
            const verifiedDriverIds = verifiedDrivers.map(d => d.user_id);

            const { data: onlineProfiles, error: profilesErr } = await supabase
              .from('profiles')
              .select('id, phone')
              .in('id', verifiedDriverIds)
              .eq('is_online', true);

            if (profilesErr) {
              console.log('❌ Error fetching driver profiles:', profilesErr);
            } else if (onlineProfiles && onlineProfiles.length > 0) {
              console.log(`🚀 Found ${onlineProfiles.length} eligible online & verified driver(s) for custom request. Sending SMS...`);

              for (const driverProfile of onlineProfiles) {
                if (driverProfile.phone) {
                  
                  // 👇 Extract the customer's name safely from their profile
                  const customerName = profile?.full_name || profile?.name || 'a customer';

                  supabase.functions.invoke('notify-driver', {
                    body: {
                      phone: driverProfile.phone,
                      
                      // 👇 Send the customer's name instead of "a custom request"
                      storeName: customerName 
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
          console.log('❌ Error during custom request driver SMS notification blast:', smsBlastErr);
        }
        // ─── END NOTIFY ONLINE & VERIFIED DRIVERS ─────────────────────────────

        await persistLocations(
          pickupAddress,
          pickupCoords,
          dropoffAddress,
          dropoffCoords
        );

        showAlert(
          'Request Submitted!',
          'Your delivery request is now live and ready for a rider.',
          'success',
          [
            {
              text: 'View Orders',
              onPress: () => {
                hideAlert();

                navigation.navigate(
                  'OrderHistory'
                );
              },
              primary: true,
            },
          ]
        );
      } catch (err) {
        console.error(err);

        showAlert(
          'Something Went Wrong',
          err.message ||
            'An error occurred while submitting.',
          'error'
        );
      } finally {
        setSubmitting(false);
      }
    };

  // ======================================================
  // MAP PICKER
  // ======================================================

  const openPinPicker =
    (mode) => {
      let startCoords = null;

      if (
        mode === 'pickup'
      ) {
        startCoords =
          normalizeCoords(
            pickupCoords
          ) ||
          normalizeCoords(
            dropoffCoords
          );
      } else {
        startCoords =
          normalizeCoords(
            dropoffCoords
          );
      }

      setTempPinCoords(
        startCoords
      );

      setPinSessionId(
        (n) => n + 1
      );

      setActivePinMode(
        mode
      );
    };

  // ======================================================
  // MAP REGION CHANGE
  // ======================================================

  const handlePinRegionChange =
    (coords) => {
      const normalized =
        normalizeCoords(
          coords
        );

      if (normalized) {
        setTempPinCoords(
          normalized
        );
      }
    };

  // ======================================================
  // CONFIRM PIN
  // ======================================================

  const confirmPin =
    async () => {
      const normalized =
        normalizeCoords(
          tempPinCoords
        );

      if (!normalized) {
        showAlert(
          'Location Error',
          'The selected map location could not be detected. Please move the map and try again.',
          'warning'
        );

        return;
      }

      const distToHub =
        calculateDistanceKm(
          adminCenter.lat,
          adminCenter.lng,
          normalized.lat,
          normalized.lng
        );

      if (
        distToHub >
        maxRadiusKm
      ) {
        showAlert(
          'Out of Service Range',
          `This location is ${distToHub.toFixed(1)} km away. We only service areas within a ${maxRadiusKm} km radius from our hub. Please move the pin closer.`,
          'warning'
        );

        return;
      }

      setResolvingPinAddress(
        true
      );

      try {
        if (
          activePinMode ===
          'pickup'
        ) {
          setPickupCoords(
            normalized
          );

          const addr =
            await fetchAddressFromCoords(
              normalized.lat,
              normalized.lng,
              'pickup'
            );

          await persistLocations(
            addr,
            normalized,
            dropoffAddress,
            dropoffCoords
          );
        } else if (
          activePinMode ===
          'dropoff'
        ) {
          setDropoffCoords(
            normalized
          );

          setHasSavedDropoff(
            true
          );

          const addr =
            await fetchAddressFromCoords(
              normalized.lat,
              normalized.lng,
              'dropoff'
            );

          await persistLocations(
            pickupAddress,
            pickupCoords,
            addr,
            normalized
          );
        }
      } catch (error) {
        console.error(
          'Confirm pin error:',
          error
        );
      } finally {
        setResolvingPinAddress(
          false
        );

        setActivePinMode(
          null
        );
      }
    };

  // ======================================================
  // UI
  // ======================================================

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }
    >
      <LinearGradient
        colors={[
          '#065F46',
          '#059669',
          '#10B981',
          '#F8FAFC',
        ]}
        locations={[
          0,
          0.14,
          0.3,
          0.46,
        ]}
        style={
          StyleSheet.absoluteFillObject
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        contentContainerStyle={
          styles.scrollContainer
        }
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {/* HEADER */}

        <View
          style={styles.header}
        >
          <TouchableOpacity
            onPress={() =>
              navigation.goBack()
            }
            style={
              styles.backButton
            }
            activeOpacity={0.8}
          >
            <Ionicons
              name="arrow-back"
              size={21}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          <View
            style={
              styles.headerTextContainer
            }
          >
            <Text
              style={
                styles.headerSmallText
              }
            >
              PAABOT DELIVERY
            </Text>

            <Text
              style={styles.title}
            >
              New Request
            </Text>
          </View>
        </View>

        {/* FEATURE LOCKOUT */}

        {penaltyBalance > 0 ? (
          <View style={styles.blockedCard}>
            <View
              style={
                styles.blockedIconCircle
              }
            >
              <Ionicons
                name="lock-closed"
                size={32}
                color="#DC2626"
              />
            </View>

            <Text
              style={
                styles.blockedTitle
              }
            >
              Feature Locked
            </Text>

            <Text
              style={
                styles.blockedText
              }
            >
              You have an outstanding
              penalty of ₱
              {penaltyBalance.toFixed(
                2
              )} from a previous missed
              delivery.
            </Text>

            <Text
              style={
                styles.blockedSubtext
              }
            >
              Custom Requests are
              temporarily disabled. To
              unlock this feature, please
              clear your balance by placing
              a regular Store Order and
              securely paying via GCash or
              Card.
            </Text>

            <TouchableOpacity
              style={
                styles.blockedBtn
              }
              onPress={() =>
                navigation.goBack()
              }
              activeOpacity={0.85}
            >
              <Text
                style={
                  styles.blockedBtnText
                }
              >
                Go Back
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* REQUEST TYPE */}

            <View
              style={
                styles.serviceCard
              }
            >
              <View
                style={
                  styles.serviceHeader
                }
              >
                <View
                  style={
                    styles.serviceIcon
                  }
                >
                  <Ionicons
                    name="options-outline"
                    size={18}
                    color="#059669"
                  />
                </View>

                <View
                  style={
                    styles.serviceHeaderText
                  }
                >
                  <Text
                    style={
                      styles.serviceTitle
                    }
                  >
                    Choose a service
                  </Text>

                  <Text
                    style={
                      styles.serviceSubtitle
                    }
                  >
                    Select what you need Paabot
                    to do
                  </Text>
                </View>
              </View>

              <View
                style={
                  styles.tabContainer
                }
              >
                {/* REQUEST ITEM */}

                <TouchableOpacity
                  style={[
                    styles.tabButton,
                    requestType ===
                      'request_item' &&
                      styles.activeTabButton,
                  ]}
                  onPress={() => {
                    setRequestType(
                      'request_item'
                    );

                    setPickupAddress('');

                    setPickupCoords(null);
                  }}
                  activeOpacity={0.85}
                >
                  <View
                    style={[
                      styles.tabIcon,
                      requestType ===
                        'request_item' &&
                        styles.activeTabIcon,
                    ]}
                  >
                    <Ionicons
                      name="basket-outline"
                      size={20}
                      color={
                        requestType ===
                        'request_item'
                          ? '#059669'
                          : '#6B7280'
                      }
                    />
                  </View>

                  <View
                    style={
                      styles.tabTextContainer
                    }
                  >
                    <Text
                      style={[
                        styles.tabTitle,
                        requestType ===
                          'request_item' &&
                          styles.activeTabTitle,
                      ]}
                      numberOfLines={2}
                    >
                      Pabakal
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* PICKUP ITEM */}

                <TouchableOpacity
                  style={[
                    styles.tabButton,
                    requestType ===
                      'pickup_item' &&
                      styles.activeTabButton,
                  ]}
                  onPress={() => {
                    setRequestType(
                      'pickup_item'
                    );

                    setPickupAddress('');

                    setPickupCoords(
                      null
                    );

                    setCalculatedFee(
                      Number(
                        baseDeliveryFee
                      ) || 50
                    );
                  }}
                  activeOpacity={0.85}
                >
                  <View
                    style={[
                      styles.tabIcon,
                      requestType ===
                        'pickup_item' &&
                        styles.activeTabIcon,
                    ]}
                  >
                    <Ionicons
                      name="cube-outline"
                      size={20}
                      color={
                        requestType ===
                        'pickup_item'
                          ? '#059669'
                          : '#6B7280'
                      }
                    />
                  </View>

                  <View
                    style={
                      styles.tabTextContainer
                    }
                  >
                    <Text
                      style={[
                        styles.tabTitle,
                        requestType ===
                          'pickup_item' &&
                          styles.activeTabTitle,
                      ]}
                      numberOfLines={2}
                    >
                      Pakuha
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* MAP */}

            <View
              style={styles.mapCard}
            >
              <View
                style={
                  styles.mapHeader
                }
              >
                <View
                  style={
                    styles.mapHeaderText
                  }
                >
                  <Text
                    style={styles.mapTitle}
                  >
                    Delivery Location
                  </Text>

                  <Text
                    style={
                      styles.mapSubtitle
                    }
                    numberOfLines={2}
                  >
                    {dropoffCoords
                      ? 'Your destination is ready'
                      : 'Finding your current location...'}
                  </Text>
                </View>

                <View
                  style={
                    styles.mapStatus
                  }
                >
                  <View
                    style={
                      styles.statusDot
                    }
                  />

                  <Text
                    style={
                      styles.statusText
                    }
                  >
                    LIVE
                  </Text>
                </View>
              </View>

              <View
                style={
                  styles.mapContainer
                }
              >
                <OsmMap
                  center={
                    dropoffCoords
                  }
                  zoom={15}
                  markers={[
                    dropoffCoords && {
                      lat:
                        dropoffCoords.lat,
                      lng:
                        dropoffCoords.lng,
                      label:
                        'Drop-off Location',
                    },

                    pickupCoords && {
                      lat:
                        pickupCoords.lat,
                      lng:
                        pickupCoords.lng,
                      label:
                        'Pickup Location',
                    },
                  ].filter(Boolean)}
                />

                <TouchableOpacity
                  style={
                    styles.mapButton
                  }
                  activeOpacity={0.9}
                  onPress={() =>
                    openPinPicker(
                      requestType ===
                        'pickup_item'
                        ? 'pickup'
                        : 'dropoff'
                    )
                  }
                >
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color="#FFFFFF"
                  />

                  <Text
                    style={
                      styles.mapButtonText
                    }
                  >
                    Pin Location on Map
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* FORM */}

            <View
              style={styles.formCard}
            >
              <View
                style={
                  styles.formHeader
                }
              >
                <View
                  style={
                    styles.formHeaderIcon
                  }
                >
                  <Ionicons
                    name="document-text-outline"
                    size={20}
                    color="#059669"
                  />
                </View>

                <View
                  style={
                    styles.formHeaderText
                  }
                >
                  <Text
                    style={
                      styles.formTitle
                    }
                  >
                    Request Details
                  </Text>

                  <Text
                    style={
                      styles.formSubtitle
                    }
                  >
                    Complete the information
                    below
                  </Text>
                </View>
              </View>

              {/* GPS */}

              {requestType ===
                'request_item' && (
                <TouchableOpacity
                  style={
                    styles.gpsButton
                  }
                  activeOpacity={0.85}
                  disabled={
                    fetchingGps
                  }
                  onPress={
                    handleUseLiveGps
                  }
                >
                  <View
                    style={
                      styles.gpsIcon
                    }
                  >
                    {fetchingGps ? (
                      <ActivityIndicator
                        size="small"
                        color="#059669"
                      />
                    ) : (
                      <Ionicons
                        name="navigate"
                        size={18}
                        color="#059669"
                      />
                    )}
                  </View>

                  <View
                    style={
                      styles.gpsTextContainer
                    }
                  >
                    <Text
                      style={
                        styles.gpsTitle
                      }
                    >
                      {fetchingGps
                        ? 'Getting your location...'
                        : 'Use my current location'}
                    </Text>

                    <Text
                      style={
                        styles.gpsSubtitle
                      }
                      numberOfLines={2}
                    >
                      Set your live GPS position
                      as the destination
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={19}
                    color="#059669"
                  />
                </TouchableOpacity>
              )}

              {/* PICKUP */}

              {requestType ===
                'pickup_item' && (
                <View
                  style={
                    styles.locationSection
                  }
                >
                  <View
                    style={
                      styles.locationLabelRow
                    }
                  >
                    <View
                      style={[
                        styles.locationIndicator,
                        styles.pickupIndicator,
                      ]}
                    >
                      <Ionicons
                        name="location"
                        size={14}
                        color="#059669"
                      />
                    </View>

                    <Text
                      style={
                        styles.locationLabel
                      }
                    >
                      Pickup Location
                    </Text>

                    <View
                      style={
                        styles.requiredBadge
                      }
                    >
                      <Text
                        style={
                          styles.requiredText
                        }
                      >
                        REQUIRED
                      </Text>
                    </View>
                  </View>

                  <Input
                    label=""
                    value={
                      pickupAddress
                    }
                    onChangeText={
                      setPickupAddress
                    }
                    placeholder="Pin your package pickup location..."
                    editable={false}
                  />
                </View>
              )}

              {/* DROPOFF */}

              <View
                style={
                  styles.locationSection
                }
              >
                <View
                  style={
                    styles.locationLabelRow
                  }
                >
                  <View
                    style={[
                      styles.locationIndicator,
                      styles.dropoffIndicator,
                    ]}
                  >
                    <Ionicons
                      name="flag"
                      size={14}
                      color="#0284C7"
                    />
                  </View>

                  <Text
                    style={
                      styles.locationLabel
                    }
                  >
                    Drop-off Destination
                  </Text>

                  <View
                    style={[
                      styles.requiredBadge,
                      styles.destinationBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.requiredText,
                        styles.destinationBadgeText,
                      ]}
                    >
                      REQUIRED
                    </Text>
                  </View>
                </View>

                <Input
                  label=""
                  value={
                    dropoffAddress
                  }
                  onChangeText={
                    setDropoffAddress
                  }
                  placeholder="Tap the map to adjust destination..."
                />
              </View>

              {/* DESCRIPTION */}

              <View
                style={
                  styles.inputSection
                }
              >
                <Input
                  label={
                    requestType ===
                    'pickup_item'
                      ? 'What should the rider pick up?'
                      : 'What do you need?'
                  }
                  value={
                    description
                  }
                  onChangeText={
                    setDescription
                  }
                  placeholder={
                    requestType ===
                    'pickup_item'
                      ? 'Describe package (e.g. documents, clothes...)'
                      : 'List your items or tasks here...'
                  }
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* RIDER INSTRUCTIONS */}

              <View
                style={
                  styles.inputSection
                }
              >
                <Input
                  label="Instructions for Rider"
                  value={
                    riderInstructions
                  }
                  onChangeText={
                    setRiderInstructions
                  }
                  placeholder="e.g. Knock on the green gate, fragile item..."
                />

                <View
                  style={
                    styles.optionalRow
                  }
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={14}
                    color="#9CA3AF"
                  />

                  <Text
                    style={
                      styles.optionalText
                    }
                    numberOfLines={2}
                  >
                    Optional — add helpful
                    instructions for your rider
                  </Text>
                </View>
              </View>

              {/* ITEM COST */}

              {requestType ===
                'request_item' && (
                <View
                  style={
                    styles.inputSection
                  }
                >
                  <Input
                    label="Estimated Item Cost"
                    value={
                      itemCost
                    }
                    onChangeText={handlePriceChange(
                      setItemCost
                    )}
                    placeholder="0.00"
                    keyboardType="number-pad"
                  />

                  <Text
                    style={
                      styles.inputHint
                    }
                    numberOfLines={2}
                  >
                    The estimated amount the
                    rider will pay at the store
                  </Text>
                </View>
              )}

              {/* PAYMENT */}

              <View
                style={
                  styles.infoCard
                }
              >
                <View
                  style={
                    styles.infoIconGreen
                  }
                >
                  <Ionicons
                    name="cash-outline"
                    size={20}
                    color="#059669"
                  />
                </View>

                <View
                  style={
                    styles.infoTextContainer
                  }
                >
                  <Text
                    style={
                      styles.infoTitle
                    }
                  >
                    Cash on Delivery
                  </Text>

                  <Text
                    style={
                      styles.infoSubtitle
                    }
                    numberOfLines={2}
                  >
                    Payment will be collected
                    upon delivery
                  </Text>
                </View>

                <Ionicons
                  name="checkmark-circle"
                  size={21}
                  color="#059669"
                />
              </View>

              {/* DELIVERY FEE */}

              <View
                style={
                  styles.feeCard
                }
              >
                <View
                  style={
                    styles.feeLeft
                  }
                >
                  <View
                    style={
                      styles.feeIcon
                    }
                  >
                    <Ionicons
                      name="pricetag-outline"
                      size={19}
                      color="#D97706"
                    />
                  </View>

                  <View
                    style={
                      styles.feeTextContainer
                    }
                  >
                    <Text
                      style={
                        styles.feeLabel
                      }
                    >
                      Delivery Fee
                    </Text>

                    <Text
                      style={
                        styles.feeDescription
                      }
                      numberOfLines={2}
                    >
                      {requestType ===
                      'pickup_item'
                        ? pickupCoords
                          ? 'Based on pickup to drop-off distance'
                          : 'Select a pickup location to calculate'
                        : 'Calculated based on distance'}
                    </Text>
                  </View>
                </View>

                <Text
                  style={
                    styles.feeAmount
                  }
                >
                  ₱
                  {calculatedFee.toFixed(
                    2
                  )}
                </Text>
              </View>

              {/* SUBMIT */}

              <View
                style={
                  styles.submitSection
                }
              >
                <Button
                  title={
                    submitting
                      ? 'Submitting...'
                      : `Request Now  •  ₱${calculatedFee.toFixed(
                          2
                        )}`
                  }
                  onPress={
                    handleSubmit
                  }
                  loading={
                    submitting ||
                    locatingUser
                  }
                  disabled={
                    !dropoffCoords
                  }
                />

                <View
                  style={
                    styles.secureRow
                  }
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={14}
                    color="#9CA3AF"
                  />

                  <Text
                    style={
                      styles.secureText
                    }
                    numberOfLines={2}
                  >
                    Your request information is
                    securely submitted
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* ==================================================
          FULL SCREEN MAP PICKER
      ================================================== */}

      <Modal
        visible={
          activePinMode !== null
        }
        animationType="slide"
        statusBarTranslucent
        hardwareAccelerated
        onRequestClose={() =>
          setActivePinMode(
            null
          )
        }
      >
        <View
          style={
            styles.modalContainer
          }
        >
          <OsmMap
            key={`pin-session-${pinSessionId}`}
            center={
              tempPinCoords
            }
            zoom={17}
            markers={[]}
            onRegionChange={
              handlePinRegionChange
            }
          />

          {/* CENTER PIN */}

          <View
            style={
              styles.centerPinWrap
            }
            pointerEvents="none"
          >
            <Ionicons
              name={
                activePinMode ===
                'pickup'
                  ? 'location'
                  : 'flag'
              }
              size={42}
              color={
                activePinMode ===
                'pickup'
                  ? '#059669'
                  : '#0284C7'
              }
            />

            <View
              style={
                styles.centerPinShadow
              }
            />
          </View>

          {/* MODAL HEADER */}

          <View
            style={
              styles.modalHeader
            }
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={
                styles.modalCloseButton
              }
              onPress={() =>
                setActivePinMode(
                  null
                )
              }
              activeOpacity={0.8}
            >
              <Ionicons
                name="close"
                size={23}
                color="#111827"
              />
            </TouchableOpacity>

            <View
              style={
                styles.modalInstruction
              }
            >
              <View
                style={
                  styles.modalInstructionIcon
                }
              >
                <Ionicons
                  name="move-outline"
                  size={16}
                  color="#FFFFFF"
                />
              </View>

              <Text
                style={
                  styles.modalInstructionText
                }
                numberOfLines={2}
              >
                Move the map to place the pin
              </Text>
            </View>
          </View>

          {/* MAP LOCATION TABS */}

          <View
            style={
              styles.modalLocationButtons
            }
            pointerEvents="box-none"
          >
            {requestType ===
              'pickup_item' && (
              <TouchableOpacity
                style={[
                  styles.modalLocationButton,
                  activePinMode ===
                    'pickup' &&
                    styles.modalLocationButtonActive,
                ]}
                activeOpacity={0.85}
                onPress={() => {
                  setTempPinCoords(
                    normalizeCoords(
                      pickupCoords
                    ) ||
                      normalizeCoords(
                        dropoffCoords
                      )
                  );

                  setActivePinMode(
                    'pickup'
                  );
                }}
              >
                <Ionicons
                  name="location"
                  size={17}
                  color={
                    activePinMode ===
                    'pickup'
                      ? '#FFFFFF'
                      : '#059669'
                  }
                />

                <Text
                  style={[
                    styles.modalLocationText,
                    activePinMode ===
                      'pickup' &&
                      styles.modalLocationTextActive,
                  ]}
                >
                  Pickup
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.modalLocationButton,
                styles.modalDropoffButton,
                activePinMode ===
                  'dropoff' &&
                  styles.modalDropoffButtonActive,
                requestType ===
                  'request_item' &&
                  styles.fullWidthModalButton,
              ]}
              activeOpacity={0.85}
              onPress={() => {
                setTempPinCoords(
                  normalizeCoords(
                    dropoffCoords
                  )
                );

                setActivePinMode(
                  'dropoff'
                );
              }}
            >
              <Ionicons
                name="flag"
                size={17}
                color={
                  activePinMode ===
                  'dropoff'
                    ? '#FFFFFF'
                    : '#0284C7'
                }
              />

              <Text
                style={[
                  styles.modalLocationText,
                  styles.modalDropoffText,
                  activePinMode ===
                    'dropoff' &&
                    styles.modalLocationTextActive,
                ]}
              >
                Drop-off
              </Text>
            </TouchableOpacity>
          </View>

          {/* CONFIRM */}

          <View
            style={
              styles.modalFooter
            }
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={[
                styles.confirmButton,
                resolvingPinAddress &&
                  styles.disabledButton,
              ]}
              activeOpacity={0.85}
              disabled={
                resolvingPinAddress
              }
              onPress={
                confirmPin
              }
            >
              {resolvingPinAddress ? (
                <ActivityIndicator
                  size="small"
                  color="#FFFFFF"
                />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={21}
                    color="#FFFFFF"
                  />

                  <Text
                    style={
                      styles.confirmButtonText
                    }
                    numberOfLines={2}
                  >
                    Confirm{' '}
                    {activePinMode ===
                    'pickup'
                      ? 'Pickup'
                      : 'Drop-off'}{' '}
                    Location
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ==================================================
          CUSTOM ALERT
      ================================================== */}

      <Modal
        visible={
          alertModal.visible
        }
        transparent
        animationType="fade"
        onRequestClose={
          hideAlert
        }
      >
        <View
          style={
            styles.alertBackdrop
          }
        >
          <View
            style={
              styles.alertCard
            }
          >
            <View
              style={[
                styles.alertIcon,
                alertModal.type ===
                  'error' &&
                  styles.alertErrorIcon,
                alertModal.type ===
                  'warning' &&
                  styles.alertWarningIcon,
                alertModal.type ===
                  'success' &&
                  styles.alertSuccessIcon,
              ]}
            >
              <Ionicons
                name={
                  alertModal.type ===
                  'error'
                    ? 'alert-circle'
                    : alertModal.type ===
                      'warning'
                    ? 'warning'
                    : 'checkmark-circle'
                }
                size={35}
                color={
                  alertModal.type ===
                  'error'
                    ? '#DC2626'
                    : alertModal.type ===
                      'warning'
                    ? '#D97706'
                    : '#059669'
                }
              />
            </View>

            <Text
              style={
                styles.alertTitle
              }
              numberOfLines={3}
            >
              {
                alertModal.title
              }
            </Text>

            {/* SCROLLABLE COMPLETE DELIVERY DETAILS */}
            <ScrollView
              style={
                styles.alertMessageScroll
              }
              contentContainerStyle={
                styles.alertMessageContent
              }
              showsVerticalScrollIndicator={
                true
              }
              nestedScrollEnabled
            >
              <Text
                style={
                  styles.alertMessageText
                }
              >
                {
                  alertModal.message
                }
              </Text>
            </ScrollView>

            <View
              style={
                styles.alertButtons
              }
            >
              {alertModal.buttons.map(
                (
                  btn,
                  index
                ) => (
                  <TouchableOpacity
                    key={
                      index
                    }
                    style={[
                      styles.alertButton,
                      btn.style ===
                        'cancel' &&
                        styles.alertCancelButton,
                      btn.primary &&
                        styles.alertPrimaryButton,
                    ]}
                    activeOpacity={
                      0.8
                    }
                    onPress={() => {
                      hideAlert();

                      if (
                        btn.onPress
                      ) {
                        btn.onPress();
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.alertButtonText,
                        btn.style ===
                          'cancel' &&
                          styles.alertCancelText,
                        btn.primary &&
                          styles.alertPrimaryText,
                      ]}
                      numberOfLines={
                        2
                      }
                    >
                      {
                        btn.text
                      }
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ======================================================
// STYLES
// ======================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  scrollContainer: {
    paddingBottom: 60,
  },

  // --------------------------------------------------
  // HEADER
  // --------------------------------------------------

  header: {
    paddingTop:
      Platform.OS === 'ios'
        ? 60
        : 50,
    paddingHorizontal: 20,
    paddingBottom: 26,
    flexDirection: 'row',
    alignItems: 'center',
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor:
      'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor:
      'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTextContainer: {
    flex: 1,
    marginLeft: 14,
    minWidth: 0,
  },

  headerSmallText: {
    color:
      'rgba(255,255,255,0.72)',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 4,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: 0.2,
  },

  // --------------------------------------------------
  // SERVICE CARD
  // --------------------------------------------------

  serviceCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },

  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },

  serviceIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  serviceHeaderText: {
    flex: 1,
    minWidth: 0,
  },

  serviceTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.1,
  },

  serviceSubtitle: {
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 3,
    lineHeight: 16,
  },

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 18,
    padding: 5,
  },

  tabButton: {
    flex: 1,
    minHeight: 84,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 2,
    minWidth: 0,
  },

  activeTabButton: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },

  tabIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    flexShrink: 0,
  },

  activeTabIcon: {
    backgroundColor: '#ECFDF5',
  },

  tabTextContainer: {
    flex: 1,
    minWidth: 0,
  },

  tabTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#4B5563',
    lineHeight: 17,
    flexShrink: 1,
  },

  activeTabTitle: {
    color: '#047857',
  },

  // --------------------------------------------------
  // MAP
  // --------------------------------------------------

  mapCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 9,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },

  mapHeader: {
    paddingHorizontal: 11,
    paddingTop: 9,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  mapHeaderText: {
    flex: 1,
    paddingRight: 8,
    minWidth: 0,
  },

  mapTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },

  mapSubtitle: {
    fontSize: 10.5,
    color: '#6B7280',
    marginTop: 3,
    lineHeight: 15,
  },

  mapStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    flexShrink: 0,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },

  statusText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.8,
  },

  mapContainer: {
    height: 210,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E5E7EB',
  },

  mapButton: {
    position: 'absolute',
    bottom: 13,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 26,
    elevation: 5,
    shadowColor: '#065F46',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.28,
    shadowRadius: 8,
  },

  mapButtonText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
    marginLeft: 7,
    letterSpacing: 0.1,
  },

  // --------------------------------------------------
  // FORM
  // --------------------------------------------------

  formCard: {
    marginHorizontal: 16,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },

  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },

  formHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  formHeaderText: {
    flex: 1,
    minWidth: 0,
  },

  formTitle: {
    fontSize: 16.5,
    fontWeight: '900',
    color: '#0F172A',
  },

  formSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 3,
    lineHeight: 15,
  },

  // --------------------------------------------------
  // GPS
  // --------------------------------------------------

  gpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#F0FDF4',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 20,
  },

  gpsIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    flexShrink: 0,
  },

  gpsTextContainer: {
    flex: 1,
    minWidth: 0,
  },

  gpsTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#047857',
    lineHeight: 17,
  },

  gpsSubtitle: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 3,
    lineHeight: 14,
    flexShrink: 1,
  },

  // --------------------------------------------------
  // LOCATION
  // --------------------------------------------------

  locationSection: {
    marginBottom: 17,
  },

  locationLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },

  locationIndicator: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    flexShrink: 0,
  },

  pickupIndicator: {
    backgroundColor: '#ECFDF5',
  },

  dropoffIndicator: {
    backgroundColor: '#EFF6FF',
  },

  locationLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#374151',
    lineHeight: 17,
  },

  requiredBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    marginLeft: 6,
    flexShrink: 0,
  },

  requiredText: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.5,
  },

  destinationBadge: {
    backgroundColor: '#EFF6FF',
  },

  destinationBadgeText: {
    color: '#0284C7',
  },

  inputSection: {
    marginBottom: 14,
  },

  optionalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: -3,
    marginBottom: 9,
    paddingLeft: 3,
    paddingRight: 5,
  },

  optionalText: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    color: '#9CA3AF',
    marginLeft: 5,
    lineHeight: 14,
  },

  inputHint: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: -4,
    marginBottom: 9,
    paddingLeft: 3,
    lineHeight: 14,
  },

  // --------------------------------------------------
  // INFO CARDS
  // --------------------------------------------------

  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 17,
    padding: 14,
    marginTop: 6,
    marginBottom: 12,
  },

  infoIconGreen: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    flexShrink: 0,
  },

  infoTextContainer: {
    flex: 1,
    minWidth: 0,
  },

  infoTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#065F46',
    lineHeight: 17,
  },

  infoSubtitle: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 3,
    lineHeight: 14,
  },

  feeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 17,
    padding: 14,
    marginBottom: 10,
  },

  feeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },

  feeIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    flexShrink: 0,
  },

  feeTextContainer: {
    flex: 1,
    minWidth: 0,
  },

  feeLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400E',
    lineHeight: 17,
  },

  feeDescription: {
    fontSize: 10,
    color: '#A16207',
    marginTop: 3,
    lineHeight: 14,
    flexShrink: 1,
  },

  feeAmount: {
    fontSize: 19,
    fontWeight: '900',
    color: '#92400E',
    marginLeft: 8,
    flexShrink: 0,
    letterSpacing: 0.2,
  },

  // --------------------------------------------------
  // SUBMIT
  // --------------------------------------------------

  submitSection: {
    marginTop: 15,
  },

  secureRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 5,
  },

  secureText: {
    flex: 1,
    minWidth: 0,
    fontSize: 9.5,
    color: '#9CA3AF',
    marginLeft: 5,
    lineHeight: 14,
    textAlign: 'center',
  },

  // --------------------------------------------------
  // MAP MODAL
  // --------------------------------------------------

  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },

  centerPinWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -21,
    marginTop: -42,
    alignItems: 'center',
    zIndex: 50,
  },

  centerPinShadow: {
    width: 13,
    height: 5,
    borderRadius: 6,
    backgroundColor:
      'rgba(0,0,0,0.28)',
    marginTop: -1,
  },

  modalHeader: {
    position: 'absolute',
    top:
      Platform.OS === 'ios'
        ? 54
        : 44,
    left: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    zIndex: 100,
  },

  modalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 7,
  },

  modalInstruction: {
    maxWidth:
      SCREEN_WIDTH - 85,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor:
      'rgba(15,23,42,0.90)',
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 22,
    elevation: 4,
    minWidth: 0,
  },

  modalInstructionIcon: {
    marginRight: 6,
    flexShrink: 0,
  },

  modalInstructionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    flexShrink: 1,
  },

  modalLocationButtons: {
    position: 'absolute',
    top: 114,
    left: 18,
    right: 18,
    flexDirection: 'row',
    zIndex: 100,
  },

  modalLocationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#059669',
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    marginRight: 5,
    minWidth: 0,
  },

  modalLocationButtonActive: {
    backgroundColor: '#059669',
  },

  modalDropoffButton: {
    borderColor: '#0284C7',
    marginRight: 0,
    marginLeft: 5,
  },

  modalDropoffButtonActive: {
    backgroundColor: '#0284C7',
  },

  fullWidthModalButton: {
    flex: 1,
    marginLeft: 0,
  },

  modalLocationText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
    marginLeft: 6,
  },

  modalDropoffText: {
    color: '#0284C7',
  },

  modalLocationTextActive: {
    color: '#FFFFFF',
  },

  modalFooter: {
    position: 'absolute',
    bottom:
      Platform.OS === 'ios'
        ? 40
        : 30,
    left: 20,
    right: 20,
    zIndex: 100,
  },

  confirmButton: {
    minHeight: 58,
    borderRadius: 19,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    elevation: 6,
    shadowColor: '#065F46',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },

  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '900',
    marginLeft: 8,
    textAlign: 'center',
    flexShrink: 1,
    lineHeight: 19,
    letterSpacing: 0.1,
  },

  disabledButton: {
    opacity: 0.55,
  },

  // --------------------------------------------------
  // ALERT
  // --------------------------------------------------

  alertBackdrop: {
    flex: 1,
    backgroundColor:
      'rgba(15,23,42,0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  alertCard: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.22,
    shadowRadius: 24,
  },

  alertIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 17,
  },

  alertSuccessIcon: {
    backgroundColor: '#ECFDF5',
  },

  alertErrorIcon: {
    backgroundColor: '#FEE2E2',
  },

  alertWarningIcon: {
    backgroundColor: '#FEF3C7',
  },

  alertTitle: {
    fontSize: 19.5,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 13,
    lineHeight: 25,
  },

  // Scrollable area for complete confirmation details
  alertMessageScroll: {
    width: '100%',
    maxHeight: 390,
    marginBottom: 20,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },

  alertMessageContent: {
    paddingVertical: 14,
    paddingHorizontal: 15,
  },

  // Left-aligned so the delivery details look like a readable list
  alertMessageText: {
    fontSize: 12.5,
    color: '#374151',
    textAlign: 'left',
    lineHeight: 20,
  },

  alertButtons: {
    flexDirection: 'row',
    width: '100%',
  },

  alertButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginHorizontal: 4,
  },

  alertCancelButton: {
    backgroundColor: '#F3F4F6',
  },

  alertPrimaryButton: {
    backgroundColor: '#059669',
    elevation: 3,
    shadowColor: '#065F46',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },

  alertButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#374151',
    textAlign: 'center',
    lineHeight: 17,
  },

  alertCancelText: {
    color: '#4B5563',
  },

  alertPrimaryText: {
    color: '#FFFFFF',
  },

  // --------------------------------------------------
  // BLOCKED STATE
  // --------------------------------------------------

  blockedCard: {
    marginHorizontal: 16,
    marginTop: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 26,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    elevation: 4,
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },

  blockedIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 17,
    borderWidth: 2,
    borderColor: '#FECACA',
  },

  blockedTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 9,
  },

  blockedText: {
    fontSize: 13.5,
    color: '#DC2626',
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 13,
  },

  blockedSubtext: {
    fontSize: 12.5,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 26,
  },

  blockedBtn: {
    width: '100%',
    backgroundColor: '#0F172A',
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
  },

  blockedBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});