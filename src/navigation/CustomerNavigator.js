import React, {
  useEffect,
  useRef,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Platform,
} from 'react-native';

import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack';

import {
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';

import { Ionicons } from '@expo/vector-icons';

import HomeScreen from '../screens/customer/HomeScreen';
import SearchScreen from '../screens/customer/SearchScreen';
import PopularProductsScreen from '../screens/customer/PopularProductsScreen';
import NewDeliveryRequestScreen from '../screens/customer/NewDeliveryRequestScreen';
import OrderTrackingScreen from '../screens/customer/OrderTrackingScreen';
import OrderHistoryScreen from '../screens/customer/OrderHistoryScreen';
import SavedAddressesScreen from '../screens/customer/SavedAddressesScreen';
import StoreDetailsScreen from '../screens/customer/StoreDetailsScreen';
import StoreMenuScreen from '../screens/customer/StoreMenuScreen';
import ProfileScreen from '../screens/customer/ProfileScreen';
import ProductDetailsScreen from '../screens/customer/ProductDetailsScreen';
import CartScreen from '../screens/customer/CartScreen';
import CheckoutScreen from '../screens/customer/CheckoutScreen';
import CustomerVerificationScreen from '../screens/customer/CustomerVerificationScreen';

import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/* =========================================================
   ANIMATED TAB BAR
========================================================= */

function AnimatedTabBar({
  state,
  descriptors,
  navigation,
}) {
  const animations = useRef({}).current;

  const getAnimation = (key) => {
    if (!animations[key]) {
      animations[key] =
        new Animated.Value(0);
    }

    return animations[key];
  };

  useEffect(() => {
    state.routes.forEach(
      (route, index) => {
        const isFocused =
          state.index === index;

        const animation =
          getAnimation(
            route.key
          );

        Animated.spring(
          animation,
          {
            toValue: isFocused
              ? 1
              : 0,

            useNativeDriver: true,

            friction: 7,

            tension: 80,
          }
        ).start();
      }
    );
  }, [
    state.index,
    state.routes,
  ]);

  return (
    <View
      style={
        styles.tabBarWrapper
      }
    >
      <View
        style={
          styles.tabBar
        }
      >
        {state.routes.map(
          (route, index) => {
            const { options } =
              descriptors[
                route.key
              ];

            const isFocused =
              state.index ===
              index;

            const animation =
              getAnimation(
                route.key
              );

            let iconName;

            if (
              route.name ===
              'HomeTab'
            ) {
              iconName =
                isFocused
                  ? 'home'
                  : 'home-outline';
            } else if (
              route.name ===
              'StoreTab'
            ) {
              iconName =
                isFocused
                  ? 'storefront'
                  : 'storefront-outline';
            } else if (
              route.name ===
              'OrdersTab'
            ) {
              iconName =
                isFocused
                  ? 'receipt'
                  : 'receipt-outline';
            } else if (
              route.name ===
              'ProfileTab'
            ) {
              iconName =
                isFocused
                  ? 'person'
                  : 'person-outline';
            }

            const scale =
              animation.interpolate(
                {
                  inputRange: [
                    0,
                    1,
                  ],
                  outputRange: [
                    1,
                    1.08,
                  ],
                }
              );

            const translateY =
              animation.interpolate(
                {
                  inputRange: [
                    0,
                    1,
                  ],
                  outputRange: [
                    0,
                    -2,
                  ],
                }
              );

            const iconScale =
              animation.interpolate(
                {
                  inputRange: [
                    0,
                    1,
                  ],
                  outputRange: [
                    1,
                    1.16,
                  ],
                }
              );

            const labelOpacity =
              animation.interpolate(
                {
                  inputRange: [
                    0,
                    0.5,
                    1,
                  ],
                  outputRange: [
                    0,
                    0.5,
                    1,
                  ],
                }
              );

            const labelTranslate =
              animation.interpolate(
                {
                  inputRange: [
                    0,
                    1,
                  ],
                  outputRange: [
                    5,
                    0,
                  ],
                }
              );

            const onPress = () => {
              const event =
                navigation.emit({
                  type: 'tabPress',
                  target:
                    route.key,
                  canPreventDefault:
                    true,
                });

              if (
                !isFocused &&
                !event.defaultPrevented
              ) {
                navigation.navigate(
                  route.name
                );
              }
            };

            const onLongPress =
              () => {
                navigation.emit({
                  type:
                    'tabLongPress',
                  target:
                    route.key,
                });
              };

            const label =
              options.tabBarLabel !==
              undefined
                ? options.tabBarLabel
                : options.title !==
                  undefined
                ? options.title
                : route.name;

            return (
              <Pressable
                key={
                  route.key
                }
                onPress={
                  onPress
                }
                onLongPress={
                  onLongPress
                }
                style={
                  styles.tabButton
                }
                android_ripple={{
                  color:
                    'rgba(5,150,105,0.08)',
                  borderless:
                    true,
                }}
              >
                <Animated.View
                  style={[
                    styles.tabItem,
                    {
                      transform: [
                        {
                          scale,
                        },
                        {
                          translateY,
                        },
                      ],
                    },
                  ]}
                >
                  {/* ACTIVE PILL */}

                  <Animated.View
                    style={[
                      styles.activePill,
                      {
                        opacity:
                          animation,

                        transform: [
                          {
                            scale:
                              animation.interpolate(
                                {
                                  inputRange: [
                                    0,
                                    1,
                                  ],
                                  outputRange: [
                                    0.7,
                                    1,
                                  ],
                                }
                              ),
                          },
                        ],
                      },
                    ]}
                  />

                  {/* ICON */}

                  <Animated.View
                    style={[
                      styles.iconCircle,
                      {
                        transform: [
                          {
                            scale:
                              iconScale,
                          },
                        ],
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        iconName
                      }
                      size={22}
                      color={
                        isFocused
                          ? '#FFFFFF'
                          : '#7B8790'
                      }
                    />
                  </Animated.View>

                  {/* LABEL */}

                  <Animated.Text
                    style={[
                      styles.tabLabel,
                      {
                        opacity:
                          labelOpacity,

                        transform: [
                          {
                            translateY:
                              labelTranslate,
                          },
                        ],
                      },
                    ]}
                  >
                    {label}
                  </Animated.Text>
                </Animated.View>
              </Pressable>
            );
          }
        )}
      </View>
    </View>
  );
}

/* =========================================================
   CUSTOMER TAB NAVIGATOR
========================================================= */

function CustomerTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <AnimatedTabBar
          {...props}
        />
      )}
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        lazy: true,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
        }}
      />

      <Tab.Screen
        name="StoreTab"
        component={
          StoreDetailsScreen
        }
        options={{
          tabBarLabel: 'Store',
        }}
      />

      <Tab.Screen
        name="OrdersTab"
        component={
          OrderHistoryScreen
        }
        options={{
          tabBarLabel: 'My Orders',
        }}
      />

      <Tab.Screen
        name="ProfileTab"
        component={
          ProfileScreen
        }
        options={{
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
}

/* =========================================================
   CUSTOMER NAVIGATOR
========================================================= */

export default function CustomerNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,

        animation:
          'slide_from_right',

        gestureEnabled: true,

        contentStyle: {
          backgroundColor:
            '#F3F6F4',
        },
      }}
    >
      {/* =================================================
          MAIN CUSTOMER TABS
      ================================================= */}

      <Stack.Screen
        name="CustomerTabs"
        component={
          CustomerTabNavigator
        }
        options={{
          animation: 'fade',
        }}
      />

      {/* =================================================
          SEARCH
      ================================================= */}

      <Stack.Screen
        name="Search"
        component={
          SearchScreen
        }
        options={{
          headerShown: false,
          animation:
            'slide_from_right',
          gestureEnabled: true,
        }}
      />

      {/* =================================================
          POPULAR PRODUCTS
      ================================================= */}

      <Stack.Screen
        name="PopularProducts"
        component={
          PopularProductsScreen
        }
        options={{
          headerShown: false,
          animation:
            'slide_from_right',
        }}
      />

      {/* =================================================
          CART
      ================================================= */}

      <Stack.Screen
        name="Cart"
        component={CartScreen}
        options={{
          headerShown: false,
          animation:
            'slide_from_right',
        }}
      />

      {/* =================================================
          CHECKOUT
      ================================================= */}

      <Stack.Screen
        name="Checkout"
        component={
          CheckoutScreen
        }
        options={{
          headerShown: false,
          animation:
            'slide_from_right',
        }}
      />

      {/* =================================================
          STORE MENU
      ================================================= */}

      <Stack.Screen
        name="StoreMenuScreen"
        component={
          StoreMenuScreen
        }
        options={{
          headerShown: false,
          animation:
            'slide_from_right',
        }}
      />

      {/* =================================================
          PRODUCT DETAILS
      ================================================= */}

      <Stack.Screen
        name="ProductDetails"
        component={
          ProductDetailsScreen
        }
        options={{
          headerShown: false,
          animation:
            'slide_from_right',
        }}
      />

      {/* =================================================
          NEW DELIVERY REQUEST
      ================================================= */}

      <Stack.Screen
        name="NewDeliveryRequest"
        component={
          NewDeliveryRequestScreen
        }
        options={{
          headerShown: false,
          animation:
            'slide_from_right',
        }}
      />

      {/* =================================================
          ORDER TRACKING
      ================================================= */}

      <Stack.Screen
        name="OrderTracking"
        component={
          OrderTrackingScreen
        }
        options={{
          headerShown: false,
          animation:
            'slide_from_right',
        }}
      />

      {/* =================================================
          STORE DETAILS
      ================================================= */}

      <Stack.Screen
        name="StoreDetails"
        component={
          StoreDetailsScreen
        }
        options={{
          headerShown: false,
          animation:
            'slide_from_right',
        }}
      />

      {/* =================================================
          PROFILE
      ================================================= */}

      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerShown: false,
          animation:
            'slide_from_right',
        }}
      />

      {/* =================================================
          SAVED ADDRESSES
      ================================================= */}

      <Stack.Screen
        name="SavedAddresses"
        component={
          SavedAddressesScreen
        }
        options={{
          headerShown: false,
          animation:
            'slide_from_right',
        }}
      />

      {/* =================================================
          ORDER HISTORY
      ================================================= */}

      <Stack.Screen
        name="OrderHistory"
        component={
          OrderHistoryScreen
        }
        options={{
          headerShown: false,
          animation:
            'slide_from_right',
        }}
      />
  {/* =================================================
          CUSTOMER VERIFICATION
      ================================================= */}

      <Stack.Screen
        name="CustomerVerification"
        component={
          CustomerVerificationScreen
        }
        options={{
          headerShown: false,
          animation:
            'slide_from_right',
        }}
      />



    </Stack.Navigator>
  );
}




