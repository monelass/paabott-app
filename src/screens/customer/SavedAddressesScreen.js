import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, RefreshControl, TextInput, Modal, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/UI';
import OsmMap from '../../components/OsmMap';

// Calculate distance in kilometers using the Haversine formula
const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return 0;
  }
  const R = 6371;
  const dLat = (Number(lat2) - Number(lat1)) * (Math.PI / 180);
  const dLon = (Number(lon2) - Number(lon1)) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(Number(lat1) * (Math.PI / 180)) *
      Math.cos(Number(lat2) * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function SavedAddressesScreen({ navigation }) {
  const authContext = useAuth();
  const user = authContext?.user || authContext?.session?.user;

  const [savedLocation, setSavedLocation] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [streetDetails, setStreetDetails] = useState('');
  const [loading, setLoading] = useState(true);
  const [mapLoading, setMapLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Admin Boundary Settings States
  const [adminCenter, setAdminCenter] = useState({ lat: 10.2021, lng: 122.8613 });
  const [maxRadiusKm, setMaxRadiusKm] = useState(15);

  // 🌟 Full-Screen Center-Pin Picker Modal State
  const [isMapModalVisible, setIsMapModalVisible] = useState(false);
  const [pinSessionId, setPinSessionId] = useState(0);
  const [tempPinCoords, setTempPinCoords] = useState(null);
  const [resolvingPinAddress, setResolvingPinAddress] = useState(false);

  // 🌟 Modern Custom Alert Modal State
  const [alertModal, setAlertModal] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'success', // 'success' | 'error' | 'warning'
    buttons: [],
  });

  const showAlert = (title, message, type = 'success', buttons = [{ text: 'OK', onPress: () => hideAlert() }]) => {
    setAlertModal({ visible: true, title, message, type, buttons });
  };

  const hideAlert = () => {
    setAlertModal((prev) => ({ ...prev, visible: false }));
  };

  const locationSubscription = useRef(null);

  useEffect(() => { 
    fetchAdminSettings();
    if (user?.id) {
      fetchProfileLocation();
    } else {
      setLoading(false);
      setMapLoading(false);
    }

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, [user?.id]);

  const fetchAdminSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value');

      if (!error && data) {
        const configMap = {};
        data.forEach((s) => { configMap[s.key] = s.value; });

        if (configMap['perimeter_lat'] && configMap['perimeter_lng']) {
          setAdminCenter({
            lat: parseFloat(configMap['perimeter_lat']) || 10.2021,
            lng: parseFloat(configMap['perimeter_lng']) || 122.8613,
          });
        }
        if (configMap['perimeter_radius_km']) {
          setMaxRadiusKm(parseFloat(configMap['perimeter_radius_km']) || 15);
        }
      }
    } catch (e) {
      // fallback defaults
    }
  };

  const startLiveTracking = async () => {
    try {
      setMapLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Denied', 'Location permission is required to fetch live location.', 'warning');
        setMapLoading(false);
        return;
      }

      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }

      locationSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        (location) => {
          const coords = {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          };
          setUserLocation(coords);
          setMapLoading(false);
        }
      );
    } catch (e) {
      setMapLoading(false);
    }
  };

  const fetchReadableAddress = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&countrycodes=ph`,
        { headers: { 'User-Agent': 'DeliveryApp/1.0' } }
      );
      const data = await response.json();
      if (data && data.address) {
        const addr = data.address;
        const buildingOrShop = addr.amenity || addr.shop || addr.building || addr.tourism || addr.commercial || addr.office || '';
        const road = addr.road || addr.suburb || addr.neighbourhood || '';
        const barangay = addr.quarter || addr.neighbourhood || addr.village || addr.suburb || '';
        const town = addr.city || addr.town || addr.municipality || '';
        
        let formattedParts = [];
        if (buildingOrShop) formattedParts.push(buildingOrShop);
        if (road) formattedParts.push(road);
        if (barangay && barangay !== road) formattedParts.push(barangay);
        if (town) formattedParts.push(town);

        return formattedParts.length > 0 
          ? formattedParts.join(', ').trim() 
          : (data.display_name ? data.display_name.split(',').slice(0, 4).join(',').trim() : `Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      } else if (data && data.display_name) {
        return data.display_name.split(',').slice(0, 4).join(',').trim();
      }
    } catch (error) {
      // fallback
    }
    return `Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  };

  const fetchProfileLocation = async () => {
    try {
      let currentUserId = user?.id;
      if (!currentUserId) {
        const { data: { session } } = await supabase.auth.getSession();
        currentUserId = session?.user?.id;
      }

      if (!currentUserId) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('current_lat, current_lng, address_details')
        .eq('id', currentUserId)
        .single();

      if (!error && data && data.current_lat && data.current_lng) {
        const baseArea = await fetchReadableAddress(data.current_lat, data.current_lng);
        const fullDisplayAddress = data.address_details 
          ? `${data.address_details}, ${baseArea}` 
          : baseArea;

        setSavedLocation({
          id: 'profile_loc',
          label: 'Saved Location',
          address: fullDisplayAddress,
          lat: data.current_lat,
          lng: data.current_lng,
          icon: 'location',
        });

        setUserLocation({
          lat: data.current_lat,
          lng: data.current_lng,
        });
        if (data.address_details) {
          setStreetDetails(data.address_details);
        }
        setMapLoading(false);
      } else {
        startLiveTracking();
      }
    } catch (err) {
      // fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Open Full-Screen Center-Pin Modal
  const openPinPicker = () => {
    const startCoords = userLocation || { lat: 10.1939, lng: 122.8586 };
    setTempPinCoords(startCoords);
    setPinSessionId((n) => n + 1);
    setIsMapModalVisible(true);
  };

  // Confirm Pinned Location from Modal with Boundary Check
  const confirmPin = async () => {
    if (!tempPinCoords || tempPinCoords.lat == null || tempPinCoords.lng == null) {
      setIsMapModalVisible(false);
      return;
    }

    // ✨ SERVICE BOUNDARY CHECK
    const distToHub = calculateDistanceKm(
      adminCenter.lat,
      adminCenter.lng,
      tempPinCoords.lat,
      tempPinCoords.lng
    );

    if (distToHub > maxRadiusKm) {
      showAlert(
        'Out of Service Range',
        `This location is ${distToHub.toFixed(1)} km away. We only service areas within a ${maxRadiusKm} km radius from our hub. Please move the pin closer.`,
        'warning'
      );
      return; // Do not close modal or confirm location
    }

    setResolvingPinAddress(true);
    try {
      setUserLocation(tempPinCoords);
      await fetchReadableAddress(tempPinCoords.lat, tempPinCoords.lng);
    } finally {
      setResolvingPinAddress(false);
      setIsMapModalVisible(false);
    }
  };

  const handleSaveLiveLocation = async () => {
    if (!userLocation) {
      showAlert('GPS Error', 'Please wait for your location to load on the map or tap "Open Map & Pin Location".', 'warning');
      return;
    }

    // ✨ SERVICE BOUNDARY CHECK ON SAVE AS WELL
    const distToHub = calculateDistanceKm(
      adminCenter.lat,
      adminCenter.lng,
      userLocation.lat,
      userLocation.lng
    );

    if (distToHub > maxRadiusKm) {
      showAlert(
        'Out of Service Range',
        `Sorry! Your location is ${distToHub.toFixed(1)} km away. We only deliver within a ${maxRadiusKm} km radius from our hub.`,
        'warning'
      );
      return;
    }

    if (!streetDetails.trim()) {
      showAlert('Required Field', 'Please fill up your street name, house number, or building details before saving.', 'warning');
      return;
    }

    try {
      setSubmitting(true);
      let currentUserId = user?.id;
      if (!currentUserId) {
        const { data: { session } } = await supabase.auth.getSession();
        currentUserId = session?.user?.id;
      }

      if (!currentUserId) {
        showAlert('Session Error', 'Please log out and log back in.', 'error');
        setSubmitting(false);
        return;
      }

      const trimmedStreet = streetDetails.trim();

      const { error } = await supabase
        .from('profiles')
        .update({
          current_lat: userLocation.lat,
          current_lng: userLocation.lng,
          address_details: trimmedStreet,
        })
        .eq('id', currentUserId);

      if (error) throw error;

      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      const baseArea = await fetchReadableAddress(userLocation.lat, userLocation.lng);
      const finalAddress = `${trimmedStreet}, ${baseArea}`;

      setSavedLocation({
        id: 'profile_loc',
        label: 'Saved Location',
        address: finalAddress,
        lat: userLocation.lat,
        lng: userLocation.lng,
        icon: 'location',
      });

      showAlert('Success', 'Location saved to your profile!', 'success');
    } catch (err) {
      showAlert('Error', err.message || 'Could not update your location.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    showAlert(
      'Clear Location',
      'Remove your saved profile coordinates?',
      'warning',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => hideAlert() },
        { 
          text: 'Clear', 
          primary: true,
          onPress: async () => {
            hideAlert();
            try {
              let currentUserId = user?.id;
              if (!currentUserId) {
                const { data: { session } } = await supabase.auth.getSession();
                currentUserId = session?.user?.id;
              }

              const { error } = await supabase
                .from('profiles')
                .update({ current_lat: null, current_lng: null, address_details: null })
                .eq('id', currentUserId);

              if (error) throw error;

              setSavedLocation(null);
              setUserLocation(null);
              setStreetDetails('');
              startLiveTracking();
            } catch (err) {
              showAlert('Error', 'Could not clear location.', 'error');
            }
          } 
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#047857', '#059669', '#34D399', '#F9FAFB']} locations={[0, 0.15, 0.35, 1]} style={StyleSheet.absoluteFillObject} />
      
      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchProfileLocation(); }} tintColor="#FFFFFF" />}
      >
        <View style={styles.headerContainer}>
          {/* ✨ Row Container for Back Button & Title */}
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn} activeOpacity={0.8}>
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.pageTitle}>Saved Places</Text>
          </View>
          <Text style={styles.pageSubtitle}>Manage your delivery pickup and destination point</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.headerRow}>
            <View style={styles.titleWithIcon}>
              <View style={styles.titleIconBox}>
                <Ionicons name="map-outline" size={16} color="#059669" />
              </View>
              <Text style={styles.sectionHeader}>Set Location</Text>
            </View>
            <TouchableOpacity onPress={startLiveTracking} style={styles.liveGpsBtn} activeOpacity={0.8}>
              <Ionicons name="navigate-circle" size={16} color="#059669" />
              <Text style={styles.liveGpsText}>Fetch GPS</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formSubText}>
            {savedLocation 
              ? 'Your location is saved. Tap "Open Map & Pin Location" below to adjust your precise pin.'
              : 'Pin your exact position on the map and complete details below.'}
          </Text>
          
          {/* Live Map Preview with Floating Pin Button */}
          <View style={styles.mapWrapper}>
            <OsmMap
              center={userLocation}
              zoom={15}
              markers={
                userLocation
                  ? [{ lat: userLocation.lat, lng: userLocation.lng, label: 'Your Location' }]
                  : []
              }
            />

            <TouchableOpacity
              style={styles.openMapFloatingBtn}
              activeOpacity={0.9}
              onPress={openPinPicker}
            >
              <Ionicons name="map-outline" size={17} color="#FFFFFF" />
              <Text style={styles.openMapFloatingBtnText}>Open Map &amp; Pin Location</Text>
            </TouchableOpacity>

            {mapLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="small" color="#059669" />
                <Text style={styles.loadingText}>Locating...</Text>
              </View>
            )}
          </View>

          <Text style={styles.inputLabel}>Street Name, House No., Building / Unit *</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="home-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Blk 3 Lot 4, Main Street"
              placeholderTextColor="#9CA3AF"
              value={streetDetails}
              onChangeText={setStreetDetails}
            />
          </View>

          <Button 
            title={submitting ? 'Saving Location...' : 'Save Location'} 
            onPress={handleSaveLiveLocation} 
            loading={submitting} 
            disabled={submitting || mapLoading} 
            style={{ marginTop: 12, borderRadius: 14 }} 
          />
        </View>

        <Text style={styles.listTitle}>Your Saved Location</Text>
        {loading ? ( <ActivityIndicator size="large" color="#059669" style={{ marginTop: 24 }} /> ) 
        : !savedLocation ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="compass-outline" size={32} color="#059669" />
            </View>
            <Text style={styles.emptyText}>No saved locations.</Text>
            <Text style={styles.emptySubText}>Fill out street details and tap "Save Location" above to add your spot.</Text>
          </View>
        ) : (
          <View style={styles.addressCard}>
            <View style={styles.iconBox}><Ionicons name={savedLocation.icon || 'location'} size={22} color="#059669" /></View>
            <View style={styles.addressTextBody}>
              <Text style={styles.labelText}>{savedLocation.label}</Text>
              <Text style={styles.addressText}>{savedLocation.address}</Text>
            </View>
            <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* 🌟 FULL SCREEN MAP PICKER MODAL (Center-Pin Pattern) */}
      <Modal
        visible={isMapModalVisible}
        animationType="slide"
        statusBarTranslucent
        hardwareAccelerated
        onRequestClose={() => setIsMapModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <OsmMap
            key={`pin-session-${pinSessionId}`}
            center={tempPinCoords}
            zoom={17}
            markers={[]}
            onRegionChange={setTempPinCoords}
          />

          {/* Fixed center pin overlay */}
          <View style={styles.centerPinWrap} pointerEvents="none">
            <Ionicons name="location" size={40} color="#059669" />
            <View style={styles.centerPinShadow} />
          </View>

          {/* Top Header Floating Bar */}
          <View style={styles.modalHeaderBar} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setIsMapModalVisible(false)}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={22} color="#111827" />
            </TouchableOpacity>
            <View style={styles.modalInstructionBadge}>
              <Text style={styles.modalInstructionText}>📍 Move map to set your exact location</Text>
            </View>
          </View>

          {/* Bottom Confirm Floating Bar */}
          <View style={styles.modalFooterBar} pointerEvents="box-none">
            <TouchableOpacity
              style={[styles.confirmPinBtn, resolvingPinAddress && styles.disabledBtn]}
              activeOpacity={0.85}
              disabled={resolvingPinAddress}
              onPress={confirmPin}
            >
              {resolvingPinAddress ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmPinBtnText}>Confirm Location</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 🌟 MODERNIZED CUSTOM IN-APP ALERT MODAL */}
      <Modal
        visible={alertModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={hideAlert}
      >
        <View style={styles.alertBackdrop}>
          <View style={styles.alertCard}>
            <View style={[
              styles.alertIconContainer,
              alertModal.type === 'error' && styles.alertIconError,
              alertModal.type === 'warning' && styles.alertIconWarning,
              alertModal.type === 'success' && styles.alertIconSuccess,
            ]}>
              <Ionicons
                name={
                  alertModal.type === 'error'
                    ? 'alert-circle'
                    : alertModal.type === 'warning'
                    ? 'warning'
                    : 'checkmark-circle'
                }
                size={32}
                color={
                  alertModal.type === 'error'
                    ? '#DC2626'
                    : alertModal.type === 'warning'
                    ? '#D97706'
                    : '#059669'
                }
              />
            </View>

            <Text style={styles.alertTitle}>{alertModal.title}</Text>
            <Text style={styles.alertMessage}>{alertModal.message}</Text>

            <View style={styles.alertButtonsRow}>
              {alertModal.buttons.map((btn, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.alertBtn,
                    btn.style === 'cancel' && styles.alertBtnCancel,
                    btn.primary && styles.alertBtnPrimary,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => {
                    hideAlert();
                    if (btn.onPress) btn.onPress();
                  }}
                >
                  <Text style={[
                    styles.alertBtnText,
                    btn.style === 'cancel' && styles.alertBtnTextCancel,
                    btn.primary && styles.alertBtnTextPrimary,
                  ]}>
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  headerContainer: { paddingTop: 48, paddingBottom: 20, paddingHorizontal: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255, 255, 255, 0.22)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  pageTitle: { fontSize: 28, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 13, color: '#D1FAE5', marginTop: 8, fontWeight: '500' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  
  formCard: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 24, 
    padding: 20, 
    marginBottom: 24, 
    elevation: 6, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 6 }, 
    shadowOpacity: 0.08, 
    shadowRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)'
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  titleWithIcon: { flexDirection: 'row', alignItems: 'center' },
  titleIconBox: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  sectionHeader: { fontSize: 17, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  
  liveGpsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#A7F3D0' },
  liveGpsText: { fontSize: 12, fontWeight: '700', color: '#059669', marginLeft: 4 },
  
  formSubText: { fontSize: 13, color: '#6B7280', marginBottom: 12, lineHeight: 18, fontWeight: '500' },

  mapWrapper: { height: 200, borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F3F4F6', position: 'relative', marginBottom: 16 },
  openMapFloatingBtn: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    gap: 6,
  },
  openMapFloatingBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  loadingOverlay: { position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  loadingText: { marginLeft: 6, fontSize: 11, color: '#059669', fontWeight: '700' },
  
  inputLabel: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginBottom: 6, marginLeft: 2 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 14, height: 50, marginBottom: 16 },
  inputIcon: { marginRight: 10 },
  textInput: { flex: 1, fontSize: 14, color: '#111827', fontWeight: '500', height: '100%' },
  
  listTitle: { fontSize: 17, fontWeight: '800', color: '#064E3B', marginBottom: 14, letterSpacing: -0.3 },
  
  addressCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 12, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  iconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  addressTextBody: { flex: 1, paddingRight: 8 },
  labelText: { fontWeight: '800', fontSize: 14.5, color: '#111827', marginBottom: 3 },
  addressText: { fontSize: 12.5, color: '#6B7280', fontWeight: '500', lineHeight: 16 },
  deleteBtn: { width: 38, height: 38, backgroundColor: '#FEF2F2', borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FEE2E2' },
  
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 20, alignItems: 'center', padding: 32, borderWidth: 1, borderColor: '#E5E7EB', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6 },
  emptyIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#A7F3D0' },
  emptyText: { fontSize: 16, fontWeight: '800', color: '#374151', marginBottom: 6 },
  emptySubText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 18, fontWeight: '500' },

  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  centerPinWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -40,
    alignItems: 'center',
    zIndex: 50,
  },
  centerPinShadow: {
    width: 10,
    height: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.35)',
    marginTop: -2,
  },
  modalHeaderBar: {
    position: 'absolute',
    top: 52,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  modalCloseBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  modalInstructionBadge: {
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    elevation: 4,
  },
  modalInstructionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalFooterBar: {
    position: 'absolute',
    bottom: 42,
    left: 24,
    right: 24,
    zIndex: 100,
  },
  confirmPinBtn: {
    backgroundColor: '#059669',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  confirmPinBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  disabledBtn: {
    opacity: 0.5,
  },

  // Modern Alert Modal Styles
  alertBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 24,
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
  },
  alertIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  alertIconSuccess: { backgroundColor: '#ECFDF5' },
  alertIconError: { backgroundColor: '#FEE2E2' },
  alertIconWarning: { backgroundColor: '#FEF3C7' },
  alertTitle: { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 8 },
  alertMessage: { fontSize: 13.5, color: '#4B5563', textAlign: 'center', lineHeight: 20, marginBottom: 22 },
  alertButtonsRow: { flexDirection: 'row', gap: 10, width: '100%' },
  alertBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  alertBtnCancel: { backgroundColor: '#F3F4F6' },
  alertBtnPrimary: { backgroundColor: '#059669' },
  alertBtnText: { fontSize: 13.5, fontWeight: '700', color: '#374151', textAlign: 'center' },
  alertBtnTextCancel: { color: '#4B5563', textAlign: 'center' },
  alertBtnTextPrimary: { color: '#FFFFFF', textAlign: 'center' },
});