import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { supabase } from '../../config/supabase';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import OpeningAnimation from '../../components/OpeningAnimation';

const { width: SCREEN_WIDTH } =
  Dimensions.get('window');

const PRIMARY_GREEN = '#059669';
const DARK_GREEN = '#047857';
const DEEP_GREEN = '#065F46';

const ACCENT_ORANGE = '#EA580C';
const ACCENT_BLUE = '#2563EB';
const ACCENT_PURPLE = '#7C3AED';
const ACCENT_AMBER = '#D97706';
const ACCENT_TEAL = '#0F766E';

/* =========================================================
   MARQUEE CONFIG
========================================================= */

const MARQUEE_CARD_WIDTH =
  SCREEN_WIDTH * 0.4;

const MARQUEE_CARD_SPACING = 12;

const MARQUEE_ITEM_WIDTH =
  MARQUEE_CARD_WIDTH +
  MARQUEE_CARD_SPACING;

const MARQUEE_SPEED_PX_MS = 0.035;

const MARQUEE_RESUME_DELAY_TAP = 500;

const MARQUEE_RESUME_DELAY_DRAG = 700;

/* =========================================================
   HELPERS
========================================================= */

const parseOrderItems = (rawItems) => {
  if (Array.isArray(rawItems)) {
    return rawItems;
  }

  if (typeof rawItems === 'string') {
    try {
      const parsed =
        JSON.parse(rawItems);

      if (Array.isArray(parsed)) {
        return parsed;
      }

      if (Array.isArray(parsed?.items)) {
        return parsed.items;
      }

      return [];
    } catch (error) {
      console.error(
        'Error parsing order items:',
        error
      );

      return [];
    }
  }

  if (
    rawItems &&
    typeof rawItems === 'object'
  ) {
    if (
      Array.isArray(
        rawItems.items
      )
    ) {
      return rawItems.items;
    }
  }

  return [];
};

const getItemQuantity = (item) => {
  const quantity = Number(
    item?.quantity ??
      item?.qty ??
      1
  );

  return Number.isFinite(quantity) &&
    quantity > 0
    ? quantity
    : 1;
};

const getLatestOrderStatusText = (
  status
) => {
  const normalized =
    String(status || '')
      .toLowerCase()
      .trim();

  const statusMap = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    accepted: 'Accepted',
    preparing: 'Preparing',
    ready_for_pickup:
      'Ready for pickup',
    picking_up:
      'Picking up',
    in_transit:
      'On the way',
    completed:
      'Completed',
    delivered:
      'Delivered',
    cancelled:
      'Cancelled',
    canceled:
      'Cancelled',
    awaiting_payment:
      'Awaiting payment',
    payment_failed:
      'Payment failed',
  };

  return (
    statusMap[normalized] ||
    String(
      status ||
        'Order placed'
    )
      .replace(/_/g, ' ')
      .replace(
        /\b\w/g,
        (letter) =>
          letter.toUpperCase()
      )
  );
};

const getCategoryAccent = (
  categoryName
) => {
  switch (
    String(
      categoryName || ''
    ).toLowerCase()
  ) {
    case 'meals':
      return {
        color: ACCENT_ORANGE,
        background: '#FFF7ED',
        border: '#FED7AA',
      };

    case 'drinks':
      return {
        color: ACCENT_BLUE,
        background: '#EFF6FF',
        border: '#BFDBFE',
      };

    case 'snacks':
      return {
        color: ACCENT_AMBER,
        background: '#FFFBEB',
        border: '#FDE68A',
      };

    case 'desserts':
      return {
        color: ACCENT_PURPLE,
        background: '#F5F3FF',
        border: '#DDD6FE',
      };

    default:
      return {
        color: PRIMARY_GREEN,
        background: '#ECFDF5',
        border: '#BBF7D0',
      };
  }
};

/* =========================================================
   ENTRANCE ANIMATION
========================================================= */

