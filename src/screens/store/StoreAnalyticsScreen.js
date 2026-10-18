import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';

export default function StoreAnalyticsScreen() {
  const { profile, user } = useAuth();
  const userId = profile?.id || user?.id;

  const [timeframe, setTimeframe] = useState('This Week');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Real dynamic states
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalOrdersCount, setTotalOrdersCount] = useState(0);
  const [codRevenue, setCodRevenue] = useState(0);
  const [onlineRevenue, setOnlineRevenue] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);

  const fetchAnalytics = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);

      // 1. Find the store owned by this user
      const { data: storeData } = await supabase
        .from('stores')
        .select('id')
        .eq('owner_id', userId)
        .maybeSingle();

      const storeId = storeData?.id;
      if (!storeId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // 2. Fetch all completed, paid, or cancelled orders for this store
      // ✨ FIX: Added 'cancelled' to the query so we can evaluate customer faults
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('store_id', storeId)
        .in('status', ['completed', 'delivered', 'paid', 'pending', 'cancelled']);

      if (error) throw error;

      const safeOrders = orders || [];

      // 3. Filter orders based on the selected timeframe & cancellation logic
      const now = new Date();
      const filteredOrders = safeOrders.filter((ord) => {
        const orderDate = new Date(ord.created_at);
        let isWithinTimeframe = true;

        if (timeframe === 'This Week') {
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(now.getDate() - 7);
          isWithinTimeframe = orderDate >= oneWeekAgo;
        } else if (timeframe === 'This Month') {
          isWithinTimeframe = (
            orderDate.getMonth() === now.getMonth() &&
            orderDate.getFullYear() === now.getFullYear()
          );
        }

        if (!isWithinTimeframe) return false;

        // ✨ FIX: If cancelled, ONLY include if it was a customer issue (Prank / No-Show)
        if (ord.status === 'cancelled') {
          const reasonStr = String(ord.cancellation_reason || ord.cancel_reason || ord.notes || '').toLowerCase();
          const isCustomerFault = 
            reasonStr.includes('unavailable') || 
            reasonStr.includes('prank') || 
            reasonStr.includes('refuse') || 
            reasonStr.includes('refused');

          if (!isCustomerFault) return false; // Exclude standard store/rider cancellations
        }

        return true;
      });

      // 4. Compute Total Revenue, Orders, and Payment Method Breakdown
      let rev = 0;
      let codSum = 0;
      let onlineSum = 0;

      filteredOrders.forEach((ord) => {
        const amount = Number(ord.subtotal || ord.total_amount || 0);
        rev += amount;
        
        const isCancelledCustomerFault = ord.status === 'cancelled';

        // ✨ FIX: If a COD order is cancelled due to prank/no-show, the platform pays the store digitally.
        // Therefore, it should NOT count as physical COD cash, but rather as Online/Platform Revenue.
        if (ord.payment_method === 'cod' && !isCancelledCustomerFault) {
          codSum += amount;
        } else {
          onlineSum += amount; // Online / GCash / Card OR Merchant Guarantee platform payout
        }
      });

      setTotalRevenue(rev);
      setTotalOrdersCount(filteredOrders.length);
      setCodRevenue(codSum);
      setOnlineRevenue(onlineSum);

      // 5. Aggregate Top Selling Products
      const productMap = {};
      filteredOrders.forEach((ord) => {
        let items = ord.items;
        if (typeof items === 'string') {
          try { items = JSON.parse(items); } catch (e) { items = []; }
        }
        if (Array.isArray(items)) {
          items.forEach((prod) => {
            const name = prod.name || prod.title || 'Item';
            const qty = Number(prod.quantity || 1);
            const price = Number(prod.price || 0);

            if (!productMap[name]) {
              productMap[name] = { units: 0, revenue: 0 };
            }
            productMap[name].units += qty;
            productMap[name].revenue += price * qty;
          });
        }
      });

      const sortedProducts = Object.keys(productMap)
        .map((name) => ({
          name,
          units: productMap[name].units,
          revenue: `₱${productMap[name].revenue.toFixed(2)}`,
        }))
        .sort((a, b) => b.units - a.units)
        .slice(0, 3);

      setTopProducts(sortedProducts);

      // 6. Build Dynamic Chart Data
      if (timeframe === 'This Week') {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const dayMap = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };

        filteredOrders.forEach((ord) => {
          const d = new Date(ord.created_at);
          let dayIndex = d.getDay();
          dayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
          const dayName = days[dayIndex];
          if (dayMap[dayName] !== undefined) {
            dayMap[dayName] += Number(ord.subtotal || ord.total_amount || 0);
          }
        });

        setChartData(days.map((day) => ({ day, revenue: dayMap[day] })));
      } else {
        const weeks = ['W1', 'W2', 'W3', 'W4'];
        const weekMap = { W1: 0, W2: 0, W3: 0, W4: 0 };

        filteredOrders.forEach((ord) => {
          const d = new Date(ord.created_at);
          const dayNum = d.getDate();
          if (dayNum <= 7) weekMap.W1 += Number(ord.subtotal || ord.total_amount || 0);
          else if (dayNum <= 14) weekMap.W2 += Number(ord.subtotal || ord.total_amount || 0);
          else if (dayNum <= 21) weekMap.W3 += Number(ord.subtotal || ord.total_amount || 0);
          else weekMap.W4 += Number(ord.subtotal || ord.total_amount || 0);
        });

        setChartData(weeks.map((week) => ({ day: week, revenue: weekMap[week] })));
      }

    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, timeframe]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const maxRevenue = chartData.length > 0 ? Math.max(...chartData.map((d) => d.revenue), 1) : 1;

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Loading store performance...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sales Analytics</Text>
        <Text style={styles.headerSub}>Real-time performance & financial insights</Text>
      </View>

      <ScrollView 
        contentContainerStyle={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={() => { setRefreshing(true); fetchAnalytics(); }} 
            colors={['#059669']} 
          />
        }
      >
        {/* Timeframe Filter Buttons */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {['This Week', 'This Month', 'Overall'].map((tf) => (
            <TouchableOpacity
              key={tf}
              style={[styles.filterBtn, timeframe === tf && styles.activeFilterBtn]}
              onPress={() => setTimeframe(tf)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterText, timeframe === tf && styles.activeFilterText]}>
                {tf}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Overview Stats Cards Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.iconBox, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="wallet-outline" size={18} color="#059669" />
            </View>
            <Text style={styles.statLabel}>Total Revenue</Text>
            <Text style={styles.statValue}>₱{totalRevenue.toFixed(2)}</Text>
            <View style={styles.trendRow}>
              <Ionicons name="trending-up" size={12} color="#059669" />
              <Text style={styles.statTrend}>Live database metrics</Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.iconBox, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="cart-outline" size={18} color="#2563EB" />
            </View>
            <Text style={styles.statLabel}>Total Orders</Text>
            <Text style={styles.statValue}>{totalOrdersCount}</Text>
            <View style={styles.trendRow}>
              <Ionicons name="trending-up" size={12} color="#059669" />
              <Text style={styles.statTrend}>Successfully processed</Text>
            </View>
          </View>
        </View>

        {/* Payment Method Breakdown Card */}
        <View style={styles.paymentSplitCard}>
          <Text style={styles.sectionTitle}>Earnings by Payment Method</Text>
          <Text style={styles.sectionSub}>Breakdown of COD vs Online collections</Text>

          <View style={styles.splitRow}>
            <View style={[styles.splitBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Ionicons name="cash-outline" size={16} color="#D97706" style={{ marginRight: 4 }} />
                <Text style={[styles.splitLabel, { color: '#B45309' }]}>Cash on Delivery</Text>
              </View>
              <Text style={styles.splitAmount}>₱{codRevenue.toFixed(2)}</Text>
              <Text style={styles.splitSub}>Collected physically by riders</Text>
            </View>

            <View style={[styles.splitBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Ionicons name="card-outline" size={16} color="#2563EB" style={{ marginRight: 4 }} />
                <Text style={[styles.splitLabel, { color: '#1D4ED8' }]}>Online Payment</Text>
              </View>
              <Text style={styles.splitAmount}>₱{onlineRevenue.toFixed(2)}</Text>
              <Text style={styles.splitSub}>Held digitally by platform</Text>
            </View>
          </View>
        </View>

        {/* Revenue Graph Card */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartTitle}>Revenue Trend</Text>
              <Text style={styles.chartSub}>Breakdown by active period</Text>
            </View>
            <View style={styles.chartBadge}>
              <Ionicons name="bar-chart-outline" size={14} color="#059669" />
              <Text style={styles.chartBadgeText}>Revenue (₱)</Text>
            </View>
          </View>

          {/* Bar Chart Visual */}
          <View style={styles.chartContainer}>
            {chartData.map((item, index) => {
              const barHeightPercent = Math.max((item.revenue / maxRevenue) * 100, 8);
              const isPeak = item.revenue === maxRevenue && item.revenue > 0;

              return (
                <View key={index} style={styles.barGroup}>
                  <Text style={[styles.barTooltip, isPeak && styles.peakTooltip]}>
                    ₱{item.revenue >= 1000 ? `${(item.revenue / 1000).toFixed(1)}k` : item.revenue}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: `${barHeightPercent}%` },
                        isPeak && styles.peakBarFill,
                      ]}
                    />
                  </View>
                  <Text style={[styles.dayLabel, isPeak && styles.peakDayLabel]}>{item.day}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Top Selling Products List */}
        <View style={styles.topSection}>
          <View style={styles.topSectionHeader}>
            <Text style={styles.sectionTitle}>Top Selling Items</Text>
            <Text style={styles.sectionSub}>By actual order volume</Text>
          </View>

          {topProducts.length === 0 ? (
            <View style={styles.emptyProducts}>
              <Text style={styles.emptyText}>No sales recorded for this period yet.</Text>
            </View>
          ) : (
            topProducts.map((prod, idx) => {
              const isLast = idx === topProducts.length - 1;
              return (
                <View key={idx} style={[styles.productRow, isLast && styles.noBorder]}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>#{idx + 1}</Text>
                  </View>

                  <View style={styles.productDetails}>
                    <Text style={styles.productName} numberOfLines={1}>
                      {prod.name}
                    </Text>
                    <Text style={styles.productUnits}>{prod.units} units sold</Text>
                  </View>

                  <Text style={styles.productRevenue}>{prod.revenue}</Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#6B7280', fontWeight: '600' },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 20) + 8 : 12,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  content: { padding: 16, paddingBottom: 32 },

  filterRow: { flexDirection: 'row', marginBottom: 16 },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    marginRight: 8,
  },
  activeFilterBtn: { backgroundColor: '#059669' },
  filterText: { fontSize: 12, fontWeight: '700', color: '#4B5563' },
  activeFilterText: { color: '#FFFFFF' },

  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  statValue: { fontSize: 18, fontWeight: '800', color: '#111827', marginVertical: 2 },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statTrend: { fontSize: 10, fontWeight: '700', color: '#059669', marginLeft: 3 },

  paymentSplitCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  splitRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  splitBox: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  splitLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  splitAmount: { fontSize: 16, fontWeight: '800', color: '#111827', marginVertical: 2 },
  splitSub: { fontSize: 9, color: '#6B7280', fontWeight: '600' },

  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  chartSub: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  chartBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  chartBadgeText: { fontSize: 11, fontWeight: '700', color: '#059669', marginLeft: 4 },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 160,
    paddingTop: 24,
  },
  barGroup: { alignItems: 'center', flex: 1 },
  barTooltip: { fontSize: 9, color: '#9CA3AF', fontWeight: '700', marginBottom: 4 },
  peakTooltip: { color: '#059669', fontWeight: '800' },
  barTrack: {
    width: 14,
    height: 110,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { width: '100%', backgroundColor: '#A7F3D0', borderRadius: 8 },
  peakBarFill: { backgroundColor: '#059669' },
  dayLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', marginTop: 6 },
  peakDayLabel: { color: '#059669', fontWeight: '800' },

  topSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  topSectionHeader: { marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  sectionSub: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  emptyProducts: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: 12, color: '#6B7280' },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  noBorder: { borderBottomWidth: 0, paddingBottom: 2 },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 12, fontWeight: '800', color: '#059669' },
  productDetails: { flex: 1, marginLeft: 10, marginRight: 8 },
  productName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  productUnits: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  productRevenue: { fontSize: 13, fontWeight: '800', color: '#059669' },
});