import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  Linking,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';

export default function ProfileScreen({ navigation }) {
  const { user, profile, signOut } = useAuth();

  // =========================================================
  // PROFILE
  // =========================================================

  const [selectedImage, setSelectedImage] = useState(
    profile?.avatar_url || null
  );

  const [authEmail, setAuthEmail] = useState(
    user?.email || ''
  );

  const [uploadingAvatar, setUploadingAvatar] =
    useState(false);

  // ── NEW STATE — customer verification status ─────────────
  const [
    verificationStatus,
    setVerificationStatus,
  ] = useState('unverified');
  // 'unverified' | 'pending' | 'rejected' | 'verified'

  // ── NEW STATE — Pull to Refresh ─────────────
  const [refreshing, setRefreshing] = useState(false);

  // ── NEW STATE — Editable Phone Number ─────────────
  const [phoneState, setPhoneState] = useState(
    profile?.phone_number || profile?.phone || user?.phone || ''
  );
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [editPhoneValue, setEditPhoneValue] = useState('');
  const [updatingPhone, setUpdatingPhone] = useState(false);

  // =========================================================
  // MODALS
  // =========================================================

  const [photoModalVisible, setPhotoModalVisible] =
    useState(false);

  const [appAlertVisible, setAppAlertVisible] =
    useState(false);

  const [logoutModalVisible, setLogoutModalVisible] =
    useState(false);

  // =========================================================
  // APP ALERT
  // =========================================================

  const [appAlert, setAppAlert] = useState({
    type: 'info',
    title: '',
    message: '',
    confirmText: 'OK',
    cancelText: null,
    action: null,
  });

  // =========================================================
  // ANIMATIONS
  // =========================================================

  const headerAnim = useRef(new Animated.Value(0)).current;
  const profileAnim = useRef(new Animated.Value(0)).current;
  const contactAnim = useRef(new Animated.Value(0)).current;
  const accountAnim = useRef(new Animated.Value(0)).current;
  const logoutAnim = useRef(new Animated.Value(0)).current;
  const avatarScale = useRef(new Animated.Value(1)).current;

  // =========================================================
  // APP ALERT HELPERS
  // =========================================================

  const showAppAlert = ({
    type = 'info',
    title = '',
    message = '',
    confirmText = 'OK',
    cancelText = null,
    action = null,
  }) => {
    setAppAlert({
      type,
      title,
      message,
      confirmText,
      cancelText,
      action,
    });

    setAppAlertVisible(true);
  };

  const closeAppAlert = () => {
    setAppAlertVisible(false);
  };

  const handleAppAlertConfirm = async () => {
    const action = appAlert.action;

    setAppAlertVisible(false);

    setTimeout(async () => {
      if (action === 'settings') {
        try {
          await Linking.openSettings();
        } catch (error) {
          console.log('Open settings error:', error);
        }
      }

      if (action === 'logout') {
        try {
          await signOut();
        } catch (error) {
          console.log('Logout error:', error);

          setTimeout(() => {
            showAppAlert({
              type: 'error',
              title: 'Logout Failed',
              message:
                'Something went wrong while logging out. Please try again.',
              confirmText: 'OK',
            });
          }, 250);
        }
      }
    }, 100);
  };

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
        return {
          icon: '#059669',
          iconBackground: '#ECFDF5',
          button: '#059669',
          buttonText: '#FFFFFF',
        };

      case 'error':
        return {
          icon: '#DC2626',
          iconBackground: '#FEF2F2',
          button: '#DC2626',
          buttonText: '#FFFFFF',
        };

      case 'warning':
        return {
          icon: '#D97706',
          iconBackground: '#FFFBEB',
          button: '#D97706',
          buttonText: '#FFFFFF',
        };

      default:
        return {
          icon: '#059669',
          iconBackground: '#ECFDF5',
          button: '#059669',
          buttonText: '#FFFFFF',
        };
    }
  };

  // =========================================================
  // PULL TO REFRESH
  // =========================================================

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const currentUserId = user?.id || profile?.id;
    
    if (currentUserId) {
      try {
        // Fetch Profile Avatar & Phone
        const { data: profileData } = await supabase
          .from('profiles')
          .select('avatar_url, phone')
          .eq('id', currentUserId)
          .maybeSingle();

        if (profileData) {
          setSelectedImage(profileData.avatar_url || null);
          if (profileData.phone) setPhoneState(profileData.phone);
        }

        // Fetch Verification Status
        const { data: verificationData } = await supabase
          .from('customer_verifications')
          .select('is_verified, verification_status')
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (!verificationData) {
          setVerificationStatus('unverified');
        } else if (verificationData.is_verified) {
          setVerificationStatus('verified');
        } else {
          setVerificationStatus(verificationData.verification_status || 'pending');
        }
      } catch (error) {
        console.log('Refresh error:', error);
      }
    }
    setRefreshing(false);
  }, [user?.id, profile?.id]);

  // =========================================================
  // LOAD EMAIL
  // =========================================================

  useEffect(() => {
    const loadEmail = async () => {
      try {
        if (user?.email) {
          setAuthEmail(user.email);
          return;
        }

        const {
          data: { user: authUser },
          error,
        } = await supabase.auth.getUser();

        if (error) {
          console.log('Auth email error:', error);
          return;
        }

        if (authUser?.email) {
          setAuthEmail(authUser.email);
        }
      } catch (error) {
        console.log('Load email error:', error);
      }
    };

    loadEmail();
  }, [user?.id, user?.email]);

  // =========================================================
  // FETCH PROFILE AVATAR
  // =========================================================

  useFocusEffect(
    useCallback(() => {
      const fetchProfileData = async () => {
        const currentUserId = user?.id || profile?.id;
        if (!currentUserId) return;

        try {
          const { data: profileData, error } = await supabase
            .from('profiles')
            .select('avatar_url, phone')
            .eq('id', currentUserId)
            .maybeSingle();

          if (error) {
            console.log('Profile fetch error:', error);
            return;
          }

          if (profileData) {
            setSelectedImage(profileData.avatar_url || null);
            if (profileData.phone) setPhoneState(profileData.phone);
          }
        } catch (error) {
          console.log('Fetch profile data error:', error);
        }
      };

      fetchProfileData();
    }, [user?.id, profile?.id])
  );

  // ── NEW EFFECT — fetch customer verification status ──────
  useFocusEffect(
    useCallback(() => {
      const fetchVerificationStatus = async () => {
        const currentUserId = user?.id || profile?.id;
        if (!currentUserId) return;

        try {
          const { data, error } = await supabase
            .from('customer_verifications')
            .select('is_verified, verification_status')
            .eq('user_id', currentUserId)
            .maybeSingle();

          if (error) {
            console.log('Verification status fetch error:', error);
            return;
          }

          if (!data) {
            setVerificationStatus('unverified');
          } else if (data.is_verified) {
            setVerificationStatus('verified');
          } else {
            setVerificationStatus(data.verification_status || 'pending');
          }
        } catch (error) {
          console.log('Fetch verification status error:', error);
        }
      };

      fetchVerificationStatus();
    }, [user?.id, profile?.id])
  );

  // =========================================================
  // PHONE NUMBER EDIT HELPERS
  // =========================================================

  const handleEditPhonePress = () => {
    setEditPhoneValue(phoneState || '');
    setIsEditingPhone(true);
  };

  const handleCancelEditPhone = () => {
    setIsEditingPhone(false);
    setEditPhoneValue('');
  };

  const handleSavePhone = async () => {
    const currentUserId = user?.id || profile?.id;
    if (!currentUserId) return;

    const cleanedPhone = editPhoneValue.trim();
    if (!cleanedPhone || cleanedPhone.length < 10) {
      showAppAlert({
        type: 'warning',
        title: 'Invalid Phone Number',
        message: 'Please enter a valid phone number to continue.',
        confirmText: 'OK',
      });
      return;
    }

    setUpdatingPhone(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ phone: cleanedPhone })
        .eq('id', currentUserId);

      if (error) throw error;

      setPhoneState(cleanedPhone);
      setIsEditingPhone(false);
      showAppAlert({
        type: 'success',
        title: 'Phone Updated',
        message: 'Your phone number has been saved successfully.',
        confirmText: 'Done',
      });
    } catch (error) {
      console.log('Error updating phone:', error);
      showAppAlert({
        type: 'error',
        title: 'Update Failed',
        message: 'Could not save your new phone number. Please try again.',
        confirmText: 'OK',
      });
    } finally {
      setUpdatingPhone(false);
    }
  };

  // =========================================================
  // SCREEN ANIMATIONS
  // =========================================================

  useEffect(() => {
    Animated.stagger(80, [
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),

      Animated.timing(profileAnim, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),

      Animated.timing(contactAnim, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),

      Animated.timing(accountAnim, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),

      Animated.timing(logoutAnim, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // =========================================================
  // MODAL CLOSE DELAY
  // =========================================================

  const waitForModalToClose = () => {
    return new Promise((resolve) => {
      setTimeout(resolve, 350);
    });
  };

  // =========================================================
  // SAVE AVATAR
  // =========================================================

  const saveAvatarFromAsset = async (asset) => {
    if (!asset?.uri) {
      return;
    }

    try {
      setUploadingAvatar(true);

      const selectedUri = asset.uri;

      const base64String =
        await FileSystem.readAsStringAsync(selectedUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

      const fileExtension =
        selectedUri
          .split('.')
          .pop()
          ?.split('?')[0]
          ?.toLowerCase() || 'jpg';

      const mimeType =
        fileExtension === 'png' ? 'png' : 'jpeg';

      const dataUri =
        `data:image/${mimeType};base64,${base64String}`;

      setSelectedImage(dataUri);

      avatarScale.setValue(0.85);

      Animated.spring(avatarScale, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }).start();

      const currentUserId =
        user?.id || profile?.id;

      if (!currentUserId) {
        throw new Error(
          'User ID could not be found.'
        );
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          avatar_url: dataUri,
        })
        .eq('id', currentUserId);

      if (error) {
        throw error;
      }

      setPhotoModalVisible(false);

      showAppAlert({
        type: 'success',
        title: 'Profile Picture Updated',
        message:
          'Your new profile picture has been successfully saved to your Paabot account.',
        confirmText: 'Done',
      });
    } catch (error) {
      console.log('Avatar upload error:', error);

      showAppAlert({
        type: 'error',
        title: 'Upload Failed',
        message:
          'We could not update your profile picture. Please try again.',
        confirmText: 'Try Again',
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  // =========================================================
  // GALLERY
  // =========================================================

  const chooseFromGallery = async () => {
    if (uploadingAvatar) {
      return;
    }

    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        if (permissionResult.canAskAgain === false) {
          showAppAlert({
            type: 'warning',
            title: 'Photo Permission Required',
            message:
              'Paabot needs access to your photos to choose a profile picture. You can enable photo access in your device settings.',
            confirmText: 'Open Settings',
            cancelText: 'Cancel',
            action: 'settings',
          });
        } else {
          showAppAlert({
            type: 'warning',
            title: 'Photo Permission Needed',
            message:
              'Please allow Paabot to access your photo library so you can choose a profile picture.',
            confirmText: 'OK',
          });
        }

        return;
      }

      setPhotoModalVisible(false);

      await waitForModalToClose();

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });

      if (
        !result.canceled &&
        result.assets &&
        result.assets.length > 0
      ) {
        await saveAvatarFromAsset(result.assets[0]);
      } else {
        setPhotoModalVisible(true);
      }
    } catch (error) {
      console.log('Gallery picker error:', error);

      setPhotoModalVisible(true);

      showAppAlert({
        type: 'error',
        title: 'Gallery Error',
        message:
          'We could not open your photo library. Please check your permissions and try again.',
        confirmText: 'OK',
      });
    }
  };

  // =========================================================
  // CAMERA
  // =========================================================

  const takePhoto = async () => {
    if (uploadingAvatar) {
      return;
    }

    try {
      const permissionResult =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permissionResult.granted) {
        if (permissionResult.canAskAgain === false) {
          showAppAlert({
            type: 'warning',
            title: 'Camera Permission Required',
            message:
              'Paabot needs camera access to take a profile picture. You can enable camera access in your device settings.',
            confirmText: 'Open Settings',
            cancelText: 'Cancel',
            action: 'settings',
          });
        } else {
          showAppAlert({
            type: 'warning',
            title: 'Camera Permission Needed',
            message:
              'Please allow Paabot to access your camera so you can take a profile picture.',
            confirmText: 'OK',
          });
        }

        return;
      }

      setPhotoModalVisible(false);

      await waitForModalToClose();

      const result =
        await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });

      if (
        !result.canceled &&
        result.assets &&
        result.assets.length > 0
      ) {
        await saveAvatarFromAsset(result.assets[0]);
      } else {
        setPhotoModalVisible(true);
      }
    } catch (error) {
      console.log('Camera picker error:', error);

      setPhotoModalVisible(true);

      showAppAlert({
        type: 'error',
        title: 'Camera Error',
        message:
          'We could not open your camera. Please check your camera permission and try again.',
        confirmText: 'OK',
      });
    }
  };

  // =========================================================
  // REMOVE PHOTO
  // =========================================================

  const removePhoto = async () => {
    if (uploadingAvatar) {
      return;
    }

    try {
      setUploadingAvatar(true);

      const currentUserId =
        user?.id || profile?.id;

      if (!currentUserId) {
        throw new Error(
          'User ID could not be found.'
        );
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          avatar_url: null,
        })
        .eq('id', currentUserId);

      if (error) {
        throw error;
      }

      setSelectedImage(null);
      setPhotoModalVisible(false);

      showAppAlert({
        type: 'success',
        title: 'Profile Picture Removed',
        message:
          'Your profile picture has been removed from your Paabot account.',
        confirmText: 'Done',
      });
    } catch (error) {
      console.log('Remove avatar error:', error);

      showAppAlert({
        type: 'error',
        title: 'Remove Failed',
        message:
          'We could not remove your profile picture. Please try again.',
        confirmText: 'OK',
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  // =========================================================
  // LOGOUT
  // =========================================================

  const confirmLogout = () => {
    setLogoutModalVisible(false);

    showAppAlert({
      type: 'warning',
      title: 'Log Out of Paabot?',
      message:
        'You will be signed out of your customer account and will need to log in again to continue.',
      confirmText: 'Log Out',
      cancelText: 'Cancel',
      action: 'logout',
    });
  };

  // ── NEW HANDLER — navigate to CustomerVerification screen ─
  const goToVerification = () => {
    const parentNavigation = navigation.getParent?.();

    if (parentNavigation) {
      parentNavigation.navigate('CustomerVerification');
    } else {
      navigation.navigate('CustomerVerification');
    }
  };

  // ── NEW HELPER — status badge config for the menu row ────
  const getVerificationBadgeConfig = () => {
    if (verificationStatus === 'verified') {
      return {
        label: 'Verified',
        color: '#047857',
        background: '#ECFDF5',
      };
    }

    if (verificationStatus === 'pending') {
      return {
        label: 'Pending',
        color: '#B45309',
        background: '#FFFBEB',
      };
    }

    if (verificationStatus === 'rejected') {
      return {
        label: 'Rejected',
        color: '#B91C1C',
        background: '#FEF2F2',
      };
    }

    return {
      label: 'Required',
      color: '#B45309',
      background: '#FFFBEB',
    };
  };

  const verificationBadge = getVerificationBadgeConfig();

  // =========================================================
  // DISPLAY DATA
  // =========================================================

  const displayName =
    profile?.full_name ||
    profile?.name ||
    'Valued Customer';

  const displayEmail =
    authEmail ||
    user?.email ||
    'No email available';

  const displayPhone =
    phoneState || 'No phone number added';

  const getInitials = () => {
    const name = displayName.trim();

    if (!name) {
      return 'P';
    }

    const parts = name.split(' ').filter(Boolean);

    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }

    return (
      parts[0].charAt(0) +
      parts[parts.length - 1].charAt(0)
    ).toUpperCase();
  };

  const animatedStyle = (animation) => ({
    opacity: animation,
    transform: [
      {
        translateY: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  });

  const alertColors = getAlertColors();

  // =========================================================
  // MAIN
  // =========================================================

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, { flexGrow: 1 }]} 
        showsVerticalScrollIndicator={false}
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
        {/* HEADER */}

        <Animated.View
          style={[
            styles.header,
            animatedStyle(headerAnim),
          ]}
        >
          <View style={styles.headerAccent} />

          <View style={styles.headerTextArea}>
            <Text style={styles.headerEyebrow}>
              PAABOT ACCOUNT
            </Text>

            <Text style={styles.headerTitle}>
              My Profile
            </Text>

            <Text style={styles.headerSubtitle}>
              Manage your personal details
            </Text>
          </View>

          <View style={styles.headerIconBox}>
            <Ionicons
              name="person-outline"
              size={22}
              color="#059669"
            />
          </View>
        </Animated.View>

        {/* PROFILE CARD */}

        <Animated.View
          style={[
            styles.profileCard,
            animatedStyle(profileAnim),
          ]}
        >
          <View style={styles.profileTopRow}>
            <View style={styles.avatarWrapper}>
              <Animated.View
                style={[
                  styles.avatarOuter,
                  {
                    transform: [
                      {
                        scale: avatarScale,
                      },
                    ],
                  },
                ]}
              >
                {uploadingAvatar ? (
                  <View style={styles.avatarPlaceholder}>
                    <ActivityIndicator
                      size="small"
                      color="#059669"
                    />
                  </View>
                ) : selectedImage ? (
                  <Image
                    source={{
                      uri: selectedImage,
                    }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitials}>
                      {getInitials()}
                    </Text>
                  </View>
                )}
              </Animated.View>

              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.avatarEditButton}
                onPress={() =>
                  setPhotoModalVisible(true)
                }
                disabled={uploadingAvatar}
              >
                <Ionicons
                  name="camera-outline"
                  size={17}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.profileIdentity}>
              <Text style={styles.profileEyebrow}>
                ACCOUNT NAME
              </Text>

              <Text
                style={styles.profileName}
                numberOfLines={2}
              >
                {displayName}
              </Text>

              <View style={styles.customerBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color="#059669"
                />

                <Text style={styles.customerBadgeText}>
                  Paabot Customer
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.profileEmailRow}>
            <View style={styles.smallIconBox}>
              <Ionicons
                name="mail-outline"
                size={17}
                color="#059669"
              />
            </View>

            <Text
              style={styles.profileEmail}
              numberOfLines={2}
            >
              {displayEmail}
            </Text>
          </View>

          <View style={styles.profileBottomBar}>
            <View style={styles.profileBottomTextArea}>
              <Text style={styles.profileBottomTitle}>
                Account Profile
              </Text>

              <Text style={styles.profileBottomSubtitle}>
                Keep your information updated
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.changePhotoButton}
              onPress={() =>
                setPhotoModalVisible(true)
              }
              disabled={uploadingAvatar}
            >
              <Ionicons
                name="image-outline"
                size={16}
                color="#FFFFFF"
              />

              <Text style={styles.changePhotoText}>
                Change Photo
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* CONTACT INFORMATION */}

        <Animated.View
          style={[
            styles.sectionWrapper,
            animatedStyle(contactAnim),
          ]}
        >
          <Text style={styles.sectionTitle}>
            Contact Information
          </Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconBox}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color="#059669"
                />
              </View>

              <View style={styles.infoTextArea}>
                <Text style={styles.infoLabel}>
                  Email Address
                </Text>

                <Text
                  style={styles.infoValue}
                  numberOfLines={2}
                >
                  {displayEmail}
                </Text>
              </View>
            </View>

            <View style={styles.infoDivider} />

            {/* ── PHONE NUMBER ROW ───────────── */}
            <View style={styles.infoRow}>
              <View style={styles.infoIconBox}>
                <Ionicons
                  name="call-outline"
                  size={20}
                  color="#059669"
                />
              </View>

              <View style={styles.infoTextArea}>
                <View style={styles.phoneHeaderRow}>
                  <Text style={styles.infoLabel}>
                    Phone Number
                  </Text>
                  {!isEditingPhone && (
                    <TouchableOpacity 
                      onPress={handleEditPhonePress} 
                      style={styles.editPhoneButton}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.editTextBtn}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {isEditingPhone ? (
                  <View style={styles.phoneEditContainer}>
                    <TextInput
                      style={styles.inlinePhoneInput}
                      value={editPhoneValue}
                      onChangeText={setEditPhoneValue}
                      placeholder="Enter phone number"
                      keyboardType="phone-pad"
                      autoFocus
                      editable={!updatingPhone}
                    />
                    <View style={styles.phoneEditActions}>
                      <TouchableOpacity 
                        onPress={handleCancelEditPhone} 
                        style={[styles.phoneActionBtn, styles.cancelActionBtn]}
                        disabled={updatingPhone}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.cancelTextBtn}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={handleSavePhone} 
                        style={[styles.phoneActionBtn, styles.saveActionBtn]}
                        disabled={updatingPhone}
                        activeOpacity={0.8}
                      >
                        {updatingPhone ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.saveTextBtn}>Save</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity 
                    onPress={handleEditPhonePress} 
                    activeOpacity={0.7}
                  >
                    <Text
                      style={styles.infoValue}
                      numberOfLines={2}
                    >
                      {displayPhone}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* ACCOUNT */}

        <Animated.View
          style={[
            styles.sectionWrapper,
            animatedStyle(accountAnim),
          ]}
        >
          <Text style={styles.sectionTitle}>
            Account
          </Text>

          <View style={styles.menuCard}>
            {/* ── NEW MENU ROW — Verify Your Account ──────── */}
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.menuRow}
              onPress={goToVerification}
            >
              <View style={styles.menuIconBox}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={21}
                  color="#059669"
                />
              </View>

              <View style={styles.menuTextArea}>
                <Text style={styles.menuTitle}>
                  Verify Your Account
                </Text>

                <Text style={styles.menuSubtitle}>
                  Submit your ID to unlock full app access
                </Text>
              </View>

              <View
                style={[
                  styles.verificationStatusPill,
                  {
                    backgroundColor:
                      verificationBadge.background,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.verificationStatusPillText,
                    { color: verificationBadge.color },
                  ]}
                >
                  {verificationBadge.label}
                </Text>
              </View>

              <View style={styles.menuArrowBox}>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color="#94A3B8"
                />
              </View>
            </TouchableOpacity>

            <View style={styles.menuDivider} />
            {/* ── END NEW MENU ROW ──────────────────────────── */}

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.menuRow}
              onPress={() =>
                navigation.navigate(
                  'SavedAddresses'
                )
              }
            >
              <View style={styles.menuIconBox}>
                <Ionicons
                  name="location-outline"
                  size={21}
                  color="#059669"
                />
              </View>

              <View style={styles.menuTextArea}>
                <Text style={styles.menuTitle}>
                  Saved Places
                </Text>

                <Text style={styles.menuSubtitle}>
                  Manage your saved delivery locations
                </Text>
              </View>

              <View style={styles.menuArrowBox}>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color="#94A3B8"
                />
              </View>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.menuRow}
              onPress={() =>
                navigation.navigate(
                  'OrderHistory'
                )
              }
            >
              <View style={styles.menuIconBox}>
                <Ionicons
                  name="receipt-outline"
                  size={21}
                  color="#059669"
                />
              </View>

              <View style={styles.menuTextArea}>
                <Text style={styles.menuTitle}>
                  Order History
                </Text>

                <Text style={styles.menuSubtitle}>
                  View your previous orders
                </Text>
              </View>

              <View style={styles.menuArrowBox}>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color="#94A3B8"
                />
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* LOGOUT */}

        <Animated.View
          style={[
            styles.logoutSection,
            animatedStyle(logoutAnim),
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.logoutButton}
            onPress={confirmLogout}
          >
            <View style={styles.logoutIconBox}>
              <Ionicons
                name="log-out-outline"
                size={22}
                color="#DC2626"
              />
            </View>

            <View style={styles.logoutTextArea}>
              <Text style={styles.logoutTitle}>
                Log Out
              </Text>

              <Text style={styles.logoutSubtitle}>
                Sign out of your Paabot account
              </Text>
            </View>

            <View style={styles.logoutArrowBox}>
              <Ionicons
                name="chevron-forward"
                size={20}
                color="#F87171"
              />
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* FOOTER */}

        <View style={styles.footer}>
          <View style={styles.footerLogoRow}>
            <View style={styles.footerLogoMark}>
              <Ionicons
                name="leaf-outline"
                size={16}
                color="#059669"
              />
            </View>

            <Text style={styles.footerBrand}>
              Paabot
            </Text>
          </View>

          <View style={styles.footerDivider} />

          <Text style={styles.footerDevelopment}>
            Developed September 25, 2026
          </Text>

          <Text style={styles.footerCopyright}>
            Local delivery made simpler.
          </Text>
        </View>
      </ScrollView>

      {/* =====================================================
          PHOTO MODAL
      ===================================================== */}

      <Modal
        visible={photoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!uploadingAvatar) {
            setPhotoModalVisible(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.photoModal}>
            <View style={styles.modalTopRow}>
              <View style={styles.modalTitleArea}>
                <Text style={styles.modalTitle}>
                  Profile Picture
                </Text>

                <Text style={styles.modalSubtitle}>
                  Add or change your profile photo
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.closeButton}
                onPress={() =>
                  setPhotoModalVisible(false)
                }
                disabled={uploadingAvatar}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color="#475569"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.previewArea}>
              {uploadingAvatar ? (
                <View style={styles.previewPlaceholder}>
                  <ActivityIndicator
                    size="large"
                    color="#059669"
                  />

                  <Text style={styles.previewLoadingText}>
                    Saving profile picture...
                  </Text>
                </View>
              ) : selectedImage ? (
                <Image
                  source={{
                    uri: selectedImage,
                  }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.previewPlaceholder}>
                  <Ionicons
                    name="person-outline"
                    size={48}
                    color="#94A3B8"
                  />

                  <Text style={styles.previewPlaceholderText}>
                    No profile picture
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.photoActionButton,
                uploadingAvatar &&
                  styles.disabledButton,
              ]}
              onPress={takePhoto}
              disabled={uploadingAvatar}
            >
              <View style={styles.photoActionIcon}>
                <Ionicons
                  name="camera-outline"
                  size={21}
                  color="#059669"
                />
              </View>

              <View style={styles.photoActionTextArea}>
                <Text style={styles.photoActionTitle}>
                  Take a Photo
                </Text>

                <Text style={styles.photoActionSubtitle}>
                  Use your device camera
                </Text>
              </View>

              <View style={styles.photoActionArrow}>
                <Ionicons
                  name="chevron-forward"
                  size={19}
                  color="#94A3B8"
                />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.photoActionButton,
                uploadingAvatar &&
                  styles.disabledButton,
              ]}
              onPress={chooseFromGallery}
              disabled={uploadingAvatar}
            >
              <View style={styles.photoActionIcon}>
                <Ionicons
                  name="images-outline"
                  size={21}
                  color="#059669"
                />
              </View>

              <View style={styles.photoActionTextArea}>
                <Text style={styles.photoActionTitle}>
                  Choose from Gallery
                </Text>

                <Text style={styles.photoActionSubtitle}>
                  Select a picture from your device
                </Text>
              </View>

              <View style={styles.photoActionArrow}>
                <Ionicons
                  name="chevron-forward"
                  size={19}
                  color="#94A3B8"
                />
              </View>
            </TouchableOpacity>

            {selectedImage && (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.removePhotoButton,
                  uploadingAvatar &&
                    styles.disabledButton,
                ]}
                onPress={removePhoto}
                disabled={uploadingAvatar}
              >
                <Ionicons
                  name="trash-outline"
                  size={19}
                  color="#DC2626"
                />

                <Text style={styles.removePhotoText}>
                  Remove Profile Picture
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* =====================================================
          APP ALERT
      ===================================================== */}

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
                {
                  backgroundColor:
                    alertColors.iconBackground,
                },
              ]}
            >
              <Ionicons
                name={getAlertIcon()}
                size={31}
                color={alertColors.icon}
              />
            </View>

            <Text style={styles.alertTitle}>
              {appAlert.title}
            </Text>

            <Text style={styles.alertMessage}>
              {appAlert.message}
            </Text>

            <View style={styles.alertButtons}>
              {appAlert.cancelText && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.alertCancelButton}
                  onPress={closeAppAlert}
                >
                  <Text style={styles.alertCancelText}>
                    {appAlert.cancelText}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.alertConfirmButton,
                  !appAlert.cancelText &&
                    styles.alertConfirmButtonFull,
                  {
                    backgroundColor:
                      alertColors.button,
                  },
                ]}
                onPress={
                  handleAppAlertConfirm
                }
              >
                <Text
                  style={[
                    styles.alertConfirmText,
                    {
                      color:
                        alertColors.buttonText,
                    },
                  ]}
                >
                  {appAlert.confirmText}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* =====================================================
          UNUSED LOGOUT STATE KEPT
      ===================================================== */}

      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setLogoutModalVisible(false)
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.logoutModal}>
            <View style={styles.logoutModalIcon}>
              <Ionicons
                name="log-out-outline"
                size={28}
                color="#DC2626"
              />
            </View>

            <Text style={styles.logoutModalTitle}>
              Log Out?
            </Text>

            <Text style={styles.logoutModalMessage}>
              Are you sure you want to continue?
            </Text>

            <View style={styles.logoutModalButtons}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.cancelButton}
                onPress={() =>
                  setLogoutModalVisible(false)
                }
              >
                <Text style={styles.cancelButtonText}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.confirmLogoutButton}
                onPress={confirmLogout}
              >
                <Text style={styles.confirmLogoutText}>
                  Continue
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // =========================================================
  // BASE
  // =========================================================

  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  container: {
    flex: 1,
    backgroundColor: '#F7F9F8',
  },

  contentContainer: {
    paddingBottom: 34,
  },

  // =========================================================
  // HEADER
  // =========================================================

  header: {
    minHeight: 108,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  headerAccent: {
    width: 4,
    height: 65,
    borderRadius: 4,
    backgroundColor: '#059669',
    marginRight: 14,
  },

  headerTextArea: {
    flex: 1,
  },

  headerEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 1.2,
    marginBottom: 3,
  },

  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 33,
  },

  headerSubtitle: {
    marginTop: 3,
    fontSize: 13.5,
    color: '#64748B',
    lineHeight: 19,
  },

  headerIconBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },

  // =========================================================
  // PROFILE
  // =========================================================

  profileCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingTop: 20,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    elevation: 3,
  },

  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatarWrapper: {
    width: 92,
    height: 92,
    marginRight: 17,
  },

  avatarOuter: {
    width: 92,
    height: 92,
    borderRadius: 46,
    padding: 3,
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#059669',
    overflow: 'hidden',
  },

  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 42,
    backgroundColor: '#ECFDF5',
  },

  avatarPlaceholder: {
    flex: 1,
    borderRadius: 42,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarInitials: {
    fontSize: 29,
    fontWeight: '800',
    color: '#047857',
  },

  avatarEditButton: {
    position: 'absolute',
    right: -3,
    bottom: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },

  profileIdentity: {
    flex: 1,
    minWidth: 0,
  },

  profileEyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1,
    marginBottom: 4,
  },

  profileName: {
    fontSize: 23,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 28,
  },

  customerBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 8,
  },

  customerBadgeText: {
    marginLeft: 5,
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },

  profileEmailRow: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 11,
    backgroundColor: '#F8FAFC',
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },

  smallIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  profileEmail: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    color: '#334155',
    lineHeight: 20,
  },

  profileBottomBar: {
    marginHorizontal: -18,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 15,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
  },

  profileBottomTextArea: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },

  profileBottomTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E293B',
  },

  profileBottomSubtitle: {
    marginTop: 3,
    fontSize: 11.5,
    color: '#64748B',
  },

  changePhotoButton: {
    width: 124,
    minHeight: 42,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  changePhotoText: {
    marginLeft: 5,
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // =========================================================
  // SECTIONS
  // =========================================================

  sectionWrapper: {
    marginHorizontal: 16,
    marginTop: 22,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },

  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  infoRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
  },

  infoIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  infoTextArea: {
    flex: 1,
    minWidth: 0,
  },

  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },

  infoValue: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1E293B',
    lineHeight: 20,
  },

  infoDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginLeft: 55,
  },

  // ── NEW STYLES — Editable Phone Number ─────────────
  phoneHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  
  editPhoneButton: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },

  editTextBtn: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#059669',
  },

  phoneEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  
  inlinePhoneInput: {
    flex: 1,
    height: 38,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14.5,
    fontWeight: '600',
    color: '#0F172A',
    marginRight: 8,
  },
  
  phoneEditActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  phoneActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginLeft: 6,
    minWidth: 60,
    alignItems: 'center',
  },

  cancelActionBtn: {
    backgroundColor: '#F1F5F9',
  },

  saveActionBtn: {
    backgroundColor: '#059669',
  },
  
  cancelTextBtn: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  
  saveTextBtn: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 15,
  },

  menuRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
  },

  menuIconBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  menuTextArea: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },

  menuTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 3,
  },

  menuSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#64748B',
  },

  menuArrowBox: {
    width: 28,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  menuDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginLeft: 57,
  },

  // ── NEW STYLES — verification status pill in menu row ────
  verificationStatusPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 6,
    flexShrink: 0,
  },

  verificationStatusPillText: {
    fontSize: 9.5,
    fontWeight: '900',
  },

  // =========================================================
  // LOGOUT
  // =========================================================

  logoutSection: {
    marginHorizontal: 16,
    marginTop: 22,
  },

  logoutButton: {
    minHeight: 76,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },

  logoutIconBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  logoutTextArea: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },

  logoutTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#B91C1C',
  },

  logoutSubtitle: {
    fontSize: 12.5,
    color: '#7F1D1D',
    marginTop: 3,
  },

  logoutArrowBox: {
    width: 28,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // =========================================================
  // FOOTER
  // =========================================================

  footer: {
    alignItems: 'center',
    paddingTop: 30,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },

  footerLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  footerLogoMark: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },

  footerBrand: {
    fontSize: 18,
    fontWeight: '800',
    color: '#059669',
  },

  footerDivider: {
    width: 44,
    height: 1,
    backgroundColor: '#CBD5E1',
    marginVertical: 10,
  },

  footerDevelopment: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },

  footerCopyright: {
    marginTop: 4,
    fontSize: 10.5,
    fontWeight: '500',
    color: '#94A3B8',
    textAlign: 'center',
  },

  // =========================================================
  // PHOTO MODAL
  // =========================================================

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  photoModal: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 19,
    maxHeight: '90%',
  },

  modalTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },

  modalTitleArea: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },

  modalSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 4,
  },

  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  previewArea: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 270,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  previewImage: {
    width: '100%',
    height: '100%',
  },

  previewPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  previewPlaceholderText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },

  previewLoadingText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },

  photoActionButton: {
    minHeight: 68,
    borderRadius: 15,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  photoActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },

  photoActionTextArea: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },

  photoActionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },

  photoActionSubtitle: {
    marginTop: 3,
    fontSize: 11.5,
    color: '#64748B',
  },

  photoActionArrow: {
    width: 28,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  removePhotoButton: {
    height: 48,
    borderRadius: 13,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    paddingHorizontal: 14,
  },

  removePhotoText: {
    marginLeft: 7,
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },

  disabledButton: {
    opacity: 0.55,
  },

  // =========================================================
  // APP ALERT
  // =========================================================

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
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 8,
  },

  alertIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  alertTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },

  alertMessage: {
    marginTop: 9,
    fontSize: 14,
    lineHeight: 21,
    color: '#64748B',
    textAlign: 'center',
  },

  alertButtons: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 23,
  },

  alertCancelButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },

  alertCancelText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
  },

  alertConfirmButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    paddingHorizontal: 16,
  },

  alertConfirmButtonFull: {
    marginLeft: 0,
    minWidth: 140,
  },

  alertConfirmText: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },

  // =========================================================
  // UNUSED LOGOUT MODAL
  // =========================================================

  logoutModal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
  },

  logoutModalIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  logoutModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },

  logoutModalMessage: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: '#64748B',
    textAlign: 'center',
  },

  logoutModalButtons: {
    width: '100%',
    flexDirection: 'row',
    marginTop: 22,
  },

  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  cancelButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
  },

  confirmLogoutButton: {
    flex: 1,
    height: 48,
    borderRadius: 13,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  confirmLogoutText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});