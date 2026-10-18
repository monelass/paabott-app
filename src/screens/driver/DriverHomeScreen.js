import React, { useEffect, useState, useCallback, useRef } from 'react';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Switch,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Modal,
  ScrollView,
  Linking,
  Animated,
  Easing,
  Image,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';

import {
  getAvailableJobs,
  acceptDelivery,
  subscribeToNewJobs,
} from '../../services/deliveryService';

import OsmMap from '../../components/OsmMap';
import { colors } from '../../theme/colors';

/* =========================================================
   DESIGN TOKENS (shared with the profile screen)
========================================================= */

const C = {
  brand: '#059669',
  brandDark: '#064E3B',
  brandSoft: '#E7F6EF',
  brandLine: '#BFE8D5',
  ink: '#10231B',
  body: '#4A5A52',
  muted: '#7B8A82',
  line: '#E6ECE8',
  bg: '#F4F7F5',
  card: '#FFFFFF',
  amber: '#B45309',
  amberSoft: '#FEF6E0',
  amberLine: '#F8DFA0',
  red: '#DC2626',
  redSoft: '#FEF2F2',
  redLine: '#F7D1D1',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
  purple: '#7C3AED',
  purpleSoft: '#F5F3FF',
};

const cardShadow = {
  shadowColor: '#14382B',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
};

const NOTICE_TYPES = {
  info: { icon: 'information-circle', color: C.blue, bg: C.blueSoft },
  warning: { icon: 'alert-circle', color: C.amber, bg: C.amberSoft },
  error: { icon: 'close-circle', color: C.red, bg: C.redSoft },
  success: { icon: 'checkmark-circle', color: C.brand, bg: C.brandSoft },
  lock: { icon: 'lock-closed', color: C.purple, bg: C.purpleSoft },
};

/* =========================================================
   HELPERS (logic unchanged)
========================================================= */

const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return 0;
  }

  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  let a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  a = Math.min(1, Math.max(0, a));

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const getPaymentMethodLabel = (item) => {
  if (!item) {
    return 'Cash on Delivery (COD)';
  }

  const pm = String(item.payment_method || '').toLowerCase().trim();
  const status = String(item.status || '').toLowerCase().trim();
  const payStatus = String(item.payment_status || '').toLowerCase().trim();
  const desc = String(item.description || item.item_description || '')
    .toLowerCase()
    .trim();

  if (
    pm === 'online' ||
    pm.includes('online') ||
    pm.includes('gcash') ||
    pm.includes('paymongo') ||
    pm.includes('card') ||
    status === 'paid' ||
    payStatus === 'paid' ||
    desc.includes('paid online') ||
    desc.includes('paymongo')
  ) {
    return 'Paid Online (GCash/Card)';
  }

  return 'Cash on Delivery (COD)';
};

// NEW HELPER: Dynamically generates text from JSON array ignoring unavailable items
const getActiveItemsText = (job) => {
  if (!job) return '';
  
  if (['store', 'store_order'].includes(job.request_type) && job.items) {
    try {
      const itemsArr = typeof job.items === 'string' ? JSON.parse(job.items) : job.items;
      if (Array.isArray(itemsArr)) {
        const active = itemsArr.filter(i => 
          !i.is_unavailable && 
          !i.is_penalty && 
          !(i.name || '').toLowerCase().includes('penalty')
        );
        if (active.length > 0) {
          return active.map(i => `${i.qty || i.quantity || 1}x ${i.name || i.title || 'Item'}`).join(', ');
        }
      }
    } catch (e) {
      // Keep falling back below if parsing fails
    }
  }
  
  return job.item_description || job.description || '';
};

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

  // Uses the new helper to clean out cancelled items
  const rawText = getActiveItemsText(job);

  let type = 'Custom Request';

  if (rawText.includes('PACKAGE PICKUP') || job.request_type === 'pickup_item') {
    type = 'Pakuha';
  } else if (
    rawText.includes('ITEM REQUEST') ||
    job.request_type === 'request_item'
  ) {
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

  const cleanDetails = rawText
    .replace(
      /\[(PACKAGE PICKUP|ITEM REQUEST|ESTIMATED ITEM COST:[^\]]+)\]/g,
      ''
    )
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
   SMALL COMPONENTS
========================================================= */

function AnimatedEntrance({ index, children, style }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    const delay = Math.min(index || 0, 8) * 55;

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 360,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 420,
        delay,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

function PressScale({ children, onPress, style, disabled }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () =>
    Animated.spring(scale, {
      toValue: 0.975,
      friction: 9,
      tension: 140,
      useNativeDriver: true,
    }).start();

  const pressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      friction: 6,
      tension: 120,
      useNativeDriver: true,
    }).start();

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

