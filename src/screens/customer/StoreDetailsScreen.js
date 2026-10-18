import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  TextInput,
  ScrollView,
  Image,
  Platform,
  Animated,
  Pressable,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../config/supabase';

const GREEN = '#059669';
const DARK_GREEN = '#047857';
const DEEP_GREEN = '#065F46';
const LIGHT_GREEN = '#ECFDF5';
const BACKGROUND = '#F7F9F8';

function StoreCardAnimated({
  item,
  index,
  navigation,
}) {
  const translateY = useRef(
    new Animated.Value(24)
  ).current;

  const opacity = useRef(
    new Animated.Value(0)
  ).current;

  const scale = useRef(
    new Animated.Value(0.98)
  ).current;

  const pressScale = useRef(
    new Animated.Value(1)
  ).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        delay: Math.min(index * 70, 420),
        useNativeDriver: true,
      }),

      Animated.spring(translateY, {
        toValue: 0,
        delay: Math.min(index * 70, 420),
        friction: 8,
        tension: 65,
        useNativeDriver: true,
      }),

      Animated.spring(scale, {
        toValue: 1,
        delay: Math.min(index * 70, 420),
        friction: 8,
        tension: 70,
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    return () => {
      animation.stop();
    };
  }, [
    index,
    opacity,
    scale,
    translateY,
  ]);

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.985,
      friction: 7,
      tension: 120,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      friction: 7,
      tension: 120,
      useNativeDriver: true,
    }).start();
  };

  const isOpen = item.is_open ?? true;

  const storeImage =
    item.image_pic ||
    item.image_url ||
    item.store_image ||
    item.banner_url;

  return (
    <Animated.View
      style={[
        styles.animatedCardWrapper,
        {
          opacity,
          transform: [
            { translateY },
            {
              scale: Animated.multiply(
                scale,
                pressScale
              ),
            },
          ],
        },
      ]}
    >
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() =>
          navigation.navigate(
            'StoreMenuScreen',
            {
              storeId: item.id,
              storeName:
                item.name ||
                'Store Partner',
            }
          )
        }
        style={({ pressed }) => [
          styles.storeCard,
          pressed &&
            styles.storeCardPressed,
        ]}
      >
        {/* IMAGE */}
        <View style={styles.imageContainer}>
          {storeImage ? (
            <Image
              source={{ uri: storeImage }}
              style={styles.storeImage}
            />
          ) : (
            <LinearGradient
              colors={[
                '#ECFDF5',
                '#D1FAE5',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.imagePlaceholder}
            >
              <View
                style={
                  styles.placeholderIconCircle
                }
              >
                <Ionicons
                  name="storefront-outline"
                  size={31}
                  color={GREEN}
                />
              </View>

              <Text
                style={
                  styles.placeholderText
                }
              >
                Store Partner
              </Text>
            </LinearGradient>
          )}

          {/* IMAGE OVERLAY */}
          <LinearGradient
            colors={[
              'rgba(0,0,0,0)',
              'rgba(0,0,0,0.03)',
              'rgba(0,0,0,0.55)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={
              StyleSheet.absoluteFillObject
            }
          />

          {/* TOP STATUS */}
          <View
            style={[
              styles.statusBadgeOverlay,
              {
                backgroundColor: isOpen
                  ? '#047857'
                  : '#374151',
              },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isOpen
                    ? '#A7F3D0'
                    : '#D1D5DB',
                },
              ]}
            />

            <Text
              style={styles.statusOverlayText}
            >
              {isOpen
                ? 'OPEN NOW'
                : 'CLOSED'}
            </Text>
          </View>

          {/* IMAGE BOTTOM LABEL */}
          <View style={styles.imageBottomRow}>
            <View
              style={styles.imageLocationBadge}
            >
              <Ionicons
                name="location-outline"
                size={12}
                color="#FFFFFF"
              />

              <Text
                style={styles.imageLocationText}
                numberOfLines={1}
              >
                Binalbagan
              </Text>
            </View>
          </View>
        </View>

        {/* DETAILS */}
        <View style={styles.storeDetails}>
          <View style={styles.storeNameRow}>
            <Text
              style={styles.storeName}
              numberOfLines={2}
            >
              {item.name ||
                'Store Partner'}
            </Text>

            <View style={styles.cardArrow}>
              <Ionicons
                name="chevron-forward"
                size={17}
                color={GREEN}
              />
            </View>
          </View>

          <View style={styles.storeAddressRow}>
            <Ionicons
              name="location-outline"
              size={15}
              color={GREEN}
              style={styles.addressIcon}
            />

            <Text
              style={styles.storeAddress}
              numberOfLines={2}
            >
              {item.address ||
                'Binalbagan, Negros Occidental'}
            </Text>
          </View>

          {/* VIEW STORE */}
          <View style={styles.viewStoreRow}>
            <Text style={styles.viewStoreText}>
              View products and services
            </Text>

            <View
              style={styles.viewStoreArrow}
            >
              <Ionicons
                name="arrow-forward"
                size={14}
                color="#FFFFFF"
              />
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function AnimatedFilterChip({
  filter,
  selected,
  onPress,
}) {
  const scale = useRef(
    new Animated.Value(1)
  ).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      friction: 7,
      tension: 120,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 7,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={{
        transform: [{ scale }],
      }}
    >
      <TouchableOpacity
        style={[
          styles.filterChip,
          selected &&
            styles.activeFilterChip,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
      >
        {filter === 'All' && (
          <Ionicons
            name="grid-outline"
            size={14}
            color={
              selected
                ? '#FFFFFF'
                : '#6B7280'
            }
          />
        )}

        {filter === 'Open' && (
          <View
            style={[
              styles.filterDot,
              {
                backgroundColor: selected
                  ? '#D1FAE5'
                  : '#10B981',
              },
            ]}
          />
        )}

        {filter === 'Closed' && (
          <View
            style={[
              styles.filterDot,
              {
                backgroundColor: selected
                  ? '#E5E7EB'
                  : '#9CA3AF',
              },
            ]}
          />
        )}

        <Text
          style={[
            styles.filterChipText,
            selected &&
              styles.activeFilterChipText,
          ]}
        >
          {filter}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function StoreDetailsScreen({
  navigation,
}) {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] =
    useState(true);
  const [refreshing, setRefreshing] =
    useState(false);
  const [searchQuery, setSearchQuery] =
    useState('');
  const [selectedFilter, setSelectedFilter] =
    useState('All');

  const searchScale = useRef(
    new Animated.Value(1)
  ).current;

  const headerOpacity = useRef(
    new Animated.Value(0)
  ).current;

  const headerTranslate = useRef(
    new Animated.Value(-12)
  ).current;

  useEffect(() => {
    fetchBinalbaganStores();

    Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),

      Animated.spring(headerTranslate, {
        toValue: 0,
        friction: 8,
        tension: 65,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const fetchBinalbaganStores =
    async () => {
      try {
        setLoading(true);

        const {
          data,
          error,
        } = await supabase
          .from('stores')
          .select('*')
          .order('name', {
            ascending: true,
          });

        if (!error && data) {
          setStores(data);
        }
      } catch (err) {
        console.error(
          'Error loading stores:',
          err.message
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchBinalbaganStores();
  };

  const filteredStores = useMemo(() => {
    const query =
      searchQuery
        .toLowerCase()
        .trim();

    return stores.filter((store) => {
      const matchesSearch =
        !query ||
        (store.name &&
          store.name
            .toLowerCase()
            .includes(query)) ||
        (store.address &&
          store.address
            .toLowerCase()
            .includes(query));

      const isOpen =
        store.is_open ?? true;

      let matchesFilter = true;

      if (selectedFilter === 'Open') {
        matchesFilter =
          isOpen === true;
      } else if (
        selectedFilter === 'Closed'
      ) {
        matchesFilter =
          isOpen === false;
      }

      return (
        matchesSearch &&
        matchesFilter
      );
    });
  }, [
    stores,
    searchQuery,
    selectedFilter,
  ]);

  const filterOptions = [
    'All',
    'Open',
    'Closed',
  ];

  const openCount = stores.filter(
    (store) =>
      store.is_open ?? true
  ).length;

  return (
    <SafeAreaView
      style={styles.container}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={DARK_GREEN}
        translucent={false}
      />

      {/* HEADER */}
      <LinearGradient
        colors={[
          '#087F5B',
          '#059669',
          '#047857',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Animated.View
          style={[
            styles.headerAnimated,
            {
              opacity:
                headerOpacity,
              transform: [
                {
                  translateY:
                    headerTranslate,
                },
              ],
            },
          ]}
        >
          <View style={styles.headerTop}>
            <View
              style={styles.headerIcon}
            >
              <Ionicons
                name="storefront-outline"
                size={24}
                color="#FFFFFF"
              />
            </View>

            <View
              style={styles.headerText}
            >
              <Text
                style={styles.screenTitle}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Partner Stores
              </Text>

              <Text
                style={styles.screenSub}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                Local stores available on Paabot
              </Text>
            </View>
          </View>

          <View
            style={styles.headerBottom}
          >
            <View
              style={styles.headerLocation}
            >
              <Ionicons
                name="location-outline"
                size={15}
                color="#D1FAE5"
              />

              <Text
                style={styles.locationText}
                numberOfLines={1}
              >
                Binalbagan
              </Text>
            </View>

            <View
              style={styles.openCountBadge}
            >
              <View
                style={styles.openCountDot}
              />

              <Text
                style={styles.openCountText}
              >
                {openCount} open
              </Text>
            </View>
          </View>
        </Animated.View>
      </LinearGradient>

      {/* SEARCH + FILTER */}
      <View
        style={styles.searchSection}
      >
        <Animated.View
          style={[
            styles.searchBarWrapper,
            {
              transform: [
                {
                  scale: searchScale,
                },
              ],
            },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={20}
            color={GREEN}
          />

          <TextInput
            style={styles.searchInput}
            placeholder="Search stores or locations"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9CA3AF"
            returnKeyType="search"
            onFocus={() => {
              Animated.spring(
                searchScale,
                {
                  toValue: 1.01,
                  friction: 8,
                  tension: 90,
                  useNativeDriver: true,
                }
              ).start();
            }}
            onBlur={() => {
              Animated.spring(
                searchScale,
                {
                  toValue: 1,
                  friction: 8,
                  tension: 90,
                  useNativeDriver: true,
                }
              ).start();
            }}
          />

          {searchQuery ? (
            <TouchableOpacity
              onPress={() =>
                setSearchQuery('')
              }
              activeOpacity={0.7}
              style={
                styles.clearSearchButton
              }
            >
              <Ionicons
                name="close-circle"
                size={19}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          ) : null}
        </Animated.View>

        <View
          style={styles.filterHeader}
        >
          <View>
            <Text
              style={styles.filterLabel}
            >
              Stores
            </Text>

            <Text
              style={styles.filterHint}
            >
              Find a local store
            </Text>
          </View>

          <View
            style={styles.resultBadge}
          >
            <Text
              style={styles.resultCount}
            >
              {filteredStores.length}
            </Text>

            <Text
              style={styles.resultCountLabel}
            >
              {filteredStores.length === 1
                ? 'store'
                : 'stores'}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.filterScroll
          }
        >
          {filterOptions.map(
            (filter) => (
              <AnimatedFilterChip
                key={filter}
                filter={filter}
                selected={
                  selectedFilter ===
                  filter
                }
                onPress={() =>
                  setSelectedFilter(
                    filter
                  )
                }
              />
            )
          )}
        </ScrollView>
      </View>

      {/* LOADING */}
      {loading && !refreshing ? (
        <View style={styles.center}>
          <View
            style={styles.loadingIcon}
          >
            <Ionicons
              name="storefront-outline"
              size={27}
              color={GREEN}
            />
          </View>

          <ActivityIndicator
            size="small"
            color={GREEN}
            style={
              styles.loadingSpinner
            }
          />

          <Text
            style={styles.loadingTitle}
          >
            Loading stores
          </Text>

          <Text
            style={styles.loadingText}
          >
            Please wait...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredStores}
          keyExtractor={(item) =>
            item.id.toString()
          }
          contentContainerStyle={
            filteredStores.length === 0
              ? styles.emptyContainer
              : styles.listContent
          }
          showsVerticalScrollIndicator={
            false
          }
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[GREEN]}
              tintColor={GREEN}
              progressBackgroundColor="#FFFFFF"
            />
          }
          renderItem={({
            item,
            index,
          }) => (
            <StoreCardAnimated
              item={item}
              index={index}
              navigation={navigation}
            />
          )}
          ListEmptyComponent={
            <View
              style={styles.emptyState}
            >
              <View
                style={styles.emptyIconBg}
              >
                <Ionicons
                  name={
                    searchQuery ||
                    selectedFilter !==
                      'All'
                      ? 'search-outline'
                      : 'storefront-outline'
                  }
                  size={34}
                  color={GREEN}
                />
              </View>

              <Text
                style={styles.emptyTitle}
              >
                {searchQuery ||
                selectedFilter !== 'All'
                  ? 'No Stores Found'
                  : 'No Stores Available'}
              </Text>

              <Text
                style={styles.emptyDesc}
              >
                {searchQuery ||
                selectedFilter !== 'All'
                  ? 'Try a different search or filter.'
                  : 'There are currently no registered partner stores in Binalbagan.'}
              </Text>

              {(searchQuery ||
                selectedFilter !==
                  'All') && (
                <TouchableOpacity
                  style={
                    styles.clearFiltersBtn
                  }
                  onPress={() => {
                    setSearchQuery('');
                    setSelectedFilter(
                      'All'
                    );
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="refresh-outline"
                    size={17}
                    color="#FFFFFF"
                  />

                  <Text
                    style={
                      styles.clearFiltersText
                    }
                  >
                    Clear Filters
                  </Text>
                </TouchableOpacity>
              )}

              {!searchQuery &&
                selectedFilter ===
                  'All' && (
                  <TouchableOpacity
                    style={
                      styles.refreshBtn
                    }
                    onPress={
                      handleRefresh
                    }
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="refresh-outline"
                      size={17}
                      color={GREEN}
                    />

                    <Text
                      style={
                        styles.refreshBtnText
                      }
                    >
                      Check Again
                    </Text>
                  </TouchableOpacity>
                )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },

  /* =========================
     HEADER
  ========================= */

  header: {
    paddingHorizontal: 20,
    paddingTop:
      Platform.OS === 'android'
        ? (StatusBar.currentHeight ||
            20) + 7
        : 14,
    paddingBottom: 16,
  },

  headerAnimated: {
    width: '100%',
  },

  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
  },

  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor:
      'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor:
      'rgba(255,255,255,0.12)',
  },

  headerText: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },

  screenTitle: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },

  screenSub: {
    fontSize: 12,
    lineHeight: 17,
    color: '#D1FAE5',
    fontWeight: '500',
    marginTop: 2,
  },

  headerBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    marginTop: 14,
  },

  headerLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },

  locationText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 6,
  },

  openCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor:
      'rgba(255,255,255,0.13)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    marginLeft: 10,
  },

  openCountDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#A7F3D0',
    marginRight: 6,
  },

  openCountText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },

  /* =========================
     SEARCH
  ========================= */

  searchSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 15,
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#E7ECE9',
  },

  searchBarWrapper: {
    height: 49,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9F8',
    borderRadius: 13,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E1E7E4',
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
    padding: 0,
    marginLeft: 9,
  },

  clearSearchButton: {
    padding: 5,
    marginLeft: 5,
  },

  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    marginTop: 15,
    marginBottom: 10,
  },

  filterLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    color: '#111827',
  },

  filterHint: {
    fontSize: 10.5,
    lineHeight: 15,
    color: '#9CA3AF',
    fontWeight: '500',
    marginTop: 1,
  },

  resultBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
  },

  resultCount: {
    fontSize: 12,
    fontWeight: '900',
    color: DEEP_GREEN,
  },

  resultCountLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    marginLeft: 3,
  },

  filterScroll: {
    paddingRight: 10,
  },

  filterChip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'center',
    paddingHorizontal: 15,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#DDE4E0',
  },

  activeFilterChip: {
    backgroundColor: GREEN,
    borderColor: GREEN,
    shadowColor: GREEN,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 2,
  },

  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginLeft: 6,
  },

  activeFilterChipText: {
    color: '#FFFFFF',
  },

  filterDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  /* =========================
     LOADING
  ========================= */

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },

  loadingIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingSpinner: {
    marginTop: 15,
  },

  loadingTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1F2937',
    marginTop: 11,
  },

  loadingText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },

  /* =========================
     LIST
  ========================= */

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 35,
  },

  animatedCardWrapper: {
    width: '100%',
    marginBottom: 15,
  },

  /* =========================
     STORE CARD
  ========================= */

  storeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8E5',

    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.07,
    shadowRadius: 9,

    elevation: 3,
  },

  storeCardPressed: {
    borderColor: '#BFE8D3',
  },

  imageContainer: {
    height: 178,
    width: '100%',
    backgroundColor: LIGHT_GREEN,
    position: 'relative',
  },

  storeImage: {
    height: '100%',
    width: '100%',
    resizeMode: 'cover',
  },

  imagePlaceholder: {
    height: '100%',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  placeholderIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#047857',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.09,
    shadowRadius: 6,
    elevation: 2,
  },

  placeholderText: {
    fontSize: 11,
    color: GREEN,
    fontWeight: '700',
    marginTop: 9,
  },

  statusBadgeOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },

  statusOverlayText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  imageBottomRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },

  imageLocationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor:
      'rgba(0,0,0,0.34)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  imageLocationText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 4,
    maxWidth: 130,
  },

  /* =========================
     DETAILS
  ========================= */

  storeDetails: {
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 15,
  },

  storeNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },

  storeName: {
    flex: 1,
    minWidth: 0,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.25,
    paddingRight: 8,
  },

  cardArrow: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
  },

  storeAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },

  addressIcon: {
    marginTop: 2,
    marginRight: 7,
    flexShrink: 0,
  },

  storeAddress: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#6B7280',
    fontWeight: '500',
  },

  /* =========================
     VIEW STORE
  ========================= */

  viewStoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    marginTop: 12,
  },

  viewStoreText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11.5,
    lineHeight: 16,
    color: GREEN,
    fontWeight: '800',
  },

  viewStoreArrow: {
    width: 27,
    height: 27,
    borderRadius: 9,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  /* =========================
     EMPTY STATE
  ========================= */

  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },

  emptyState: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },

  emptyIconBg: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },

  emptyTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 7,
    textAlign: 'center',
  },

  emptyDesc: {
    fontSize: 13,
    lineHeight: 20,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
    marginBottom: 21,
    maxWidth: 310,
  },

  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },

  refreshBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: GREEN,
    marginLeft: 7,
  },

  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GREEN,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 11,
    shadowColor: GREEN,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 2,
  },

  clearFiltersText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    marginLeft: 7,
  },
});