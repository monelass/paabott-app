import React, {
  useEffect,
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
  Image,
  Alert,
  RefreshControl,
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
const BACKGROUND = '#F6F8F7';

function AnimatedProductCard({
  item,
  index,
  navigation,
}) {
  const opacity = useRef(
    new Animated.Value(0)
  ).current;

  const translateY = useRef(
    new Animated.Value(22)
  ).current;

  const scale = useRef(
    new Animated.Value(0.97)
  ).current;

  const pressScale = useRef(
    new Animated.Value(1)
  ).current;

  useEffect(() => {
    const delay = Math.min(
      index * 65,
      420
    );

    const animation =
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          delay,
          useNativeDriver: true,
        }),

        Animated.spring(translateY, {
          toValue: 0,
          delay,
          friction: 8,
          tension: 70,
          useNativeDriver: true,
        }),

        Animated.spring(scale, {
          toValue: 1,
          delay,
          friction: 8,
          tension: 80,
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
      toValue: 0.975,
      friction: 7,
      tension: 130,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      friction: 7,
      tension: 110,
      useNativeDriver: true,
    }).start();
  };

  const productImage =
    item?.image_url ||
    item?.image_pic ||
    item?.product_image ||
    item?.image;

  return (
    <Animated.View
      style={{
        width: '48.2%',
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
      }}
    >
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() =>
          navigation.navigate(
            'ProductDetails',
            {
              product: item,
            }
          )
        }
        style={({ pressed }) => [
          styles.productCard,
          pressed &&
            styles.productCardPressed,
        ]}
      >
        {/* PRODUCT IMAGE */}
        <View
          style={
            styles.productImageContainer
          }
        >
          {productImage ? (
            <Image
              source={{
                uri: productImage,
              }}
              style={styles.productImage}
            />
          ) : (
            <LinearGradient
              colors={[
                '#ECFDF5',
                '#D1FAE5',
              ]}
              start={{
                x: 0,
                y: 0,
              }}
              end={{
                x: 1,
                y: 1,
              }}
              style={
                styles.productImagePlaceholder
              }
            >
              <View
                style={
                  styles.placeholderCircle
                }
              >
                <Ionicons
                  name="fast-food-outline"
                  size={28}
                  color={GREEN}
                />
              </View>
            </LinearGradient>
          )}

          {/* IMAGE GRADIENT */}
          <LinearGradient
            colors={[
              'transparent',
              'rgba(0,0,0,0.32)',
            ]}
            start={{
              x: 0,
              y: 0,
            }}
            end={{
              x: 0,
              y: 1,
            }}
            style={
              StyleSheet.absoluteFillObject
            }
          />

          {/* AVAILABLE */}
          <View
            style={styles.availableBadge}
          >
            <View
              style={styles.availableDot}
            />

            <Text
              style={styles.availableText}
            >
              Available
            </Text>
          </View>
        </View>

        {/* PRODUCT DETAILS */}
        <View style={styles.productInfo}>
          <View
            style={styles.categoryBadge}
          >
            <Text
              style={
                styles.productCategory
              }
              numberOfLines={1}
            >
              {item.category ||
                'General'}
            </Text>
          </View>

          <Text
            style={styles.productName}
            numberOfLines={2}
          >
            {item.name}
          </Text>

          <View
            style={styles.productBottomRow}
          >
            <View style={styles.priceContainer}>
              <Text
                style={styles.priceLabel}
              >
                PRICE
              </Text>

              <Text
                style={styles.productPrice}
              >
                ₱{item.price}
              </Text>
            </View>

            <View
              style={styles.productArrow}
            >
              <Ionicons
                name="arrow-forward"
                size={14}
                color={GREEN}
              />
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function AnimatedIconButton({
  children,
  onPress,
  style,
}) {
  const scale = useRef(
    new Animated.Value(1)
  ).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.92,
      friction: 7,
      tension: 140,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 7,
      tension: 110,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [{ scale }],
        },
      ]}
    >
      <TouchableOpacity
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        activeOpacity={0.9}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function StoreMenuScreen({
  route,
  navigation,
}) {
  const {
    storeId,
    storeName,
  } = route.params || {};

  const [products, setProducts] =
    useState([]);

  const [storeInfo, setStoreInfo] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const headerOpacity = useRef(
    new Animated.Value(0)
  ).current;

  const headerTranslate = useRef(
    new Animated.Value(18)
  ).current;

  const headerScale = useRef(
    new Animated.Value(0.98)
  ).current;

  useEffect(() => {
    if (storeId) {
      fetchStoreDetails();
      fetchStoreMenu();
    }

    Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),

      Animated.spring(
        headerTranslate,
        {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }
      ),

      Animated.spring(
        headerScale,
        {
          toValue: 1,
          friction: 8,
          tension: 70,
          useNativeDriver: true,
        }
      ),
    ]).start();
  }, [storeId]);

  const fetchStoreDetails =
    async () => {
      try {
        const {
          data,
          error,
        } = await supabase
          .from('stores')
          .select('*')
          .eq('id', storeId)
          .single();

        if (error) {
          throw error;
        }

        if (data) {
          setStoreInfo(data);
        }
      } catch (err) {
        console.error(
          'Error loading store details:',
          err.message
        );
      }
    };

  const fetchStoreMenu = async () => {
    try {
      setLoading(true);

      const {
        data,
        error,
      } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_available', true);

      if (error) {
        throw error;
      }

      if (data) {
        setProducts(data);
      }
    } catch (err) {
      console.error(
        'Error loading store menu:',
        err.message
      );

      Alert.alert(
        'Error',
        'Could not load items for this store.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);

    fetchStoreDetails();
    fetchStoreMenu();
  };

  const storeImage =
    storeInfo?.image_pic ||
    storeInfo?.image_url ||
    storeInfo?.store_image ||
    storeInfo?.banner_url;

  const storeIsOpen =
    storeInfo?.is_open ?? true;

  return (
    <SafeAreaView
      style={styles.container}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={DARK_GREEN}
      />

      <FlatList
        key="store-menu-grid"
        data={loading ? [] : products}
        keyExtractor={(item) =>
          item.id.toString()
        }
        numColumns={2}
        columnWrapperStyle={
          styles.columnWrapper
        }
        contentContainerStyle={
          styles.listContent
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
        ListHeaderComponent={
          <>
            {/* =========================
                STORE HERO
            ========================= */}

            <Animated.View
              style={[
                styles.storeHeroContainer,
                {
                  opacity:
                    headerOpacity,
                  transform: [
                    {
                      translateY:
                        headerTranslate,
                    },
                    {
                      scale: headerScale,
                    },
                  ],
                },
              ]}
            >
              {storeImage ? (
                <Image
                  source={{
                    uri: storeImage,
                  }}
                  style={
                    styles.storeHeroImage
                  }
                />
              ) : (
                <LinearGradient
                  colors={[
                    '#ECFDF5',
                    '#D1FAE5',
                  ]}
                  start={{
                    x: 0,
                    y: 0,
                  }}
                  end={{
                    x: 1,
                    y: 1,
                  }}
                  style={
                    styles.storeHeroFallback
                  }
                >
                  <View
                    style={
                      styles.fallbackIconCircle
                    }
                  >
                    <Ionicons
                      name="storefront-outline"
                      size={42}
                      color={GREEN}
                    />
                  </View>

                  <Text
                    style={
                      styles.fallbackText
                    }
                  >
                    Paabot Partner Store
                  </Text>
                </LinearGradient>
              )}

              <LinearGradient
                colors={[
                  'rgba(0,0,0,0.04)',
                  'rgba(0,0,0,0.18)',
                  'rgba(0,0,0,0.82)',
                ]}
                locations={[
                  0,
                  0.45,
                  1,
                ]}
                style={
                  StyleSheet.absoluteFillObject
                }
              />

              {/* BACK BUTTON */}

              <AnimatedIconButton
                onPress={() =>
                  navigation.goBack()
                }
                style={
                  styles.backBtnWrapper
                }
              >
                <View
                  style={
                    styles.backBtnOverlay
                  }
                >
                  <Ionicons
                    name="arrow-back"
                    size={20}
                    color="#FFFFFF"
                  />
                </View>
              </AnimatedIconButton>

              {/* RATING */}

              <View
                style={
                  styles.topRightRatingBadge
                }
              >
                <Ionicons
                  name="star"
                  size={13}
                  color="#FBBF24"
                />

                <Text
                  style={
                    styles.topRightRatingText
                  }
                >
                  4.9
                </Text>
              </View>

              {/* OPEN STATUS */}

              <View
                style={[
                  styles.openStatusBadge,
                  {
                    backgroundColor:
                      storeIsOpen
                        ? 'rgba(4,120,87,0.90)'
                        : 'rgba(55,65,81,0.90)',
                  },
                ]}
              >
                <View
                  style={[
                    styles.openStatusDot,
                    {
                      backgroundColor:
                        storeIsOpen
                          ? '#A7F3D0'
                          : '#D1D5DB',
                    },
                  ]}
                />

                <Text
                  style={
                    styles.openStatusText
                  }
                >
                  {storeIsOpen
                    ? 'OPEN NOW'
                    : 'CLOSED'}
                </Text>
              </View>

              {/* STORE CONTENT */}

              <View
                style={styles.storeHeroContent}
              >
                <View
                  style={styles.partnerBadge}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={13}
                    color="#A7F3D0"
                  />

                  <Text
                    style={
                      styles.partnerBadgeText
                    }
                  >
                    PAABOT PARTNER
                  </Text>
                </View>

                <Text
                  style={
                    styles.storeHeroTitle
                  }
                  numberOfLines={2}
                >
                  {storeInfo?.name ||
                    storeName ||
                    'Store Menu'}
                </Text>

                <View
                  style={
                    styles.storeHeroSubRow
                  }
                >
                  <View
                    style={
                      styles.locationIconCircle
                    }
                  >
                    <Ionicons
                      name="location"
                      size={12}
                      color="#FFFFFF"
                    />
                  </View>

                  <Text
                    style={
                      styles.storeHeroSubText
                    }
                    numberOfLines={2}
                  >
                    {storeInfo?.address ||
                      'Binalbagan, Negros Occidental'}
                  </Text>
                </View>
              </View>
            </Animated.View>

            {/* =========================
                MENU HEADER
            ========================= */}

            {loading ? (
              <View
                style={styles.loadingSection}
              >
                <View
                  style={
                    styles.loadingIcon
                  }
                >
                  <Ionicons
                    name="restaurant-outline"
                    size={23}
                    color={GREEN}
                  />
                </View>

                <ActivityIndicator
                  size="small"
                  color={GREEN}
                  style={
                    styles.loadingIndicator
                  }
                />

                <Text
                  style={
                    styles.loadingTitle
                  }
                >
                  Loading menu
                </Text>

                <Text
                  style={
                    styles.loadingText
                  }
                >
                  Please wait...
                </Text>
              </View>
            ) : (
              <View
                style={
                  styles.menuHeadingContainer
                }
              >
                <View
                  style={
                    styles.menuTitleLeft
                  }
                >
                  <View
                    style={
                      styles.menuIconBox
                    }
                  >
                    <Ionicons
                      name="restaurant-outline"
                      size={18}
                      color={GREEN}
                    />
                  </View>

                  <View
                    style={
                      styles.menuTitleTexts
                    }
                  >
                    <Text
                      style={
                        styles.menuHeadingText
                      }
                    >
                      Available Items
                    </Text>

                    <Text
                      style={
                        styles.menuSubtitle
                      }
                    >
                      Choose something you like
                    </Text>
                  </View>
                </View>

                <View
                  style={
                    styles.menuCountBadge
                  }
                >
                  <Text
                    style={
                      styles.menuCountText
                    }
                  >
                    {products.length}
                  </Text>

                  <Text
                    style={
                      styles.menuCountLabel
                    }
                  >
                    {products.length ===
                    1
                      ? 'item'
                      : 'items'}
                  </Text>
                </View>
              </View>
            )}
          </>
        }

        renderItem={({
          item,
          index,
        }) => (
          <AnimatedProductCard
            item={item}
            index={index}
            navigation={navigation}
          />
        )}

        ListEmptyComponent={
          !loading ? (
            <View
              style={styles.emptyState}
            >
              <View
                style={styles.emptyIconBg}
              >
                <View
                  style={
                    styles.emptyIconCircle
                  }
                >
                  <Ionicons
                    name="basket-outline"
                    size={36}
                    color={GREEN}
                  />
                </View>
              </View>

              <Text
                style={styles.emptyTitle}
              >
                No Menu Items Yet
              </Text>

              <Text
                style={styles.emptyDesc}
              >
                This store hasn't added any
                available products to their
                catalog yet.
              </Text>

              <TouchableOpacity
                style={styles.emptyBackButton}
                onPress={() =>
                  navigation.goBack()
                }
                activeOpacity={0.85}
              >
                <Ionicons
                  name="arrow-back"
                  size={16}
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.emptyBackText
                  }
                >
                  Back to Stores
                </Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },

  /* =========================
     STORE HERO
  ========================= */

  storeHeroContainer: {
    height: 260,
    width: '100%',
    position: 'relative',
    backgroundColor: '#064E3B',
    justifyContent: 'flex-end',
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 18,

    elevation: 5,

    shadowColor: '#064E3B',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },

  storeHeroImage: {
    ...StyleSheet.absoluteFillObject,
    resizeMode: 'cover',
  },

  storeHeroFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  fallbackIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1FAE5',

    shadowColor: '#047857',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },

  fallbackText: {
    fontSize: 11,
    fontWeight: '800',
    color: GREEN,
    marginTop: 9,
  },

  backBtnWrapper: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 5,
  },

  backBtnOverlay: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor:
      'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor:
      'rgba(255,255,255,0.24)',
  },

  topRightRatingBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor:
      'rgba(0,0,0,0.48)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor:
      'rgba(255,255,255,0.22)',
    zIndex: 3,
  },

  topRightRatingText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    marginLeft: 5,
  },

  openStatusBadge: {
    position: 'absolute',
    top: 67,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    zIndex: 3,
  },

  openStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },

  openStatusText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  storeHeroContent: {
    paddingHorizontal: 17,
    paddingBottom: 18,
    paddingTop: 45,
    zIndex: 2,
  },

  partnerBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor:
      'rgba(4,120,87,0.78)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor:
      'rgba(167,243,208,0.35)',
  },

  partnerBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#ECFDF5',
    letterSpacing: 0.7,
    marginLeft: 5,
  },

  storeHeroTitle: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,

    textShadowColor:
      'rgba(0,0,0,0.5)',
    textShadowOffset: {
      width: 0,
      height: 1,
    },
    textShadowRadius: 3,
  },

  storeHeroSubRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  locationIconCircle: {
    width: 23,
    height: 23,
    borderRadius: 8,
    backgroundColor:
      'rgba(5,150,105,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },

  storeHeroSubText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: '#F1F5F9',
    paddingTop: 2,
  },

  /* =========================
     MENU HEADER
  ========================= */

  loadingSection: {
    width: '100%',
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },

  loadingIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingIndicator: {
    marginTop: 13,
  },

  loadingTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
    marginTop: 9,
  },

  loadingText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 3,
  },

  menuHeadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
    paddingHorizontal: 2,
  },

  menuTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },

  menuIconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: LIGHT_GREEN,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  menuTitleTexts: {
    flex: 1,
    minWidth: 0,
  },

  menuHeadingText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },

  menuSubtitle: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
  },

  menuCountBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    minWidth: 55,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },

  menuCountText: {
    fontSize: 13,
    fontWeight: '900',
    color: GREEN,
  },

  menuCountLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#94A3B8',
    marginTop: 1,
  },

  /* =========================
     LIST
  ========================= */

  listContent: {
    padding: 16,
    paddingBottom: 35,
  },

  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 15,
  },

  /* =========================
     PRODUCT CARD
  ========================= */

  productCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',

    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.055,
    shadowRadius: 8,

    elevation: 3,
  },

  productCardPressed: {
    borderColor: '#BFE8D3',
  },

  productImageContainer: {
    height: 136,
    width: '100%',
    backgroundColor: LIGHT_GREEN,
    position: 'relative',
  },

  productImage: {
    height: '100%',
    width: '100%',
    resizeMode: 'cover',
  },

  productImagePlaceholder: {
    height: '100%',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  placeholderCircle: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },

  availableBadge: {
    position: 'absolute',
    left: 9,
    bottom: 9,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor:
      'rgba(4,120,87,0.90)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
  },

  availableDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#A7F3D0',
    marginRight: 5,
  },

  availableText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* =========================
     PRODUCT INFO
  ========================= */

  productInfo: {
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 11,
  },

  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    marginBottom: 6,
    maxWidth: '90%',
  },

  productCategory: {
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '800',
    color: GREEN,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  productName: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '800',
    color: '#0F172A',
    minHeight: 36,
  },

  productBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },

  priceContainer: {
    flex: 1,
    minWidth: 0,
  },

  priceLabel: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 1,
  },

  productPrice: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    color: GREEN,
  },

  productArrow: {
    width: 29,
    height: 29,
    borderRadius: 9,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
  },

  /* =========================
     EMPTY STATE
  ========================= */

  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 25,
    marginTop: 40,
    paddingBottom: 30,
  },

  emptyIconBg: {
    width: 90,
    height: 90,
    borderRadius: 28,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    marginBottom: 17,
  },

  emptyIconCircle: {
    width: 63,
    height: 63,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 7,
    textAlign: 'center',
  },

  emptyDesc: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 19,
    maxWidth: 310,
    marginBottom: 20,
  },

  emptyBackButton: {
    minHeight: 44,
    paddingHorizontal: 17,
    borderRadius: 11,
    backgroundColor: GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: GREEN,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 2,
  },

  emptyBackText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
    marginLeft: 7,
  },
});