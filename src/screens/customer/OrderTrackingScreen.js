import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import OsmMap from '../../components/OsmMap'; 
import { getRouteAndEta } from '../../services/etaService';

export default function OrderTrackingScreen({ route, navigation }) {
  const { user } = useAuth();
  const { deliveryId } = route.params || {};
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [loading, setLoading] = useState(true);

  // Real-time state variables
  const [driverLocation, setDriverLocation] = useState(null);
  const [liveEta, setLiveEta] = useState(0);
  
  // 🌟 NEW: Route Coordinates State
  const [routeCoordinates, setRouteCoordinates] = useState([]);

  useEffect(() => { 
    fetchActiveDelivery(); 
  }, [user?.id, deliveryId]);

  const fetchActiveDelivery = async () => {
    try {
      let currentUserId = user?.id;

      // Fallback: If context is slow, fetch the auth session directly
      if (!currentUserId) {
        const { data: sessionData } = await supabase.auth.getSession();
        currentUserId = sessionData?.session?.user?.id;
      }

      if (!currentUserId) {
        console.log('Track Debug: No user ID available even after session check');
        setLoading(false);
        return;
      }

      let data = null;
      let error = null;

      if (deliveryId) {
        // 1. Try finding by delivery_requests.id
        const res1 = await supabase
          .from('delivery_requests')
          .select('*, driver:driver_id(*)')
          .eq('id', deliveryId)
          .maybeSingle();

        if (res1.data) {
          data = res1.data;
        } else {
          // 2. If not found, look up via order_id (Store Orders)
          const res2 = await supabase
            .from('delivery_requests')
            .select('*, driver:driver_id(*)')
            .eq('order_id', deliveryId)
            .maybeSingle();
          data = res2.data;
          error = res2.error;
        }
      } else {
        // Fallback to the latest active order
        const res3 = await supabase
          .from('delivery_requests')
          .select('*, driver:driver_id(*)')
          .eq('customer_id', currentUserId)
          .in('status', ['accepted', 'preparing', 'ready_for_pickup', 'picked_up', 'in_transit'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        data = res3.data;
        error = res3.error;
      }

      if (error) throw error;
      
      setActiveDelivery(data || null);
      if (data?.eta_minutes) {
        setLiveEta(data.eta_minutes);
      }

      // FETCH INITIAL DRIVER LOCATION
      if (data?.driver_id) {
        const { data: locData, error: locErr } = await supabase
          .from('driver_locations')
          .select('*')
          .eq('driver_id', data.driver_id)
          .order('created_at', { ascending: false })
          .limit(1)                                  
          .maybeSingle();
        
        console.log('Track Debug: Initial Driver Location:', locData, locErr);

        if (locData) {
          const initLat = locData.lat ?? locData.latitude;
          const initLng = locData.lng ?? locData.longitude;
          if (initLat && initLng) {
            setDriverLocation({ lat: initLat, lng: initLng });
          }
        }
      }

    } catch (err) {
      console.error('Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // REAL-TIME SUBSCRIPTIONS
  useEffect(() => {
    if (!activeDelivery?.id) return;

    // Listen for Status & ETA updates
    const deliveryChannel = supabase
      .channel(`delivery_tracking_${activeDelivery.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'delivery_requests', filter: `id=eq.${activeDelivery.id}` },
        (payload) => {
          setActiveDelivery((prev) => ({ ...prev, ...payload.new }));
          if (payload.new.eta_minutes) {
            setLiveEta(payload.new.eta_minutes);
          }
        }
      )
      .subscribe();

    // Listen for Live GPS Location Pings
    let driverChannel = null;
    if (activeDelivery.driver_id) {
      driverChannel = supabase
        .channel(`driver_location_${activeDelivery.driver_id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${activeDelivery.driver_id}` },
          async (payload) => {
            console.log('Track Debug: INCOMING DRIVER PING:', payload.new);

            const lat = payload.new.lat ?? payload.new.latitude;
            const lng = payload.new.lng ?? payload.new.longitude;
            
            if (lat && lng) {
              const newLoc = { lat, lng };
              setDriverLocation(newLoc);

              // Recalculate ETA dynamically based on driver's live location
              if (activeDelivery.dropoff_lat && activeDelivery.dropoff_lng) {
                const { etaMinutes } = await getRouteAndEta(
                  newLoc,
                  { lat: activeDelivery.dropoff_lat, lng: activeDelivery.dropoff_lng }
                );
                if (etaMinutes > 0) setLiveEta(etaMinutes);
              }
            }
          }
        )
        .subscribe();
    }

    return () => {
      supabase.removeChannel(deliveryChannel);
      if (driverChannel) supabase.removeChannel(driverChannel);
    };
  }, [activeDelivery?.id, activeDelivery?.driver_id]);

  // 🌟 FETCH ROUTE LINE (OSRM API)
  useEffect(() => {
    if (!driverLocation?.lat || !driverLocation?.lng || !activeDelivery) return;

    const fetchRouteCoordinates = async () => {
      const statusCheck = (activeDelivery.status || 'accepted').toLowerCase();
      // If picked up or in transit, route to customer. Otherwise, route to pickup location.
      const isHeadingToDropoff = ['picked_up', 'in_transit', 'delivering'].includes(statusCheck);

      const targetLat = isHeadingToDropoff ? activeDelivery.dropoff_lat : activeDelivery.pickup_lat;
      const targetLng = isHeadingToDropoff ? activeDelivery.dropoff_lng : activeDelivery.pickup_lng;

      if (!targetLat || !targetLng) return;

      try {
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${driverLocation.lng},${driverLocation.lat};${targetLng},${targetLat}?geometries=geojson`
        );
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          // Leaflet expects [lat, lng], but OSRM gives [lng, lat], so we flip them
          const mappedCoords = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
          setRouteCoordinates(mappedCoords);
        }
      } catch (error) {
        console.error("Failed to fetch route line:", error);
      }
    };

    fetchRouteCoordinates();
  }, [
    activeDelivery?.status, 
    driverLocation?.lat, 
    driverLocation?.lng, 
    activeDelivery?.pickup_lat, 
    activeDelivery?.pickup_lng, 
    activeDelivery?.dropoff_lat, 
    activeDelivery?.dropoff_lng
  ]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  if (!activeDelivery) {
    return (
      <View style={styles.center}>
        <Ionicons name="receipt-outline" size={64} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>No Active Orders</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map Section (Top Half) */}
      <View style={styles.mapContainer}>
        <OsmMap 
          center={driverLocation || { lat: activeDelivery.dropoff_lat, lng: activeDelivery.dropoff_lng }}
          zoom={15}
          route={routeCoordinates} // 🌟 PASSED THE ROUTE HERE
          markers={[
            { 
              lat: activeDelivery.pickup_lat, 
              lng: activeDelivery.pickup_lng, 
              label: 'Pickup',
              color: '#059669' 
            },
            { 
              lat: activeDelivery.dropoff_lat, 
              lng: activeDelivery.dropoff_lng, 
              label: 'Drop-off',
              color: '#EF4444' 
            },
            (driverLocation || activeDelivery?.driver_id) ? { 
              lat: driverLocation?.lat || activeDelivery.pickup_lat, 
              lng: driverLocation?.lng || activeDelivery.pickup_lng, 
              label: driverLocation ? 'Driver' : 'Driver (Starting)',
              color: '#2563EB' 
            } : null
          ].filter(Boolean)} 
        />
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      {/* Details Bottom Sheet (Bottom Half) */}
      <View style={styles.bottomSheet}>
        <View style={styles.handleBar} />
        
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.etaText}>
              {liveEta > 0 ? `Arriving in ~${liveEta} mins` : 'Calculating ETA...'}
            </Text>
            <Text style={styles.statusText}>
              {(activeDelivery.status || '').replace(/_/g, ' ').toUpperCase()}
            </Text>
          </View>
          <Text style={styles.feeText}>₱{activeDelivery.delivery_fee}</Text>
        </View>

        <View style={styles.divider} />

        {/* Driver Row */}
        {activeDelivery.driver ? (
          <View style={styles.driverRow}>
            <View style={styles.driverAvatar}>
              <Ionicons name="person" size={24} color="#059669" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.driverName}>{activeDelivery.driver.full_name}</Text>
              <Text style={styles.driverPlate}>Delivery Rider</Text>
            </View>
            <TouchableOpacity 
              style={styles.callBtn} 
              onPress={() => Linking.openURL(`tel:${activeDelivery.driver.phone}`)}
            >
              <Ionicons name="call" size={20} color="#059669" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.findingRiderRow}>
            <ActivityIndicator size="small" color="#059669" />
            <Text style={styles.findingText}>Finding a rider near you...</Text>
          </View>
        )}

        <View style={styles.divider} />

        {/* Dropoff Address */}
        <View style={styles.addressRow}>
          <Ionicons name="location" size={24} color="#EF4444" />
          <View style={styles.addressTextWrap}>
            <Text style={styles.addressLabel}>Drop-off Location</Text>
            <Text style={styles.addressValue} numberOfLines={2}>
              {activeDelivery.dropoff_address || activeDelivery.delivery_address || 'Customer Location'}
            </Text>
          </View>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#9CA3AF', marginTop: 16 },
  mapContainer: { flex: 1, backgroundColor: '#E5E7EB' },
  backBtn: { position: 'absolute', top: 50, left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 4 },
  bottomSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, elevation: 16, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12 },
  handleBar: { width: 40, height: 5, backgroundColor: '#D1D5DB', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  etaText: { fontSize: 20, fontWeight: '800', color: '#111827' },
  statusText: { fontSize: 13, color: '#059669', fontWeight: '700', marginTop: 4 },
  feeText: { fontSize: 18, fontWeight: '800', color: '#111827' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 16 },
  driverRow: { flexDirection: 'row', alignItems: 'center' },
  driverAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  driverName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  driverPlate: { fontSize: 13, color: '#6B7280', marginTop: 2, fontWeight: '500' },
  callBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  findingRiderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  findingText: { marginLeft: 12, fontSize: 15, color: '#4B5563', fontWeight: '600' },
  addressRow: { flexDirection: 'row', alignItems: 'center' },
  addressTextWrap: { marginLeft: 12, flex: 1 },
  addressLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase' },
  addressValue: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 2 },
});