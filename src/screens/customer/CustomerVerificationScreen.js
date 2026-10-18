import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
  Modal,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';

// Same reverse-geocoding format used in SavedAddressesScreen
const fetchReadableAddress = async (lat, lng) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&countrycodes=ph`,
      { headers: { 'User-Agent': 'DeliveryApp/1.0' } }
    );
    const data = await response.json();
    if (data && data.address) {
      const addr = data.address;
      const buildingOrShop =
        addr.amenity || addr.shop || addr.building || addr.tourism || addr.commercial || addr.office || '';
      const road = addr.road || addr.suburb || addr.neighbourhood || '';
      const barangay = addr.quarter || addr.neighbourhood || addr.village || addr.suburb || '';
      const town = addr.city || addr.town || addr.municipality || '';

      const parts = [];
      if (buildingOrShop) parts.push(buildingOrShop);
      if (road) parts.push(road);
      if (barangay && barangay !== road) parts.push(barangay);
      if (town) parts.push(town);

      if (parts.length > 0) return parts.join(', ').trim();
    }
    if (data && data.display_name) {
      return data.display_name.split(',').slice(0, 4).join(',').trim();
    }
  } catch (error) {
    // fallback below
  }
  return `Pin (${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)})`;
};

export default function CustomerVerificationScreen({ navigation }) {
  const { user, profile } = useAuth();

  // =========================================================
  // STATE
  // =========================================================

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [verificationId, setVerificationId] = useState(null);
  const [isVerified, setIsVerified] = useState(false);
  const [verificationStatus, setVerificationStatus] =
    useState('unverified'); // unverified | pending | rejected | verified

  const [idImage, setIdImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Address confirmation (source of truth = profiles table, edited in Saved Places)
  const [addressLoading, setAddressLoading] = useState(true);
  const [savedAddress, setSavedAddress] = useState(null); // { lat, lng, street, area, full }
  const [addressConfirmed, setAddressConfirmed] = useState(false);

  // =========================================================
  // APP ALERT (same pattern as ProfileScreen)
  // =========================================================

  const [appAlertVisible, setAppAlertVisible] = useState(false);
  const [appAlert, setAppAlert] = useState({
    type: 'info',
    title: '',
    message: '',
    confirmText: 'OK',
  });

  const showAppAlert = ({
    type = 'info',
    title = '',
    message = '',
    confirmText = 'OK',
  }) => {
    setAppAlert({ type, title, message, confirmText });
    setAppAlertVisible(true);
  };

  const closeAppAlert = () => setAppAlertVisible(false);

  const getAlertIcon = () => {
    switch (appAlert.type) {
      case 'success':
        return 'checkmark-circle';
      case 'error':
        return 'close-circle';
      case 'warning':
        return 'warning';
      default:
        return 'information-circle';
    }
  };

  const getAlertColors = () => {
    switch (appAlert.type) {
      case 'success':
        return { icon: '#059669', iconBackground: '#ECFDF5' };
      case 'error':
        return { icon: '#DC2626', iconBackground: '#FEF2F2' };
      case 'warning':
        return { icon: '#D97706', iconBackground: '#FFFBEB' };
      default:
        return { icon: '#059669', iconBackground: '#ECFDF5' };
    }
  };

  const alertColors = getAlertColors();

  // =========================================================
  // ANIMATIONS
  // =========================================================

  const headerAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(90, [
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const animatedStyle = (animation) => ({
    opacity: animation,
    transform: [
      {
        translateY: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0],
        }),
      },
    ],
  });

  // =========================================================
  // FETCH CURRENT VERIFICATION STATUS
  // =========================================================

  useEffect(() => {
    const fetchVerification = async () => {
      const currentUserId = user?.id || profile?.id;

      if (!currentUserId) {
        setLoadingInitial(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('customer_verifications')
          .select('*')
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (error) {
          console.log('Verification fetch error:', error.message);
          return;
        }

        if (data) {
          setVerificationId(data.id);
          setIsVerified(data.is_verified || false);
          setVerificationStatus(
            data.is_verified
              ? 'verified'
              : data.verification_status || 'pending'
          );
        }
      } catch (error) {
        console.log('Error fetching verification:', error);
      } finally {
        setLoadingInitial(false);
      }
    };

    fetchVerification();
  }, [user?.id, profile?.id]);

  // =========================================================
  // SAVED ADDRESS (loaded from profiles, refreshed when returning
  // from Saved Places so edits show up here)
  // =========================================================

  const loadSavedAddress = async () => {
    const currentUserId = user?.id || profile?.id;

    if (!currentUserId) {
      setAddressLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('current_lat, current_lng, address_details')
        .eq('id', currentUserId)
        .single();

      if (error) {
        console.log('Address fetch error:', error.message);
        return;
      }

      if (data?.current_lat && data?.current_lng && data?.address_details) {
        const area = await fetchReadableAddress(data.current_lat, data.current_lng);
        const next = {
          lat: data.current_lat,
          lng: data.current_lng,
          street: data.address_details,
          area,
          full: `${data.address_details}, ${area}`,
        };

        // If the address changed (edited in Saved Places), ask to confirm again
        setSavedAddress((prev) => {
          if (prev && prev.full !== next.full) setAddressConfirmed(false);
          return next;
        });
      } else {
        setSavedAddress(null);
        setAddressConfirmed(false);
      }
    } catch (error) {
      console.log('Error fetching address:', error);
    } finally {
      setAddressLoading(false);
    }
  };

  useEffect(() => {
    loadSavedAddress();

    const unsubscribe = navigation?.addListener?.('focus', loadSavedAddress);
    return unsubscribe;
  }, [user?.id, profile?.id]);

  const goToSavedPlaces = () => {
    navigation.navigate('SavedAddresses');
  };

  // =========================================================
  // ID PICKER
  // =========================================================

  const pickIdImage = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        showAppAlert({
          type: 'warning',
          title: 'Permission Needed',
          message:
            'Paabot needs access to your photos so you can attach your ID.',
          confirmText: 'OK',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const selectedUri = result.assets[0].uri;

        const base64String = await FileSystem.readAsStringAsync(
          selectedUri,
          { encoding: FileSystem.EncodingType.Base64 }
        );

        const fileExtension =
          selectedUri.split('.').pop()?.toLowerCase() || 'jpg';

        const dataUri = `data:image/${
          fileExtension === 'png' ? 'png' : 'jpeg'
        };base64,${base64String}`;

        setIdImage(dataUri);
      }
    } catch (error) {
      showAppAlert({
        type: 'error',
        title: 'Upload Failed',
        message: 'Failed to attach your ID. Please try again.',
        confirmText: 'OK',
      });
    }
  };

  // =========================================================
  // SUBMIT
  // =========================================================

  const submitVerification = async () => {
    const currentUserId = user?.id || profile?.id;

    if (!currentUserId) {
      showAppAlert({
        type: 'error',
        title: 'Session Error',
        message: 'Your user session could not be found. Please log in again.',
        confirmText: 'OK',
      });
      return;
    }

    if (!idImage) {
      showAppAlert({
        type: 'warning',
        title: 'ID Required',
        message: 'Please attach a valid ID before submitting.',
        confirmText: 'OK',
      });
      return;
    }

    if (!savedAddress) {
      showAppAlert({
        type: 'warning',
        title: 'Address Required',
        message: 'Please set your address in Saved Places before submitting.',
        confirmText: 'OK',
      });
      return;
    }

    if (!addressConfirmed) {
      showAppAlert({
        type: 'warning',
        title: 'Confirm Your Address',
        message: 'Please confirm that your address is correct before submitting.',
        confirmText: 'OK',
      });
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        user_id: currentUserId,
        verification_status: 'pending',
        is_verified: false,
        verification_documents: {
          valid_id_url: idImage,
          submitted_at: new Date().toISOString(),
          // Snapshot of the address the customer confirmed (admin reads this)
          address: {
            street_details: savedAddress.street,
            area: savedAddress.area,
            full_address: savedAddress.full,
            lat: savedAddress.lat,
            lng: savedAddress.lng,
            confirmed_at: new Date().toISOString(),
          },
        },
      };

      let error;

      if (verificationId) {
        const result = await supabase
          .from('customer_verifications')
          .update(payload)
          .eq('id', verificationId);

        error = result.error;
      } else {
        const result = await supabase
          .from('customer_verifications')
          .insert(payload)
          .select()
          .single();

        error = result.error;

        if (result.data) {
          setVerificationId(result.data.id);
        }
      }

      if (error) {
        throw error;
      }

      setVerificationStatus('pending');
      setIdImage(null);

      showAppAlert({
        type: 'success',
        title: 'Submitted for Review',
        message:
          'Your ID has been submitted. Our admin team will review it shortly and update your account status.',
        confirmText: 'Done',
      });
    } catch (error) {
      showAppAlert({
        type: 'error',
        title: 'Submission Failed',
        message:
          error?.message || 'Something went wrong. Please try again.',
        confirmText: 'OK',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // =========================================================
  // STATUS CONFIG (mirrors DriverProfileScreen pattern)
  // =========================================================

  const getStatusConfig = () => {
    if (verificationStatus === 'verified') {
      return {
        label: 'Verified',
        icon: 'shield-checkmark',
        color: '#047857',
        background: '#ECFDF5',
        border: '#A7F3D0',
      };
    }

    if (verificationStatus === 'pending') {
      return {
        label: 'Pending Review',
        icon: 'time',
        color: '#B45309',
        background: '#FFFBEB',
        border: '#FDE68A',
      };
    }

    if (verificationStatus === 'rejected') {
      return {
        label: 'Rejected',
        icon: 'close-circle',
        color: '#B91C1C',
        background: '#FEF2F2',
        border: '#FECACA',
      };
    }

    return {
      label: 'Not Verified',
      icon: 'shield-outline',
      color: '#B45309',
      background: '#FFFBEB',
      border: '#FDE68A',
    };
  };

  const status = getStatusConfig();

  // =========================================================
  // LOADING SCREEN
  // =========================================================

  if (loadingInitial) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingScreen}>
          <View style={styles.loadingLogo}>
            <Ionicons name="shield-outline" size={28} color="#059669" />
          </View>

          <ActivityIndicator size="small" color="#059669" />

          <Text style={styles.loadingTitle}>Loading verification status</Text>
        </View>
      </SafeAreaView>
    );
  }

  // =========================================================
  // MAIN
  // =========================================================

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}

        <Animated.View
          style={[styles.header, animatedStyle(headerAnim)]}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color="#0F172A" />
          </TouchableOpacity>

          <View style={styles.headerTextArea}>
            <Text style={styles.headerEyebrow}>ACCOUNT VERIFICATION</Text>
            <Text style={styles.headerTitle}>Verify Your Account</Text>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.contentWrapper,
            animatedStyle(contentAnim),
          ]}
        >
          {/* STATUS BADGE CARD */}

          <View
            style={[
              styles.statusCard,
              {
                backgroundColor: status.background,
                borderColor: status.border,
              },
            ]}
          >
            <View
              style={[
                styles.statusIconBox,
                { backgroundColor: '#FFFFFF' },
              ]}
            >
              <Ionicons
                name={status.icon}
                size={26}
                color={status.color}
              />
            </View>

            <View style={styles.statusTextArea}>
              <Text style={[styles.statusTitle, { color: status.color }]}>
                {status.label}
              </Text>

              <Text style={styles.statusSubtitle}>
                {verificationStatus === 'verified'
                  ? 'Your account is fully verified. You can now use the app without restrictions.'
                  : verificationStatus === 'pending'
                  ? 'Your ID has been submitted and is under review by our admin team.'
                  : verificationStatus === 'rejected'
                  ? 'Your previous submission was not approved. Please resubmit a clear photo of your valid ID.'
                  : 'Confirm your address and attach a valid ID to unlock full access to browsing and ordering.'}
              </Text>
            </View>
          </View>

          {/* FORM (only when action is needed) */}

          {(verificationStatus === 'unverified' ||
            verificationStatus === 'rejected') && (
            <>
              <View style={styles.sectionWrapper}>
                <Text style={styles.sectionTitle}>Confirm Your Address</Text>

                {addressLoading ? (
                  <View style={styles.addressCard}>
                    <ActivityIndicator size="small" color="#059669" />
                  </View>
                ) : !savedAddress ? (
                  <View style={styles.addressCard}>
                    <View style={styles.addressRow}>
                      <View style={styles.docIcon}>
                        <Ionicons name="location-outline" size={21} color="#64748B" />
                      </View>
                      <View style={styles.docTextArea}>
                        <Text style={styles.docTitle}>No address saved yet</Text>
                        <Text style={styles.docSubtitle}>
                          Pin your location and add your street details first.
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.addressActionButton}
                      onPress={goToSavedPlaces}
                    >
                      <Ionicons name="add-circle-outline" size={17} color="#059669" />
                      <Text style={styles.addressActionText}>Set Address in Saved Places</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.addressCard,
                      addressConfirmed && styles.docRowAttached,
                    ]}
                  >
                    <View style={styles.addressRow}>
                      <View style={[styles.docIcon, addressConfirmed && styles.docIconAttached]}>
                        <Ionicons name="location" size={21} color="#059669" />
                      </View>
                      <View style={styles.docTextArea}>
                        <Text style={styles.docTitle}>Delivery Address</Text>
                        <Text style={styles.addressFullText}>{savedAddress.full}</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.confirmRow}
                      onPress={() => setAddressConfirmed((v) => !v)}
                    >
                      <Ionicons
                        name={addressConfirmed ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={addressConfirmed ? '#059669' : '#94A3B8'}
                      />
                      <Text style={styles.confirmText}>
                        I confirm this is my correct address
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.editLink}
                      onPress={goToSavedPlaces}
                    >
                      <Ionicons name="create-outline" size={15} color="#059669" />
                      <Text style={styles.editLinkText}>Edit in Saved Places</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.sectionWrapper}>
                <Text style={styles.sectionTitle}>
                  Upload Government ID
                </Text>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[
                    styles.docRow,
                    idImage && styles.docRowAttached,
                  ]}
                  onPress={pickIdImage}
                >
                  <View
                    style={[
                      styles.docIcon,
                      idImage && styles.docIconAttached,
                    ]}
                  >
                    <Ionicons
                      name={idImage ? 'checkmark' : 'card-outline'}
                      size={21}
                      color={idImage ? '#059669' : '#64748B'}
                    />
                  </View>

                  <View style={styles.docTextArea}>
                    <Text style={styles.docTitle}>
                      Valid Government ID
                    </Text>

                    <Text style={styles.docSubtitle}>
                      {idImage
                        ? 'ID attached. Tap to replace.'
                        : 'Tap to upload a clear photo of your ID.'}
                    </Text>
                  </View>

                  {idImage && (
                    <Image
                      source={{ uri: idImage }}
                      style={styles.docThumb}
                    />
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.submitButton,
                  (!idImage || !savedAddress || !addressConfirmed || submitting) &&
                    styles.submitButtonDisabled,
                ]}
                onPress={submitVerification}
                disabled={!idImage || !savedAddress || !addressConfirmed || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={19}
                      color="#FFFFFF"
                    />
                    <Text style={styles.submitButtonText}>
                      Submit for Verification
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* PENDING STATE — no form, just wait message */}

          {verificationStatus === 'pending' && (
            <View style={styles.pendingNote}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color="#B45309"
              />
              <Text style={styles.pendingNoteText}>
                You'll be able to use the app fully once an admin approves
                your submission.
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* APP ALERT */}

      <Modal
        visible={appAlertVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAppAlert}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertCard}>
            <View
              style={[
                styles.alertIcon,
                { backgroundColor: alertColors.iconBackground },
              ]}
            >
              <Ionicons
                name={getAlertIcon()}
                size={30}
                color={alertColors.icon}
              />
            </View>

            <Text style={styles.alertTitle}>{appAlert.title}</Text>
            <Text style={styles.alertMessage}>{appAlert.message}</Text>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.alertConfirmButton}
              onPress={closeAppAlert}
            >
              <Text style={styles.alertConfirmText}>
                {appAlert.confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, backgroundColor: '#F7F9F8' },
  contentContainer: { paddingBottom: 40 },

  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  loadingLogo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  loadingTitle: {
    marginTop: 10,
    fontSize: 13.5,
    fontWeight: '700',
    color: '#374151',
  },

  header: {
    minHeight: 90,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  headerTextArea: { flex: 1 },
  headerEyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 1,
    marginBottom: 3,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#0F172A',
  },

  contentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },

  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  statusIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  statusTextArea: { flex: 1, minWidth: 0 },
  statusTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  statusSubtitle: {
    marginTop: 4,
    fontSize: 11.5,
    lineHeight: 17,
    color: '#57636D',
    fontWeight: '500',
  },

  sectionWrapper: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },

  docRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 13,
  },
  docRowAttached: {
    backgroundColor: '#F2FBF6',
    borderColor: '#BFEBD2',
  },
  docIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  docIconAttached: { backgroundColor: '#DFF6E9' },
  docTextArea: { flex: 1, minWidth: 0 },
  docTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  docSubtitle: {
    marginTop: 3,
    fontSize: 11.5,
    color: '#64748B',
  },
  addressCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 13,
  },
  addressRow: { flexDirection: 'row', alignItems: 'center' },
  addressFullText: {
    marginTop: 3,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#334155',
    fontWeight: '600',
  },
  addressActionButton: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressActionText: {
    marginLeft: 7,
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  confirmRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  confirmText: {
    marginLeft: 9,
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  editLink: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  editLinkText: {
    marginLeft: 5,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#059669',
  },

  docThumb: {
    width: 52,
    height: 52,
    borderRadius: 11,
    marginLeft: 10,
  },

  submitButton: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { backgroundColor: '#9CA3AF' },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '900',
    marginLeft: 8,
  },

  pendingNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 13,
  },
  pendingNoteText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 11.5,
    lineHeight: 17,
    color: '#92400E',
    fontWeight: '600',
  },

  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  alertCard: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 23,
    alignItems: 'center',
  },
  alertIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  alertTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  alertMessage: {
    marginTop: 8,
    fontSize: 13.5,
    lineHeight: 20,
    color: '#64748B',
    textAlign: 'center',
  },
  alertConfirmButton: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  alertConfirmText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});