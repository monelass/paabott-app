import React, {
  useState,
  useEffect,
  useCallback,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  StatusBar,
  Platform,
  ActivityIndicator,
  Image,
  Modal,
  Dimensions,
  KeyboardAvoidingView,
  RefreshControl,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Linking from 'expo-linking';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../config/supabase';
import OsmMap from '../../components/OsmMap';
import { createPaymentLink } from '../../services/paymongoService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ======================================================
// HELPERS
// ======================================================

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
    Math.cos(
      Number(lat1) * (Math.PI / 180)
    ) *
      Math.cos(
        Number(lat2) * (Math.PI / 180)
      ) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
};

// ======================================================
// AUTH FALLBACK
// ======================================================

let useAuth;

try {
  useAuth =
    require('../../context/AuthContext').useAuth;
} catch (e) {
  useAuth = () => ({
    signOut: null,
    profile: null,
    user: null,
  });
}

// ======================================================
// REUSABLE INPUT COMPONENT
// ======================================================

const FormInput = ({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  numberOfLines = 1,
  editable = true,
  required = false,
  maxLength,
}) => {
  return (
    <View style={styles.inputGroup}>
      <View style={styles.inputLabelRow}>
        <Text style={styles.inputLabel}>
          {label}
          {required ? ' *' : ''}
        </Text>
      </View>

      <View
        style={[
          styles.inputBox,
          multiline &&
            styles.inputBoxMultiline,
          !editable &&
            styles.inputBoxDisabled,
        ]}
      >
        <View style={styles.inputIconArea}>
          <Ionicons
            name={icon}
            size={19}
            color={
              editable
                ? '#6B7280'
                : '#9CA3AF'
            }
          />
        </View>

        <TextInput
          style={[
            styles.formTextInput,
            multiline &&
              styles.formTextInputMultiline,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={numberOfLines}
          editable={editable}
          maxLength={maxLength}
          textAlignVertical={
            multiline
              ? 'top'
              : 'center'
          }
          autoCapitalize={
            keyboardType === 'email-address'
              ? 'none'
              : 'sentences'
          }
        />
      </View>
    </View>
  );
};

// ======================================================
// DOCUMENT UPLOAD COMPONENT
// ======================================================

const DocumentUpload = ({
  title,
  attached,
  onPress,
}) => {
  return (
    <View style={styles.documentGroup}>
      <Text style={styles.documentLabel}>
        {title}
      </Text>

      <TouchableOpacity
        style={[
          styles.documentUploadBox,
          attached &&
            styles.documentUploadBoxAttached,
        ]}
        onPress={onPress}
        activeOpacity={0.78}
      >
        <View
          style={[
            styles.documentIconBox,
            attached &&
              styles.documentIconBoxAttached,
          ]}
        >
          <Ionicons
            name={
              attached
                ? 'checkmark'
                : 'cloud-upload-outline'
            }
            size={21}
            color={
              attached
                ? '#FFFFFF'
                : '#6B7280'
            }
          />
        </View>

        <View style={styles.documentTextArea}>
          <Text
            style={[
              styles.documentUploadTitle,
              attached &&
                styles.documentUploadTitleAttached,
            ]}
          >
            {attached
              ? 'Document attached'
              : 'Upload document'}
          </Text>

          <Text
            style={styles.documentUploadSub}
          >
            {attached
              ? 'Tap to replace this document'
              : 'JPG or PNG image'}
          </Text>
        </View>

        <Ionicons
          name="chevron-forward"
          size={18}
          color={
            attached
              ? '#059669'
              : '#9CA3AF'
          }
        />
      </TouchableOpacity>
    </View>
  );
};

// ======================================================
// MAIN COMPONENT
// ======================================================

export default function StoreProfileScreen() {
  const auth = useAuth
    ? useAuth()
    : {};

  const signOut = auth?.signOut;
  const currentUser =
    auth?.profile || auth?.user;

  // ====================================================
  // MAIN STATE
  // ====================================================

  const [
    loadingInitial,
    setLoadingInitial,
  ] = useState(true);

  const [storeId, setStoreId] =
    useState(null);

  const [isOpen, setIsOpen] =
    useState(true);

  const [storeName, setStoreName] =
    useState('');

  const [
    autoAreaLabel,
    setAutoAreaLabel,
  ] = useState('');

  const [
    streetDetails,
    setStreetDetails,
  ] = useState('');

  const [landmark, setLandmark] =
    useState('');

  const [phone, setPhone] =
    useState('');

  const [storeImage, setStoreImage] =
    useState(null);

  const [storeLoc, setStoreLoc] =
    useState(null);

  const [isLocating, setIsLocating] =
    useState(false);

  const [
    uploadingImage,
    setUploadingImage,
  ] = useState(false);

  // ── PULL TO REFRESH STATE ─────────────
  const [refreshing, setRefreshing] = useState(false);

  // ====================================================
  // VERIFICATION / SUBSCRIPTION
  // ====================================================

  const [
    isVerified,
    setIsVerified,
  ] = useState(false);

  const [
    verificationStatus,
    setVerificationStatus,
  ] = useState('unverified');

  const [
    subscriptionPlan,
    setSubscriptionPlan,
  ] = useState('Free Plan');

  const [
    subscriptionPrice,
    setSubscriptionPrice,
  ] = useState(500.0);

  // ====================================================
  // SERVICE BOUNDARY
  // ====================================================

  const [
    adminCenter,
    setAdminCenter,
  ] = useState({
    lat: 10.2021,
    lng: 122.8613,
  });

  const [
    maxRadiusKm,
    setMaxRadiusKm,
  ] = useState(15);

  // ====================================================
  // MAP PICKER
  // ====================================================

  const [
    isMapModalVisible,
    setIsMapModalVisible,
  ] = useState(false);

  const [
    pinSessionId,
    setPinSessionId,
  ] = useState(0);

  const [
    tempPinCoords,
    setTempPinCoords,
  ] = useState(null);

  const [
    resolvingPinAddress,
    setResolvingPinAddress,
  ] = useState(false);

  // ====================================================
  // PROFILE MODAL
  // ====================================================

  const [
    profileModalVisible,
    setProfileModalVisible,
  ] = useState(false);

  const [
    savingProfile,
    setSavingProfile,
  ] = useState(false);

  const [
    tempStoreName,
    setTempStoreName,
  ] = useState('');

  const [
    tempPhone,
    setTempPhone,
  ] = useState('');

  const [
    tempStreetDetails,
    setTempStreetDetails,
  ] = useState('');

  const [
    tempLandmark,
    setTempLandmark,
  ] = useState('');

  const [
    tempStoreLoc,
    setTempStoreLoc,
  ] = useState(null);

  const [
    tempAutoArea,
    setTempAutoArea,
  ] = useState('');

  const [
    isLocatingModal,
    setIsLocatingModal,
  ] = useState(false);

  // ====================================================
  // DOCUMENTS
  // ====================================================

  const [
    agreedToTerms,
    setAgreedToTerms,
  ] = useState(false);

  const [
    termsModalVisible,
    setTermsModalVisible,
  ] = useState(false);

  const [regType, setRegType] =
    useState('DTI');

  const [docs, setDocs] =
    useState({
      dtiSec: null,
      mayorsPermit: null,
      bir2303: null,
      barangayClearance: null,
      validId: null,
      fdaLto: null,
    });

  // ====================================================
  // LOGOUT / POPUPS / SUBSCRIPTION
  // ====================================================

  const [
    logoutModalVisible,
    setLogoutModalVisible,
  ] = useState(false);

  const [
    paymentModalVisible,
    setPaymentModalVisible,
  ] = useState(false);

  const [
    appDialog,
    setAppDialog,
  ] = useState({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    buttonText: 'Okay',
  });

  const showDialog = useCallback(
    ({
      type = 'info',
      title,
      message,
      buttonText = 'Okay',
    }) => {
      setAppDialog({
        visible: true,
        type,
        title,
        message,
        buttonText,
      });
    },
    []
  );

  const closeDialog = useCallback(() => {
    setAppDialog((prev) => ({
      ...prev,
      visible: false,
    }));
  }, []);

  // ====================================================
  // ADDRESS LOOKUP
  // ====================================================

  const fetchReadableAddress = async (
    lat,
    lng
  ) => {
    try {
      const response =
        await fetch(
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

      if (data && data.address) {
        const addr = data.address;

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
          formattedParts.push(road);
        }

        if (
          barangay &&
          barangay !== road
        ) {
          formattedParts.push(barangay);
        }

        if (town) {
          formattedParts.push(town);
        }

        return formattedParts.length > 0
          ? formattedParts
              .join(', ')
              .trim()
          : data.display_name
          ? data.display_name
              .split(',')
              .slice(0, 3)
              .join(',')
              .trim()
          : `Store Location (${lat.toFixed(
              4
            )}, ${lng.toFixed(4)})`;
      }

      if (data?.display_name) {
        return data.display_name
          .split(',')
          .slice(0, 3)
          .join(',')
          .trim();
      }
    } catch (error) {
      console.error(
        'Address lookup failed:',
        error
      );
    }

    return `Store Location (${lat.toFixed(
      4
    )}, ${lng.toFixed(4)})`;
  };

  // ====================================================
  // FETCH STORE (Wrapped in useCallback)
  // ====================================================

  const fetchStoreData = useCallback(async () => {
    if (!currentUser?.id) {
      setLoadingInitial(false);
      return;
    }

    try {
      const {
        data: settingsData,
      } = await supabase
        .from('settings')
        .select('key, value');

      if (settingsData) {
        const configMap = {};

        settingsData.forEach(
          (s) => {
            configMap[s.key] =
              s.value;
          }
        );

        if (
          configMap[
            'subscription_price'
          ]
        ) {
          setSubscriptionPrice(
            Number(
              configMap[
                'subscription_price'
              ]
            )
          );
        }

        if (
          configMap[
            'perimeter_lat'
          ] &&
          configMap[
            'perimeter_lng'
          ]
        ) {
          setAdminCenter({
            lat:
              parseFloat(
                configMap[
                  'perimeter_lat'
                ]
              ) ||
              10.2021,

            lng:
              parseFloat(
                configMap[
                  'perimeter_lng'
                ]
              ) ||
              122.8613,
          });
        }

        if (
          configMap[
            'perimeter_radius_km'
          ]
        ) {
          setMaxRadiusKm(
            parseFloat(
              configMap[
                'perimeter_radius_km'
              ]
            ) || 15
          );
        }
      }

      let storeData = null;

      const {
        data: storeByOwner,
      } = await supabase
        .from('stores')
        .select('*')
        .eq(
          'owner_id',
          currentUser.id
        )
        .maybeSingle();

      if (storeByOwner) {
        storeData =
          storeByOwner;
      } else {
        const {
          data: storeByUser,
        } = await supabase
          .from('stores')
          .select('*')
          .or(
            `user_id.eq.${currentUser.id},vendor_id.eq.${currentUser.id}`
          )
          .maybeSingle();

        if (storeByUser) {
          storeData =
            storeByUser;
        }
      }

      if (storeData) {
        setStoreId(
          storeData.id
        );

        setStoreName(
          storeData.name || ''
        );

        setIsOpen(
          storeData.is_open ??
            true
        );

        setPhone(
          storeData.phone || ''
        );

        setIsVerified(
          storeData.is_verified ||
            false
        );

        setVerificationStatus(
          storeData.verification_status ||
            (storeData.is_verified
              ? 'verified'
              : 'unverified')
        );

        setSubscriptionPlan(
          storeData.subscription_plan ||
            'Free Plan'
        );

        const existingImg =
          storeData.image_pic ||
          storeData.image_url ||
          storeData.store_image ||
          storeData.banner_url;

        if (existingImg) {
          setStoreImage(
            existingImg
          );
        }

        if (
          storeData.street
        ) {
          setStreetDetails(
            storeData.street
          );
        }

        if (
          storeData.description
        ) {
          setLandmark(
            storeData.description
          );
        }

        if (
          storeData.address
        ) {
          setAutoAreaLabel(
            storeData.address
          );
        }

        if (
          storeData.lat != null &&
          storeData.lng != null
        ) {
          setStoreLoc({
            lat: Number(
              storeData.lat
            ),
            lng: Number(
              storeData.lng
            ),
          });
        }
      }
    } catch (err) {
      console.error(
        'Error fetching store:',
        err
      );

      showDialog({
        type: 'error',
        title:
          'Unable to Load Store',
        message:
          'We could not load your store profile right now. Please try again.',
      });
    } finally {
      setLoadingInitial(false);
    }
  }, [currentUser?.id, showDialog]);

  // ====================================================
  // REAL-TIME AUTO REFRESH & PULL TO REFRESH
  // ====================================================

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStoreData();
    setRefreshing(false);
  }, [fetchStoreData]);

  useFocusEffect(
    useCallback(() => {
      // 1. Fetch fresh data immediately when screen opens
      fetchStoreData();

      // 2. Start a background listener to update instantly if admin approves verification
      const storeSubscription = supabase
        .channel(`store_profile_updates_${currentUser?.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'stores',
            filter: `owner_id=eq.${currentUser?.id}`
          },
          () => {
            fetchStoreData(); // Refresh silently
          }
        )
        .subscribe();

      // Clean up the listener when the user leaves the tab
      return () => {
        supabase.removeChannel(storeSubscription);
      };
    }, [fetchStoreData, currentUser?.id])
  );

  // ====================================================
  // SUBSCRIPTION DEEP LINK
  // ====================================================

  useEffect(() => {
    const upgradeSubscription =
      async () => {
        try {
          await supabase
            .from('stores')
            .update({
              subscription_plan:
                'Premium Plan',
            })
            .eq(
              'id',
              storeId
            );

          let {
            data: storeWallet,
          } = await supabase
            .from('wallets')
            .select('id')
            .eq(
              'user_id',
              currentUser?.id
            )
            .maybeSingle();

          if (!storeWallet) {
            const {
              data: newWallet,
            } = await supabase
              .from('wallets')
              .insert({
                user_id:
                  currentUser?.id,
                role: 'store',
                available_balance: 0,
                cash_on_hand: 0,
              })
              .select('id')
              .single();

            storeWallet =
              newWallet;
          }

          if (storeWallet) {
            await supabase
              .from(
                'ledger_transactions'
              )
              .insert([
                {
                  wallet_id:
                    storeWallet.id,
                  amount:
                    subscriptionPrice,
                  transaction_type:
                    'subscription_paid',
                  payment_reference: `Store Premium Subscription (Store ID: ${storeId})`,
                },
              ]);
          }

          setSubscriptionPlan(
            'Premium Plan'
          );

          showDialog({
            type: 'success',
            title:
              'Subscription Upgraded',
            message:
              'Welcome to the Premium Plan. Your store can now post items and accept customer orders.',
          });
        } catch (err) {
          console.error(
            'Upgrade error:',
            err
          );

          showDialog({
            type: 'error',
            title:
              'Subscription Update Failed',
            message:
              'Your payment was detected, but we could not update the store subscription automatically.',
          });
        }
      };

    const handleDeepLink =
      async (event) => {
        if (
          event?.url?.includes(
            'subscription-success'
          ) &&
          storeId
        ) {
          await upgradeSubscription();
        }
      };

    const subscription =
      Linking.addEventListener(
        'url',
        handleDeepLink
      );

    Linking.getInitialURL()
      .then(async (url) => {
        if (
          url?.includes(
            'subscription-success'
          ) &&
          storeId
        ) {
          await upgradeSubscription();
        }
      })
      .catch((err) =>
        console.error(
          'URL Error:',
          err
        )
      );

    return () => {
      subscription.remove();
    };
  }, [
    storeId,
    currentUser?.id,
    subscriptionPrice,
    showDialog,
  ]);

  // ====================================================
  // IMAGE PICKER
  // ====================================================

  const handlePickImage =
    async () => {
      try {
        const permissionResult =
          await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permissionResult.granted) {
          showDialog({
            type: 'warning',
            title:
              'Permission Required',
            message:
              'Please allow photo library access so you can choose a store image.',
          });
          return;
        }

        const result =
          await ImagePicker.launchImageLibraryAsync(
            {
              mediaTypes:
                ImagePicker
                  .MediaTypeOptions
                  .Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            }
          );

        if (
          !result.canceled &&
          result.assets &&
          result.assets.length > 0
        ) {
          const selectedUri =
            result.assets[0].uri;

          await uploadImageToSupabase(
            selectedUri
          );
        }
      } catch (error) {
        showDialog({
          type: 'error',
          title:
            'Image Selection Failed',
          message:
            'We could not select an image from your gallery.',
        });
      }
    };

  const uploadImageToSupabase =
    async (uri) => {
      setUploadingImage(true);

      try {
        const base64String =
          await FileSystem.readAsStringAsync(
            uri,
            {
              encoding:
                FileSystem
                  .EncodingType
                  .Base64,
            }
          );

        const fileExtension =
          uri
            .split('.')
            .pop()
            ?.toLowerCase() ||
          'jpg';

        const base64DataUri = `data:image/${
          fileExtension === 'png'
            ? 'png'
            : 'jpeg'
        };base64,${base64String}`;

        setStoreImage(
          base64DataUri
        );

        if (storeId) {
          await supabase
            .from('stores')
            .update({
              image_pic:
                base64DataUri,
            })
            .eq(
              'id',
              storeId
            );
        }

        showDialog({
          type: 'success',
          title:
            'Store Image Updated',
          message:
            'Your store picture has been attached successfully.',
        });
      } catch (error) {
        showDialog({
          type: 'error',
          title:
            'Upload Failed',
          message:
            error?.message ||
            'Could not process the selected image.',
        });
      } finally {
        setUploadingImage(false);
      }
    };

  // ====================================================
  // DOCUMENT PICKER
  // ====================================================

  const pickDocumentImage =
    async (docKey) => {
      try {
        const permissionResult =
          await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permissionResult.granted) {
          showDialog({
            type: 'warning',
            title:
              'Permission Required',
            message:
              'Photo library access is needed to attach business documents.',
          });
          return;
        }

        const result =
          await ImagePicker.launchImageLibraryAsync(
            {
              mediaTypes:
                ImagePicker
                  .MediaTypeOptions
                  .Images,
              allowsEditing: false,
              quality: 0.7,
            }
          );

        if (
          !result.canceled &&
          result.assets &&
          result.assets.length > 0
        ) {
          const selectedUri =
            result.assets[0].uri;

          const base64String =
            await FileSystem.readAsStringAsync(
              selectedUri,
              {
                encoding:
                  FileSystem
                    .EncodingType
                    .Base64,
              }
            );

          const fileExtension =
            selectedUri
              .split('.')
              .pop()
              ?.toLowerCase() ||
            'jpg';

          const dataUri = `data:image/${
            fileExtension === 'png'
              ? 'png'
              : 'jpeg'
          };base64,${base64String}`;

          setDocs((prev) => ({
            ...prev,
            [docKey]: dataUri,
          }));
        }
      } catch (e) {
        showDialog({
          type: 'error',
          title:
            'Document Upload Failed',
          message:
            'We could not attach that document image. Please try again.',
        });
      }
    };

  // ====================================================
  // OPEN PROFILE MODAL
  // ====================================================

  const handleOpenEditModal =
    () => {
      setTempStoreName(
        storeName
      );

      setTempPhone(phone);

      setTempStreetDetails(
        streetDetails
      );

      setTempLandmark(
        landmark
      );

      setTempStoreLoc(
        storeLoc
      );

      setTempAutoArea(
        autoAreaLabel
      );

      setProfileModalVisible(
        true
      );
    };

  // ====================================================
  // GET GPS
  // ====================================================

  const handleFetchLocationModal =
    async () => {
      setIsLocatingModal(
        true
      );

      try {
        const {
          status,
        } =
          await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          showDialog({
            type: 'warning',
            title:
              'Location Permission Required',
            message:
              'Please enable location access so Paabot can determine your store location.',
          });

          setIsLocatingModal(
            false
          );

          return;
        }

        const location =
          await Location.getCurrentPositionAsync(
            {
              accuracy:
                Location
                  .Accuracy
                  .High,
            }
          );

        const lat =
          location.coords
            .latitude;

        const lng =
          location.coords
            .longitude;

        const distToHub =
          calculateDistanceKm(
            adminCenter.lat,
            adminCenter.lng,
            lat,
            lng
          );

        if (
          distToHub >
          maxRadiusKm
        ) {
          showDialog({
            type: 'warning',
            title:
              'Outside Service Area',
            message: `Your current location is ${distToHub.toFixed(
              1
            )} km away. Stores must be within ${maxRadiusKm} km of our service hub.`,
          });

          setIsLocatingModal(
            false
          );

          return;
        }

        setTempStoreLoc({
          lat,
          lng,
        });

        const autoAddress =
          await fetchReadableAddress(
            lat,
            lng
          );

        setTempAutoArea(
          autoAddress
        );
      } catch (error) {
        showDialog({
          type: 'error',
          title:
            'Location Error',
          message:
            'We could not fetch your current location. Please try again or place the pin manually.',
        });
      } finally {
        setIsLocatingModal(
          false
        );
      }
    };

  // ====================================================
  // OPEN PIN PICKER
  // ====================================================

  const openPinPicker =
    () => {
      const startCoords =
        tempStoreLoc ||
        storeLoc ||
        adminCenter;

      setTempPinCoords(
        startCoords
      );

      setPinSessionId(
        (n) => n + 1
      );

      setIsMapModalVisible(
        true
      );
    };

  // ====================================================
  // CONFIRM PIN
  // ====================================================

  const confirmPin =
    async () => {
      if (
        !tempPinCoords ||
        tempPinCoords.lat == null ||
        tempPinCoords.lng == null
      ) {
        setIsMapModalVisible(
          false
        );
        return;
      }

      const distToHub =
        calculateDistanceKm(
          adminCenter.lat,
          adminCenter.lng,
          tempPinCoords.lat,
          tempPinCoords.lng
        );

      if (
        distToHub >
        maxRadiusKm
      ) {
        showDialog({
          type: 'warning',
          title:
            'Outside Service Area',
          message: `This location is ${distToHub.toFixed(
            1
          )} km away. Stores must be within ${maxRadiusKm} km of our service hub. Move the map closer and try again.`,
        });

        return;
      }

      setResolvingPinAddress(
        true
      );

      try {
        setTempStoreLoc(
          tempPinCoords
        );

        const autoAddress =
          await fetchReadableAddress(
            tempPinCoords.lat,
            tempPinCoords.lng
          );

        setTempAutoArea(
          autoAddress
        );
      } finally {
        setResolvingPinAddress(
          false
        );

        setIsMapModalVisible(
          false
        );
      }
    };

  // ====================================================
  // SAVE PROFILE
  // ====================================================

  const handleSaveProfileAndVerify =
    async () => {
      if (!currentUser?.id) {
        showDialog({
          type: 'error',
          title:
            'Session Not Found',
          message:
            'Your user session could not be found. Please log in again.',
        });

        return;
      }

      if (
        !tempStoreName.trim() ||
        !tempStreetDetails.trim() ||
        !tempStoreLoc
      ) {
        showDialog({
          type: 'warning',
          title:
            'Missing Store Information',
          message:
            'Please provide your store name, street address, and exact store location.',
        });

        return;
      }

      const distToHub =
        calculateDistanceKm(
          adminCenter.lat,
          adminCenter.lng,
          tempStoreLoc.lat,
          tempStoreLoc.lng
        );

      if (
        distToHub >
        maxRadiusKm
      ) {
        showDialog({
          type: 'warning',
          title:
            'Outside Service Area',
          message: `Your store is ${distToHub.toFixed(
            1
          )} km away. Store locations must be within ${maxRadiusKm} km of our service hub.`,
        });

        return;
      }

      const isSubmittingVerification =
        verificationStatus ===
        'unverified';

      if (isSubmittingVerification) {
        if (
          !docs.dtiSec ||
          !docs.mayorsPermit ||
          !docs.bir2303 ||
          !docs.validId
        ) {
          showDialog({
            type: 'warning',
            title:
              'Required Documents Missing',
            message:
              "Please upload your DTI/SEC registration, Mayor's Permit, BIR Form 2303, and Owner Valid ID before submitting verification.",
          });

          return;
        }

        if (!agreedToTerms) {
          showDialog({
            type: 'warning',
            title:
              'Terms Not Accepted',
            message:
              'Please agree to the Terms and Conditions and Platform Policies before submitting your store for verification.',
          });

          return;
        }
      }

      setSavingProfile(true);

      try {
        let finalAddress =
          tempAutoArea;

        const parts = [];

        if (
          tempStreetDetails.trim()
        ) {
          parts.push(
            tempStreetDetails.trim()
          );
        }

        if (
          tempAutoArea.trim()
        ) {
          parts.push(
            tempAutoArea.trim()
          );
        }

        if (parts.length > 0) {
          finalAddress =
            parts.join(', ');
        }

        const storePayload = {
          owner_id:
            currentUser.id,
          name:
            tempStoreName.trim(),
          address:
            finalAddress,
          street:
            tempStreetDetails.trim(),
          description:
            tempLandmark.trim(),
          phone:
            tempPhone.trim(),
          is_open: isOpen,
          lat:
            tempStoreLoc.lat,
          lng:
            tempStoreLoc.lng,
          image_pic:
            storeImage,
        };

        if (
          isSubmittingVerification
        ) {
          storePayload.verification_status =
            'pending';

          storePayload.is_verified =
            false;

          storePayload.verification_documents =
            {
              reg_type:
                regType,
              dti_sec_url:
                docs.dtiSec,
              mayors_permit_url:
                docs.mayorsPermit,
              bir_2303_url:
                docs.bir2303,
              barangay_clearance_url:
                docs.barangayClearance,
              valid_id_url:
                docs.validId,
              fda_lto_url:
                docs.fdaLto,
              submitted_at:
                new Date().toISOString(),
              agreed_to_terms:
                agreedToTerms,
            };
        }

        let existingStoreId =
          storeId;

        if (!existingStoreId) {
          const {
            data: existingCheck,
          } = await supabase
            .from('stores')
            .select('id')
            .eq(
              'owner_id',
              currentUser.id
            )
            .maybeSingle();

          if (
            existingCheck?.id
          ) {
            existingStoreId =
              existingCheck.id;

            setStoreId(
              existingStoreId
            );
          }
        }

        let error = null;

        if (existingStoreId) {
          const {
            error: updateErr,
          } = await supabase
            .from('stores')
            .update(
              storePayload
            )
            .eq(
              'id',
              existingStoreId
            );

          error =
            updateErr;
        } else {
          const {
            data: newStore,
            error: insertErr,
          } = await supabase
            .from('stores')
            .insert(
              storePayload
            )
            .select()
            .single();

          error =
            insertErr;

          if (newStore?.id) {
            setStoreId(
              newStore.id
            );
          }
        }

        if (error) {
          throw error;
        }

        // Commit temporary state
        setStoreName(tempStoreName);
        setPhone(tempPhone);
        setStreetDetails(tempStreetDetails);
        setLandmark(tempLandmark);
        setStoreLoc(tempStoreLoc);
        setAutoAreaLabel(tempAutoArea);

        // ✨ FIX: Sync phone number to the 'profiles' table
        const profilePayload = {
          phone: tempPhone.trim(),
        };

        // If they are also verifying, append the terms data
        if (isSubmittingVerification && agreedToTerms) {
          profilePayload.agreed_to_terms = true;
          profilePayload.terms_accepted_at = new Date().toISOString();
        }

        const { error: profileUpdateError } = await supabase
          .from('profiles')
          .update(profilePayload)
          .eq('id', currentUser.id);

        if (profileUpdateError) {
          console.error(
            'Error updating profiles table:',
            profileUpdateError.message
          );
        }

        if (isSubmittingVerification) {
          setVerificationStatus('pending');
        }

        setProfileModalVisible(false);

        showDialog({
          type: 'success',
          title: isSubmittingVerification
            ? 'Verification Submitted'
            : 'Profile Updated',
          message: isSubmittingVerification
            ? 'Your store profile and verification documents have been submitted for admin review.'
            : 'Your store profile has been updated successfully.',
        });
      } catch (error) {
        showDialog({
          type: 'error',
          title:
            'Save Failed',
          message:
            error?.message ||
            'We could not save your store profile.',
        });
      } finally {
        setSavingProfile(false);
      }
    };

  // ====================================================
  // LOGOUT
  // ====================================================

  const confirmLogout =
    () => {
      setLogoutModalVisible(
        false
      );

      if (signOut) {
        signOut();
      }
    };

  // ====================================================
  // SUBSCRIPTION
  // ====================================================

  const manageSubscription =
    () => {
      if (!isVerified) {
        showDialog({
          type: 'warning',
          title:
            'Verification Required',
          message:
            'Your store must be fully verified by the admin before you can subscribe and post items.',
        });

        return;
      }

      if (
        subscriptionPlan !==
        'Free Plan'
      ) {
        showDialog({
          type: 'success',
          title:
            'Subscription Active',
          message: `Your store is currently subscribed to the ${subscriptionPlan}.\n\nYour account is fully upgraded.`,
        });

        return;
      }

      setPaymentModalVisible(
        true
      );
    };

  // ====================================================
  // PROCESS PAYMONGO
  // ====================================================

  const processSubscriptionPayment =
    async () => {
      setPaymentModalVisible(
        false
      );

      try {
        const returnUrl =
          Linking.createURL(
            'subscription-success'
          );

        const checkoutUrl =
          await createPaymentLink(
            subscriptionPrice,
            `Store Premium Subscription (Store ID: ${storeId})`,
            returnUrl,
            currentUser?.email ||
              'store@paabot.com',
            storeName ||
              'Paabot Merchant'
          );

        if (checkoutUrl) {
          await Linking.openURL(
            checkoutUrl
          );
        }
      } catch (error) {
        showDialog({
          type: 'error',
          title:
            'Payment Error',
          message:
            error?.message ||
            'Failed to generate the PayMongo payment link.',
        });
      }
    };

  // ====================================================
  // LOADING
  // ====================================================

  if (loadingInitial) {
    return (
      <View
        style={
          styles.loadingScreen
        }
      >
        <View
          style={
            styles.loadingIconBox
          }
        >
          <Ionicons
            name="storefront-outline"
            size={30}
            color="#059669"
          />
        </View>

        <ActivityIndicator
          size="small"
          color="#059669"
        />

        <Text
          style={
            styles.loadingTitle
          }
        >
          Loading store profile
        </Text>

        <Text
          style={
            styles.loadingSub
          }
        >
          Preparing your store settings...
        </Text>
      </View>
    );
  }

  // ====================================================
  // MAIN UI
  // ====================================================

  return (
    <SafeAreaView
      style={styles.container}
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
      />

      {/* ==============================================
          HEADER
      ============================================== */}

      <View style={styles.header}>
        <View style={styles.headerTextGroup}>
          <Text
            style={styles.headerEyebrow}
          >
            STORE MANAGEMENT
          </Text>

          <Text
            style={styles.headerTitle}
          >
            Store Settings
          </Text>

          <Text
            style={styles.headerSub}
          >
            Manage your store profile, verification, and operations
          </Text>
        </View>

        
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { flexGrow: 1 }
        ]}
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical={true}
        nestedScrollEnabled={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#059669']}
            tintColor="#059669"
          />
        }
      >
        {/* ==========================================
            VERIFICATION BANNER
        ========================================== */}

        {verificationStatus ===
          'unverified' && (
          <View
            style={
              styles.statusBannerDanger
            }
          >
            <View
              style={
                styles.bannerIconDanger
              }
            >
              <Ionicons
                name="warning"
                size={21}
                color="#B91C1C"
              />
            </View>

            <View
              style={
                styles.bannerTextArea
              }
            >
              <Text
                style={
                  styles.bannerTitleDanger
                }
              >
                Action Required
              </Text>

              <Text
                style={
                  styles.bannerSubDanger
                }
              >
                Complete your store profile and submit the required documents before posting items.
              </Text>
            </View>
          </View>
        )}

        {verificationStatus ===
          'pending' && (
          <View
            style={
              styles.statusBannerPending
            }
          >
            <View
              style={
                styles.bannerIconPending
              }
            >
              <Ionicons
                name="time-outline"
                size={21}
                color="#B45309"
              />
            </View>

            <View
              style={
                styles.bannerTextArea
              }
            >
              <Text
                style={
                  styles.bannerTitlePending
                }
              >
                Verification Pending
              </Text>

              <Text
                style={
                  styles.bannerSubPending
                }
              >
                Your documents have been submitted and are waiting for admin review.
              </Text>
            </View>
          </View>
        )}

        {verificationStatus ===
          'verified' && (
          <View
            style={
              styles.statusBannerSuccess
            }
          >
            <View
              style={
                styles.bannerIconSuccess
              }
            >
              <Ionicons
                name="checkmark-circle"
                size={21}
                color="#047857"
              />
            </View>

            <View
              style={
                styles.bannerTextArea
              }
            >
              <Text
                style={
                  styles.bannerTitleSuccess
                }
              >
                Store Verified
              </Text>

              <Text
                style={
                  styles.bannerSubSuccess
                }
              >
                Your store has been approved. You can now manage your subscription and products.
              </Text>
            </View>
          </View>
        )}

        {/* ==========================================
            STORE IDENTITY CARD
        ========================================== */}

        <View
          style={
            styles.identityCard
          }
        >
          <TouchableOpacity
            style={
              styles.avatarWrapper
            }
            onPress={
              handlePickImage
            }
            activeOpacity={0.85}
          >
            {uploadingImage ? (
              <View
                style={
                  styles.avatarPlaceholder
                }
              >
                <ActivityIndicator
                  size="small"
                  color="#059669"
                />
              </View>
            ) : storeImage ? (
              <Image
                source={{
                  uri: storeImage,
                }}
                style={
                  styles.avatarImage
                }
              />
            ) : (
              <View
                style={
                  styles.avatarPlaceholder
                }
              >
                <Ionicons
                  name="storefront-outline"
                  size={34}
                  color="#059669"
                />
              </View>
            )}

            <View
              style={
                styles.cameraBadge
              }
            >
              <Ionicons
                name="camera"
                size={14}
                color="#FFFFFF"
              />
            </View>
          </TouchableOpacity>

          <Text
            style={
              styles.identityName
            }
            numberOfLines={2}
          >
            {storeName ||
              'Store Name Not Set'}
          </Text>

          <View
            style={
              styles.identityStatusRow
            }
          >
            {isVerified && (
              <Ionicons
                name="checkmark-circle"
                size={17}
                color="#A7F3D0"
                style={
                  styles.identityCheck
                }
              />
            )}

            {verificationStatus ===
            'verified' ? (
              <View
                style={
                  styles.verifiedBadge
                }
              >
                <Ionicons
                  name="shield-checkmark"
                  size={14}
                  color="#047857"
                />

                <Text
                  style={
                    styles.verifiedBadgeText
                  }
                >
                  Verified Merchant
                </Text>
              </View>
            ) : verificationStatus ===
              'pending' ? (
              <View
                style={
                  styles.pendingBadge
                }
              >
                <Ionicons
                  name="time-outline"
                  size={14}
                  color="#B45309"
                />

                <Text
                  style={
                    styles.pendingBadgeText
                  }
                >
                  Verification Pending
                </Text>
              </View>
            ) : (
              <View
                style={
                  styles.unverifiedBadge
                }
              >
                <Ionicons
                  name="warning-outline"
                  size={14}
                  color="#B91C1C"
                />

                <Text
                  style={
                    styles.unverifiedBadgeText
                  }
                >
                  Unverified Store
                </Text>
              </View>
            )}
          </View>

          <Text
            style={
              styles.changePhotoText
            }
          >
            Tap the image to change store photo
          </Text>
        </View>

        {/* ==========================================
            STORE STATUS
        ========================================== */}

        <View
          style={
            styles.sectionCard
          }
        >
          <View
            style={
              styles.sectionCardHeader
            }
          >
            <View
              style={
                styles.sectionHeaderIcon
              }
            >
              <Ionicons
                name="radio-outline"
                size={20}
                color="#059669"
              />
            </View>

            <View
              style={
                styles.sectionHeaderText
              }
            >
              <Text
                style={
                  styles.sectionCardTitle
                }
              >
                Store Status
              </Text>

              <Text
                style={
                  styles.sectionCardSubtitle
                }
              >
                Control whether customers can place online orders
              </Text>
            </View>

            <Switch
              value={isOpen}
              onValueChange={
                setIsOpen
              }
              trackColor={{
                false: '#D1D5DB',
                true: '#6EE7B7',
              }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#D1D5DB"
            />
          </View>

          <View
            style={[
              styles.storeStatusDisplay,
              isOpen
                ? styles.storeStatusOpen
                : styles.storeStatusClosed,
            ]}
          >
            <View
              style={[
                styles.statusIndicator,
                {
                  backgroundColor:
                    isOpen
                      ? '#059669'
                      : '#9CA3AF',
                },
              ]}
            />

            <View
              style={
                styles.storeStatusDisplayText
              }
            >
              <Text
                style={[
                  styles.storeStatusTitle,
                  {
                    color: isOpen
                      ? '#047857'
                      : '#4B5563',
                  },
                ]}
              >
                {isOpen
                  ? 'Currently Open'
                  : 'Currently Closed'}
              </Text>

              <Text
                style={
                  styles.storeStatusDescription
                }
              >
                {isOpen
                  ? 'Your store is accepting online orders.'
                  : 'Your store is not currently accepting online orders.'}
              </Text>
            </View>
          </View>
        </View>

        {/* ==========================================
            SUBSCRIPTION
        ========================================== */}

        <View
          style={
            styles.subscriptionCard
          }
        >
          <View
            style={
              styles.subscriptionTop
            }
          >
            <View
              style={
                styles.subscriptionIconBox
              }
            >
              <Ionicons
                name="star-outline"
                size={22}
                color="#D97706"
              />
            </View>

            <View
              style={
                styles.subscriptionTextArea
              }
            >
              <Text
                style={
                  styles.subscriptionEyebrow
                }
              >
                PLATFORM SUBSCRIPTION
              </Text>

              <Text
                style={
                  styles.subscriptionTitle
                }
              >
                {subscriptionPlan}
              </Text>

              {subscriptionPlan ===
                'Free Plan' && (
                <Text
                  style={
                    styles.subscriptionSub
                  }
                >
                  ₱
                  {subscriptionPrice.toFixed(
                    2
                  )}
                  /month
                </Text>
              )}
            </View>
          </View>

          <View
            style={
              styles.subscriptionDivider
            }
          />

          <View
            style={
              styles.subscriptionBottom
            }
          >
            <View
              style={
                styles.subscriptionBenefits
              }
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={16}
                color="#D97706"
              />

              <Text
                style={
                  styles.subscriptionBenefitText
                }
              >
                {subscriptionPlan ===
                'Free Plan'
                  ? 'Upgrade to unlock unlimited item posting'
                  : 'Premium features are active'}
              </Text>
            </View>

            <TouchableOpacity
              style={
                styles.subscriptionButton
              }
              onPress={
                manageSubscription
              }
              activeOpacity={0.82}
            >
              <Text
                style={
                  styles.subscriptionButtonText
                }
              >
                {subscriptionPlan ===
                'Free Plan'
                  ? 'Upgrade'
                  : 'Manage'}
              </Text>

              <Ionicons
                name="chevron-forward"
                size={15}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ==========================================
            PROFILE INFORMATION
        ========================================== */}

        <View
          style={
            styles.profileCard
          }
        >
          <View
            style={
              styles.profileCardHeader
            }
          >
            <View>
              <Text
                style={
                  styles.profileEyebrow
                }
              >
                STORE INFORMATION
              </Text>

              <Text
                style={
                  styles.profileTitle
                }
              >
                Store Profile
              </Text>
            </View>

            <View
              style={
                styles.profileHeaderIcon
              }
            >
              <Ionicons
                name="document-text-outline"
                size={21}
                color="#059669"
              />
            </View>
          </View>

          {/* NAME */}
          <View
            style={
              styles.profileInfoRow
            }
          >
            <View
              style={
                styles.profileInfoIcon
              }
            >
              <Ionicons
                name="storefront-outline"
                size={19}
                color="#059669"
              />
            </View>

            <View
              style={
                styles.profileInfoTextArea
              }
            >
              <Text
                style={
                  styles.profileInfoLabel
                }
              >
                Store Name
              </Text>

              <Text
                style={
                  styles.profileInfoValue
                }
              >
                {storeName ||
                  'No store name set'}
              </Text>
            </View>
          </View>

          {/* PHONE */}
          <View
            style={
              styles.profileInfoRow
            }
          >
            <View
              style={
                styles.profileInfoIcon
              }
            >
              <Ionicons
                name="call-outline"
                size={19}
                color="#059669"
              />
            </View>

            <View
              style={
                styles.profileInfoTextArea
              }
            >
              <Text
                style={
                  styles.profileInfoLabel
                }
              >
                Contact Number
              </Text>

              <Text
                style={
                  styles.profileInfoValue
                }
              >
                {phone ||
                  'No contact number set'}
              </Text>
            </View>
          </View>

          {/* ADDRESS */}
          <View
            style={[
              styles.profileInfoRow,
              styles.profileInfoRowTop,
            ]}
          >
            <View
              style={
                styles.profileInfoIcon
              }
            >
              <Ionicons
                name="location-outline"
                size={19}
                color="#059669"
              />
            </View>

            <View
              style={
                styles.profileInfoTextArea
              }
            >
              <Text
                style={
                  styles.profileInfoLabel
                }
              >
                Store Address
              </Text>

              <Text
                style={
                  styles.profileInfoValue
                }
              >
                {streetDetails
                  ? `${streetDetails}${
                      autoAreaLabel
                        ? `, ${autoAreaLabel}`
                        : ''
                    }`
                  : 'No address pinned yet'}
              </Text>

              {landmark ? (
                <View
                  style={
                    styles.landmarkDisplay
                  }
                >
                  <Ionicons
                    name="navigate-outline"
                    size={14}
                    color="#6B7280"
                  />

                  <Text
                    style={
                      styles.landmarkText
                    }
                  >
                    {landmark}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* MAP */}
          {storeLoc ? (
            <View
              style={
                styles.profileMapWrapper
              }
            >
              <OsmMap
                center={storeLoc}
                zoom={15}
                markers={[
                  {
                    lat: storeLoc.lat,
                    lng: storeLoc.lng,
                    label:
                      storeName ||
                      'Store',
                  },
                ]}
              />

              <View
                style={
                  styles.mapLocationBadge
                }
              >
                <Ionicons
                  name="location"
                  size={14}
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.mapLocationBadgeText
                  }
                >
                  Store Location
                </Text>
              </View>
            </View>
          ) : (
            <View
              style={
                styles.noMapBox
              }
            >
              <Ionicons
                name="location-outline"
                size={24}
                color="#9CA3AF"
              />

              <Text
                style={
                  styles.noMapText
                }
              >
                No store location pinned yet
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.editProfileButton,
              verificationStatus ===
                'unverified' &&
                styles.verifyProfileButton,
            ]}
            onPress={
              handleOpenEditModal
            }
            activeOpacity={0.85}
          >
            <Ionicons
              name={
                verificationStatus ===
                'unverified'
                  ? 'shield-checkmark-outline'
                  : 'create-outline'
              }
              size={19}
              color={
                verificationStatus ===
                'unverified'
                  ? '#FFFFFF'
                  : '#059669'
              }
            />

            <Text
              style={[
                styles.editProfileButtonText,
                verificationStatus !==
                  'unverified' &&
                  styles.editProfileButtonTextGreen,
              ]}
            >
              {verificationStatus ===
              'unverified'
                ? 'Setup & Verify Store'
                : 'Edit Profile Details'}
            </Text>

            <Ionicons
              name="chevron-forward"
              size={17}
              color={
                verificationStatus ===
                'unverified'
                  ? '#FFFFFF'
                  : '#059669'
              }
            />
          </TouchableOpacity>
        </View>

        {/* ==========================================
            LOGOUT
        ========================================== */}

        <TouchableOpacity
          style={
            styles.bottomLogoutButton
          }
          onPress={() =>
            setLogoutModalVisible(
              true
            )
          }
          activeOpacity={0.8}
        >
          <Ionicons
            name="log-out-outline"
            size={19}
            color="#DC2626"
          />

          <Text
            style={
              styles.bottomLogoutText
            }
          >
            Log Out of Store Account
          </Text>
        </TouchableOpacity>

        <View style={styles.bottomSpace} />
      </ScrollView>

      {/* ==========================================
          PROFILE / VERIFICATION MODAL
      ========================================== */}

      <Modal
        visible={
          profileModalVisible
        }
        animationType="slide"
        transparent={false}
        onRequestClose={() =>
          !savingProfile &&
          setProfileModalVisible(
            false
          )
        }
      >
        <SafeAreaView
          style={
            styles.fullModalContainer
          }
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={
              Platform.OS === 'ios'
                ? 'padding'
                : undefined
            }
          >
            {/* MODAL HEADER */}
            <View
              style={
                styles.profileModalHeader
              }
            >
              <TouchableOpacity
                style={
                  styles.modalIconButton
                }
                onPress={() =>
                  !savingProfile &&
                  setProfileModalVisible(
                    false
                  )
                }
                disabled={
                  savingProfile
                }
              >
                <Ionicons
                  name="close"
                  size={23}
                  color="#111827"
                />
              </TouchableOpacity>

              <View
                style={
                  styles.profileModalTitleArea
                }
              >
                <Text
                  style={
                    styles.profileModalEyebrow
                  }
                >
                  {verificationStatus ===
                  'unverified'
                    ? 'ACCOUNT SETUP'
                    : 'STORE SETTINGS'}
                </Text>

                <Text
                  style={
                    styles.profileModalTitle
                  }
                >
                  {verificationStatus ===
                  'unverified'
                    ? 'Store Verification'
                    : 'Edit Store Profile'}
                </Text>
              </View>

              <View
                style={{
                  width: 42,
                }}
              />
            </View>

            <ScrollView
              contentContainerStyle={
                styles.profileModalContent
              }
              showsVerticalScrollIndicator={
                false
              }
              keyboardShouldPersistTaps="handled"
            >
              {/* LEAD MESSAGE */}
              {verificationStatus ===
                'unverified' && (
                <View
                  style={
                    styles.modalLeadBox
                  }
                >
                  <View
                    style={
                      styles.modalLeadIconBox
                    }
                  >
                    <Ionicons
                      name="information-circle"
                      size={21}
                      color="#0284C7"
                    />
                  </View>

                  <View
                    style={
                      styles.modalLeadTextArea
                    }
                  >
                    <Text
                      style={
                        styles.modalLeadTitle
                      }
                    >
                      Complete your store profile
                    </Text>

                    <Text
                      style={
                        styles.modalLeadText
                      }
                    >
                      Provide your business details, exact location, and required documents for admin verification.
                    </Text>
                  </View>
                </View>
              )}

              {/* =====================================
                  BASIC DETAILS CARD
              ===================================== */}

              <View
                style={
                  styles.modalSectionCard
                }
              >
                <View
                  style={
                    styles.modalSectionHeader
                  }
                >
                  <View
                    style={
                      styles.modalSectionHeaderIcon
                    }
                  >
                    <Ionicons
                      name="storefront-outline"
                      size={19}
                      color="#059669"
                    />
                  </View>

                  <View
                    style={
                      styles.modalSectionHeaderText
                    }
                  >
                    <Text
                      style={
                        styles.modalSectionTitle
                      }
                    >
                      Store Basic Details
                    </Text>

                    <Text
                      style={
                        styles.modalSectionSubtitle
                      }
                    >
                      Information customers will see
                    </Text>
                  </View>
                </View>

                <FormInput
                  label="Store Display Name"
                  icon="storefront-outline"
                  value={
                    tempStoreName
                  }
                  onChangeText={
                    setTempStoreName
                  }
                  placeholder="e.g. Aling Nena's Sari-Sari"
                  required
                />

                <FormInput
                  label="Contact Number"
                  icon="call-outline"
                  value={tempPhone}
                  onChangeText={
                    setTempPhone
                  }
                  keyboardType="phone-pad"
                  placeholder="e.g. 09123456789"
                  maxLength={11}
                />

                <FormInput
                  label="Street Name, House No., Building"
                  icon="home-outline"
                  value={
                    tempStreetDetails
                  }
                  onChangeText={
                    setTempStreetDetails
                  }
                  placeholder="e.g. Blk 3 Lot 4, Main Street"
                  required
                  multiline
                  numberOfLines={2}
                  maxLength={180}
                />

                <FormInput
                  label="Landmarks / Directions"
                  icon="map-outline"
                  value={
                    tempLandmark
                  }
                  onChangeText={
                    setTempLandmark
                  }
                  placeholder="e.g. Beside the blue gate"
                  multiline
                  numberOfLines={2}
                  maxLength={180}
                />
              </View>

              {/* =====================================
                  LOCATION CARD
              ===================================== */}

              <View
                style={
                  styles.modalSectionCard
                }
              >
                <View
                  style={
                    styles.locationSectionHeader
                  }
                >
                  <View
                    style={
                      styles.modalSectionHeaderLeft
                    }
                  >
                    <View
                      style={
                        styles.modalSectionHeaderIcon
                      }
                    >
                      <Ionicons
                        name="location-outline"
                        size={19}
                        color="#059669"
                      />
                    </View>

                    <View
                      style={
                        styles.modalSectionHeaderText
                      }
                    >
                      <Text
                        style={
                          styles.modalSectionTitle
                        }
                      >
                        Exact Store Location
                      </Text>

                      <Text
                        style={
                          styles.modalSectionSubtitle
                        }
                      >
                        Required for deliveries
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={
                      styles.gpsButton
                    }
                    onPress={
                      handleFetchLocationModal
                    }
                    disabled={
                      isLocatingModal
                    }
                    activeOpacity={
                      0.8
                    }
                  >
                    {isLocatingModal ? (
                      <ActivityIndicator
                        size="small"
                        color="#059669"
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="navigate-circle-outline"
                          size={17}
                          color="#059669"
                        />

                        <Text
                          style={
                            styles.gpsButtonText
                          }
                        >
                          Get GPS
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <View
                  style={
                    styles.largeMapWrapper
                  }
                >
                  <OsmMap
                    center={
                      tempStoreLoc ||
                      adminCenter
                    }
                    zoom={16}
                    markers={
                      tempStoreLoc
                        ? [
                            {
                              lat:
                                tempStoreLoc.lat,
                              lng:
                                tempStoreLoc.lng,
                              label:
                                'Store Pickup Point',
                            },
                          ]
                        : []
                    }
                  />

                  {!tempStoreLoc && (
                    <View
                      style={
                        styles.mapOverlayMsg
                      }
                    >
                      <View
                        style={
                          styles.mapOverlayIcon
                        }
                      >
                        <Ionicons
                          name="location-outline"
                          size={25}
                          color="#9CA3AF"
                        />
                      </View>

                      <Text
                        style={
                          styles.mapOverlayTitle
                        }
                      >
                        Location not selected
                      </Text>

                      <Text
                        style={
                          styles.mapOverlayText
                        }
                      >
                        Use GPS or place your store pin manually.
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={
                      styles.mapPinButton
                    }
                    activeOpacity={0.88}
                    onPress={
                      openPinPicker
                    }
                  >
                    <Ionicons
                      name="map-outline"
                      size={17}
                      color="#FFFFFF"
                    />

                    <Text
                      style={
                        styles.mapPinButtonText
                      }
                    >
                      Pin on Map
                    </Text>
                  </TouchableOpacity>
                </View>

                {tempAutoArea ? (
                  <View
                    style={
                      styles.detectedAddressBox
                    }
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={17}
                      color="#059669"
                    />

                    <View
                      style={
                        styles.detectedAddressTextArea
                      }
                    >
                      <Text
                        style={
                          styles.detectedAddressLabel
                        }
                      >
                        DETECTED LOCATION
                      </Text>

                      <Text
                        style={
                          styles.detectedAreaText
                        }
                      >
                        {tempAutoArea}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>

              {/* =====================================
                  DOCUMENTS
              ===================================== */}

              {verificationStatus ===
                'unverified' && (
                <View
                  style={
                    styles.modalSectionCard
                  }
                >
                  <View
                    style={
                      styles.modalSectionHeader
                    }
                  >
                    <View
                      style={
                        styles.modalSectionHeaderIcon
                      }
                    >
                      <Ionicons
                        name="document-attach-outline"
                        size={19}
                        color="#059669"
                      />
                    </View>

                    <View
                      style={
                        styles.modalSectionHeaderText
                      }
                    >
                      <Text
                        style={
                          styles.modalSectionTitle
                        }
                      >
                        Official Documents
                      </Text>

                      <Text
                        style={
                          styles.modalSectionSubtitle
                        }
                      >
                        Required for verification
                      </Text>
                    </View>
                  </View>

                  {/* REGISTRATION */}
                  <View
                    style={
                      styles.registrationBlock
                    }
                  >
                    <Text
                      style={
                        styles.documentLabel
                      }
                    >
                      Business Registration
                    </Text>

                    <View
                      style={
                        styles.regTypeRow
                      }
                    >
                      <TouchableOpacity
                        style={[
                          styles.regTypeButton,
                          regType ===
                            'DTI' &&
                            styles.regTypeButtonActive,
                        ]}
                        onPress={() =>
                          setRegType(
                            'DTI'
                          )
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={
                            regType ===
                            'DTI'
                              ? 'checkmark-circle'
                              : 'ellipse-outline'
                          }
                          size={16}
                          color={
                            regType ===
                            'DTI'
                              ? '#059669'
                              : '#9CA3AF'
                          }
                        />

                        <Text
                          style={[
                            styles.regTypeText,
                            regType ===
                              'DTI' &&
                              styles.regTypeTextActive,
                          ]}
                        >
                          DTI Registration
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.regTypeButton,
                          regType ===
                            'SEC' &&
                            styles.regTypeButtonActive,
                        ]}
                        onPress={() =>
                          setRegType(
                            'SEC'
                          )
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={
                            regType ===
                            'SEC'
                              ? 'checkmark-circle'
                              : 'ellipse-outline'
                          }
                          size={16}
                          color={
                            regType ===
                            'SEC'
                              ? '#059669'
                              : '#9CA3AF'
                          }
                        />

                        <Text
                          style={[
                            styles.regTypeText,
                            regType ===
                              'SEC' &&
                              styles.regTypeTextActive,
                          ]}
                        >
                          SEC Registration
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <DocumentUpload
                    title={`Attach ${regType} Certificate *`}
                    attached={
                      !!docs.dtiSec
                    }
                    onPress={() =>
                      pickDocumentImage(
                        'dtiSec'
                      )
                    }
                  />

                  <DocumentUpload
                    title="Mayor's / Business Permit *"
                    attached={
                      !!docs.mayorsPermit
                    }
                    onPress={() =>
                      pickDocumentImage(
                        'mayorsPermit'
                      )
                    }
                  />

                  <DocumentUpload
                    title="BIR Certificate of Registration (2303) *"
                    attached={
                      !!docs.bir2303
                    }
                    onPress={() =>
                      pickDocumentImage(
                        'bir2303'
                      )
                    }
                  />

                  <DocumentUpload
                    title="Government-Issued Owner ID *"
                    attached={
                      !!docs.validId
                    }
                    onPress={() =>
                      pickDocumentImage(
                        'validId'
                      )
                    }
                  />

                  <DocumentUpload
                    title="Barangay Business Clearance (Optional)"
                    attached={
                      !!docs.barangayClearance
                    }
                    onPress={() =>
                      pickDocumentImage(
                        'barangayClearance'
                      )
                    }
                  />

                  <DocumentUpload
                    title="FDA LTO / Food Safety License (For Food)"
                    attached={
                      !!docs.fdaLto
                    }
                    onPress={() =>
                      pickDocumentImage(
                        'fdaLto'
                      )
                    }
                  />
                </View>
              )}

              {/* =====================================
                  TERMS
              ===================================== */}

              {verificationStatus ===
                'unverified' && (
                <View
                  style={
                    styles.termsCard
                  }
                >
                  <TouchableOpacity
                    style={
                      styles.checkboxButton
                    }
                    onPress={() =>
                      setAgreedToTerms(
                        !agreedToTerms
                      )
                    }
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={
                        agreedToTerms
                          ? 'checkbox'
                          : 'square-outline'
                      }
                      size={25}
                      color={
                        agreedToTerms
                          ? '#059669'
                          : '#9CA3AF'
                      }
                    />
                  </TouchableOpacity>

                  <Text
                    style={
                      styles.termsText
                    }
                  >
                    I agree to the{' '}
                    <Text
                      style={
                        styles.termsLink
                      }
                      onPress={() =>
                        setTermsModalVisible(
                          true
                        )
                      }
                    >
                      Terms and Conditions
                    </Text>{' '}
                    and{' '}
                    <Text
                      style={
                        styles.termsLink
                      }
                      onPress={() =>
                        setTermsModalVisible(
                          true
                        )
                      }
                    >
                      Platform Policies
                    </Text>
                    .
                  </Text>
                </View>
              )}

              {/* =====================================
                  SAVE BUTTON
              ===================================== */}

              <TouchableOpacity
                style={[
                  styles.saveProfileButton,
                  savingProfile &&
                    styles.saveProfileButtonDisabled,
                  verificationStatus ===
                    'unverified' &&
                    !agreedToTerms &&
                    styles.saveProfileButtonDisabled,
                ]}
                onPress={
                  handleSaveProfileAndVerify
                }
                disabled={
                  savingProfile ||
                  (verificationStatus ===
                    'unverified' &&
                    !agreedToTerms)
                }
                activeOpacity={0.86}
              >
                {savingProfile ? (
                  <>
                    <ActivityIndicator
                      color="#FFFFFF"
                      size="small"
                    />

                    <Text
                      style={
                        styles.saveProfileButtonText
                      }
                    >
                      Saving...
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons
                      name={
                        verificationStatus ===
                        'unverified'
                          ? 'shield-checkmark-outline'
                          : 'checkmark-circle-outline'
                      }
                      size={20}
                      color="#FFFFFF"
                    />

                    <Text
                      style={
                        styles.saveProfileButtonText
                      }
                    >
                      {verificationStatus ===
                      'unverified'
                        ? 'Save & Submit Verification'
                        : 'Save Profile Changes'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {verificationStatus ===
                'unverified' &&
                !agreedToTerms && (
                  <Text
                    style={
                      styles.saveRequirementText
                    }
                  >
                    Agree to the Terms and Conditions above to continue.
                  </Text>
                )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ==========================================
          FULL SCREEN MAP PICKER
      ========================================== */}

      <Modal
        visible={
          isMapModalVisible
        }
        animationType="slide"
        statusBarTranslucent
        hardwareAccelerated
        onRequestClose={() =>
          setIsMapModalVisible(
            false
          )
        }
      >
        <View
          style={
            styles.mapModalContainer
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
              setTempPinCoords
            }
          />

          <View
            style={
              styles.centerPinWrap
            }
            pointerEvents="none"
          >
            <Ionicons
              name="location"
              size={46}
              color="#059669"
            />

            <View
              style={
                styles.centerPinShadow
              }
            />
          </View>

          <View
            style={
              styles.mapTopControls
            }
          >
            <TouchableOpacity
              style={
                styles.mapCloseButton
              }
              onPress={() =>
                setIsMapModalVisible(
                  false
                )
              }
              activeOpacity={0.82}
            >
              <Ionicons
                name="close"
                size={22}
                color="#111827"
              />
            </TouchableOpacity>

            <View
              style={
                styles.mapInstructionCard
              }
            >
              <View
                style={
                  styles.mapInstructionIcon
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
                  styles.mapInstructionText
                }
              >
                Move the map until the pin is exactly on your store.
              </Text>
            </View>
          </View>

          <View
            style={
              styles.mapBottomPanel
            }
          >
            <View
              style={
                styles.mapCoordinatesCard
              }
            >
              <View
                style={
                  styles.mapCoordinatesIcon
                }
              >
                <Ionicons
                  name="pin-outline"
                  size={18}
                  color="#059669"
                />
              </View>

              <View
                style={
                  styles.mapCoordinatesText
                }
              >
                <Text
                  style={
                    styles.mapCoordinatesTitle
                  }
                >
                  Exact Store Location
                </Text>

                <Text
                  style={
                    styles.mapCoordinatesSub
                  }
                >
                  {tempPinCoords
                    ? `${Number(
                        tempPinCoords.lat
                      ).toFixed(
                        6
                      )}, ${Number(
                        tempPinCoords.lng
                      ).toFixed(
                        6
                      )}`
                    : 'Move the map to select a location'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.confirmPinButton,
                resolvingPinAddress &&
                  styles.disabledButton,
              ]}
              activeOpacity={0.88}
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
                    size={20}
                    color="#FFFFFF"
                  />

                  <Text
                    style={
                      styles.confirmPinButtonText
                    }
                  >
                    Confirm Store Location
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ==========================================
          TERMS MODAL
      ========================================== */}

      <Modal
        visible={
          termsModalVisible
        }
        animationType="slide"
        transparent={false}
        onRequestClose={() =>
          setTermsModalVisible(
            false
          )
        }
      >
        <SafeAreaView
          style={
            styles.termsModalContainer
          }
        >
          <View
            style={
              styles.termsModalHeader
            }
          >
            <View>
              <Text
                style={
                  styles.termsModalEyebrow
                }
              >
                PAABOT MERCHANT
              </Text>

              <Text
                style={
                  styles.termsModalTitle
                }
              >
                Terms & Policies
              </Text>
            </View>

            <TouchableOpacity
              onPress={() =>
                setTermsModalVisible(
                  false
                )
              }
              style={
                styles.termsCloseButton
              }
            >
              <Ionicons
                name="close"
                size={22}
                color="#111827"
              />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={
              styles.termsScrollContent
            }
            showsVerticalScrollIndicator={
              false
            }
          >
            <View
              style={
                styles.termsIntroCard
              }
            >
              <View
                style={
                  styles.termsIntroIcon
                }
              >
                <Ionicons
                  name="document-text-outline"
                  size={22}
                  color="#059669"
                />
              </View>

              <Text
                style={
                  styles.termsIntroText
                }
              >
                Please review the platform rules before submitting your store for verification.
              </Text>
            </View>

            <Text
              style={
                styles.termsH1
              }
            >
              PART I: TERMS AND CONDITIONS
            </Text>

            <Text
              style={
                styles.termsH2
              }
            >
              1. Acceptance of Terms
            </Text>

            <Text
              style={
                styles.termsP
              }
            >
              By downloading, accessing, or using Paabot (the "App"), you agree to be bound by these Terms and Conditions ("Terms"). If you do not agree, you must not use the App.
            </Text>

            <Text
              style={
                styles.termsH2
              }
            >
              2. About the Service
            </Text>

            <Text
              style={
                styles.termsP
              }
            >
              Paabot is a delivery platform operated by Titech that connects customers, merchants, and delivery riders to facilitate the ordering and delivery of products ("Services").
            </Text>

            <Text
              style={
                styles.termsH2
              }
            >
              3. Merchant Responsibilities
            </Text>

            <Text
              style={
                styles.termsP
              }
            >
              Merchants are responsible for providing accurate store information, valid business documents, correct product information, and safe products for customers.
            </Text>

            <Text
              style={
                styles.termsH2
              }
            >
              4. Verification
            </Text>

            <Text
              style={
                styles.termsP
              }
            >
              Store verification is subject to administrative review. Submission of documents does not guarantee approval.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ==========================================
          SUBSCRIPTION PAYMENT MODAL
      ========================================== */}

      <Modal
        visible={
          paymentModalVisible
        }
        transparent
        animationType="fade"
        onRequestClose={() =>
          setPaymentModalVisible(
            false
          )
        }
      >
        <View
          style={
            styles.dialogOverlay
          }
        >
          <View
            style={
              styles.paymentDialog
            }
          >
            <View
              style={
                styles.paymentIconBox
              }
            >
              <Ionicons
                name="star"
                size={30}
                color="#D97706"
              />
            </View>

            <Text
              style={
                styles.paymentDialogEyebrow
              }
            >
              PREMIUM SUBSCRIPTION
            </Text>

            <Text
              style={
                styles.paymentDialogTitle
              }
            >
              Upgrade your store
            </Text>

            <Text
              style={
                styles.paymentDialogText
              }
            >
              Upgrade to the Premium Plan for
              {' '}
              <Text
                style={
                  styles.paymentPrice
                }
              >
                ₱
                {subscriptionPrice.toFixed(
                  2
                )}
                /month
              </Text>
              . You can then post unlimited items and receive customer orders.
            </Text>

            <View
              style={
                styles.paymentFeatureRow
              }
            >
              <Ionicons
                name="checkmark-circle"
                size={18}
                color="#059669"
              />

              <Text
                style={
                  styles.paymentFeatureText
                }
              >
                Unlimited item posting
              </Text>
            </View>

            <View
              style={
                styles.paymentFeatureRow
              }
            >
              <Ionicons
                name="checkmark-circle"
                size={18}
                color="#059669"
              />

              <Text
                style={
                  styles.paymentFeatureText
                }
              >
                Accept customer orders
              </Text>
            </View>

            <View
              style={
                styles.paymentFeatureRow
              }
            >
              <Ionicons
                name="checkmark-circle"
                size={18}
                color="#059669"
              />

              <Text
                style={
                  styles.paymentFeatureText
                }
              >
                Priority support
              </Text>
            </View>

            <TouchableOpacity
              style={
                styles.paymentPrimaryButton
              }
              onPress={
                processSubscriptionPayment
              }
              activeOpacity={0.85}
            >
              <Ionicons
                name="card-outline"
                size={19}
                color="#FFFFFF"
              />

              <Text
                style={
                  styles.paymentPrimaryText
                }
              >
                Continue to PayMongo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={
                styles.paymentCancelButton
              }
              onPress={() =>
                setPaymentModalVisible(
                  false
                )
              }
              activeOpacity={0.8}
            >
              <Text
                style={
                  styles.paymentCancelText
                }
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ==========================================
          LOGOUT MODAL
      ========================================== */}

      <Modal
        visible={
          logoutModalVisible
        }
        transparent
        animationType="fade"
        onRequestClose={() =>
          setLogoutModalVisible(
            false
          )
        }
      >
        <View
          style={
            styles.dialogOverlay
          }
        >
          <View
            style={
              styles.logoutDialog
            }
          >
            <View
              style={
                styles.logoutIconCircle
              }
            >
              <Ionicons
                name="log-out-outline"
                size={30}
                color="#DC2626"
              />
            </View>

            <Text
              style={
                styles.logoutDialogTitle
              }
            >
              Log Out?
            </Text>

            <Text
              style={
                styles.logoutDialogText
              }
            >
              Are you sure you want to log out of your store account?
            </Text>

            <View
              style={
                styles.dialogButtonRow
              }
            >
              <TouchableOpacity
                style={
                  styles.dialogCancelButton
                }
                activeOpacity={0.82}
                onPress={() =>
                  setLogoutModalVisible(
                    false
                  )
                }
              >
                <Text
                  style={
                    styles.dialogCancelText
                  }
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={
                  styles.dialogDangerButton
                }
                activeOpacity={0.82}
                onPress={
                  confirmLogout
                }
              >
                <Text
                  style={
                    styles.dialogDangerText
                  }
                >
                  Log Out
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ==========================================
          GLOBAL APP DIALOG
      ========================================== */}

      <AppDialog
        visible={
          appDialog.visible
        }
        type={
          appDialog.type
        }
        title={
          appDialog.title
        }
        message={
          appDialog.message
        }
        buttonText={
          appDialog.buttonText
        }
        onClose={
          closeDialog
        }
      />
    </SafeAreaView>
  );
}

// ======================================================
// APP DIALOG COMPONENT
// ======================================================

const AppDialog = ({
  visible,
  type,
  title,
  message,
  buttonText,
  onClose,
}) => {
  const config = {
    success: {
      icon: 'checkmark-circle',
      color: '#059669',
      bg: '#ECFDF5',
      label: 'SUCCESS',
    },

    error: {
      icon: 'close-circle',
      color: '#DC2626',
      bg: '#FEF2F2',
      label: 'ERROR',
    },

    warning: {
      icon: 'warning',
      color: '#D97706',
      bg: '#FFFBEB',
      label: 'ATTENTION',
    },

    info: {
      icon: 'information-circle',
      color: '#2563EB',
      bg: '#EFF6FF',
      label: 'INFORMATION',
    },
  };

  const current =
    config[type] ||
    config.info;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={
        onClose
      }
    >
      <View
        style={
          styles.dialogOverlay
        }
      >
        <View
          style={
            styles.appDialog
          }
        >
          <View
            style={[
              styles.appDialogIcon,
              {
                backgroundColor:
                  current.bg,
              },
            ]}
          >
            <Ionicons
              name={
                current.icon
              }
              size={31}
              color={
                current.color
              }
            />
          </View>

          <Text
            style={
              styles.appDialogLabel
            }
          >
            {current.label}
          </Text>

          <Text
            style={
              styles.appDialogTitle
            }
          >
            {title}
          </Text>

          <Text
            style={
              styles.appDialogMessage
            }
          >
            {message}
          </Text>

          <TouchableOpacity
            style={[
              styles.appDialogButton,
              {
                backgroundColor:
                  current.color,
              },
            ]}
            onPress={
              onClose
            }
            activeOpacity={0.85}
          >
            <Text
              style={
                styles.appDialogButtonText
              }
            >
              {buttonText}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ======================================================
// STYLES
// ======================================================

const styles = StyleSheet.create({
  // ====================================================
  // GLOBAL
  // ====================================================

  container: {
    flex: 1,
    backgroundColor: '#F3F6F4',
  },

  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F6F4',
    paddingHorizontal: 30,
  },

  loadingIconBox: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: '#E7F3EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },

  loadingTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
    marginTop: 14,
  },

  loadingSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 5,
    textAlign: 'center',
  },

  // ====================================================
  // HEADER
  // ====================================================

  header: {
    backgroundColor: '#FFFFFF',
    minHeight: 88,
    paddingHorizontal: 19,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE6E0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerTextGroup: {
    flex: 1,
    marginRight: 10,
  },

  headerEyebrow: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#059669',
    marginBottom: 2,
  },

  headerTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#15251E',
  },

  headerSub: {
    fontSize: 11,
    color: '#63736A',
    lineHeight: 15,
    marginTop: 2,
    maxWidth: 245,
  },

  logoutHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  logoutHeaderText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#DC2626',
    marginLeft: 4,
  },

  // ====================================================
  // CONTENT
  // ====================================================

  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 36,
  },

  // ====================================================
  // BANNERS
  // ====================================================

  statusBannerDanger: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#F3C9C7',
    borderRadius: 12,
    padding: 13,
    marginBottom: 12,
  },

  statusBannerPending: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#F0DCA6',
    borderRadius: 12,
    padding: 13,
    marginBottom: 12,
  },

  statusBannerSuccess: {
    flexDirection: 'row',
    backgroundColor: '#EFF8F2',
    borderWidth: 1,
    borderColor: '#B9DDC8',
    borderRadius: 12,
    padding: 13,
    marginBottom: 12,
  },

  bannerIconDanger: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bannerIconPending: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bannerIconSuccess: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bannerTextArea: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },

  bannerTitleDanger: {
    fontSize: 13,
    fontWeight: '900',
    color: '#991B1B',
    marginBottom: 3,
  },

  bannerSubDanger: {
    fontSize: 11,
    lineHeight: 17,
    color: '#B91C1C',
    fontWeight: '600',
  },

  bannerTitlePending: {
    fontSize: 13,
    fontWeight: '900',
    color: '#92400E',
    marginBottom: 3,
  },

  bannerSubPending: {
    fontSize: 11,
    lineHeight: 17,
    color: '#B45309',
    fontWeight: '600',
  },

  bannerTitleSuccess: {
    fontSize: 13,
    fontWeight: '900',
    color: '#065F46',
    marginBottom: 3,
  },

  bannerSubSuccess: {
    fontSize: 11,
    lineHeight: 17,
    color: '#047857',
    fontWeight: '600',
  },

  // ====================================================
  // IDENTITY
  // ====================================================

  identityCard: {
    alignItems: 'center',
    backgroundColor: '#123B32',
    borderWidth: 1,
    borderColor: '#123B32',
    borderRadius: 14,
    padding: 24,
    marginBottom: 12,
    shadowColor: '#0B2D25',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },

  avatarWrapper: {
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 2,
    borderColor: '#D6EADF',
    backgroundColor: '#EAF4EE',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 11,
  },

  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },

  cameraBadge: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: '#059669',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  identityName: {
    maxWidth: '92%',
    textAlign: 'center',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  identityStatusRow: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  identityCheck: {
    position: 'absolute',
    right: -23,
    top: 5,
  },

  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },

  verifiedBadgeText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#047857',
    marginLeft: 5,
  },

  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },

  pendingBadgeText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#B45309',
    marginLeft: 5,
  },

  unverifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },

  unverifiedBadgeText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#B91C1C',
    marginLeft: 5,
  },

  changePhotoText: {
    fontSize: 10.5,
    color: '#C8DDD2',
    marginTop: 8,
    fontWeight: '600',
  },

  // ====================================================
  // SECTION CARD
  // ====================================================

  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE6E0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },

  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  sectionHeaderIcon: {
    width: 43,
    height: 43,
    borderRadius: 11,
    backgroundColor: '#EFF7F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },

  sectionHeaderText: {
    flex: 1,
  },

  sectionCardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#15251E',
  },

  sectionCardSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    color: '#63736A',
    marginTop: 2,
  },

  storeStatusDisplay: {
    marginTop: 13,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DCE6E0',
  },

  storeStatusOpen: {
    backgroundColor: '#EFF8F2',
  },

  storeStatusClosed: {
    backgroundColor: '#F4F6F5',
  },

  statusIndicator: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 9,
  },

  storeStatusDisplayText: {
    flex: 1,
  },

  storeStatusTitle: {
    fontSize: 13,
    fontWeight: '900',
  },

  storeStatusDescription: {
    fontSize: 10.5,
    color: '#63736A',
    marginTop: 2,
  },

  // ====================================================
  // SUBSCRIPTION
  // ====================================================

  subscriptionCard: {
    backgroundColor: '#FFF9E9',
    borderWidth: 1,
    borderColor: '#F0DCA6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },

  subscriptionTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  subscriptionIconBox: {
    width: 45,
    height: 45,
    borderRadius: 11,
    backgroundColor: '#FBECC4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },

  subscriptionTextArea: {
    flex: 1,
  },

  subscriptionEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: '#B45309',
    marginBottom: 2,
  },

  subscriptionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#92400E',
  },

  subscriptionSub: {
    fontSize: 10.5,
    color: '#B45309',
    fontWeight: '700',
    marginTop: 1,
  },

  subscriptionDivider: {
    height: 1,
    backgroundColor: '#FDE68A',
    marginVertical: 14,
  },

  subscriptionBottom: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  subscriptionBenefits: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
  },

  subscriptionBenefitText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#92400E',
    marginLeft: 6,
    fontWeight: '600',
  },

  subscriptionButton: {
    backgroundColor: '#D88A12',
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },

  subscriptionButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    marginRight: 3,
  },

  // ====================================================
  // PROFILE CARD
  // ====================================================

  profileCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE6E0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },

  profileCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },

  profileEyebrow: {
    fontSize: 9.5,
    letterSpacing: 0.9,
    fontWeight: '900',
    color: '#059669',
    marginBottom: 2,
  },

  profileTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#15251E',
  },

  profileHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EFF7F1',
    justifyContent: 'center',
    alignItems: 'center',
  },

  profileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 11,
    paddingBottom: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2EF',
  },

  profileInfoRowTop: {
    alignItems: 'flex-start',
  },

  profileInfoIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F1F6F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },

  profileInfoTextArea: {
    flex: 1,
    minWidth: 0,
  },

  profileInfoLabel: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.6,
    color: '#718078',
    marginBottom: 2,
    textTransform: 'uppercase',
  },

  profileInfoValue: {
    fontSize: 13,
    lineHeight: 18,
    color: '#33443A',
    fontWeight: '700',
  },

  landmarkDisplay: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 5,
  },

  landmarkText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#63736A',
    marginLeft: 5,
  },

  profileMapWrapper: {
    height: 145,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DCE6E0',
    marginTop: 3,
    position: 'relative',
  },

  mapLocationBadge: {
    position: 'absolute',
    top: 9,
    left: 9,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18,59,50,0.94)',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  mapLocationBadgeText: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: '800',
    marginLeft: 4,
  },

  noMapBox: {
    minHeight: 110,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE6E0',
    backgroundColor: '#F6F8F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },

  noMapText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
    marginTop: 6,
  },

  editProfileButton: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#9CD5B4',
    backgroundColor: '#EFF8F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 14,
  },

  verifyProfileButton: {
    borderColor: '#087A55',
    backgroundColor: '#087A55',
  },

  editProfileButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    marginHorizontal: 8,
  },

  editProfileButtonTextGreen: {
    color: '#087A55',
  },

  bottomLogoutButton: {
    minHeight: 49,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },

  bottomLogoutText: {
    fontSize: 12.5,
    color: '#DC2626',
    fontWeight: '900',
    marginLeft: 7,
  },

  bottomSpace: {
    height: 8,
  },

  // ====================================================
  // PROFILE MODAL
  // ====================================================

  fullModalContainer: {
    flex: 1,
    backgroundColor: '#F3F6F4',
  },

  profileModalHeader: {
    minHeight: 76,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#DCE6E0',
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  modalIconButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#F1F5F2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileModalTitleArea: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },

  profileModalEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
    color: '#059669',
    marginBottom: 2,
  },

  profileModalTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#15251E',
    textAlign: 'center',
  },

  profileModalContent: {
    padding: 18,
    paddingBottom: 36,
  },

  // ====================================================
  // MODAL LEAD
  // ====================================================

  modalLeadBox: {
    backgroundColor: '#EFF8F2',
    borderWidth: 1,
    borderColor: '#B9DDC8',
    borderRadius: 12,
    padding: 13,
    flexDirection: 'row',
    marginBottom: 14,
  },

  modalLeadIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#DDEFE3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  modalLeadTextArea: {
    flex: 1,
  },

  modalLeadTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#155C3F',
    marginBottom: 3,
  },

  modalLeadText: {
    fontSize: 11,
    lineHeight: 17,
    color: '#356A50',
    fontWeight: '600',
  },

  // ====================================================
  // MODAL SECTIONS
  // ====================================================

  modalSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE6E0',
    padding: 15,
    marginBottom: 14,
  },

  modalSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 17,
  },

  modalSectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  modalSectionHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: '#EFF7F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  modalSectionHeaderText: {
    flex: 1,
    minWidth: 0,
  },

  modalSectionTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#15251E',
  },

  modalSectionSubtitle: {
    fontSize: 10.5,
    lineHeight: 16,
    color: '#63736A',
    marginTop: 2,
  },

  // ====================================================
  // INPUTS
  // ====================================================

  inputGroup: {
    marginBottom: 15,
  },

  inputLabelRow: {
    marginBottom: 7,
  },

  inputLabel: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#33443A',
    letterSpacing: 0.1,
  },

  inputBox: {
    width: '100%',
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#CAD8D0',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
  },

  inputBoxMultiline: {
    alignItems: 'flex-start',
    minHeight: 85,
    paddingTop: 12,
    paddingBottom: 10,
  },

  inputBoxDisabled: {
    backgroundColor: '#F0F3F1',
    borderColor: '#DCE6E0',
  },

  inputIconArea: {
    width: 31,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: 5,
  },

  formTextInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 0,
    paddingVertical: 0,
    includeFontPadding: false,
  },

  formTextInputMultiline: {
    minHeight: 60,
    paddingTop: 0,
    paddingBottom: 0,
    lineHeight: 20,
  },

  // ====================================================
  // LOCATION
  // ====================================================

  locationSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 13,
  },

  gpsButton: {
    minHeight: 36,
    borderRadius: 9,
    backgroundColor: '#EFF8F2',
    borderWidth: 1,
    borderColor: '#B9DDC8',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  gpsButtonText: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '900',
    marginLeft: 4,
  },

  largeMapWrapper: {
    height: 205,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DCE6E0',
    backgroundColor: '#E5E7EB',
    position: 'relative',
  },

  mapOverlayMsg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor:
      'rgba(255,255,255,0.84)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },

  mapOverlayIcon: {
    width: 49,
    height: 49,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },

  mapOverlayTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#374151',
    textAlign: 'center',
  },

  mapOverlayText: {
    fontSize: 10,
    color: '#6B7280',
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 3,
  },

  mapPinButton: {
    position: 'absolute',
    bottom: 11,
    alignSelf: 'center',
    minHeight: 40,
    paddingHorizontal: 15,
    borderRadius: 10,
    backgroundColor: '#087A55',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },

  mapPinButtonText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '900',
    marginLeft: 5,
  },

  detectedAddressBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF8F2',
    borderWidth: 1,
    borderColor: '#B9DDC8',
    borderRadius: 10,
    padding: 10,
    marginTop: 9,
  },

  detectedAddressTextArea: {
    flex: 1,
    marginLeft: 7,
  },

  detectedAddressLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: '#059669',
    marginBottom: 2,
  },

  detectedAreaText: {
    fontSize: 10.5,
    lineHeight: 16,
    color: '#047857',
    fontWeight: '700',
  },

  // ====================================================
  // DOCUMENTS
  // ====================================================

  registrationBlock: {
    marginBottom: 4,
  },

  documentLabel: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#374151',
    marginBottom: 7,
  },

  regTypeRow: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 14,
  },

  regTypeButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CAD8D0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  regTypeButtonActive: {
    borderColor: '#86EFAC',
    backgroundColor: '#ECFDF5',
  },

  regTypeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#6B7280',
    marginLeft: 5,
    textAlign: 'center',
  },

  regTypeTextActive: {
    color: '#059669',
  },

  documentGroup: {
    marginBottom: 13,
  },

  documentUploadBox: {
    minHeight: 66,
    borderWidth: 1,
    borderColor: '#CAD8D0',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
  },

  documentUploadBoxAttached: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },

  documentIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  documentIconBoxAttached: {
    backgroundColor: '#059669',
  },

  documentTextArea: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 10,
  },

  documentUploadTitle: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '800',
    color: '#374151',
  },

  documentUploadTitleAttached: {
    color: '#047857',
  },

  documentUploadSub: {
    fontSize: 9.5,
    color: '#9CA3AF',
    marginTop: 2,
  },

  // ====================================================
  // TERMS
  // ====================================================

  termsCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE6E0',
    borderRadius: 11,
    padding: 12,
    marginBottom: 13,
  },

  checkboxButton: {
    marginRight: 9,
    marginTop: 1,
  },

  termsText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 18,
    color: '#4B5563',
  },

  termsLink: {
    color: '#059669',
    fontWeight: '900',
    textDecorationLine: 'underline',
  },

  // ====================================================
  // SAVE
  // ====================================================

  saveProfileButton: {
    minHeight: 53,
    borderRadius: 11,
    backgroundColor: '#087A55',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 3,
  },

  saveProfileButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },

  saveProfileButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '900',
    marginLeft: 7,
    textAlign: 'center',
  },

  saveRequirementText: {
    fontSize: 9.5,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 7,
    lineHeight: 14,
  },

  // ====================================================
  // MAP MODAL
  // ====================================================

  mapModalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  centerPinWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -23,
    marginTop: -44,
    alignItems: 'center',
    zIndex: 50,
  },

  centerPinShadow: {
    width: 13,
    height: 5,
    borderRadius: 5,
    backgroundColor:
      'rgba(0,0,0,0.28)',
    marginTop: -1,
  },

  mapTopControls: {
    position: 'absolute',
    top:
      Platform.OS === 'ios'
        ? 53
        : 40,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    zIndex: 100,
  },

  mapCloseButton: {
    width: 45,
    height: 45,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE6E0',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },

  mapInstructionCard: {
    maxWidth:
      SCREEN_WIDTH - 80,
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    padding: 9,
    paddingRight: 11,
    borderWidth: 1,
    borderColor: '#DCE6E0',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.16,
    shadowRadius: 7,
    elevation: 5,
  },

  mapInstructionIcon: {
    width: 31,
    height: 31,
    borderRadius: 9,
    backgroundColor: '#EFF7F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },

  mapInstructionText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#33443A',
    fontWeight: '800',
  },

  mapBottomPanel: {
    position: 'absolute',
    left: 15,
    right: 15,
    bottom:
      Platform.OS === 'ios'
        ? 35
        : 20,
    zIndex: 100,
  },

  mapCoordinatesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    padding: 11,
    borderWidth: 1,
    borderColor: '#DCE6E0',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 7,
    elevation: 5,
  },

  mapCoordinatesIcon: {
    width: 39,
    height: 39,
    borderRadius: 10,
    backgroundColor: '#EFF7F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  mapCoordinatesText: {
    flex: 1,
  },

  mapCoordinatesTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#15251E',
  },

  mapCoordinatesSub: {
    fontSize: 10,
    color: '#63736A',
    marginTop: 2,
  },

  confirmPinButton: {
    minHeight: 53,
    borderRadius: 11,
    backgroundColor: '#087A55',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.23,
    shadowRadius: 7,
    elevation: 6,
  },

  confirmPinButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '900',
    marginLeft: 7,
  },

  disabledButton: {
    opacity: 0.6,
  },

  // ====================================================
  // TERMS MODAL
  // ====================================================

  termsModalContainer: {
    flex: 1,
    backgroundColor: '#F3F6F4',
  },

  termsModalHeader: {
    backgroundColor: '#FFFFFF',
    minHeight: 76,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE6E0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  termsModalEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
    color: '#059669',
    marginBottom: 2,
  },

  termsModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#15251E',
  },

  termsCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#F1F5F2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  termsScrollContent: {
    padding: 19,
    paddingBottom: 50,
  },

  termsIntroCard: {
    flexDirection: 'row',
    backgroundColor: '#EFF8F2',
    borderWidth: 1,
    borderColor: '#B9DDC8',
    borderRadius: 11,
    padding: 13,
    marginBottom: 20,
  },

  termsIntroIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#DDEFE3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 9,
  },

  termsIntroText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: '#356A50',
    fontWeight: '700',
  },

  termsH1: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '900',
    color: '#15251E',
    marginBottom: 18,
  },

  termsH2: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '900',
    color: '#20382D',
    marginTop: 19,
    marginBottom: 7,
  },

  termsP: {
    fontSize: 12.5,
    lineHeight: 21,
    color: '#46564D',
  },

  // ====================================================
  // DIALOGS
  // ====================================================

  dialogOverlay: {
    flex: 1,
    backgroundColor:
      'rgba(17,24,39,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },

  appDialog: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },

  appDialogIcon: {
    width: 62,
    height: 62,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
  },

  appDialogLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#9CA3AF',
    letterSpacing: 1,
    marginBottom: 3,
  },

  appDialogTitle: {
    fontSize: 22,
    lineHeight: 29,
    fontWeight: '900',
    color: '#15251E',
    textAlign: 'center',
  },

  appDialogMessage: {
    fontSize: 13,
    lineHeight: 20,
    color: '#63736A',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },

  appDialogButton: {
    width: '100%',
    minHeight: 49,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },

  appDialogButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '900',
  },

  // ====================================================
  // PAYMENT DIALOG
  // ====================================================

  paymentDialog: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 23,
  },

  paymentIconBox: {
    alignSelf: 'center',
    width: 62,
    height: 62,
    borderRadius: 16,
    backgroundColor: '#FBECC4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 11,
  },

  paymentDialogEyebrow: {
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '900',
    color: '#B45309',
    marginBottom: 3,
  },

  paymentDialogTitle: {
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '900',
    color: '#15251E',
  },

  paymentDialogText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#63736A',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 17,
  },

  paymentPrice: {
    color: '#B45309',
    fontWeight: '900',
  },

  paymentFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },

  paymentFeatureText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#33443A',
    marginLeft: 7,
  },

  paymentPrimaryButton: {
    minHeight: 51,
    borderRadius: 10,
    backgroundColor: '#D88A12',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  paymentPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 7,
  },

  paymentCancelButton: {
    minHeight: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },

  paymentCancelText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#6B7280',
  },

  // ====================================================
  // LOGOUT DIALOG
  // ====================================================

  logoutDialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },

  logoutIconCircle: {
    width: 62,
    height: 62,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 13,
  },

  logoutDialogTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#15251E',
  },

  logoutDialogText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#63736A',
    textAlign: 'center',
    marginTop: 7,
    marginBottom: 21,
  },

  dialogButtonRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },

  dialogCancelButton: {
    flex: 1,
    minHeight: 49,
    borderRadius: 10,
    backgroundColor: '#F1F5F2',
    justifyContent: 'center',
    alignItems: 'center',
  },

  dialogCancelText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#4B5563',
  },

  dialogDangerButton: {
    flex: 1,
    minHeight: 49,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },

  dialogDangerText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});