/* =========================================================
   STYLES
========================================================= */

const styles =
  StyleSheet.create({
    /* =====================================================
       TAB BAR WRAPPER
    ===================================================== */

    tabBarWrapper: {
      backgroundColor:
        'transparent',

      paddingHorizontal: 10,

      paddingBottom:
        Platform.OS === 'ios'
          ? 7
          : 8,

      paddingTop: 5,
    },

    /* =====================================================
       TAB BAR
    ===================================================== */

    tabBar: {
      height: 65,

      backgroundColor:
        '#FFFFFF',

      borderRadius: 20,

      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-around',

      paddingHorizontal: 5,

      borderWidth: 1,

      borderColor:
        '#E6ECE9',

      shadowColor:
        '#0F2F25',

      shadowOffset: {
        width: 0,
        height: 4,
      },

      shadowOpacity: 0.08,

      shadowRadius: 10,

      elevation: 8,
    },

    /* =====================================================
       TAB BUTTON
    ===================================================== */

    tabButton: {
      flex: 1,

      height: 58,

      alignItems:
        'center',

      justifyContent:
        'center',

      paddingHorizontal: 2,
    },

    /* =====================================================
       TAB ITEM
    ===================================================== */

    tabItem: {
      minWidth: 68,

      height: 48,

      borderRadius: 15,

      alignItems:
        'center',

      justifyContent:
        'center',

      position:
        'relative',

      paddingHorizontal: 8,
    },

    /* =====================================================
       ACTIVE PILL
    ===================================================== */

    activePill: {
      position:
        'absolute',

      top: 2,

      bottom: 2,

      left: 1,

      right: 1,

      borderRadius: 15,

      backgroundColor:
        colors?.primary ||
        '#059669',

      shadowColor:
        colors?.primary ||
        '#059669',

      shadowOffset: {
        width: 0,
        height: 3,
      },

      shadowOpacity: 0.18,

      shadowRadius: 6,

      elevation: 3,
    },

    /* =====================================================
       ICON
    ===================================================== */

    iconCircle: {
      width: 25,

      height: 25,

      alignItems:
        'center',

      justifyContent:
        'center',

      zIndex: 2,
    },

    /* =====================================================
       LABEL
    ===================================================== */

    tabLabel: {
      marginTop: 2,

      fontSize: 8.5,

      lineHeight: 11,

      fontWeight: '800',

      color: '#FFFFFF',

      zIndex: 2,
    },
  });