function IconBox({ name, color = C.brand, bg = C.brandSoft, size = 20, box = 40 }) {
  return (
    <View
      style={[
        styles.iconBox,
        { width: box, height: box, borderRadius: box * 0.3, backgroundColor: bg },
      ]}
    >
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
}

function DetailCard({ icon, title, subtitle, children }) {
  return (
    <View style={styles.detailCard}>
      <View style={styles.detailHead}>
        <IconBox name={icon} size={17} box={34} />
        <View style={styles.flex}>
          <Text style={styles.detailTitle}>{title}</Text>
          {subtitle ? <Text style={styles.detailSub}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/* =========================================================
   LOCKED ACCESS GESTURE (animation unchanged)
========================================================= */

function AnimatedNoGesture() {
  const fingerX = useRef(new Animated.Value(0)).current;
  const fingerRotate = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const step = (toValue, duration) =>
      Animated.parallel([
        Animated.timing(fingerX, {
          toValue: toValue * 6,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(fingerRotate, {
          toValue,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]);

    const noGesture = Animated.loop(
      Animated.sequence([step(-1, 220), step(1, 440), step(0, 220), Animated.delay(700)])
    );

    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    noGesture.start();
    breathing.start();

    return () => {
      noGesture.stop();
      breathing.stop();
    };
  }, []);

  const rotate = fingerRotate.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-8deg', '0deg', '8deg'],
  });

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  return (
    <Animated.View style={[styles.lockedChip, { transform: [{ scale }] }]}>
      <Animated.View style={{ transform: [{ translateX: fingerX }, { rotate }] }}>
        <Ionicons name="hand-left" size={17} color={C.purple} />
      </Animated.View>
      <Text style={styles.lockedChipText}>Verify first</Text>
    </Animated.View>
  );
}

/* =========================================================
   NOTICE MODAL
========================================================= */

function DriverNoticeModal({
  visible,
  type = 'info',
  title,
  message,
  buttonText = 'Okay',
  onClose,
}) {
  const current = NOTICE_TYPES[type] || NOTICE_TYPES.info;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={[styles.dialogIcon, { backgroundColor: current.bg }]}>
            <Ionicons name={current.icon} size={30} color={current.color} />
          </View>

          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogMessage}>{message}</Text>

          <TouchableOpacity
            style={[styles.dialogButton, { backgroundColor: current.color }]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.dialogButtonText}>{buttonText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* =========================================================
   SCREEN
========================================================= */

export default function DriverHomeScreen({ navigation }) {
  const { profile, refreshProfile } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [online, setOnline] = useState(profile?.is_online || false);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [remittanceLimit, setRemittanceLimit] = useState(1000);
  const [cashOnHand, setCashOnHand] = useState(0);
  const [isSuspended, setIsSuspended] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState('unverified');
  const [showAcceptLoading, setShowAcceptLoading] = useState(false);
  const [acceptLoadingText, setAcceptLoadingText] = useState(
    'Confirming delivery request...'
  );
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);

  const [notice, setNotice] = useState({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showNotice = useCallback((type, title, message) => {
    setNotice({ visible: true, type, title, message });
  }, []);

  const closeNotice = useCallback(() => {
    setNotice({ visible: false, type: 'info', title: '', message: '' });
  }, []);

  /* ---------------- ANIMATION VALUES ---------------- */

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-14)).current;
  const statusDotPulse = useRef(new Animated.Value(0)).current;
  const toggleGlow = useRef(new Animated.Value(0)).current;
  const acceptPopupScale = useRef(new Animated.Value(0.94)).current;
  const acceptPopupOpacity = useRef(new Animated.Value(0)).current;
  const routeSweep = useRef(new Animated.Value(-105)).current;
  const routeGlow = useRef(new Animated.Value(0)).current;
  const routeCorePulse = useRef(new Animated.Value(0)).current;
  const routeNodeOne = useRef(new Animated.Value(0)).current;
  const routeNodeTwo = useRef(new Animated.Value(0)).current;
  const routeNodeThree = useRef(new Animated.Value(0)).current;
  const particleOne = useRef(new Animated.Value(0)).current;
  const particleTwo = useRef(new Animated.Value(0)).current;
  const acceptProgress = useRef(new Animated.Value(0)).current;
  const progressShimmer = useRef(new Animated.Value(-100)).current;

  // UI-only animation for the floating active-delivery button.
  // Does not affect delivery logic or navigation state.
  const activeFloatPulse = useRef(new Animated.Value(0)).current;

  const animationLoops = useRef([]);
  const animationTimeouts = useRef([]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(headerSlide, {
        toValue: 0,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(statusDotPulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(statusDotPulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => loop.stop();
  }, []);

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(activeFloatPulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(activeFloatPulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    floatLoop.start();

    return () => floatLoop.stop();
  }, []);

  useEffect(() => {
    if (profile?.avatar_url) {
      setAvatarUrl(profile.avatar_url);
    }

    if (typeof profile?.is_online === 'boolean') {
      setOnline(profile.is_online);
    }
  }, [profile?.avatar_url, profile?.is_online]);

  useEffect(() => {
    Animated.timing(toggleGlow, {
      toValue: online ? 1 : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [online]);

  const stopAcceptAnimation = useCallback(() => {
    animationLoops.current.forEach((loop) => {
      try {
        loop.stop();
      } catch (e) {}
    });

    animationLoops.current = [];

    animationTimeouts.current.forEach((timeout) => clearTimeout(timeout));

    animationTimeouts.current = [];

    routeSweep.stopAnimation();
    routeGlow.stopAnimation();
    routeCorePulse.stopAnimation();
    routeNodeOne.stopAnimation();
    routeNodeTwo.stopAnimation();
    routeNodeThree.stopAnimation();
    particleOne.stopAnimation();
    particleTwo.stopAnimation();
    acceptProgress.stopAnimation();
    progressShimmer.stopAnimation();
    acceptPopupScale.stopAnimation();
    acceptPopupOpacity.stopAnimation();
  }, []);

  useEffect(() => () => stopAcceptAnimation(), [stopAcceptAnimation]);

  const startAcceptAnimation = useCallback(() => {
    stopAcceptAnimation();

    setShowAcceptLoading(true);
    setAcceptLoadingText('Confirming delivery request...');

    acceptPopupScale.setValue(0.94);
    acceptPopupOpacity.setValue(0);
    routeSweep.setValue(-105);
    routeGlow.setValue(0);
    routeCorePulse.setValue(0);
    routeNodeOne.setValue(0);
    routeNodeTwo.setValue(0);
    routeNodeThree.setValue(0);
    particleOne.setValue(0);
    particleTwo.setValue(0);
    acceptProgress.setValue(0);
    progressShimmer.setValue(-100);

    const pulseLoop = (value) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );

    const loops = [
      Animated.loop(
        Animated.timing(routeSweep, {
          toValue: 105,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ),
      pulseLoop(routeGlow),
      pulseLoop(routeCorePulse),
      Animated.loop(
        Animated.timing(particleOne, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        })
      ),
      Animated.loop(
        Animated.timing(particleTwo, {
          toValue: 1,
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        })
      ),
      Animated.loop(
        Animated.timing(progressShimmer, {
          toValue: 100,
          duration: 1100,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ),
    ];

    animationLoops.current = loops;

    loops.forEach((loop) => loop.start());

    Animated.parallel([
      Animated.spring(acceptPopupScale, {
        toValue: 1,
        friction: 9,
        tension: 65,
        useNativeDriver: true,
      }),
      Animated.timing(acceptPopupOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.timing(routeNodeOne, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }),
      Animated.timing(acceptProgress, {
        toValue: 0.26,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(routeNodeTwo, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(acceptProgress, {
        toValue: 0.55,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(routeNodeThree, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(acceptProgress, {
        toValue: 0.82,
        duration: 350,
        useNativeDriver: false,
      }),
    ]).start();

    animationTimeouts.current.push(
      setTimeout(() => setAcceptLoadingText('Securing your delivery slot...'), 650)
    );

    animationTimeouts.current.push(
      setTimeout(() => setAcceptLoadingText('Preparing your route...'), 1300)
    );

    animationTimeouts.current.push(
      setTimeout(() => setAcceptLoadingText('Opening active delivery...'), 2050)
    );
  }, []);

  /* ---------------- EXTERNAL MAP ---------------- */

  const openExternalMap = (lat, lng, label) => {
    if (lat == null || lng == null) {
      showNotice(
        'error',
        'Location unavailable',
        'Coordinates are not available for this location, so navigation cannot be opened.'
      );

      return;
    }

    const scheme = Platform.select({
      ios: 'maps:0,0?q=',
      android: 'geo:0,0?q=',
    });

    const latLng = `${lat},${lng}`;

    const url = Platform.select({
      ios: `${scheme}${label ? encodeURIComponent(label) : latLng}@${latLng}`,
      android: `${scheme}${latLng}(${
        label ? encodeURIComponent(label) : 'Destination'
      })`,
    });

    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Linking.openURL(
          `https://www.google.com/maps/search/?api=1&query=${latLng}`
        );
      }
    });
  };

  /* ---------------- FORMAT STORE ORDER ---------------- */

  const formatStoreOrder = useCallback(
    (order, customerName = 'Valued Customer', customerPhone = '') => {
      if (!order) {
        return null;
      }

      const storeObj = order.stores || order.store || {};

      const storeName = storeObj.name || order.store_name || 'Store';

      const storeAddress =
        storeObj.address ||
        order.store_address ||
        order.pickup_address ||
        'Store Address';

      const storeLat = parseFloat(
        storeObj.lat || order.store_lat || order.pickup_lat
      );

      const storeLng = parseFloat(
        storeObj.lng || order.store_lng || order.pickup_lng
      );

      const dropLat = parseFloat(
        order.delivery_lat || order.lat || order.dropoff_lat
      );

      const dropLng = parseFloat(
        order.delivery_lng || order.lng || order.dropoff_lng
      );

      let calculatedDist = calculateDistanceKm(
        storeLat,
        storeLng,
        dropLat,
        dropLng
      );

      if (Number.isNaN(calculatedDist)) {
        calculatedDist = 0;
      }

      return {
        ...order,
        id: order.id,
        request_type: order.request_type || 'store_order',
        description:
          order.description || `Store Order #${order.id?.toString().slice(-4)}`,
        subtotal: order.subtotal || 0,
        delivery_fee: order.delivery_fee || 0,
        app_fee: order.app_fee || 0, // Safely mapped
        total_amount: order.total_amount || 0,
        pickup_name: storeName,
        pickup_address: storeAddress,
        pickup_lat: storeLat,
        pickup_lng: storeLng,
        customer_name: order.customer_name || customerName,
        customer_phone: order.customer_phone || customerPhone,
        dropoff_address:
          order.delivery_address ||
          order.address ||
          order.dropoff_address ||
          'Customer Address',
        dropoff_lat: dropLat,
        dropoff_lng: dropLng,
        distance_km:
          calculatedDist > 0
            ? calculatedDist.toFixed(2)
            : order.distance_km || null,
        notes: order.delivery_instructions || order.notes,
        items: order.items,
        item_details: order.items || order.item_details,
        payment_method: order.payment_method || 'cod',
        payment_status: order.payment_status || 'unpaid',
      };
    },
    []
  );

  /* ---------------- LOAD DASHBOARD DATA ---------------- */

  const loadDashboardData = useCallback(async () => {
    try {
      if (!profile?.id) {
        return;
      }

      const { data: driverData } = await supabase
        .from('drivers')
        .select('is_verified, verification_status')
        .eq('user_id', profile.id)
        .maybeSingle();

      const currentlyVerified = driverData?.is_verified || false;

      setIsVerified(currentlyVerified);

      setVerificationStatus(driverData?.verification_status || 'unverified');

      const { data: profileData } = await supabase
        .from('profiles')
        .select('status, is_online, avatar_url')
        .eq('id', profile.id)
        .maybeSingle();

      if (profileData) {
        setAvatarUrl(profileData.avatar_url || profile?.avatar_url || null);

        const suspended = profileData.status === 'suspended';

        setIsSuspended(suspended);

        if (suspended && profileData.is_online) {
          setOnline(false);

          await supabase
            .from('profiles')
            .update({ is_online: false })
            .eq('id', profile.id);
        } else if (profileData.is_online !== undefined && !suspended) {
          setOnline(profileData.is_online);
        }
      } else {
        setAvatarUrl(profile?.avatar_url || null);
      }

      if (!currentlyVerified) {
        setJobs([]);
        setActiveDelivery(null);
        setRefreshing(false);
        return;
      }

      const { data: settingsData } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'remittance_limit')
        .maybeSingle();

      if (settingsData?.value) {
        setRemittanceLimit(Number(settingsData.value));
      }

      const { data: walletData } = await supabase
        .from('wallets')
        .select('cash_on_hand')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (walletData) {
        setCashOnHand(Number(walletData.cash_on_hand || 0));
      }

      const { data: customJobsRaw } = await getAvailableJobs();

      const customJobs = (customJobsRaw || []).filter(
        (j) => j.request_type !== 'store_order' && !j.order_id
      );

      const { data: storeOrders, error: storeErr } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['accepted', 'preparing', 'ready_for_pickup'])
        .is('driver_id', null)
        .order('created_at', { ascending: false });

      if (storeErr) {
        console.error('Error fetching store orders:', storeErr.message);
      }

      const allCustomerIds = [
        ...new Set([
          ...(customJobs || []).map((j) => j.customer_id).filter(Boolean),
          ...(storeOrders || [])
            .map((o) => o.customer_id || o.user_id)
            .filter(Boolean),
        ]),
      ];

      let profileMap = {};

      if (allCustomerIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', allCustomerIds);

        if (profilesData) {
          profileMap = Object.fromEntries(profilesData.map((p) => [p.id, p]));
        }
      }

      let formattedStoreJobs = [];

      if (storeOrders && storeOrders.length > 0) {
        const storeIds = [
          ...new Set(storeOrders.map((o) => o.store_id).filter(Boolean)),
        ];

        let storeMap = {};

        if (storeIds.length > 0) {
          const { data: storesData } = await supabase
            .from('stores')
            .select('id, name, address, lat, lng')
            .in('id', storeIds);

          if (storesData) {
            storeMap = Object.fromEntries(storesData.map((s) => [s.id, s]));
          }
        }

        formattedStoreJobs = storeOrders
          .map((order) => {
            const storeObj = storeMap[order.store_id] || {};

            const custId = order.customer_id || order.user_id;

            const custProfile = profileMap[custId] || {};

            return formatStoreOrder(
              { ...order, stores: storeObj },
              custProfile.full_name || order.customer_name || 'Valued Customer',
              custProfile.phone || order.customer_phone || ''
            );
          })
          .filter(Boolean);
      }

      const formattedCustomJobs = customJobs.map((j) => {
        const desc = j.description || j.item_description || '';

        const isPackagePickup =
          desc.includes('PACKAGE PICKUP') || j.request_type === 'pickup_item';

        const custProfile = profileMap[j.customer_id] || {};

        return {
          ...j,
          request_type: isPackagePickup ? 'pickup_item' : 'request_item',
          customer_name:
            custProfile.full_name || j.customer_name || 'Valued Customer',
          customer_phone: custProfile.phone || j.customer_phone || '',
          pickup_address: isPackagePickup
            ? j.pickup_address || j.pickup?.address || 'Pickup Location'
            : null,
          pickup_lat: isPackagePickup ? j.pickup_lat || j.pickup?.lat : null,
          pickup_lng: isPackagePickup ? j.pickup_lng || j.pickup?.lng : null,
          dropoff_address:
            j.dropoff_address ||
            j.delivery_address ||
            j.dropoff?.address ||
            'Customer Address',
          dropoff_lat:
            j.dropoff_lat || j.delivery_lat || j.lat || j.dropoff?.lat,
          dropoff_lng:
            j.dropoff_lng || j.delivery_lng || j.lng || j.dropoff?.lng,
        };
      });

      const uniqueJobsMap = new Map();

      [...formattedCustomJobs, ...formattedStoreJobs].forEach((job) => {
        if (job && job.id) {
          uniqueJobsMap.set(job.id.toString(), job);
        }
      });

      const finalSortedJobs = Array.from(uniqueJobsMap.values()).sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );

      setJobs(finalSortedJobs);

      /*
       * IMPORTANT:
       * This is your original active-delivery logic.
       * It is intentionally unchanged.
       */
      // Find the driver's current active delivery regardless of which active
      // workflow status it is currently in. For store orders, also load the
      // related order status so the floating button can show the live status.
      const { data: assignedDeliveries } = await supabase
        .from('delivery_requests')
        .select('*, orders(status)')
        .eq('driver_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(20);

      const terminalStatuses = new Set([
        'delivered',
        'completed',
        'cancelled',
        'canceled',
        'failed',
        'rejected',
        'declined',
      ]);

      const activeJob = (assignedDeliveries || []).find((job) => {
        const status = String(job?.status || '').toLowerCase().trim();
        return status && !terminalStatuses.has(status);
      });

      setActiveDelivery(activeJob || null);
    } catch (err) {
      console.error('Error loading driver dashboard:', err?.message);

      setJobs([]);
    } finally {
      setRefreshing(false);
    }
  }, [profile?.id, profile?.avatar_url, formatStoreOrder]);

  /* ---------------- REALTIME ---------------- */

  useEffect(() => {
    loadDashboardData();

    let walletChannel;
    let activeDeliveryChannel;

    if (profile?.id) {
      activeDeliveryChannel = supabase
        .channel('driver_active_delivery_realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'delivery_requests',
            filter: `driver_id=eq.${profile.id}`,
          },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              setActiveDelivery((prev) =>
                prev && String(prev.id) === String(payload.old?.id)
                  ? null
                  : prev
              );
              return;
            }

            const nextDelivery = payload.new;
            if (!nextDelivery) return;

            const terminalStatuses = [
              'delivered',
              'completed',
              'cancelled',
              'canceled',
              'failed',
              'rejected',
              'declined',
            ];
            const nextStatus = String(nextDelivery.status || '').toLowerCase().trim();

            if (terminalStatuses.includes(nextStatus)) {
              setActiveDelivery((prev) =>
                prev && String(prev.id) === String(nextDelivery.id)
                  ? null
                  : prev
              );
              return;
            }

            setActiveDelivery((prev) => ({
              ...(prev || {}),
              ...nextDelivery,
            }));
          }
        )
        .subscribe();

      walletChannel = supabase
        .channel('driver_wallet_realtime')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'wallets',
            filter: `user_id=eq.${profile.id}`,
          },
          (payload) => {
            if (payload.new && payload.new.cash_on_hand !== undefined) {
              setCashOnHand(Number(payload.new.cash_on_hand));
            }
          }
        )
        .subscribe();
    }

    const unsubscribeCustom = subscribeToNewJobs(async (job) => {
      if (job.request_type === 'store_order' || job.order_id) {
        return;
      }

      const desc = job.description || job.item_description || '';

      const isPackagePickup =
        desc.includes('PACKAGE PICKUP') || job.request_type === 'pickup_item';

      let customerName = job.customer_name || 'Valued Customer';
      let customerPhone = job.customer_phone || '';

      if (job.customer_id) {
        const { data: custData } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', job.customer_id)
          .maybeSingle();

        if (custData) {
          customerName = custData.full_name || customerName;
          customerPhone = custData.phone || customerPhone;
        }
      }

      const formatted = {
        ...job,
        request_type: isPackagePickup ? 'pickup_item' : 'request_item',
        customer_name: customerName,
        customer_phone: customerPhone,
        pickup_address: isPackagePickup
          ? job.pickup_address || job.pickup?.address || 'Pickup Location'
          : null,
        pickup_lat: isPackagePickup ? job.pickup_lat || job.pickup?.lat : null,
        pickup_lng: isPackagePickup ? job.pickup_lng || job.pickup?.lng : null,
        dropoff_address:
          job.dropoff_address ||
          job.delivery_address ||
          job.dropoff?.address ||
          'Customer Address',
        dropoff_lat:
          job.dropoff_lat || job.delivery_lat || j.lat || job.dropoff?.lat,
        dropoff_lng:
          job.dropoff_lng || job.delivery_lng || j.lng || job.dropoff?.lng,
      };

      setJobs((prev) =>
        prev.some((j) => j.id.toString() === formatted.id.toString())
          ? prev
          : [formatted, ...prev]
      );
    });

    const storeOrdersChannel = supabase
      .channel('driver_store_orders_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        async (payload) => {
          const order = payload.new;

          if (order && profile?.id && String(order.driver_id) === String(profile.id)) {
            setActiveDelivery((prev) => {
              if (!prev) return prev;

              const matchesOrder =
                String(prev.order_id || prev.id) === String(order.id);

              if (!matchesOrder) return prev;

              return {
                ...prev,
                orders: {
                  ...(Array.isArray(prev.orders) ? prev.orders[0] : prev.orders),
                  status: order.status,
                },
              };
            });
          }

          if (
            order &&
            !order.driver_id &&
            ['accepted', 'preparing', 'ready_for_pickup'].includes(order.status)
          ) {
            let storeObj = {};

            if (order.store_id) {
              const { data: storeData } = await supabase
                .from('stores')
                .select('id, name, address, lat, lng')
                .eq('id', order.store_id)
                .maybeSingle();

              if (storeData) {
                storeObj = storeData;
              }
            }

            let customerName = order.customer_name || 'Valued Customer';
            let customerPhone = order.customer_phone || '';

            const custId = order.customer_id || order.user_id;

            if (custId) {
              const { data: custData } = await supabase
                .from('profiles')
                .select('full_name, phone')
                .eq('id', custId)
                .maybeSingle();

              if (custData) {
                customerName = custData.full_name || customerName;
                customerPhone = custData.phone || customerPhone;
              }
            }

            const fullOrder = { ...order, stores: storeObj };

            const formattedStoreJob = formatStoreOrder(
              fullOrder,
              customerName,
              customerPhone
            );

            if (formattedStoreJob) {
              setJobs((prev) => {
                const exists = prev.some(
                  (j) => j.id.toString() === formattedStoreJob.id.toString()
                );

                return exists
                  ? prev.map((j) =>
                      j.id.toString() === formattedStoreJob.id.toString()
                        ? formattedStoreJob
                        : j
                    )
                  : [formattedStoreJob, ...prev];
              });
            }
          } else if (
            payload.eventType === 'UPDATE' ||
            payload.eventType === 'DELETE'
          ) {
            const targetId = payload.old?.id || order?.id;

            if (targetId && order?.driver_id) {
              setJobs((prev) =>
                prev.filter((j) => j.id.toString() !== targetId.toString())
              );
            }
          }
        }
      )
      .subscribe();

    // ✨ NEW REALTIME LISTENERS FOR DASHBOARD JOBS ✨
    const generalOrdersListener = supabase
      .channel(`public_orders_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadDashboardData();
      })
      .subscribe();

    const generalRequestsListener = supabase
      .channel(`public_delivery_requests_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_requests' }, () => {
        loadDashboardData();
      })
      .subscribe();

    return () => {
      if (typeof unsubscribeCustom === 'function') {
        unsubscribeCustom();
      } else if (unsubscribeCustom?.unsubscribe) {
        unsubscribeCustom.unsubscribe();
      }

      supabase.removeChannel(storeOrdersChannel);
      supabase.removeChannel(generalOrdersListener);
      supabase.removeChannel(generalRequestsListener);

      if (activeDeliveryChannel) {
        supabase.removeChannel(activeDeliveryChannel);
      }

      if (walletChannel) {
        supabase.removeChannel(walletChannel);
      }
    };
  }, [loadDashboardData, formatStoreOrder, profile?.id]);

  /* ---------------- TOGGLE ONLINE ---------------- */

  const toggleOnline = async (value) => {
    if (!isVerified) {
      showNotice(
        'lock',
        'Verification required',
        'You must be a fully verified driver before you can go online and accept delivery requests.'
      );

      setOnline(false);
      return;
    }

    if (value && isSuspended) {
      showNotice(
        'error',
        'Account suspended',
        'Your account is currently restricted.\n\nPlease settle pending cash collections or remittances and contact administration for account review.'
      );

      setOnline(false);
      return;
    }

    setOnline(value);

    await supabase
      .from('profiles')
      .update({ is_online: value })
      .eq('id', profile.id);

    refreshProfile();
  };

  const isLimitReached = cashOnHand >= remittanceLimit;

  const isActuallyOnline = online && !isSuspended && isVerified;

  /* ---------------- HANDLE ACCEPT ---------------- */

  const handleAccept = async (job) => {
    if (!job) {
      return;
    }

    if (!isVerified) {
      showNotice(
        'lock',
        'Action locked',
        'You must be a verified driver before you can accept delivery jobs.'
      );

      return;
    }

    if (isSuspended) {
      showNotice(
        'error',
        'Account suspended',
        'You cannot accept orders while your account is suspended.\n\nPlease clear your outstanding balances or violations and contact administration for clearance.'
      );

      return;
    }

    if (isLimitReached) {
      showNotice(
        'warning',
        'Remittance required',
        `You currently hold ₱${cashOnHand.toFixed(
          2
        )} in unremitted platform cash.\n\nLimit: ₱${Number(
          remittanceLimit
        ).toFixed(2)}\n\nPlease remit before accepting more jobs.`
      );

      return;
    }

    startAcceptAnimation();

    setAcceptingId(job.id);

    const isStoreOrder = ['store', 'store_order'].includes(job.request_type);

    const currentTime = new Date().toISOString();

    if (isStoreOrder) {
      const { data: updatedOrder, error: updateErr } = await supabase
        .from('orders')
        .update({ driver_id: profile.id })
        .eq('id', job.id)
        .is('driver_id', null)
        .select()
        .single();

      if (updateErr || !updatedOrder) {
        setAcceptingId(null);

        stopAcceptAnimation();

        setShowAcceptLoading(false);

        showNotice(
          'warning',
          'Job no longer available',
          'This job was already accepted by another driver. The available jobs list has been refreshed.'
        );

        loadDashboardData();

        return;
      }

      await supabase
        .from('delivery_requests')
        .update({
          driver_id: profile.id,
          status: 'accepted',
          accepted_at: currentTime,
        })
        .eq('order_id', job.id);
    } else {
      const { error } = await acceptDelivery(job.id, profile.id);

      if (error) {
        setAcceptingId(null);

        stopAcceptAnimation();

        setShowAcceptLoading(false);

        showNotice(
          'warning',
          'Job no longer available',
          'This delivery was already accepted by another driver. The available jobs list has been refreshed.'
        );

        loadDashboardData();

        return;
      }

      await supabase
        .from('delivery_requests')
        .update({ status: 'accepted', accepted_at: currentTime })
        .eq('id', job.id);
    }

    setJobs((prev) => prev.filter((j) => j.id.toString() !== job.id.toString()));

    setAcceptingId(null);

    setSelectedJob(null);

    setAcceptLoadingText('Delivery accepted successfully.');

    Animated.sequence([
      Animated.timing(acceptProgress, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();

    const timeout = setTimeout(() => {
      setAcceptLoadingText('Opening active delivery...');

      Animated.parallel([
        Animated.timing(acceptPopupOpacity, {
          toValue: 0,
          duration: 260,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(acceptPopupScale, {
          toValue: 0.96,
          duration: 260,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        stopAcceptAnimation();

        setShowAcceptLoading(false);

        navigation.navigate('ActiveDelivery', {
          deliveryId: job.id,
          deliveryData: job,
        });
      });
    }, 950);

    animationTimeouts.current.push(timeout);
  };

  /* ---------------- MODAL MAP MARKERS ---------------- */

  const getModalMapMarkers = () => {
    if (!selectedJob) {
      return [];
    }

    const markers = [];

    const hasPickup = ['store', 'store_order', 'pickup_item'].includes(
      selectedJob.request_type
    );

    const pickupLat = selectedJob.pickup_lat || selectedJob.pickup?.lat;
    const pickupLng = selectedJob.pickup_lng || selectedJob.pickup?.lng;

    if (hasPickup && pickupLat != null && pickupLng != null) {
      markers.push({
        lat: Number(pickupLat),
        lng: Number(pickupLng),
        label: selectedJob.pickup_name || 'Pickup',
      });
    }

    const dropoffLat = selectedJob.dropoff_lat || selectedJob.dropoff?.lat;
    const dropoffLng = selectedJob.dropoff_lng || selectedJob.dropoff?.lng;

    if (dropoffLat != null && dropoffLng != null) {
      markers.push({
        lat: Number(dropoffLat),
        lng: Number(dropoffLng),
        label: 'Drop-off',
      });
    }

    return markers;
  };

  /* ---------------- ANIMATION INTERPOLATIONS ---------------- */

  const toggleTrackBg = toggleGlow.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E8EEEA', '#CDEFDD'],
  });

  const acceptCoreScale = routeCorePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  const acceptCoreGlow = routeCorePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.32],
  });

  const nodeOneScale = routeNodeOne.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  const nodeTwoScale = routeNodeTwo.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  const nodeThreeScale = routeNodeThree.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  const particleOneX = particleOne.interpolate({
    inputRange: [0, 1],
    outputRange: [-55, 55],
  });

  const particleOneY = particleOne.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [8, -10, 8],
  });

  const particleTwoX = particleTwo.interpolate({
    inputRange: [0, 1],
    outputRange: [55, -55],
  });

  const particleTwoY = particleTwo.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [-7, 9, -7],
  });

  const activeDeliveryStatus = (() => {
    if (!activeDelivery) {
      return '';
    }

    const deliveryStatus = String(activeDelivery.status || '')
      .toLowerCase()
      .trim();

    const orderStatus = Array.isArray(activeDelivery.orders)
      ? activeDelivery.orders[0]?.status
      : activeDelivery.orders?.status;

    const rawStatus =
      activeDelivery.request_type === 'store_order' ||
      activeDelivery.order_id ||
      activeDelivery.store_id
        ? String(orderStatus || deliveryStatus || 'accepted')
        : String(deliveryStatus || 'accepted');

    return rawStatus
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  })();

  /* ---------------- DERIVED UI VALUES ---------------- */

  const accepted = acceptLoadingText === 'Delivery accepted successfully.';

  const statusLine = isActuallyOnline
    ? 'Available for deliveries'
    : isSuspended
      ? 'Account restricted'
      : !isVerified
        ? 'Verification required'
        : 'Currently offline';

  const dispatchTitle = !isVerified
    ? 'Jobs are locked'
    : isSuspended
      ? 'Dispatch disabled'
      : online
        ? "You're online"
        : "You're offline";

  const dispatchHint = isSuspended
    ? 'Resolve your account restrictions to restore dispatch access.'
    : !isVerified
      ? 'Complete profile verification to start receiving jobs.'
      : isActuallyOnline
        ? 'New delivery requests will appear automatically.'
        : 'Turn on dispatch when you are ready to accept jobs.';

  const suspendedMessage =
    'Your account is currently restricted.\n\nPlease settle pending cash collections or remittances and contact administration for account review.';

  const remittanceMessage = `You currently hold ₱${cashOnHand.toFixed(
    2
  )} in unremitted platform cash.\n\nLimit: ₱${Number(remittanceLimit).toFixed(
    2
  )}\n\nPlease remit before accepting more jobs.`;

  const pickupTypes = ['store', 'store_order', 'pickup_item'];
  const selectedHasPickup = pickupTypes.includes(selectedJob?.request_type);
  const selectedPaymentLabel = getPaymentMethodLabel(selectedJob);
  const selectedIsOnline = selectedPaymentLabel.includes('Online');
  
  // DEDUCT APP FEE FROM DELIVERY FEE TO SHOW TRUE PAYOUT
  const selectedPayout = Math.max(0, Number(selectedJob?.delivery_fee || 0) - Number(selectedJob?.app_fee || 0));

  // GET ACTIVE DELIVERY SHORT ID
  const activeId = activeDelivery?.order_id || activeDelivery?.id;
  const activeShortId = activeId ? String(activeId).substring(0, 5).toUpperCase() : '';

  // GET SELECTED JOB SHORT ID (For Modal)
  const selectedShortId = selectedJob?.id ? String(selectedJob.id).substring(0, 5).toUpperCase() : '';

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={C.brandDark}
        translucent={false}
      />

      <FlatList
        style={styles.list}
        data={isActuallyOnline ? jobs : []}
        keyExtractor={(item) => `${item.request_type}-${item.id}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);

              loadDashboardData();
            }}
            colors={[colors.primary || C.brand]}
            tintColor="#FFFFFF"
          />
        }
        ListHeaderComponent={
          <>
            {/* HERO */}
            <Animated.View
              style={{
                opacity: headerFade,
                transform: [{ translateY: headerSlide }],
              }}
            >
              <LinearGradient
                colors={[C.brandDark, '#0A6B4E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.hero}
              >
                <View style={styles.heroRow}>
                  <View style={styles.avatarWrap}>
                    <View style={styles.avatarInner}>
                      {avatarUrl ? (
                        <Image
                          source={{ uri: avatarUrl }}
                          style={styles.avatarImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <Ionicons name="person" size={24} color={C.brand} />
                      )}
                    </View>

                    <Animated.View
                      style={[
                        styles.avatarDot,
                        {
                          backgroundColor: isActuallyOnline ? '#34D399' : '#94A3B8',
                          transform: [
                            {
                              scale: isActuallyOnline
                                ? statusDotPulse.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [1, 1.25],
                                  })
                                : 1,
                            },
                          ],
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.flex}>
                    <Text style={styles.heroKicker}>Paabot driver</Text>

                    <Text style={styles.heroName} numberOfLines={1}>
                      {profile?.full_name || 'Driver'}
                    </Text>

                    <Text style={styles.heroStatus} numberOfLines={1}>
                      {statusLine}
                    </Text>
                  </View>

                  <View style={styles.heroChip}>
                    <Ionicons
                      name={isVerified ? 'shield-checkmark' : 'shield-outline'}
                      size={13}
                      color={isVerified ? C.brand : C.amber}
                    />
                    <Text
                      style={[
                        styles.heroChipText,
                        { color: isVerified ? C.brand : C.amber },
                      ]}
                    >
                      {isVerified ? 'Verified' : 'Not verified'}
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </Animated.View>

            {/* DISPATCH CARD */}
            <View style={styles.dispatchCard}>
              <View style={styles.dispatchRow}>
                <Animated.View
                  style={[styles.dispatchIcon, { backgroundColor: toggleTrackBg }]}
                >
                  <Ionicons
                    name={
                      !isVerified
                        ? 'lock-closed-outline'
                        : isSuspended
                          ? 'ban-outline'
                          : online
                            ? 'radio-outline'
                            : 'moon-outline'
                    }
                    size={20}
                    color={C.brand}
                  />
                </Animated.View>

                <View style={styles.flex}>
                  <Text style={styles.dispatchLabel}>
                    {!isVerified
                      ? 'Verification required'
                      : isSuspended
                        ? 'Account restricted'
                        : 'Dispatch status'}
                  </Text>
                  <Text style={styles.dispatchTitle}>{dispatchTitle}</Text>
                </View>

                {isVerified ? (
                  <Switch
                    value={online && !isSuspended}
                    onValueChange={toggleOnline}
                    trackColor={{ false: '#D5DDD8', true: '#34D399' }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor="#D5DDD8"
                  />
                ) : (
                  <AnimatedNoGesture />
                )}
              </View>

              <Text style={styles.dispatchHint}>{dispatchHint}</Text>
            </View>

            {/* SUSPENSION */}
            {isSuspended && (
              <TouchableOpacity
                activeOpacity={0.9}
                style={[
                  styles.alertBanner,
                  { backgroundColor: C.redSoft, borderColor: C.redLine },
                ]}
                onPress={() => showNotice('error', 'Account suspended', suspendedMessage)}
              >
                <IconBox name="shield-outline" color={C.red} bg="#FFFFFF" />

                <View style={styles.flex}>
                  <Text style={[styles.alertTitle, { color: '#991B1B' }]}>
                    Account suspended
                  </Text>
                  <Text style={[styles.alertText, { color: '#B91C1C' }]}>
                    Dispatch access is restricted. Tap to see what you need to do.
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color={C.red} />
              </TouchableOpacity>
            )}

            {/* REMITTANCE */}
            {!isSuspended && isLimitReached && (
              <TouchableOpacity
                activeOpacity={0.9}
                style={[
                  styles.alertBanner,
                  { backgroundColor: C.amberSoft, borderColor: C.amberLine },
                ]}
                onPress={() =>
                  showNotice('warning', 'Remittance required', remittanceMessage)
                }
              >
                <IconBox name="wallet-outline" color={C.amber} bg="#FFFFFF" />

                <View style={styles.flex}>
                  <Text style={[styles.alertTitle, { color: '#92400E' }]}>
                    Remittance required
                  </Text>
                  <Text style={[styles.alertText, { color: C.amber }]}>
                    ₱{cashOnHand.toFixed(2)} held · limit ₱
                    {Number(remittanceLimit).toFixed(0)}
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color={C.amber} />
              </TouchableOpacity>
            )}

            {/* SECTION HEADER */}
            {isVerified && (
              <View style={styles.sectionHeader}>
                <View style={styles.flex}>
                  <Text style={styles.sectionTitle}>Available jobs</Text>

                  <Text style={styles.sectionSubtitle}>
                    {isActuallyOnline
                      ? jobs.length > 0
                        ? 'Pick a route that works for you'
                        : 'New requests will appear automatically'
                      : 'Go online to see available deliveries'}
                  </Text>
                </View>

                {isActuallyOnline && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{jobs.length}</Text>
                  </View>
                )}
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          !isVerified ? (
            <View style={styles.stateCard}>
              <IconBox
                name={verificationStatus === 'pending' ? 'time-outline' : 'lock-closed'}
                color={verificationStatus === 'pending' ? C.amber : C.purple}
                bg={verificationStatus === 'pending' ? C.amberSoft : C.purpleSoft}
                size={30}
                box={64}
              />

              <Text style={styles.stateTitle}>
                {verificationStatus === 'pending'
                  ? 'Verification pending'
                  : 'Delivery access locked'}
              </Text>

              <Text style={styles.stateText}>
                {verificationStatus === 'pending'
                  ? 'Your documents are being reviewed by the admin team. Jobs will become available once your account is approved.'
                  : 'Complete your driver profile and submit the required documents to unlock available delivery jobs.'}
              </Text>

              {verificationStatus === 'unverified' && (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => navigation.navigate('ProfileTab')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Complete my profile</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.stateCard}>
              <IconBox
                name={
                  isSuspended
                    ? 'ban-outline'
                    : online
                      ? 'file-tray-outline'
                      : 'moon-outline'
                }
                size={30}
                box={64}
              />

              <Text style={styles.stateTitle}>
                {isSuspended
                  ? 'Account suspended'
                  : online
                    ? 'No available jobs'
                    : "You're offline"}
              </Text>

              <Text style={styles.stateText}>
                {isSuspended
                  ? 'Complete the required compliance steps or settle your balances to restore access.'
                  : online
                    ? 'New delivery requests in your area will appear here automatically.'
                    : 'Turn on dispatch when you are ready to receive delivery requests.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const isStoreOrPickup = pickupTypes.includes(item.request_type);

          const paymentLabel = getPaymentMethodLabel(item);

          const isOnlinePayment = paymentLabel.includes('Online');

          let cardBadgeTitle = 'Store delivery';

          let subtitleTitle = getActiveItemsText(item) || 'Package Delivery';

          if (item.request_type === 'request_item') {
            cardBadgeTitle = 'Custom request';
            subtitleTitle = 'Pabakal';
          } else if (item.request_type === 'pickup_item') {
            cardBadgeTitle = 'Custom request';
            subtitleTitle = 'Pakuha';
          }

          const blocked = isLimitReached || isSuspended;
          
          const payoutAmount = Math.max(0, Number(item.delivery_fee || 0) - Number(item.app_fee || 0));
          
          const shortId = item?.id ? String(item.id).substring(0, 5).toUpperCase() : '';

          return (
            <AnimatedEntrance index={index}>
              <PressScale
                onPress={() => setSelectedJob(item)}
                style={styles.jobCard}
              >
                {/* top row */}
                <View style={styles.jobTop}>
                  <View style={styles.jobTypeChip}>
                    <Ionicons
                      name={isStoreOrPickup ? 'storefront-outline' : 'basket-outline'}
                      size={14}
                      color={C.brand}
                    />
                    <Text style={styles.jobTypeText}>{cardBadgeTitle} • #{shortId}</Text>
                  </View>

                  <View style={styles.payoutBlock}>
                    <Text style={styles.payoutLabel}>Your payout</Text>
                    <Text style={styles.payoutText}>
                      ₱{payoutAmount.toFixed(2)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.itemTitle} numberOfLines={2}>
                  {subtitleTitle}
                </Text>

                <Text style={styles.customerLine} numberOfLines={1}>
                  For{' '}
                  <Text style={styles.customerBold}>
                    {item.customer_name || 'Valued Customer'}
                  </Text>
                </Text>

                {/* route */}
                <View style={styles.route}>
                  <View style={styles.routeRail} />

                  {isStoreOrPickup && (
                    <View style={[styles.routeRow, { marginBottom: 14 }]}>
                      <View style={[styles.routeDot, { backgroundColor: C.brand }]} />
                      <View style={styles.flex}>
                        <Text style={styles.routeLabel}>Pickup</Text>
                        <Text style={styles.routeAddress} numberOfLines={2}>
                          {item.pickup_address ||
                            item.pickup?.address ||
                            'Store / Landmark'}
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.routeRow}>
                    <View style={[styles.routeDot, { backgroundColor: C.red }]} />
                    <View style={styles.flex}>
                      <Text style={styles.routeLabel}>Drop-off</Text>
                      <Text style={styles.routeAddress} numberOfLines={2}>
                        {item.dropoff_address ||
                          item.dropoff?.address ||
                          'Customer Address'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* footer */}
                <View style={styles.jobFooter}>
                  <View style={styles.metaWrap}>
                    <View style={styles.metaChip}>
                      <Ionicons name="navigate-outline" size={13} color={C.body} />
                      <Text style={styles.metaText}>
                        {item.distance_km
                          ? `${Number(item.distance_km).toFixed(2)} km`
                          : 'Nearby'}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.metaChip,
                        isOnlinePayment && { backgroundColor: C.blueSoft },
                      ]}
                    >
                      <Ionicons
                        name={isOnlinePayment ? 'card-outline' : 'cash-outline'}
                        size={13}
                        color={isOnlinePayment ? C.blue : C.brand}
                      />
                      <Text
                        style={[
                          styles.metaText,
                          { color: isOnlinePayment ? C.blue : C.brand },
                        ]}
                      >
                        {isOnlinePayment ? 'Paid online' : 'COD'}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.acceptBtn, blocked && styles.acceptBtnDisabled]}
                    onPress={() => handleAccept(item)}
                    disabled={acceptingId === item.id || blocked}
                    activeOpacity={0.8}
                  >
                    {acceptingId === item.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.acceptBtnText}>
                        {isSuspended
                          ? 'Suspended'
                          : isLimitReached
                            ? 'Remit first'
                            : 'Accept'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </PressScale>
            </AnimatedEntrance>
          );
        }}
      />

      {/* ACTIVE DELIVERY - fixed below the available jobs area and in front */}
      {activeDelivery && (
        <View pointerEvents="box-none" style={styles.activeFloatingLayer}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.activeFloatingGlow,
              {
                opacity: activeFloatPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.16, 0.34],
                }),
                transform: [
                  {
                    scale: activeFloatPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.92, 1.08],
                    }),
                  },
                ],
              },
            ]}
          />

          <Animated.View
            style={{
              transform: [
                {
                  translateY: activeFloatPulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -5],
                  }),
                },
              ],
            }}
          >
            <PressScale
            style={styles.activeFloatingButton}
            onPress={() => {
              // Get the parent navigator (DriverNavigator stack) so it finds ActiveDelivery correctly
              const parentNav = navigation.getParent?.() || navigation;
              parentNav.navigate('ActiveDelivery', {
                deliveryId: activeDelivery.id,
                deliveryData: activeDelivery,
              });
            }}
          >
              <View style={styles.activeFloatingIcon}>
                <Ionicons name="navigate" size={21} color="#FFFFFF" />
                <Animated.View
                  style={[
                    styles.activeFloatingDot,
                    {
                      transform: [
                        {
                          scale: activeFloatPulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.35],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              </View>

              <View style={styles.activeFloatingTextWrap}>
                <Text style={styles.activeFloatingTitle} numberOfLines={1}>
                  {activeDeliveryStatus || 'Active'}
                </Text>
                <Text style={styles.activeFloatingSub}>Active delivery • #{activeShortId}</Text>
              </View>

              <Ionicons name="chevron-forward" size={17} color={C.brand} />
            </PressScale>
          </Animated.View>
        </View>
      )}

      {/* =====================================================
          ROUTE DETAILS MODAL
      ===================================================== */}

      <Modal
        visible={!!selectedJob}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedJob(null)}
      >
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={styles.flex}>
                <Text style={styles.sheetKicker}>
                  {selectedJob?.request_type === 'request_item' ||
                  selectedJob?.request_type === 'pickup_item'
                    ? 'Custom request'
                    : 'Store delivery'} • #{selectedShortId}
                </Text>
                <Text style={styles.sheetTitle}>Route details</Text>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setSelectedJob(null)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={C.ink} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.sheetBody}
              contentContainerStyle={styles.sheetScroll}
            >
              {/* MAP */}
              <View style={styles.detailCard}>
                <View style={styles.mapBox}>
                  <OsmMap
                    center={{
                      lat: Number(
                        selectedJob?.dropoff_lat ||
                          selectedJob?.dropoff?.lat ||
                          selectedJob?.pickup_lat ||
                          10.32
                      ),
                      lng: Number(
                        selectedJob?.dropoff_lng ||
                          selectedJob?.dropoff?.lng ||
                          selectedJob?.pickup_lng ||
                          123.89
                      ),
                    }}
                    zoom={13}
                    markers={getModalMapMarkers()}
                  />
                </View>

                <View style={styles.navRow}>
                  {selectedHasPickup && (
                    <TouchableOpacity
                      style={[styles.navBtn, { backgroundColor: C.brand }]}
                      activeOpacity={0.85}
                      onPress={() =>
                        openExternalMap(
                          selectedJob?.pickup_lat || selectedJob?.pickup?.lat,
                          selectedJob?.pickup_lng || selectedJob?.pickup?.lng,
                          selectedJob?.pickup_address || selectedJob?.pickup?.address
                        )
                      }
                    >
                      <Ionicons name="location" size={16} color="#FFFFFF" />
                      <Text style={styles.navBtnText}>Navigate to pickup</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.navBtn, { backgroundColor: C.ink }]}
                    activeOpacity={0.85}
                    onPress={() =>
                      openExternalMap(
                        selectedJob?.dropoff_lat || selectedJob?.dropoff?.lat,
                        selectedJob?.dropoff_lng || selectedJob?.dropoff?.lng,
                        selectedJob?.dropoff_address || selectedJob?.dropoff?.address
                      )
                    }
                  >
                    <Ionicons name="flag" size={16} color="#FFFFFF" />
                    <Text style={styles.navBtnText}>Navigate to drop-off</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ITEMS */}
              {(() => {
                const parsed = parseCustomDescription(selectedJob);

                return (
                  <DetailCard
                    icon="basket-outline"
                    title="Requested items"
                    subtitle="Items and special instructions"
                  >
                    <View style={styles.insetBox}>
                      {(parsed.details || '').split(',').map((line, idx) => {
                        const trimmedLine = line.trim();

                        if (!trimmedLine) {
                          return null;
                        }

                        return (
                          <View key={idx} style={styles.itemRow}>
                            <View style={styles.itemBullet} />
                            <Text style={styles.itemText}>{trimmedLine}</Text>
                          </View>
                        );
                      })}
                    </View>

                    {parsed.cost > 0 && (
                      <View style={styles.metaRow}>
                        <Ionicons name="wallet-outline" size={16} color={C.amber} />
                        <Text style={styles.metaRowText}>
                          Estimated item cost:{' '}
                          <Text style={styles.metaStrong}>₱{parsed.cost}</Text>
                        </Text>
                      </View>
                    )}

                    {parsed.instructions && (
                      <View style={styles.noteBox}>
                        <Ionicons
                          name="information-circle-outline"
                          size={17}
                          color={C.amber}
                        />
                        <Text style={styles.noteText}>
                          <Text style={styles.noteBold}>Rider instruction: </Text>
                          {parsed.instructions}
                        </Text>
                      </View>
                    )}
                  </DetailCard>
                );
              })()}

              {/* CUSTOMER */}
              <DetailCard
                icon="person-outline"
                title="Customer"
                subtitle="Contact details"
              >
                <View style={styles.insetBox}>
                  <Text style={styles.customerName}>
                    {selectedJob?.customer_name || 'Customer'}
                  </Text>

                  <View style={styles.phoneRow}>
                    <Ionicons name="call-outline" size={14} color={C.muted} />
                    <Text style={styles.phoneText}>
                      {selectedJob?.customer_phone ||
                        'Phone number provided upon acceptance'}
                    </Text>
                  </View>
                </View>
              </DetailCard>

              {/* ROUTE */}
              <DetailCard
                icon="navigate-outline"
                title={selectedHasPickup ? 'Route' : 'Delivery address'}
                subtitle="Where to go"
              >
                <View style={styles.route}>
                  <View style={styles.routeRail} />

                  {selectedHasPickup && (
                    <View style={[styles.routeRow, { marginBottom: 14 }]}>
                      <View style={[styles.routeDot, { backgroundColor: C.brand }]} />
                      <View style={styles.flex}>
                        <Text style={styles.routeLabel}>Pickup location</Text>
                        <Text style={styles.routeAddress}>
                          {selectedJob?.pickup_address ||
                            selectedJob?.pickup?.address ||
                            'Store / Landmark'}
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.routeRow}>
                    <View style={[styles.routeDot, { backgroundColor: C.red }]} />
                    <View style={styles.flex}>
                      <Text style={styles.routeLabel}>Drop-off location</Text>
                      <Text style={styles.routeAddress}>
                        {selectedJob?.dropoff_address ||
                          selectedJob?.dropoff?.address ||
                          'Customer Address'}
                      </Text>
                    </View>
                  </View>
                </View>
              </DetailCard>

              {/* SUMMARY */}
              <DetailCard
                icon="receipt-outline"
                title="Delivery summary"
                subtitle="Job value and payout"
              >
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Payment method</Text>
                  <Text style={styles.summaryValue}>{selectedPaymentLabel}</Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Estimated distance</Text>
                  <Text style={styles.summaryValue}>
                    {selectedJob?.distance_km
                      ? `${Number(selectedJob.distance_km).toFixed(2)} km`
                      : 'Nearby'}
                  </Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Your delivery payout</Text>
                  <Text style={styles.summaryPayout}>
                    ₱{selectedPayout.toFixed(2)}
                  </Text>
                </View>

                <View style={styles.collectRow}>
                  <View style={styles.flex}>
                    <Text style={styles.collectLabel}>
                      {selectedIsOnline ? 'Total order value' : 'Total to collect'}
                    </Text>

                    <Text style={styles.collectSub}>
                      {selectedIsOnline
                        ? 'Payment already made online'
                        : 'Amount customer pays upon delivery'}
                    </Text>
                  </View>

                  <Text style={styles.collectAmount}>
                    ₱{(() => {
                      if (selectedIsOnline) return '0.00';
                      
                      const isStoreOrder = selectedJob?.order_type === 'store' || selectedJob?.request_type === 'store_order';
                      
                      if (isStoreOrder) {
                        return Number(selectedJob?.total_amount || selectedJob?.amount || 0).toFixed(2);
                      } else {
                        return selectedPayout.toFixed(2);
                      }
                    })()}
                  </Text>
                </View>
              </DetailCard>
            </ScrollView>

            <View style={styles.sheetFooter}>
              <TouchableOpacity
                style={[
                  styles.modalAcceptBtn,
                  (isLimitReached || isSuspended) && styles.acceptBtnDisabled,
                ]}
                onPress={() => handleAccept(selectedJob)}
                disabled={
                  acceptingId === selectedJob?.id || isLimitReached || isSuspended
                }
                activeOpacity={0.85}
              >
                {acceptingId === selectedJob?.id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name={
                        isSuspended || isLimitReached
                          ? 'lock-closed-outline'
                          : 'checkmark-circle'
                      }
                      size={20}
                      color="#FFFFFF"
                    />

                    <Text style={styles.modalAcceptText}>
                      {isSuspended
                        ? 'Account suspended'
                        : isLimitReached
                          ? 'Remit to accept jobs'
                          : `Accept job · ₱${selectedPayout.toFixed(2)}`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* =====================================================
          ACCEPT LOADING MODAL
      ===================================================== */}

      <Modal
        visible={showAcceptLoading}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={styles.overlay}>
          <Animated.View
            style={[
              styles.acceptPopup,
              {
                opacity: acceptPopupOpacity,
                transform: [{ scale: acceptPopupScale }],
              },
            ]}
          >
            <Text style={styles.dialogTitle}>
              {accepted ? 'Delivery accepted' : 'Preparing your delivery'}
            </Text>

            <Text style={styles.dialogMessage}>
              {accepted
                ? 'Your delivery slot is secured.'
                : 'Connecting pickup, drop-off and dispatch details'}
            </Text>

            <View style={styles.routeAnim}>
              <View style={styles.routeGuideLine} />

              <View style={styles.routeGuideActive}>
                <Animated.View
                  style={[
                    styles.routeSweep,
                    { transform: [{ translateX: routeSweep }] },
                  ]}
                />
              </View>

              <Animated.View
                style={[
                  styles.routeNodeWrap,
                  { left: 6, opacity: routeNodeOne, transform: [{ scale: nodeOneScale }] },
                ]}
              >
                <View style={styles.routeNode}>
                  <Ionicons name="location" size={17} color="#FFFFFF" />
                </View>
                <Text style={styles.routeNodeLabel}>Pickup</Text>
              </Animated.View>

              <View style={styles.routeCenterWrap}>
                <Animated.View
                  style={[
                    styles.routeCenterGlow,
                    { opacity: acceptCoreGlow, transform: [{ scale: acceptCoreScale }] },
                  ]}
                />

                <View style={styles.routeCenterRing}>
                  <View style={styles.routeCenter}>
                    <Ionicons
                      name={accepted ? 'checkmark' : 'navigate'}
                      size={22}
                      color="#FFFFFF"
                    />
                  </View>
                </View>
              </View>

              <Animated.View
                style={[
                  styles.routeNodeWrap,
                  { right: 6, opacity: routeNodeThree, transform: [{ scale: nodeThreeScale }] },
                ]}
              >
                <View style={[styles.routeNode, { backgroundColor: C.ink }]}>
                  <Ionicons name="flag" size={16} color="#FFFFFF" />
                </View>
                <Text style={styles.routeNodeLabel}>Drop-off</Text>
              </Animated.View>

              <Animated.View
                style={[
                  styles.routeMiddleNode,
                  { opacity: routeNodeTwo, transform: [{ scale: nodeTwoScale }] },
                ]}
              />

              <Animated.View
                style={[
                  styles.routeParticle,
                  { top: 25, transform: [{ translateX: particleOneX }, { translateY: particleOneY }] },
                ]}
              />

              <Animated.View
                style={[
                  styles.routeParticle,
                  { top: 83, transform: [{ translateX: particleTwoX }, { translateY: particleTwoY }] },
                ]}
              />
            </View>

            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: acceptProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />

              <Animated.View
                style={[
                  styles.progressShimmer,
                  { transform: [{ translateX: progressShimmer }] },
                ]}
              />
            </View>

            <View style={styles.acceptLoadingRow}>
              <ActivityIndicator size="small" color={C.brand} />
              <Text style={styles.acceptLoadingText}>{acceptLoadingText}</Text>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* NOTICE */}
      <DriverNoticeModal
        visible={notice.visible}
        type={notice.type}
        title={notice.title}
        message={notice.message}
        onClose={closeNotice}
      />
    </SafeAreaView>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  iconBox: { alignItems: 'center', justifyContent: 'center' },

  container: {
    flex: 1,
    backgroundColor: C.brandDark,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },

  list: { flex: 1, backgroundColor: C.bg },
  listContent: { paddingBottom: 40 },

  /* Hero */
  hero: { paddingTop: 18, paddingHorizontal: 18, paddingBottom: 56 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: { width: 56, height: 56 },
  avatarInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: C.brandDark,
  },
  heroKicker: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, fontWeight: '600' },
  heroName: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 1,
  },
  heroStatus: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  heroChipText: { fontSize: 12, fontWeight: '700' },

  /* Dispatch */
  dispatchCard: {
    marginHorizontal: 16,
    marginTop: -32,
    marginBottom: 16,
    padding: 14,
    borderRadius: 20,
    backgroundColor: C.card,
    ...cardShadow,
  },
  dispatchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dispatchIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dispatchLabel: { color: C.muted, fontSize: 12.5 },
  dispatchTitle: { color: C.ink, fontSize: 17, fontWeight: '800', marginTop: 1 },
  dispatchHint: {
    color: C.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  lockedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    height: 36,
    borderRadius: 12,
    backgroundColor: C.purpleSoft,
  },
  lockedChipText: { color: C.purple, fontSize: 12.5, fontWeight: '700' },

  /* Banners */
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  alertTitle: { fontSize: 15, fontWeight: '700' },
  alertText: { fontSize: 13, lineHeight: 19, marginTop: 2 },

  /* Floating Active Delivery */
  activeFloatingLayer: {
    position: 'absolute',
    right: 14,
    bottom: 96,
    zIndex: 100,
    elevation: 100,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  activeFloatingGlow: {
    position: 'absolute',
    right: 2,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.brand,
  },
  activeFloatingButton: {
    minWidth: 178,
    height: 64,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 32,
    backgroundColor: C.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: C.brandLine,
    ...cardShadow,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  activeFloatingIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeFloatingDot: {
    position: 'absolute',
    right: 1,
    top: 1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#34D399',
    borderWidth: 2,
    borderColor: C.brand,
  },
  activeFloatingTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  activeFloatingTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  activeFloatingSub: {
    color: C.muted,
    fontSize: 11.5,
    marginTop: 2,
  },

  /* Section */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 18,
    marginTop: 6,
    marginBottom: 12,
  },
  sectionTitle: { color: C.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  sectionSubtitle: { color: C.muted, fontSize: 13, marginTop: 2 },
  countBadge: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  countText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  /* Job card */
  jobCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: C.card,
    ...cardShadow,
  },
  jobTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  jobTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: C.brandSoft,
  },
  jobTypeText: { color: C.brand, fontSize: 12.5, fontWeight: '700' },
  payoutBlock: { alignItems: 'flex-end' },
  payoutLabel: { color: C.muted, fontSize: 12 },
  payoutText: { color: C.brand, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  itemTitle: {
    color: C.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    marginTop: 14,
  },
  customerLine: { color: C.muted, fontSize: 13, marginTop: 4 },
  customerBold: { color: C.body, fontWeight: '700' },

  route: { position: 'relative', marginTop: 14 },
  routeRail: {
    position: 'absolute',
    left: 5,
    top: 12,
    bottom: 12,
    width: 2,
    backgroundColor: C.line,
  },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 3,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  routeLabel: { color: C.muted, fontSize: 12 },
  routeAddress: { color: C.ink, fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: 1 },

  jobFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  metaWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F0F3F1',
  },
  metaText: { color: C.body, fontSize: 12.5, fontWeight: '700' },
  acceptBtn: {
    minWidth: 96,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnDisabled: { backgroundColor: '#A9B6AF' },
  acceptBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  /* Empty states */
  stateCard: {
    marginHorizontal: 16,
    padding: 26,
    borderRadius: 22,
    backgroundColor: C.card,
    alignItems: 'center',
    ...cardShadow,
  },
  stateTitle: { color: C.ink, fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 16 },
  stateText: { color: C.body, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 6 },
  primaryBtn: {
    marginTop: 18,
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  /* Dialogs */
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10,25,19,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
  },
  dialogIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  dialogTitle: { color: C.ink, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  dialogMessage: { color: C.body, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 6 },
  dialogButton: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  /* Details sheet */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(10,25,19,0.5)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '93%',
    backgroundColor: C.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    overflow: 'hidden',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CDD8D4',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  sheetKicker: { color: C.brand, fontSize: 13, fontWeight: '700' },
  sheetTitle: { color: C.ink, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  sheetBody: { paddingHorizontal: 16 },
  sheetScroll: { paddingBottom: 120 },
  sheetFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 26 : 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  modalAcceptBtn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: C.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalAcceptText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  detailCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    ...cardShadow,
  },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  detailTitle: { color: C.ink, fontSize: 15, fontWeight: '800' },
  detailSub: { color: C.muted, fontSize: 12.5, marginTop: 1 },

  mapBox: { height: 200, borderRadius: 14, overflow: 'hidden', backgroundColor: '#E8EFEC' },
  navRow: { gap: 8, marginTop: 10 },
  navBtn: {
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  navBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  insetBox: { backgroundColor: '#F7FAF8', borderRadius: 12, padding: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  itemBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.brand, marginTop: 8 },
  itemText: { flex: 1, color: C.ink, fontSize: 14, lineHeight: 21 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  metaRowText: { color: C.body, fontSize: 13.5 },
  metaStrong: { color: '#92400E', fontWeight: '800' },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.amberSoft,
    borderWidth: 1,
    borderColor: C.amberLine,
  },
  noteText: { flex: 1, color: '#92400E', fontSize: 13.5, lineHeight: 20 },
  noteBold: { fontWeight: '800' },

  customerName: { color: C.ink, fontSize: 16, fontWeight: '800' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  phoneText: { color: C.body, fontSize: 13.5 },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLabel: { color: C.muted, fontSize: 14 },
  summaryValue: { color: C.ink, fontSize: 14, fontWeight: '700', textAlign: 'right', maxWidth: '58%' },
  summaryPayout: { color: C.brand, fontSize: 18, fontWeight: '800' },
  summaryDivider: { height: 1, backgroundColor: C.line, marginVertical: 4 },
  collectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: C.brandSoft,
  },
  collectLabel: { color: '#065F46', fontSize: 14, fontWeight: '700' },
  collectSub: { color: '#2F7D62', fontSize: 12.5, marginTop: 2 },
  collectAmount: { color: '#065F46', fontSize: 20, fontWeight: '800' },

  /* Accept loading popup */
  acceptPopup: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 22,
    alignItems: 'center',
  },
  routeAnim: { width: '100%', height: 118, marginTop: 14, justifyContent: 'center' },
  routeGuideLine: {
    position: 'absolute',
    left: 31,
    right: 31,
    top: 54,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#DCE8E3',
  },
  routeGuideActive: {
    position: 'absolute',
    left: 31,
    right: 31,
    top: 54,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  routeSweep: { width: 72, height: 3, borderRadius: 2, backgroundColor: C.brand },
  routeNodeWrap: { position: 'absolute', alignItems: 'center', top: 33, width: 66 },
  routeNode: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeNodeLabel: { marginTop: 5, color: C.muted, fontSize: 12, fontWeight: '600' },
  routeCenterWrap: {
    position: 'absolute',
    alignSelf: 'center',
    top: 23,
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCenterGlow: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#34D399',
  },
  routeCenterRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCenter: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeMiddleNode: {
    position: 'absolute',
    left: '50%',
    marginLeft: -3,
    top: 51,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: C.brand,
  },
  routeParticle: {
    position: 'absolute',
    left: '50%',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#86EFAC',
  },
  progressTrack: {
    width: '100%',
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#E9F0EC',
    marginTop: 6,
  },
  progressFill: { height: '100%', backgroundColor: C.brand, borderRadius: 4 },
  progressShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 60,
    height: 7,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  acceptLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  acceptLoadingText: { color: C.body, fontSize: 14, fontWeight: '600' },
});