function EntranceAnimation({
  children,
  delay = 0,
  distance = 18,
  style,
}) {
  const opacity =
    useRef(
      new Animated.Value(0)
    ).current;

  const translateY =
    useRef(
      new Animated.Value(distance)
    ).current;

  useEffect(() => {
    const timer =
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(
            opacity,
            {
              toValue: 1,
              duration: 420,
              useNativeDriver: true,
            }
          ),

          Animated.spring(
            translateY,
            {
              toValue: 0,
              friction: 8,
              tension: 58,
              useNativeDriver: true,
            }
          ),
        ]).start();
      }, delay);

    return () =>
      clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [
            {
              translateY,
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/* =========================================================
   MARQUEE PRODUCT CARD
========================================================= */

function MarqueeProductCard({
  item,
  navigation,
  onAddToCart,
}) {
  const [added, setAdded] =
    useState(false);

  const pressScale =
    useRef(
      new Animated.Value(1)
    ).current;

  const addScale =
    useRef(
      new Animated.Value(1)
    ).current;

  const handlePressIn = () => {
    Animated.spring(
      pressScale,
      {
        toValue: 0.96,
        friction: 7,
        tension: 120,
        useNativeDriver: true,
      }
    ).start();
  };

  const handlePressOut = () => {
    Animated.spring(
      pressScale,
      {
        toValue: 1,
        friction: 7,
        tension: 100,
        useNativeDriver: true,
      }
    ).start();
  };

  const handleAdd = () => {
    if (added) {
      return;
    }

    setAdded(true);

    Animated.sequence([
      Animated.timing(
        addScale,
        {
          toValue: 0.82,
          duration: 80,
          useNativeDriver: true,
        }
      ),

      Animated.spring(
        addScale,
        {
          toValue: 1,
          friction: 4,
          tension: 140,
          useNativeDriver: true,
        }
      ),
    ]).start();

    onAddToCart(item);

    setTimeout(() => {
      setAdded(false);
    }, 900);
  };

  // Safely get the store name if joined via Supabase
  const storeName = item?.stores?.name || item?.store_name || 'Store Partner';

  return (
    <Animated.View
      style={{
        transform: [
          {
            scale:
              pressScale,
          },
        ],
      }}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPressIn={
          handlePressIn
        }
        onPressOut={
          handlePressOut
        }
        onPress={() =>
          navigation.navigate(
            'ProductDetails',
            {
              product:
                item,
            }
          )
        }
        style={
          styles.marqueeCard
        }
      >
        <View
          style={
            styles.marqueeImageContainer
          }
        >
          {item?.image_url ? (
            <Image
              source={{
                uri:
                  item.image_url,
              }}
              style={
                styles.marqueeImage
              }
            />
          ) : (
            <View
              style={
                styles.marqueeImageFallback
              }
            >
              <Ionicons
                name="fast-food-outline"
                size={30}
                color="#A7F3D0"
              />
            </View>
          )}

          <LinearGradient
            colors={[
              'rgba(0,0,0,0)',
              'rgba(0,0,0,0.45)',
            ]}
            start={{
              x: 0,
              y: 0.4,
            }}
            end={{
              x: 0,
              y: 1,
            }}
            style={
              StyleSheet.absoluteFillObject
            }
          />

          <View
            style={
              styles.marqueeBadge
            }
          >
            <Ionicons
              name="flame"
              size={9}
              color="#FFFFFF"
            />
          </View>
        </View>

        <View
          style={
            styles.marqueeContent
          }
        >
          <Text
            style={
              styles.marqueeName
            }
            numberOfLines={1}
          >
            {item?.name ||
              'Product'}
          </Text>

          {/* NEW: Store Name Display */}
          <View style={styles.marqueeStoreRow}>
            <Ionicons name="storefront-outline" size={10} color="#9CA3AF" />
            <Text style={styles.marqueeStoreName} numberOfLines={1}>
              {storeName}
            </Text>
          </View>

          <View
            style={
              styles.marqueeBottom
            }
          >
            <Text
              style={
                styles.marqueePrice
              }
              numberOfLines={1}
            >
              ₱
              {Number(
                item?.price ||
                  0
              ).toFixed(2)}
            </Text>

            <Animated.View
              style={{
                transform: [
                  {
                    scale:
                      addScale,
                  },
                ],
              }}
            >
              <TouchableOpacity
                style={[
                  styles.marqueeAddBtn,
                  added &&
                    styles.marqueeAddBtnAdded,
                ]}
                activeOpacity={
                  0.8
                }
                hitSlop={{
                  top: 8,
                  bottom: 8,
                  left: 8,
                  right: 8,
                }}
                onPress={
                  handleAdd
                }
              >
                <Ionicons
                  name={
                    added
                      ? 'checkmark'
                      : 'add'
                  }
                  size={15}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

/* =========================================================
   MARQUEE ROW
   Continuously auto-scrolls, pauses smoothly while the
   user is touching / dragging, and resumes drifting once
   they let go. Cards stay fully swipeable and tappable.
========================================================= */

function MarqueeRow({
  products,
  navigation,
  onAddToCart,
}) {
  const scrollRef =
    useRef(null);

  const offsetRef =
    useRef(0);

  const pausedRef =
    useRef(false);

  const draggingRef =
    useRef(false);

  const rafRef =
    useRef(null);

  const lastTsRef =
    useRef(null);

  const resumeTimerRef =
    useRef(null);

  const uniqueCount =
    products.length;

  const canLoop =
    uniqueCount >= 2;

  const singleSetWidth =
    MARQUEE_ITEM_WIDTH *
    uniqueCount;

  const data = canLoop
    ? [
        ...products,
        ...products,
        ...products,
      ]
    : products;

  useEffect(() => {
    if (!canLoop) {
      return undefined;
    }

    offsetRef.current =
      singleSetWidth;

    lastTsRef.current =
      null;

    const initTimer =
      setTimeout(() => {
        scrollRef.current?.scrollTo(
          {
            x: offsetRef.current,
            animated: false,
          }
        );
      }, 40);

    const tick = (
      timestamp
    ) => {
      if (
        lastTsRef.current ==
        null
      ) {
        lastTsRef.current =
          timestamp;
      }

      const delta =
        timestamp -
        lastTsRef.current;

      lastTsRef.current =
        timestamp;

      if (
        !pausedRef.current &&
        !draggingRef.current
      ) {
        offsetRef.current +=
          MARQUEE_SPEED_PX_MS *
          delta;

        if (
          offsetRef.current >=
          singleSetWidth * 2
        ) {
          offsetRef.current -=
            singleSetWidth;
        }

        scrollRef.current?.scrollTo(
          {
            x: offsetRef.current,
            animated: false,
          }
        );
      }

      rafRef.current =
        requestAnimationFrame(
          tick
        );
    };

    rafRef.current =
      requestAnimationFrame(
        tick
      );

    return () => {
      clearTimeout(
        initTimer
      );

      if (rafRef.current) {
        cancelAnimationFrame(
          rafRef.current
        );
      }

      if (
        resumeTimerRef.current
      ) {
        clearTimeout(
          resumeTimerRef.current
        );
      }

      lastTsRef.current =
        null;
    };
  }, [
    canLoop,
    singleSetWidth,
    uniqueCount,
  ]);

  const scheduleResume = (
    delay
  ) => {
    if (
      resumeTimerRef.current
    ) {
      clearTimeout(
        resumeTimerRef.current
      );
    }

    resumeTimerRef.current =
      setTimeout(() => {
        pausedRef.current =
          false;

        resumeTimerRef.current =
          null;
      }, delay);
  };

  const normalizeOffset =
    () => {
      if (
        offsetRef.current >=
        singleSetWidth * 2
      ) {
        offsetRef.current -=
          singleSetWidth;

        scrollRef.current?.scrollTo(
          {
            x: offsetRef.current,
            animated: false,
          }
        );
      } else if (
        offsetRef.current <=
        0
      ) {
        offsetRef.current +=
          singleSetWidth;

        scrollRef.current?.scrollTo(
          {
            x: offsetRef.current,
            animated: false,
          }
        );
      }
    };

  const handleTouchStart =
    () => {
      if (!canLoop) {
        return;
      }

      pausedRef.current =
        true;

      draggingRef.current =
        false;

      if (
        resumeTimerRef.current
      ) {
        clearTimeout(
          resumeTimerRef.current
        );

        resumeTimerRef.current =
          null;
      }
    };

  const handleScrollBeginDrag =
    () => {
      if (!canLoop) {
        return;
      }

      draggingRef.current =
        true;
    };

  const handleScroll = (
    event
  ) => {
    if (!canLoop) {
      return;
    }

    offsetRef.current =
      event.nativeEvent
        .contentOffset.x;
  };

  const handleMomentumScrollEnd =
    () => {
      if (!canLoop) {
        return;
      }

      draggingRef.current =
        false;

      normalizeOffset();

      scheduleResume(
        MARQUEE_RESUME_DELAY_DRAG
      );
    };

  const handleTouchEnd =
    () => {
      if (!canLoop) {
        return;
      }

      if (
        !draggingRef.current
      ) {
        scheduleResume(
          MARQUEE_RESUME_DELAY_TAP
        );
      }
    };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={
        false
      }
      bounces={false}
      overScrollMode="never"
      decelerationRate="fast"
      scrollEventThrottle={16}
      contentContainerStyle={
        styles.marqueeScroll
      }
      onScroll={handleScroll}
      onScrollBeginDrag={
        handleScrollBeginDrag
      }
      onMomentumScrollEnd={
        handleMomentumScrollEnd
      }
      onTouchStart={
        handleTouchStart
      }
      onTouchEnd={
        handleTouchEnd
      }
      onTouchCancel={
        handleTouchEnd
      }
    >
      {data.map(
        (product, index) => (
          <View
            key={`${
              product?.id ||
              'product'
            }-${index}`}
            style={
              styles.marqueeCardWrapper
            }
          >
            <MarqueeProductCard
              item={product}
              navigation={
                navigation
              }
              onAddToCart={
                onAddToCart
              }
            />
          </View>
        )
      )}
    </ScrollView>
  );
}

/* =========================================================
   CATEGORY PILL
========================================================= */

function CategoryButton({
  category,
  selected,
  onPress,
}) {
  const scale =
    useRef(
      new Animated.Value(1)
    ).current;

  const accent =
    getCategoryAccent(
      category.name
    );

  useEffect(() => {
    Animated.spring(
      scale,
      {
        toValue:
          selected
            ? 1.03
            : 1,
        friction: 7,
        tension: 110,
        useNativeDriver: true,
      }
    ).start();
  }, [
    selected,
  ]);

  return (
    <Animated.View
      style={{
        transform: [
          {
            scale,
          },
        ],
      }}
    >
      <TouchableOpacity
        style={[
          styles.categoryPill,
          selected && {
            backgroundColor:
              accent.color,
            borderColor:
              accent.color,
          },
        ]}
        activeOpacity={0.82}
        onPress={onPress}
      >
        <View
          style={[
            styles.categoryPillIcon,
            {
              backgroundColor:
                selected
                  ? 'rgba(255,255,255,0.22)'
                  : accent.background,
            },
          ]}
        >
          <Ionicons
            name={
              category.icon
            }
            size={14}
            color={
              selected
                ? '#FFFFFF'
                : accent.color
            }
          />
        </View>

        <Text
          style={[
            styles.categoryPillText,
            selected && {
              color:
                '#FFFFFF',
            },
          ]}
        >
          {category.name}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

/* =========================================================
   STORE CARD
========================================================= */

function StoreCard({
  store,
  navigation,
  index,
}) {
  const fade =
    useRef(
      new Animated.Value(0)
    ).current;

  const translateY =
    useRef(
      new Animated.Value(16)
    ).current;

  const scale =
    useRef(
      new Animated.Value(0.98)
    ).current;

  const storeImage =
    store?.image_pic ||
    store?.image_url ||
    store?.store_image ||
    store?.banner_url;

  useEffect(() => {
    const timer =
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(
            fade,
            {
              toValue: 1,
              duration: 380,
              useNativeDriver: true,
            }
          ),

          Animated.spring(
            translateY,
            {
              toValue: 0,
              friction: 8,
              tension: 65,
              useNativeDriver: true,
            }
          ),

          Animated.spring(
            scale,
            {
              toValue: 1,
              friction: 8,
              tension: 65,
              useNativeDriver: true,
            }
          ),
        ]).start();
      }, index * 75);

    return () =>
      clearTimeout(timer);
  }, []);

  const handlePressIn = () => {
    Animated.spring(
      scale,
      {
        toValue: 0.97,
        friction: 8,
        tension: 120,
        useNativeDriver: true,
      }
    ).start();
  };

  const handlePressOut = () => {
    Animated.spring(
      scale,
      {
        toValue: 1,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }
    ).start();
  };

  return (
    <Animated.View
      style={{
        opacity: fade,

        transform: [
          {
            translateY,
          },
          {
            scale,
          },
        ],
      }}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPressIn={
          handlePressIn
        }
        onPressOut={
          handlePressOut
        }
        onPress={() =>
          navigation.navigate(
            'StoreMenuScreen',
            {
              storeId:
                store.id,

              storeName:
                store.name ||
                'Store',
            }
          )
        }
        style={
          styles.storeCard
        }
      >
        <View
          style={
            styles.storeImageWrap
          }
        >
          {storeImage ? (
            <Image
              source={{
                uri:
                  storeImage,
              }}
              style={
                styles.storeImage
              }
            />
          ) : (
            <View
              style={
                styles.storeFallback
              }
            >
              <Ionicons
                name="storefront-outline"
                size={26}
                color={
                  PRIMARY_GREEN
                }
              />
            </View>
          )}

          <View
            style={
              styles.storeOnlineBadge
            }
          >
            <View
              style={
                styles.storeOnlineDot
              }
            />
          </View>
        </View>

        <View
          style={
            styles.storeInfo
          }
        >
          <Text
            style={
              styles.storeName
            }
            numberOfLines={1}
          >
            {store?.name ||
              'Store'}
          </Text>

          <View
            style={
              styles.storeAddressRow
            }
          >
            <Ionicons
              name="location-outline"
              size={12}
              color="#9CA3AF"
            />

            <Text
              style={
                styles.storeAddress
              }
              numberOfLines={1}
            >
              {store?.address ||
                'Binalbagan, Negros Occidental'}
            </Text>
          </View>

          <View
            style={
              styles.storeDetails
            }
          >
            <View
              style={
                styles.ratingBadge
              }
            >
              <Ionicons
                name="star"
                size={10}
                color={
                  ACCENT_AMBER
                }
              />

              <Text
                style={
                  styles.ratingText
                }
              >
                4.9
              </Text>
            </View>

            <View
              style={
                styles.deliveryBadge
              }
            >
              <Ionicons
                name="time-outline"
                size={10}
                color={
                  ACCENT_TEAL
                }
              />

              <Text
                style={
                  styles.deliveryText
                }
              >
                Fast delivery
              </Text>
            </View>
          </View>
        </View>

        <View
          style={
            styles.arrowButton
          }
        >
          <Ionicons
            name="chevron-forward"
            size={16}
            color={
              PRIMARY_GREEN
            }
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

/* =========================================================
   ACTION BUTTON
========================================================= */

function AnimatedActionButton({
  children,
  onPress,
  style,
}) {
  const scale =
    useRef(
      new Animated.Value(1)
    ).current;

  const handleIn = () => {
    Animated.spring(
      scale,
      {
        toValue: 0.95,
        friction: 7,
        tension: 130,
        useNativeDriver: true,
      }
    ).start();
  };

  const handleOut = () => {
    Animated.spring(
      scale,
      {
        toValue: 1,
        friction: 7,
        tension: 110,
        useNativeDriver: true,
      }
    ).start();
  };

  return (
    <Animated.View
      style={{
        flex: 1,

        transform: [
          {
            scale,
          },
        ],
      }}
    >
      <TouchableOpacity
        style={style}
        activeOpacity={0.9}
        onPressIn={
          handleIn
        }
        onPressOut={
          handleOut
        }
        onPress={onPress}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

/* =========================================================
   HOME SCREEN
========================================================= */

export default function HomeScreen({
  navigation,
}) {
  const {
    user,
    profile,
    refreshProfile,
    signOut,
  } = useAuth();

  const cartContext =
    useCart();

  const getCartCount =
    cartContext?.getCartCount;

  const addToCart =
    cartContext?.addToCart;

  const cartItemCount =
    typeof getCartCount ===
    'function'
      ? getCartCount()
      : 0;

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    products,
    setProducts,
  ] = useState([]);

  const [
    stores,
    setStores,
  ] = useState([]);

  const [
    activeCategory,
    setActiveCategory,
  ] = useState('All');

  const [
    latestOrder,
    setLatestOrder,
  ] = useState(null);

  const [
    latestOrderLoading,
    setLatestOrderLoading,
  ] = useState(false);

  const [
    showTermsModal,
    setShowTermsModal,
  ] = useState(false);

  const [
    agreedToTerms,
    setAgreedToTerms,
  ] = useState(false);

  const [
    savingTerms,
    setSavingTerms,
  ] = useState(false);

  /* =========================================================
     PAABOT QUICK ANIMATION
  ========================================================= */

  const [
    showPaabotAnimation,
    setShowPaabotAnimation,
  ] = useState(false);

  const handlePaabotPress = () => {
    setShowPaabotAnimation(
      true
    );
  };

  const handlePaabotAnimationFinish =
    () => {
      setShowPaabotAnimation(
        false
      );

      navigation.navigate(
        'NewDeliveryRequest'
      );
    };

  /* =========================================================
     SCREEN ANIMATIONS
  ========================================================= */

  const headerOpacity =
    useRef(
      new Animated.Value(0)
    ).current;

  const headerTranslate =
    useRef(
      new Animated.Value(-18)
    ).current;

  const welcomeOpacity =
    useRef(
      new Animated.Value(0)
    ).current;

  const welcomeTranslate =
    useRef(
      new Animated.Value(18)
    ).current;

  const fabScale =
    useRef(
      new Animated.Value(1)
    ).current;

  const fabTranslate =
    useRef(
      new Animated.Value(35)
    ).current;

  const productsTransition =
    useRef(
      new Animated.Value(1)
    ).current;

  const categories = [
    {
      name: 'All',
      icon: 'apps-outline',
    },

    {
      name: 'Meals',
      icon: 'restaurant-outline',
    },

    {
      name: 'Drinks',
      icon: 'cafe-outline',
    },

    {
      name: 'Snacks',
      icon: 'fast-food-outline',
    },

    {
      name: 'Desserts',
      icon: 'ice-cream-outline',
    },
  ];

  /* =========================================================
     INTRO ANIMATION
  ========================================================= */

  useEffect(() => {
    Animated.parallel([
      Animated.timing(
        headerOpacity,
        {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }
      ),

      Animated.spring(
        headerTranslate,
        {
          toValue: 0,
          friction: 8,
          tension: 58,
          useNativeDriver: true,
        }
      ),
    ]).start();

    const welcomeTimer =
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(
            welcomeOpacity,
            {
              toValue: 1,
              duration: 430,
              useNativeDriver: true,
            }
          ),

          Animated.spring(
            welcomeTranslate,
            {
              toValue: 0,
              friction: 8,
              tension: 60,
              useNativeDriver: true,
            }
          ),
        ]).start();
      }, 100);

    Animated.spring(
      fabTranslate,
      {
        toValue: 0,
        friction: 8,
        tension: 55,
        delay: 450,
        useNativeDriver: true,
      }
    ).start();

    return () =>
      clearTimeout(
        welcomeTimer
      );
  }, []);

  /* =========================================================
     FAB ANIMATION
  ========================================================= */

  useEffect(() => {
    const pulse =
      Animated.loop(
        Animated.sequence([
          Animated.timing(
            fabScale,
            {
              toValue: 1.02,
              duration: 1500,
              useNativeDriver: true,
            }
          ),

          Animated.timing(
            fabScale,
            {
              toValue: 1,
              duration: 1500,
              useNativeDriver: true,
            }
          ),
        ])
      );

    pulse.start();

    return () =>
      pulse.stop();
  }, []);

  /* =========================================================
     PRODUCTS TRANSITION
  ========================================================= */

  useEffect(() => {
    Animated.sequence([
      Animated.timing(
        productsTransition,
        {
          toValue: 0.97,
          duration: 100,
          useNativeDriver: true,
        }
      ),

      Animated.spring(
        productsTransition,
        {
          toValue: 1,
          friction: 7,
          tension: 85,
          useNativeDriver: true,
        }
      ),
    ]).start();
  }, [
    activeCategory,
  ]);

  /* =========================================================
     TERMS
  ========================================================= */

  useEffect(() => {
    const checkTermsStatus =
      async () => {
        const currentUserId =
          user?.id ||
          profile?.id;

        if (!currentUserId) {
          return;
        }

        try {
          const {
            data,
            error,
          } = await supabase
            .from(
              'profiles'
            )
            .select(
              'agreed_to_terms'
            )
            .eq(
              'id',
              currentUserId
            )
            .maybeSingle();

          if (error) {
            console.error(
              'Terms check error:',
              error.message
            );

            return;
          }

          if (
            data &&
            data.agreed_to_terms ===
              false
          ) {
            setShowTermsModal(
              true
            );
          }
        } catch (error) {
          console.error(
            'Error checking terms:',
            error
          );
        }
      };

    checkTermsStatus();
  }, [
    user?.id,
    profile?.id,
  ]);

  const handleAcceptTerms =
    async () => {
      if (!agreedToTerms) {
        Alert.alert(
          'Action Required',
          'Please check the box to agree to the terms before continuing.'
        );

        return;
      }

      const currentUserId =
        user?.id ||
        profile?.id;

      if (!currentUserId) {
        return;
      }

      try {
        setSavingTerms(
          true
        );

        const {
          error,
        } = await supabase
          .from('profiles')
          .update({
            agreed_to_terms:
              true,

            terms_accepted_at:
              new Date().toISOString(),
          })
          .eq(
            'id',
            currentUserId
          );

        if (error) {
          throw error;
        }

        setShowTermsModal(
          false
        );

        if (refreshProfile) {
          refreshProfile();
        }
      } catch (error) {
        Alert.alert(
          'Error',
          error?.message ||
            'Unable to save your agreement.'
        );
      } finally {
        setSavingTerms(
          false
        );
      }
    };

  /* =========================================================
     DASHBOARD DATA
  ========================================================= */

  const fetchDashboardData =
    async () => {
      try {
        if (!refreshing) {
          setLoading(
            true
          );
        }

        const [
          storesResult,
          productsResult,
        ] = await Promise.all([
          supabase
            .from('stores')
            .select('*')
            .eq(
              'is_open',
              true
            )
            .limit(8),

          // ✨ CHANGED: Include the store name directly in the products query
          supabase
            .from('products')
            .select('*, stores(name)')
            .eq(
              'is_available',
              true
            )
            .order(
              'created_at',
              {
                ascending:
                  false,
              }
            )
            .limit(15),
        ]);

        if (
          storesResult.error
        ) {
          console.error(
            'Stores error:',
            storesResult.error
              .message
          );
        }

        if (
          productsResult.error
        ) {
          console.error(
            'Products error:',
            productsResult.error
              .message
          );
        }

        setStores(
          storesResult.data ||
            []
        );

        setProducts(
          productsResult.data ||
            []
        );
      } catch (error) {
        console.error(
          'Error loading home data:',
          error
        );
      } finally {
        setLoading(false);

        setRefreshing(
          false
        );
      }
    };

  /* =========================================================
     LATEST ORDER
  ========================================================= */

  const fetchLatestOrder =
    async () => {
      const currentUserId =
        user?.id ||
        profile?.id;

      if (!currentUserId) {
        setLatestOrder(
          null
        );

        return;
      }

      try {
        setLatestOrderLoading(
          true
        );

        const {
          data: order,
          error,
        } = await supabase
          .from('orders')
          .select('*')
          .eq(
            'customer_id',
            currentUserId
          )
          .neq(
            'status',
            'awaiting_payment'
          )
          .order(
            'created_at',
            {
              ascending:
                false,
            }
          )
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error(
            'Latest order error:',
            error.message
          );

          setLatestOrder(
            null
          );

          return;
        }

        if (!order) {
          setLatestOrder(
            null
          );

          return;
        }

        let storeName =
          order.store_name ||
          order.storeName ||
          '';

        if (
          !storeName &&
          order.store_id
        ) {
          const {
            data: store,
          } = await supabase
            .from(
              'stores'
            )
            .select('name')
            .eq(
              'id',
              order.store_id
            )
            .maybeSingle();

          storeName =
            store?.name ||
            '';
        }

        setLatestOrder({
          ...order,

          store_name:
            storeName ||
            'Store Order',

          order_type:
            'store',
        });
      } catch (error) {
        console.error(
          'Error fetching latest order:',
          error
        );

        setLatestOrder(
          null
        );
      } finally {
        setLatestOrderLoading(
          false
        );
      }
    };

  /* =========================================================
     BUY AGAIN
  ========================================================= */

  const handleBuyAgain =
    (order) => {
      if (!order) {
        return;
      }

      const savedItems =
        parseOrderItems(
          order.items
        );

      if (
        savedItems.length ===
        0
      ) {
        Alert.alert(
          'Items Unavailable',
          'The items from your previous order could not be loaded.'
        );

        return;
      }

      const exactItems =
        savedItems.map(
          (item) => ({
            ...item,

            quantity:
              item.quantity ??
              item.qty ??
              1,

            store_id:
              item.store_id ||
              item.storeId ||
              order.store_id ||
              null,

            store_name:
              item.store_name ||
              item.storeName ||
              order.store_name ||
              'Store',
          })
        );

      const checkoutParams =
        {
          itemsToCheckout:
            exactItems,

          reorder:
            true,

          reorderFromOrderId:
            order.id,
        };

      const parentNavigation =
        navigation.getParent?.();

      if (
        parentNavigation
      ) {
        parentNavigation.navigate(
          'Checkout',
          checkoutParams
        );
      } else {
        navigation.navigate(
          'Checkout',
          checkoutParams
        );
      }
    };

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    fetchLatestOrder();
  }, [
    user?.id,
    profile?.id,
  ]);

  const handleRefresh =
    () => {
      setRefreshing(
        true
      );

      fetchDashboardData();

      fetchLatestOrder();
    };

  /* =========================================================
     CATEGORY FILTER
  ========================================================= */

  const filteredProducts =
    useMemo(() => {
      return products.filter(
        (product) => {
          if (
            activeCategory ===
            'All'
          ) {
            return true;
          }

          const category =
            String(
              product?.category ||
                ''
            ).toLowerCase();

          return (
            category ===
            activeCategory.toLowerCase()
          );
        }
      );
    }, [
      products,
      activeCategory,
    ]);

  /* =========================================================
     ADD TO CART
  ========================================================= */

  const handleAddToCart =
    (item) => {
      if (
        typeof addToCart ===
        'function'
      ) {
        addToCart(
          item,
          1
        );
      }
    };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <SafeAreaView
      style={
        styles.container
      }
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#047857"
      />

      {/* =====================================================
          HEADER
      ===================================================== */}

      <Animated.View
        style={{
          opacity:
            headerOpacity,

          transform: [
            {
              translateY:
                headerTranslate,
            },
          ],
        }}
      >
        <LinearGradient
          colors={[
            '#047857',
            '#059669',
            '#0F766E',
          ]}
          locations={[
            0,
            0.6,
            1,
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
            styles.header
          }
        >
          <View
            style={
              styles.headerHighlight
            }
          />

          <View
            style={
              styles.headerContent
            }
          >
            <View
              style={
                styles.brandContainer
              }
            >
              <Text
                style={
                  styles.brandTitle
                }
              >
                Paabot
              </Text>

              <View
                style={
                  styles.locationRow
                }
              >
                <View
                  style={
                    styles.locationIconWrap
                  }
                >
                  <Ionicons
                    name="location-sharp"
                    size={10}
                    color="#D1FAE5"
                  />
                </View>

                <Text
                  style={
                    styles.locationText
                  }
                >
                  Binalbagan,
                  Negros Occidental
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={
                styles.cartButton
              }
              activeOpacity={0.8}
              onPress={() =>
                navigation.navigate(
                  'Cart'
                )
              }
            >
              <View
                style={
                  styles.cartIconCircle
                }
              >
                <Ionicons
                  name="bag-handle-outline"
                  size={22}
                  color={
                    DARK_GREEN
                  }
                />
              </View>

              {cartItemCount >
                0 && (
                <View
                  style={
                    styles.cartBadge
                  }
                >
                  <Text
                    style={
                      styles.cartBadgeText
                    }
                  >
                    {cartItemCount >
                    99
                      ? '99+'
                      : cartItemCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* =====================================================
          CONTENT
      ===================================================== */}

      <Animated.ScrollView
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={
          styles.scrollContent
        }
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={
              handleRefresh
            }
            colors={[
              PRIMARY_GREEN,
            ]}
            tintColor={
              PRIMARY_GREEN
            }
          />
        }
      >
        {/* ===================================================
            WELCOME
        =================================================== */}

        <Animated.View
          style={{
            opacity:
              welcomeOpacity,

            transform: [
              {
                translateY:
                  welcomeTranslate,
              },
            ],
          }}
        >
          <View
            style={
              styles.welcomeSection
            }
          >
            <Text
              style={
                styles.welcomeGreeting
              }
            >
              Welcome back
            </Text>

            <Text
              style={
                styles.welcomeTitle
              }
            >
              What are you craving?
            </Text>

            <Text
              style={
                styles.welcomeSubtitle
              }
            >
              Find your favorite
              food and local stores
              around Binalbagan.
            </Text>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() =>
                navigation.navigate(
                  'Search'
                )
              }
              style={
                styles.searchContainer
              }
            >
              <View
                style={
                  styles.searchIconContainer
                }
              >
                <Ionicons
                  name="search"
                  size={19}
                  color={
                    PRIMARY_GREEN
                  }
                />
              </View>

              <Text
                style={
                  styles.searchPlaceholder
                }
                numberOfLines={1}
              >
                Search food, drinks or stores
              </Text>

              <View
                style={
                  styles.searchArrow
                }
              >
                <Ionicons
                  name="chevron-forward"
                  size={15}
                  color={
                    PRIMARY_GREEN
                  }
                />
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ===================================================
            CATEGORIES
        =================================================== */}

        <EntranceAnimation
          delay={180}
          distance={15}
        >
          <View
            style={
              styles.categorySection
            }
          >
            <View
              style={
                styles.sectionHeader
              }
            >
              <View>
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Categories
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Browse what you want
                </Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={
                false
              }
              contentContainerStyle={
                styles.categoryScroll
              }
            >
              {categories.map(
                (
                  category,
                  index
                ) => (
                  <EntranceAnimation
                    key={
                      category.name
                    }
                    delay={
                      230 +
                      index * 55
                    }
                    distance={10}
                  >
                    <CategoryButton
                      category={
                        category
                      }
                      selected={
                        activeCategory ===
                        category.name
                      }
                      onPress={() =>
                        setActiveCategory(
                          category.name
                        )
                      }
                    />
                  </EntranceAnimation>
                )
              )}
            </ScrollView>
          </View>
        </EntranceAnimation>

        {/* ===================================================
            LATEST ORDER
        =================================================== */}

        <EntranceAnimation
          delay={300}
          distance={18}
        >
          <View
            style={
              styles.latestOrderSection
            }
          >
            <View
              style={
                styles.latestOrderHeader
              }
            >
              <View>
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Your latest order
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Amo na ang status sang imo order
                </Text>
              </View>

              <TouchableOpacity
                style={
                  styles.latestOrderViewAll
                }
                activeOpacity={0.75}
                onPress={() =>
                  navigation.navigate(
                    'OrderHistory'
                  )
                }
              >
                <Text
                  style={
                    styles.latestOrderViewAllText
                  }
                >
                  My Orders
                </Text>

                <Ionicons
                  name="chevron-forward"
                  size={13}
                  color={
                    PRIMARY_GREEN
                  }
                />
              </TouchableOpacity>
            </View>

            {latestOrderLoading ? (
              <View
                style={
                  styles.latestOrderCard
                }
              >
                <ActivityIndicator
                  size="small"
                  color={
                    PRIMARY_GREEN
                  }
                />

                <Text
                  style={
                    styles.latestOrderLoadingText
                  }
                >
                  Checking your latest order...
                </Text>
              </View>
            ) : !latestOrder ? (
              <View
                style={[
                  styles.latestOrderCard,
                  styles.latestOrderEmpty,
                ]}
              >
                <View
                  style={
                    styles.latestOrderIcon
                  }
                >
                  <Ionicons
                    name="receipt-outline"
                    size={20}
                    color={
                      PRIMARY_GREEN
                    }
                  />
                </View>

                <View
                  style={
                    styles.latestOrderEmptyContent
                  }
                >
                  <Text
                    style={
                      styles.latestOrderTitle
                    }
                  >
                    Wala pa sang latest order
                  </Text>

                  <Text
                    style={
                      styles.latestOrderSubtitle
                    }
                  >
                    Pili lang sang gusto mo kag order dayon.
                  </Text>
                </View>
              </View>
            ) : (
              <Animated.View
                style={
                  styles.latestOrderCard
                }
              >
                <View
                  style={
                    styles.latestOrderTopRow
                  }
                >
                  <View
                    style={[
                      styles.latestOrderIcon,
                      styles.latestOrderIconFilled,
                    ]}
                  >
                    <Ionicons
                      name="receipt-outline"
                      size={18}
                      color="#FFFFFF"
                    />
                  </View>

                  <View
                    style={
                      styles.latestOrderMain
                    }
                  >
                    <Text
                      style={
                        styles.latestOrderStore
                      }
                      numberOfLines={1}
                    >
                      {latestOrder.store_name ||
                        'Store Order'}
                    </Text>

                    <Text
                      style={
                        styles.latestOrderDate
                      }
                    >
                      {latestOrder.created_at
                        ? new Date(
                            latestOrder.created_at
                          ).toLocaleDateString(
                            'en-PH',
                            {
                              month:
                                'short',
                              day:
                                'numeric',
                              year:
                                'numeric',
                            }
                          )
                        : 'Recent order'}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.latestOrderStatus
                    }
                  >
                    <View
                      style={
                        styles.latestOrderStatusDot
                      }
                    />

                    <Text
                      style={
                        styles.latestOrderStatusText
                      }
                    >
                      {getLatestOrderStatusText(
                        latestOrder.status
                      )}
                    </Text>
                  </View>
                </View>

                <View
                  style={
                    styles.latestOrderSummary
                  }
                >
                  <View>
                    <Text
                      style={
                        styles.latestOrderMetaLabel
                      }
                    >
                      Items
                    </Text>

                    <Text
                      style={
                        styles.latestOrderMetaValue
                      }
                    >
                      {parseOrderItems(
                        latestOrder.items
                      ).reduce(
                        (
                          total,
                          item
                        ) =>
                          total +
                          getItemQuantity(
                            item
                          ),
                        0
                      )}{' '}
                      item(s)
                    </Text>
                  </View>

                  <View
                    style={
                      styles.latestOrderTotalBlock
                    }
                  >
                    <Text
                      style={
                        styles.latestOrderMetaLabel
                      }
                    >
                      Total
                    </Text>

                    <Text
                      style={
                        styles.latestOrderTotal
                      }
                    >
                      ₱
                      {Number(
                        latestOrder.total_amount ||
                          0
                      ).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View
                  style={
                    styles.latestOrderActions
                  }
                >
                  <AnimatedActionButton
                    style={
                      styles.latestOrderViewButton
                    }
                    onPress={() =>
                      navigation.navigate(
                        'OrderHistory'
                      )
                    }
                  >
                    <Ionicons
                      name="eye-outline"
                      size={15}
                      color={
                        PRIMARY_GREEN
                      }
                    />

                    <Text
                      style={
                        styles.latestOrderViewButtonText
                      }
                    >
                      View Order
                    </Text>
                  </AnimatedActionButton>

                  {parseOrderItems(
                    latestOrder.items
                  ).length >
                    0 &&
                    [
                      'completed',
                      'delivered',
                    ].includes(
                      String(
                        latestOrder.status ||
                          ''
                      )
                        .toLowerCase()
                        .trim()
                    ) && (
                      <AnimatedActionButton
                        style={
                          styles.latestOrderBuyAgainButton
                        }
                        onPress={() =>
                          handleBuyAgain(
                            latestOrder
                          )
                        }
                      >
                        <Ionicons
                          name="repeat-outline"
                          size={15}
                          color="#FFFFFF"
                        />

                        <Text
                          style={
                            styles.latestOrderBuyAgainText
                          }
                        >
                          Bakal liwat
                        </Text>
                      </AnimatedActionButton>
                    )}
                </View>
              </Animated.View>
            )}
          </View>
        </EntranceAnimation>

        {/* ===================================================
            POPULAR PICKS — MARQUEE
        =================================================== */}

        <Animated.View
          style={{
            transform: [
              {
                scale:
                  productsTransition,
              },
            ],
          }}
        >
          <EntranceAnimation
            delay={370}
            distance={18}
          >
            <View
              style={
                styles.productsSection
              }
            >
              <View
                style={
                  styles.productsHeader
                }
              >
                <View
                  style={
                    styles.titleWithIcon
                  }
                >
                  <View
                    style={
                      styles.fireIcon
                    }
                  >
                    <Ionicons
                      name="flame"
                      size={16}
                      color={
                        ACCENT_ORANGE
                      }
                    />
                  </View>

                  <View>
                    <Text
                      style={
                        styles.sectionTitle
                      }
                    >
                      Popular Picks
                    </Text>

                    <Text
                      style={
                        styles.sectionSubtitle
                      }
                    >
                      Customer favorites
                    </Text>
                  </View>
                </View>

                {!loading &&
                  filteredProducts.length >
                    0 && (
                    <TouchableOpacity
                      style={
                        styles.seeAllButton
                      }
                      activeOpacity={0.7}
                      onPress={() =>
                        navigation.navigate(
                          'PopularProducts'
                        )
                      }
                    >
                      <Text
                        style={
                          styles.seeAllText
                        }
                      >
                        See all
                      </Text>

                      <Ionicons
                        name="arrow-forward"
                        size={12}
                        color={
                          PRIMARY_GREEN
                        }
                      />
                    </TouchableOpacity>
                  )}
              </View>

              {loading ? (
                <View
                  style={
                    styles.loadingCard
                  }
                >
                  <View
                    style={
                      styles.loadingIcon
                    }
                  >
                    <ActivityIndicator
                      size="small"
                      color={
                        PRIMARY_GREEN
                      }
                    />
                  </View>

                  <Text
                    style={
                      styles.loadingTitle
                    }
                  >
                    Finding something
                    delicious...
                  </Text>

                  <Text
                    style={
                      styles.loadingSubtitle
                    }
                  >
                    Please wait a moment
                  </Text>
                </View>
              ) : filteredProducts.length ===
                0 ? (
                <View
                  style={
                    styles.emptyCard
                  }
                >
                  <View
                    style={
                      styles.emptyIcon
                    }
                  >
                    <Ionicons
                      name="search-outline"
                      size={24}
                      color="#9CA3AF"
                    />
                  </View>

                  <Text
                    style={
                      styles.emptyTitle
                    }
                  >
                    Nothing found
                  </Text>

                  <Text
                    style={
                      styles.emptyText
                    }
                  >
                    No items are available
                    in this category.
                  </Text>
                </View>
              ) : (
                <MarqueeRow
                  products={
                    filteredProducts
                  }
                  navigation={
                    navigation
                  }
                  onAddToCart={
                    handleAddToCart
                  }
                />
              )}
            </View>
          </EntranceAnimation>
        </Animated.View>

        {/* ===================================================
            STORES
        =================================================== */}

        <EntranceAnimation
          delay={450}
          distance={18}
        >
          <View
            style={
              styles.storesSection
            }
          >
            <View
              style={
                styles.storesHeader
              }
            >
              <View
                style={
                  styles.titleWithIcon
                }
              >
                <View
                  style={
                    styles.storeIcon
                  }
                >
                  <Ionicons
                    name="storefront"
                    size={16}
                    color={
                      ACCENT_TEAL
                    }
                  />
                </View>

                <View>
                  <Text
                    style={
                      styles.sectionTitle
                    }
                  >
                    Merchant Partners
                  </Text>

                  <Text
                    style={
                      styles.sectionSubtitle
                    }
                  >
                    Local stores near you
                  </Text>
                </View>
              </View>

              <View
                style={
                  styles.openBadge
                }
              >
                <View
                  style={
                    styles.openDot
                  }
                />

                <Text
                  style={
                    styles.openText
                  }
                >
                  Open now
                </Text>
              </View>
            </View>

            {stores.length ===
            0 ? (
              <View
                style={
                  styles.storeEmptyCard
                }
              >
                <View
                  style={
                    styles.emptyIcon
                  }
                >
                  <Ionicons
                    name="storefront-outline"
                    size={23}
                    color="#9CA3AF"
                  />
                </View>

                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  No stores available
                </Text>

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Please check again later.
                </Text>
              </View>
            ) : (
              <View
                style={
                  styles.storeList
                }
              >
                {stores.map(
                  (
                    store,
                    index
                  ) => (
                    <StoreCard
                      key={
                        store?.id
                          ? String(
                              store.id
                            )
                          : `store-${index}`
                      }
                      store={
                        store
                      }
                      index={
                        index
                      }
                      navigation={
                        navigation
                      }
                    />
                  )
                )}
              </View>
            )}
          </View>
        </EntranceAnimation>

        <View
          style={
            styles.bottomSpace
          }
        />
      </Animated.ScrollView>

      {/* =====================================================
          PAABOT TA NA
      ===================================================== */}

      <Animated.View
        style={[
          styles.fabWrapper,
          {
            opacity:
              fabTranslate.interpolate(
                {
                  inputRange: [
                    0,
                    35,
                  ],

                  outputRange: [
                    1,
                    0,
                  ],

                  extrapolate:
                    'clamp',
                }
              ),

            transform: [
              {
                translateY:
                  fabTranslate,
              },

              {
                scale:
                  fabScale,
              },
            ],
          },
        ]}
      >
        <TouchableOpacity
          style={
            styles.fab
          }
          activeOpacity={0.85}
          onPress={
            handlePaabotPress
          }
        >
          <LinearGradient
            colors={[
              '#059669',
              '#047857',
              '#0F766E',
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
              styles.fabIcon
            }
          >
            <Ionicons
              name="cube-outline"
              size={22}
              color="#FFFFFF"
            />
          </LinearGradient>

          <View
            style={
              styles.fabContent
            }
          >
            <Text
              style={
                styles.fabLabel
              }
            >
              Need something?
            </Text>

            <Text
              style={
                styles.fabTitle
              }
            >
              Paabot ta na
            </Text>
          </View>

          <View
            style={
              styles.fabArrow
            }
          >
            <Ionicons
              name="arrow-forward"
              size={15}
              color={
                PRIMARY_GREEN
              }
            />
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* =====================================================
          TERMS MODAL
      ===================================================== */}

      <Modal
        visible={
          showTermsModal
        }
        animationType="slide"
        transparent
        onRequestClose={() => {}}
      >
        <View
          style={
            styles.termsOverlay
          }
        >
          <View
            style={
              styles.floatingTermsCard
            }
          >
            <View
              style={
                styles.termsModalHeader
              }
            >
              <Text
                style={
                  styles.termsModalTitle
                }
              >
                Welcome to Paabot
              </Text>

              <TouchableOpacity
                onPress={() => {
                  if (signOut) {
                    signOut();
                  }
                }}
                style={
                  styles.termsCloseBtn
                }
              >
                <Ionicons
                  name="log-out-outline"
                  size={19}
                  color="#EF4444"
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
              <Text
                style={
                  styles.termsH1
                }
              >
                PART I: TERMS AND
                CONDITIONS
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
                By downloading, accessing,
                or using Paabot (the "App"),
                you agree to be bound by
                these Terms and Conditions
                ("Terms"). If you do not
                agree, you must not use the
                App.
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
                Paabot is a delivery platform
                operated by Titech that
                connects customers, merchants,
                and delivery riders to
                facilitate the ordering and
                delivery of products and
                services.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                3. Eligibility
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                You must meet the legal age
                requirements applicable to
                your use of the App.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                4. Account Registration
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                • You must provide accurate,
                current, and complete
                information.
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                • You are responsible for your
                account and password.
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                • You are responsible for
                activity under your account.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                5. Verification
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Paabot may require applicable
                business, rider, or account
                documents before activation
                and may require updated
                documents when necessary.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                6. Orders and Delivery
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                • Orders are subject to
                acceptance and availability.
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                • Delivery times are estimates
                and may vary.
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                • Customers must provide a
                complete and accurate address.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                7. Vehicle Restrictions
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Customers are responsible for
                ensuring that declared items
                can be safely carried by the
                assigned vehicle.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                8. Location Data
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Paabot may use location data
                to facilitate deliveries,
                matching, and tracking.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                9. Payments
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Payment methods and payment
                processing are subject to
                the methods displayed in the
                App and the applicable payment
                provider's terms.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                10. COD
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Cash-on-delivery orders must
                be properly collected and
                remitted according to the
                applicable procedures.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                11. Cancellation
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Users and delivery partners
                must follow the applicable
                cancellation procedures.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                12. Damaged or Lost Items
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Claims for damaged or lost
                items should be submitted
                through the applicable
                Paabot support process.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                13. Fraudulent Orders
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Fraudulent, prank, or abusive
                orders are prohibited.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                14. Rider Protection
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Paabot may take action to
                protect delivery partners
                from fraudulent or abusive
                activity.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                15. Prohibited Items
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Prohibited or unlawful items
                may not be ordered or
                delivered through Paabot.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                16. User Conduct
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Users must not use Paabot
                for unlawful purposes, provide
                false information, harass
                others, or interfere with the
                App.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                17. Intellectual Property
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Paabot content, logos,
                trademarks, and software are
                protected and may not be used
                without permission.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                18. Limitation of Liability
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Liability is limited to the
                extent permitted by applicable
                law.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                19. Indemnification
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Users may be responsible for
                claims arising from misuse of
                the App or violation of these
                Terms.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                20. Suspension and
                Termination
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Paabot may suspend or terminate
                access when these Terms or
                applicable laws are violated.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                21. Dispute Resolution
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Disputes should first be
                addressed through good-faith
                resolution and applicable
                procedures.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                22. Changes to These Terms
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                These Terms may be updated
                from time to time.
              </Text>

              <Text
                style={
                  styles.termsH2
                }
              >
                23. Contact Us
              </Text>

              <Text
                style={
                  styles.termsP
                }
              >
                Titech
                {'\n'}
                Binalbagan Negros Occidental
                {'\n'}
                Email: Paabot@email.com
                {'\n'}
                Phone: 09123456789
              </Text>

              <View
                style={
                  styles.termsRowContainer
                }
              >
                <TouchableOpacity
                  style={
                    styles.checkboxTouch
                  }
                  activeOpacity={
                    0.7
                  }
                  onPress={() =>
                    setAgreedToTerms(
                      !agreedToTerms
                    )
                  }
                >
                  <Ionicons
                    name={
                      agreedToTerms
                        ? 'checkbox'
                        : 'square-outline'
                    }
                    size={22}
                    color={
                      agreedToTerms
                        ? PRIMARY_GREEN
                        : '#9CA3AF'
                    }
                  />
                </TouchableOpacity>

                <Text
                  style={
                    styles.termsText
                  }
                >
                  I have read and agree
                  to the{' '}
                  <Text
                    style={
                      styles.termsLink
                    }
                  >
                    Terms and Conditions
                  </Text>{' '}
                  and{' '}
                  <Text
                    style={
                      styles.termsLink
                    }
                  >
                    Platform Policies
                  </Text>
                  .
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.submitVerificationBtn,
                  (!agreedToTerms ||
                    savingTerms) &&
                    styles.submitVerificationBtnDisabled,
                ]}
                onPress={
                  handleAcceptTerms
                }
                disabled={
                  savingTerms ||
                  !agreedToTerms
                }
              >
                {savingTerms ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                    size="small"
                  />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={18}
                      color="#FFFFFF"
                    />

                    <Text
                      style={
                        styles.submitVerificationText
                      }
                    >
                      I Agree to Continue
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* =====================================================
          QUICK PAABOT ANIMATION
      ===================================================== */}

      {showPaabotAnimation && (
        <OpeningAnimation
          quick={true}
          onFinish={
            handlePaabotAnimationFinish
          }
        />
      )}
    </SafeAreaView>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor:
      '#F7FAF9',
  },

  /* =======================================================
     HEADER
  ======================================================= */

  header: {
    paddingTop:
      Platform.OS ===
      'android'
        ? (StatusBar.currentHeight ||
            20) + 8
        : 14,

    paddingBottom: 18,

    paddingHorizontal: 20,

    borderBottomLeftRadius:
      28,

    borderBottomRightRadius:
      28,

    elevation: 7,

    shadowColor:
      '#047857',

    shadowOffset: {
      width: 0,
      height: 5,
    },

    shadowOpacity:
      0.16,

    shadowRadius:
      10,

    overflow:
      'hidden',
  },

  headerHighlight: {
    position:
      'absolute',

    top: -70,

    right: -40,

    width: 220,

    height: 180,

    borderRadius: 100,

    backgroundColor:
      'rgba(255,255,255,0.07)',
  },

  headerContent: {
    flexDirection:
      'row',

    alignItems:
      'center',

    justifyContent:
      'space-between',
  },

  brandContainer: {
    flex: 1,
  },

  brandTitle: {
    color:
      '#FFFFFF',

    fontSize: 28,

    fontWeight:
      '900',

    letterSpacing:
      -1,
  },

  locationRow: {
    flexDirection:
      'row',

    alignItems:
      'center',

    marginTop: 4,
  },

  locationIconWrap: {
    width: 20,

    height: 20,

    borderRadius: 6,

    backgroundColor:
      'rgba(255,255,255,0.12)',

    alignItems:
      'center',

    justifyContent:
      'center',

    marginRight: 3,
  },

  locationText: {
    color:
      '#D1FAE5',

    fontSize: 10,

    fontWeight:
      '700',

    marginLeft: 2,
  },

  cartButton: {
    width: 49,

    height: 49,

    borderRadius: 16,

    backgroundColor:
      '#FFFFFF',

    alignItems:
      'center',

    justifyContent:
      'center',

    position:
      'relative',

    elevation: 4,

    shadowColor:
      '#000000',

    shadowOffset: {
      width: 0,
      height: 2,
    },

    shadowOpacity:
      0.12,

    shadowRadius:
      5,
  },

  cartIconCircle: {
    width: 41,

    height: 41,

    borderRadius: 13,

    backgroundColor:
      '#ECFDF5',

    alignItems:
      'center',

    justifyContent:
      'center',
  },

  cartBadge: {
    position:
      'absolute',

    top: -6,

    right: -6,

    minWidth: 20,

    height: 20,

    borderRadius: 10,

    paddingHorizontal: 3,

    backgroundColor:
      '#EF4444',

    alignItems:
      'center',

    justifyContent:
      'center',

    borderWidth: 2,

    borderColor:
      '#FFFFFF',
  },

  cartBadgeText: {
    color:
      '#FFFFFF',

    fontSize: 8,

    fontWeight:
      '900',
  },

  /* =======================================================
     CONTENT
  ======================================================= */

  scrollContent: {
    paddingTop: 22,

    paddingBottom:
      160,
  },

  /* =======================================================
     WELCOME
  ======================================================= */

  welcomeSection: {
    paddingHorizontal: 20,

    marginBottom: 28,
  },

  welcomeGreeting: {
    color:
      PRIMARY_GREEN,

    fontSize: 9.5,

    fontWeight:
      '900',

    textTransform:
      'uppercase',

    letterSpacing:
      1,

    marginBottom: 4,
  },

  welcomeTitle: {
    color:
      '#111827',

    fontSize: 27,

    lineHeight: 32,

    fontWeight:
      '900',

    letterSpacing:
      -1,
  },

  welcomeSubtitle: {
    color:
      '#6B7280',

    fontSize: 12,

    lineHeight: 18,

    marginTop: 7,

    marginBottom: 16,

    fontWeight:
      '500',
  },

  /* =======================================================
     SEARCH
  ======================================================= */

  searchContainer: {
    height: 54,

    backgroundColor:
      '#FFFFFF',

    borderRadius: 16,

    flexDirection:
      'row',

    alignItems:
      'center',

    paddingHorizontal: 7,

    borderWidth: 1,

    borderColor:
      '#E4ECE7',

    elevation: 3,

    shadowColor:
      '#14532D',

    shadowOffset: {
      width: 0,
      height: 2,
    },

    shadowOpacity:
      0.05,

    shadowRadius:
      7,
  },

  searchIconContainer: {
    width: 38,

    height: 38,

    borderRadius: 11,

    backgroundColor:
      '#ECFDF5',

    alignItems:
      'center',

    justifyContent:
      'center',
  },

  searchPlaceholder: {
    flex: 1,

    marginLeft: 10,

    color:
      '#9CA3AF',

    fontSize: 12.5,

    fontWeight:
      '700',
  },

  searchArrow: {
    width: 30,

    height: 30,

    borderRadius: 9,

    backgroundColor:
      '#F0FDF4',

    alignItems:
      'center',

    justifyContent:
      'center',

    marginRight: 2,
  },

  /* =======================================================
     GENERAL
  ======================================================= */

  sectionHeader: {
    paddingHorizontal: 20,

    marginBottom: 12,

    flexDirection:
      'row',

    alignItems:
      'center',

    justifyContent:
      'space-between',
  },

  sectionTitle: {
    color:
      '#111827',

    fontSize: 16,

    fontWeight:
      '900',

    letterSpacing:
      -0.3,
  },

  sectionSubtitle: {
    color:
      '#9CA3AF',

    fontSize: 10,

    fontWeight:
      '600',

    marginTop: 3,
  },

  /* =======================================================
     CATEGORIES — PILLS
  ======================================================= */

  categorySection: {
    marginBottom: 24,
  },

  categoryScroll: {
    paddingHorizontal: 20,
  },

  categoryPill: {
    flexDirection:
      'row',

    alignItems:
      'center',

    height: 42,

    paddingLeft: 5,

    paddingRight: 14,

    marginRight: 9,

    borderRadius: 999,

    backgroundColor:
      '#FFFFFF',

    borderWidth: 1,

    borderColor:
      '#E3EAE6',

    elevation: 1,

    shadowColor:
      '#14532D',

    shadowOffset: {
      width: 0,
      height: 1,
    },

    shadowOpacity:
      0.02,

    shadowRadius:
      3,
  },

  categoryPillIcon: {
    width: 32,

    height: 32,

    borderRadius: 16,

    alignItems:
      'center',

    justifyContent:
      'center',

    marginRight: 7,
  },

  categoryPillText: {
    fontSize: 12,

    fontWeight:
      '800',

    color:
      '#4B5563',
  },

  /* =======================================================
     LATEST ORDER
  ======================================================= */

  latestOrderSection: {
    paddingHorizontal: 20,

    marginBottom: 23,
  },

  latestOrderHeader: {
    flexDirection:
      'row',

    alignItems:
      'center',

    justifyContent:
      'space-between',

    marginBottom: 11,
  },

  latestOrderViewAll: {
    flexDirection:
      'row',

    alignItems:
      'center',

    paddingVertical: 5,

    paddingLeft: 8,
  },

  latestOrderViewAllText: {
    fontSize: 10.5,

    fontWeight:
      '800',

    color:
      PRIMARY_GREEN,
  },

  latestOrderCard: {
    backgroundColor:
      '#FFFFFF',

    borderRadius: 18,

    padding: 14,

    borderWidth: 1,

    borderColor:
      '#DDEBE4',

    shadowColor:
      '#14532D',

    shadowOffset: {
      width: 0,
      height: 3,
    },

    shadowOpacity:
      0.06,

    shadowRadius:
      8,

    elevation: 2,
  },

  latestOrderEmpty: {
    flexDirection:
      'row',

    alignItems:
      'center',

    minHeight: 78,
  },

  latestOrderLoadingText: {
    marginLeft: 10,

    color:
      '#6B7280',

    fontSize: 11.5,

    fontWeight:
      '600',
  },

  latestOrderIcon: {
    width: 43,

    height: 43,

    borderRadius: 13,

    alignItems:
      'center',

    justifyContent:
      'center',

    backgroundColor:
      '#ECFDF5',

    borderWidth: 1,

    borderColor:
      '#D1FAE5',
  },

  latestOrderIconFilled: {
    backgroundColor:
      PRIMARY_GREEN,

    borderColor:
      PRIMARY_GREEN,
  },

  latestOrderEmptyContent: {
    flex: 1,

    marginLeft: 11,
  },

  latestOrderTopRow: {
    flexDirection:
      'row',

    alignItems:
      'center',
  },

  latestOrderMain: {
    flex: 1,

    marginLeft: 11,

    marginRight: 8,
  },

  latestOrderStore: {
    color:
      '#111827',

    fontSize: 13.5,

    fontWeight:
      '900',
  },

  latestOrderDate: {
    color:
      '#9CA3AF',

    fontSize: 10,

    fontWeight:
      '600',

    marginTop: 2,
  },

  latestOrderTitle: {
    color:
      '#111827',

    fontSize: 12.5,

    fontWeight:
      '900',
  },

  latestOrderSubtitle: {
    color:
      '#6B7280',

    fontSize: 10.5,

    lineHeight: 15,

    marginTop: 3,
  },

  latestOrderStatus: {
    flexDirection:
      'row',

    alignItems:
      'center',

    paddingHorizontal: 7,

    paddingVertical: 5,

    borderRadius: 999,

    backgroundColor:
      '#ECFDF5',

    maxWidth: 110,
  },

  latestOrderStatusDot: {
    width: 5,

    height: 5,

    borderRadius: 3,

    backgroundColor:
      PRIMARY_GREEN,

    marginRight: 4,
  },

  latestOrderStatusText: {
    color:
      DEEP_GREEN,

    fontSize: 8.5,

    fontWeight:
      '900',

    flexShrink: 1,
  },

  latestOrderSummary: {
    flexDirection:
      'row',

    justifyContent:
      'space-between',

    marginTop: 13,

    paddingTop: 11,

    borderTopWidth: 1,

    borderTopColor:
      '#F1F5F9',
  },

  latestOrderMetaLabel: {
    color:
      '#9CA3AF',

    fontSize: 8.5,

    fontWeight:
      '700',

    textTransform:
      'uppercase',

    letterSpacing:
      0.5,
  },

  latestOrderMetaValue: {
    color:
      '#374151',

    fontSize: 11.5,

    fontWeight:
      '800',

    marginTop: 2,
  },

  latestOrderTotalBlock: {
    alignItems:
      'flex-end',
  },

  latestOrderTotal: {
    color:
      DEEP_GREEN,

    fontSize: 14,

    fontWeight:
      '900',

    marginTop: 2,
  },

  latestOrderActions: {
    flexDirection:
      'row',

    marginTop: 12,

    gap: 7,
  },

  latestOrderViewButton: {
    minHeight: 38,

    borderRadius: 11,

    borderWidth: 1,

    borderColor:
      '#CDEFE0',

    backgroundColor:
      '#F0FDF4',

    flexDirection:
      'row',

    alignItems:
      'center',

    justifyContent:
      'center',

    paddingHorizontal: 10,
  },

  latestOrderViewButtonText: {
    color:
      DEEP_GREEN,

    fontSize: 10.5,

    fontWeight:
      '900',

    marginLeft: 5,
  },

  latestOrderBuyAgainButton: {
    minHeight: 38,

    borderRadius: 11,

    backgroundColor:
      PRIMARY_GREEN,

    flexDirection:
      'row',

    alignItems:
      'center',

    justifyContent:
      'center',

    paddingHorizontal: 10,

    elevation: 2,
  },

  latestOrderBuyAgainText: {
    color:
      '#FFFFFF',

    fontSize: 10.5,

    fontWeight:
      '900',

    marginLeft: 5,
  },

  /* =======================================================
     PRODUCTS HEADER
  ======================================================= */

  productsSection: {
    marginBottom: 29,
  },

  productsHeader: {
    paddingHorizontal: 20,

    marginBottom: 13,

    flexDirection:
      'row',

    alignItems:
      'center',

    justifyContent:
      'space-between',
  },

  titleWithIcon: {
    flexDirection:
      'row',

    alignItems:
      'center',
  },

  fireIcon: {
    width: 34,

    height: 34,

    borderRadius: 11,

    backgroundColor:
      '#FFF7ED',

    borderWidth: 1,

    borderColor:
      '#FED7AA',

    alignItems:
      'center',

    justifyContent:
      'center',

    marginRight: 9,
  },

  storeIcon: {
    width: 34,

    height: 34,

    borderRadius: 11,

    backgroundColor:
      '#ECFEFF',

    borderWidth: 1,

    borderColor:
      '#A5F3FC',

    alignItems:
      'center',

    justifyContent:
      'center',

    marginRight: 9,
  },

  seeAllButton: {
    flexDirection:
      'row',

    alignItems:
      'center',

    backgroundColor:
      '#ECFDF5',

    paddingHorizontal: 10,

    paddingVertical: 6,

    borderRadius: 9,

    borderWidth: 1,

    borderColor:
      '#D1FAE5',
  },

  seeAllText: {
    color:
      PRIMARY_GREEN,

    fontSize: 10,

    fontWeight:
      '900',

    marginRight: 3,
  },

  loadingCard: {
    marginHorizontal: 20,

    minHeight: 150,

    borderRadius: 18,

    backgroundColor:
      '#FFFFFF',

    alignItems:
      'center',

    justifyContent:
      'center',

    borderWidth: 1,

    borderColor:
      '#E3EAE6',
  },

  loadingIcon: {
    width: 46,

    height: 46,

    borderRadius: 14,

    backgroundColor:
      '#ECFDF5',

    borderWidth: 1,

    borderColor:
      '#D1FAE5',

    alignItems:
      'center',

    justifyContent:
      'center',
  },

  loadingTitle: {
    color:
      '#374151',

    fontSize: 11.5,

    fontWeight:
      '800',

    marginTop: 10,
  },

  loadingSubtitle: {
    color:
      '#9CA3AF',

    fontSize: 9.5,

    marginTop: 3,
  },

  emptyCard: {
    marginHorizontal: 20,

    minHeight: 150,

    backgroundColor:
      '#FFFFFF',

    borderRadius: 18,

    alignItems:
      'center',

    justifyContent:
      'center',

    paddingHorizontal: 25,

    borderWidth: 1,

    borderColor:
      '#E3EAE6',
  },

  emptyIcon: {
    width: 48,

    height: 48,

    borderRadius: 24,

    backgroundColor:
      '#F3F4F6',

    alignItems:
      'center',

    justifyContent:
      'center',

    marginBottom: 10,
  },

  emptyTitle: {
    color:
      '#374151',

    fontSize: 12.5,

    fontWeight:
      '900',

    marginBottom: 3,
  },

  emptyText: {
    color:
      '#9CA3AF',

    fontSize: 10,

    lineHeight: 15,

    fontWeight:
      '600',

    textAlign:
      'center',
  },

  /* =======================================================
     MARQUEE
  ======================================================= */

  marqueeScroll: {
    paddingHorizontal: 20,

    paddingVertical: 4,
  },

  marqueeCardWrapper: {
    width:
      MARQUEE_CARD_WIDTH,

    marginRight:
      MARQUEE_CARD_SPACING,
  },

  marqueeCard: {
    backgroundColor:
      '#FFFFFF',

    borderRadius: 17,

    overflow:
      'hidden',

    borderWidth: 1,

    borderColor:
      '#E0E9E4',

    elevation: 4,

    shadowColor:
      '#0F2F25',

    shadowOffset: {
      width: 0,
      height: 3,
    },

    shadowOpacity:
      0.08,

    shadowRadius:
      8,
  },

  marqueeImageContainer: {
    height: 108,

    width: '100%',

    backgroundColor:
      '#F3F4F6',

    position:
      'relative',

    overflow:
      'hidden',
  },

  marqueeImage: {
    width: '100%',

    height: '100%',

    resizeMode:
      'cover',
  },

  marqueeImageFallback: {
    flex: 1,

    backgroundColor:
      '#ECFDF5',

    alignItems:
      'center',

    justifyContent:
      'center',
  },

  marqueeBadge: {
    position:
      'absolute',

    top: 7,

    left: 7,

    width: 20,

    height: 20,

    borderRadius: 7,

    backgroundColor:
      'rgba(234,88,12,0.92)',

    alignItems:
      'center',

    justifyContent:
      'center',
  },

  marqueeContent: {
    paddingHorizontal: 10,

    paddingVertical: 9,
  },

  marqueeName: {
    color:
      '#111827',

    fontSize: 12.5,

    fontWeight:
      '900',

    letterSpacing:
      -0.1,
  },

  /* NEW STORE ROW STYLES */
  marqueeStoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },

  marqueeStoreName: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 3,
    flex: 1,
  },

  marqueeBottom: {
    flexDirection:
      'row',

    alignItems:
      'center',

    justifyContent:
      'space-between',

    marginTop: 7,
  },

  marqueePrice: {
    color:
      PRIMARY_GREEN,

    fontSize: 13.5,

    fontWeight:
      '900',

    flex: 1,

    marginRight: 6,
  },

  marqueeAddBtn: {
    width: 26,

    height: 26,

    borderRadius: 9,

    backgroundColor:
      PRIMARY_GREEN,

    alignItems:
      'center',

    justifyContent:
      'center',
  },

  marqueeAddBtnAdded: {
    backgroundColor:
      DARK_GREEN,
  },

  /* =======================================================
     STORES
  ======================================================= */

  storesSection: {
    paddingHorizontal: 20,

    marginBottom: 8,
  },

  storesHeader: {
    flexDirection:
      'row',

    alignItems:
      'center',

    justifyContent:
      'space-between',

    marginBottom: 13,
  },

  openBadge: {
    flexDirection:
      'row',

    alignItems:
      'center',

    backgroundColor:
      '#ECFDF5',

    borderWidth: 1,

    borderColor:
      '#A7F3D0',

    paddingHorizontal: 8,

    paddingVertical: 5,

    borderRadius: 9,
  },

  openDot: {
    width: 6,

    height: 6,

    borderRadius: 3,

    backgroundColor:
      '#10B981',

    marginRight: 4,
  },

  openText: {
    color:
      PRIMARY_GREEN,

    fontSize: 8.5,

    fontWeight:
      '900',
  },

  storeList: {},

  storeCard: {
    minHeight: 92,

    backgroundColor:
      '#FFFFFF',

    borderRadius: 17,

    padding: 10,

    marginBottom: 10,

    flexDirection:
      'row',

    alignItems:
      'center',

    borderWidth: 1,

    borderColor:
      '#E2EAE5',

    elevation: 2,

    shadowColor:
      '#000000',

    shadowOffset: {
      width: 0,
      height: 1,
    },

    shadowOpacity:
      0.03,

    shadowRadius:
      4,
  },

  storeImageWrap: {
    position:
      'relative',
  },

  storeImage: {
    width: 68,

    height: 68,

    borderRadius: 14,

    resizeMode:
      'cover',
  },

  storeFallback: {
    width: 68,

    height: 68,

    borderRadius: 14,

    backgroundColor:
      '#ECFDF5',

    alignItems:
      'center',

    justifyContent:
      'center',
  },

  storeOnlineBadge: {
    position:
      'absolute',

    top: -2,

    right: -2,

    width: 18,

    height: 18,

    borderRadius: 9,

    backgroundColor:
      '#FFFFFF',

    alignItems:
      'center',

    justifyContent:
      'center',
  },

  storeOnlineDot: {
    width: 8,

    height: 8,

    borderRadius: 4,

    backgroundColor:
      '#10B981',
  },

  storeInfo: {
    flex: 1,

    marginLeft: 11,

    marginRight: 8,
  },

  storeName: {
    color:
      '#111827',

    fontSize: 14,

    fontWeight:
      '900',
  },

  storeAddressRow: {
    flexDirection:
      'row',

    alignItems:
      'center',

    marginTop: 4,
  },

  storeAddress: {
    flex: 1,

    color:
      '#6B7280',

    fontSize: 10,

    fontWeight:
      '500',

    marginLeft: 4,
  },

  storeDetails: {
    flexDirection:
      'row',

    alignItems:
      'center',

    marginTop: 6,
  },

  ratingBadge: {
    backgroundColor:
      '#FFFBEB',

    flexDirection:
      'row',

    alignItems:
      'center',

    paddingHorizontal: 7,

    paddingVertical: 3,

    borderRadius: 6,

    marginRight: 5,

    borderWidth: 1,

    borderColor:
      '#FDE68A',
  },

  ratingText: {
    color:
      '#B45309',

    fontSize: 9,

    fontWeight:
      '900',

    marginLeft: 2,
  },

  deliveryBadge: {
    flexDirection:
      'row',

    alignItems:
      'center',

    backgroundColor:
      '#ECFEFF',

    paddingHorizontal: 6,

    paddingVertical: 3,

    borderRadius: 6,
  },

  deliveryText: {
    color:
      ACCENT_TEAL,

    fontSize: 9,

    fontWeight:
      '900',

    marginLeft: 2,
  },

  arrowButton: {
    width: 33,

    height: 33,

    borderRadius: 16,

    backgroundColor:
      '#ECFDF5',

    alignItems:
      'center',

    justifyContent:
      'center',
  },

  storeEmptyCard: {
    backgroundColor:
      '#FFFFFF',

    borderRadius: 17,

    minHeight: 155,

    alignItems:
      'center',

    justifyContent:
      'center',

    paddingHorizontal: 20,

    borderWidth: 1,

    borderColor:
      '#E3EAE6',
  },

  bottomSpace: {
    height: 20,
  },

  /* =======================================================
     PAABOT TA NA
  ======================================================= */

  fabWrapper: {
    position:
      'absolute',

    left: 16,

    right: 16,

    bottom:
      Platform.OS ===
      'ios'
        ? 90
        : 82,

    zIndex: 20,
  },

  fab: {
    minHeight: 64,

    borderRadius: 20,

    backgroundColor:
      '#FFFFFF',

    flexDirection:
      'row',

    alignItems:
      'center',

    paddingHorizontal: 8,

    borderWidth: 1,

    borderColor:
      '#BFE8D3',

    elevation: 8,

    shadowColor:
      '#047857',

    shadowOffset: {
      width: 0,
      height: 3,
    },

    shadowOpacity:
      0.15,

    shadowRadius:
      8,
  },

  fabIcon: {
    width: 46,

    height: 46,

    borderRadius: 15,

    alignItems:
      'center',

    justifyContent:
      'center',
  },

  fabContent: {
    flex: 1,

    marginLeft: 10,
  },

  fabLabel: {
    color:
      '#6B7280',

    fontSize: 9,

    fontWeight:
      '600',
  },

  fabTitle: {
    color:
      DEEP_GREEN,

    fontSize: 12.5,

    fontWeight:
      '900',

    marginTop: 1,
  },

  fabArrow: {
    width: 32,

    height: 32,

    borderRadius: 16,

    backgroundColor:
      '#ECFDF5',

    alignItems:
      'center',

    justifyContent:
      'center',

    marginRight: 2,
  },

  /* =======================================================
     TERMS
  ======================================================= */

  termsOverlay: {
    flex: 1,

    backgroundColor:
      'rgba(15,23,42,0.65)',

    justifyContent:
      'center',

    alignItems:
      'center',

    padding: 20,
  },

  floatingTermsCard: {
    backgroundColor:
      '#FFFFFF',

    width: '100%',

    maxHeight: '85%',

    borderRadius: 23,

    overflow:
      'hidden',

    elevation: 11,

    shadowColor:
      '#000000',

    shadowOffset: {
      width: 0,
      height: 6,
    },

    shadowOpacity:
      0.22,

    shadowRadius:
      10,
  },

  termsModalHeader: {
    flexDirection:
      'row',

    alignItems:
      'center',

    justifyContent:
      'space-between',

    paddingHorizontal: 20,

    paddingVertical: 15,

    borderBottomWidth: 1,

    borderBottomColor:
      '#E5E7EB',

    backgroundColor:
      '#F9FAFB',
  },

  termsModalTitle: {
    fontSize: 17,

    fontWeight:
      '800',

    color:
      '#111827',
  },

  termsCloseBtn: {
    padding: 7,

    backgroundColor:
      '#FEE2E2',

    borderRadius: 18,
  },

  termsScrollContent: {
    padding: 19,

    paddingBottom: 35,
  },

  termsH1: {
    fontSize: 19,

    fontWeight:
      '900',

    color:
      '#111827',

    marginBottom: 18,

    textAlign:
      'center',
  },

  termsH2: {
    fontSize: 14.5,

    fontWeight:
      '800',

    color:
      '#111827',

    marginTop: 22,

    marginBottom: 7,
  },

  termsP: {
    fontSize: 13,

    color:
      '#4B5563',

    lineHeight: 21,

    marginBottom: 7,
  },

  termsRowContainer: {
    flexDirection:
      'row',

    alignItems:
      'flex-start',

    marginTop: 15,

    marginBottom: 7,

    backgroundColor:
      '#F9FAFB',

    padding: 11,

    borderRadius: 11,

    borderWidth: 1,

    borderColor:
      '#E5E7EB',
  },

  checkboxTouch: {
    marginRight: 9,

    marginTop: 2,
  },

  termsText: {
    flex: 1,

    fontSize: 12.5,

    color:
      '#4B5563',

    lineHeight: 19,
  },

  termsLink: {
    color:
      PRIMARY_GREEN,

    fontWeight:
      '700',

    textDecorationLine:
      'underline',
  },

  submitVerificationBtn: {
    flexDirection:
      'row',

    justifyContent:
      'center',

    backgroundColor:
      PRIMARY_GREEN,

    paddingVertical: 13,

    borderRadius: 11,

    alignItems:
      'center',

    marginTop: 15,
  },

  submitVerificationBtnDisabled: {
    backgroundColor:
      '#9CA3AF',
  },

  submitVerificationText: {
    color:
      '#FFFFFF',

    fontSize: 14.5,

    fontWeight:
      '800',

    marginLeft: 5,
  },
});