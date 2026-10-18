import { supabase } from '../config/supabase';

// ---- Customer Actions -------------------------------------------------

export const createCustomDeliveryRequest = async ({
  customerId,
  description,
  pickup,
  dropoff = null,
  distanceKm = 0,
  etaMinutes = 0,
  deliveryFee = 0,
}) => {
  try {
    const { data, error } = await supabase
      .from('delivery_requests')
      .insert({
        customer_id: customerId,
        request_type: 'custom',
        item_description: description,
        pickup_address: pickup?.address || 'Pickup Location',
        pickup_lat: pickup?.lat || null,
        pickup_lng: pickup?.lng || null,
        dropoff_address: dropoff?.address || null,
        dropoff_lat: dropoff?.lat || null,
        dropoff_lng: dropoff?.lng || null,
        distance_km: distanceKm,
        eta_minutes: etaMinutes,
        delivery_fee: deliveryFee,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating delivery_request:', error.message);
    return { data: null, error };
  }
};

export async function createStoreOrder({
  customerId,
  storeId,
  items,
  pickup,
  dropoff,
  distanceKm,
  etaMinutes,
  deliveryFee,
  itemsTotal,
}) {
  try {
    const { data, error } = await supabase
      .from('delivery_requests')
      .insert({
        customer_id: customerId,
        store_id: storeId,
        request_type: 'store_order',
        items,
        pickup_address: pickup?.address,
        pickup_lat: pickup?.lat,
        pickup_lng: pickup?.lng,
        dropoff_address: dropoff?.address,
        dropoff_lat: dropoff?.lat,
        dropoff_lng: dropoff?.lng,
        distance_km: distanceKm,
        eta_minutes: etaMinutes,
        delivery_fee: deliveryFee,
        total_amount: itemsTotal + deliveryFee,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating store order:', error.message);
    return { data: null, error };
  }
}

// ---- Driver Actions -----------------------------------------------------

export async function getAvailableJobs() {
  try {
    const { data, error } = await supabase
      .from('delivery_requests')
      .select('*')
      .is('driver_id', null)
      .in('status', ['pending', 'accepted', 'preparing', 'ready_for_pickup'])
      .order('created_at', { ascending: true });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching available jobs:', error.message);
    return { data: [], error };
  }
}

export async function acceptDelivery(deliveryId, driverId) {
  const { data, error } = await supabase
    .from('delivery_requests')
    .update({ 
      driver_id: driverId, 
      status: 'accepted' 
    })
    .eq('id', deliveryId)
    .is('driver_id', null)
    .select();

  if (error) {
    return { data: null, error };
  }

  if (!data || data.length === 0) {
    return { 
      data: null, 
      error: { message: 'This job was already accepted by another driver.' } 
    };
  }

  return { data: data[0], error: null };
}

export async function updateDeliveryStatus(deliveryId, status) {
  try {
    const timestampField = {
      picked_up: 'picked_up_at',
      completed: 'delivered_at',
      delivered: 'delivered_at',
    }[status];

    const payload = { status };
    if (timestampField) payload[timestampField] = new Date().toISOString();

    const { data, error } = await supabase
      .from('delivery_requests')
      .update(payload)
      .eq('id', deliveryId)
      .select();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating delivery status:', error.message);
    return { data: null, error };
  }
}

export async function pingDriverLocation(driverIdOrObj, lat, lng, heading, deliveryId) {
  try {
    let driver_id, location_lat, location_lng, loc_heading, loc_delivery_id;

    if (typeof driverIdOrObj === 'object' && driverIdOrObj !== null) {
      driver_id = driverIdOrObj.driverId;
      loc_delivery_id = driverIdOrObj.deliveryId;
      location_lat = driverIdOrObj.lat;
      location_lng = driverIdOrObj.lng;
      loc_heading = driverIdOrObj.heading;
    } else {
      driver_id = driverIdOrObj;
      location_lat = lat;
      location_lng = lng;
      loc_heading = heading;
      loc_delivery_id = deliveryId;
    }

    const payload = {
      driver_id,
      lat: location_lat,
      lng: location_lng,
    };

    if (loc_delivery_id) payload.delivery_id = loc_delivery_id;
    if (loc_heading) payload.heading = loc_heading;

    // 👈 Switched back to .insert() since driver_locations is a historical log table
    const { data, error } = await supabase
      .from('driver_locations')
      .insert(payload);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    // ✨ FIX: Changed from console.error to console.warn
    // This prevents the Red Screen from popping up when the rider goes through a tunnel or dead zone.
    console.warn('Silent ping fail (rider offline or weak signal):', error.message);
    return { data: null, error };
  }
}

export async function getDriverActiveDeliveries(driverId) {
  try {
    const { data, error } = await supabase
      .from('delivery_requests')
      .select('*')
      .eq('driver_id', driverId)
      .in('status', ['accepted', 'preparing', 'picking_up', 'picked_up', 'in_transit'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching driver active deliveries:', error.message);
    return { data: [], error };
  }
}

// ---- Store Owner Actions -------------------------------------------------

export async function getStoreOrders(storeId) {
  try {
    const { data, error } = await supabase
      .from('delivery_requests')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching store orders:', error.message);
    return { data: [], error };
  }
}

// ---- Realtime Subscriptions ----------------------------------------------

export function subscribeToDelivery(deliveryId, onChange) {
  const channel = supabase
    .channel(`delivery-${deliveryId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'delivery_requests', filter: `id=eq.${deliveryId}` },
      (payload) => onChange(payload.new)
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'driver_locations', filter: `delivery_id=eq.${deliveryId}` },
      (payload) => onChange(null, payload.new)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToNewJobs(onNewJob) {
  const channel = supabase
    .channel('available-jobs-channel')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'delivery_requests', filter: 'status=eq.pending' },
      (payload) => {
        if (!payload.new.driver_id) onNewJob(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'delivery_requests', filter: 'status=eq.accepted' },
      (payload) => {
        if (!payload.new.driver_id && payload.new.request_type === 'store_order') {
          onNewJob(payload.new);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}