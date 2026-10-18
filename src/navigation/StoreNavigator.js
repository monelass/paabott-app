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
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';

import { Ionicons } from '@expo/vector-icons';

import StoreOrdersScreen from '../screens/store/StoreOrdersScreen';
import StoreInventoryScreen from '../screens/store/StoreInventoryScreen';
import StoreAnalyticsScreen from '../screens/store/StoreAnalyticsScreen';
import StoreWalletScreen from '../screens/store/StoreWalletScreen';
import StoreProfileScreen from '../screens/store/StoreProfileScreen';

import { colors } from '../theme/colors';

const Tab = createBottomTabNavigator();

/* =========================================================
   ANIMATED STORE OWNER TAB BAR
========================================================= */

function AnimatedStoreTabBar({
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
          getAnimation(route.key);

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
              'OrdersTab'
            ) {
              iconName =
                isFocused
                  ? 'receipt'
                  : 'receipt-outline';
            } else if (
              route.name ===
              'CatalogTab'
            ) {
              iconName =
                isFocused
                  ? 'fast-food'
                  : 'fast-food-outline';
            } else if (
              route.name ===
              'AnalyticsTab'
            ) {
              iconName =
                isFocused
                  ? 'stats-chart'
                  : 'stats-chart-outline';
            } else if (
              route.name ===
              'WalletTab'
            ) {
              iconName =
                isFocused
                  ? 'wallet'
                  : 'wallet-outline';
            } else if (
              route.name ===
              'StoreProfileTab'
            ) {
              iconName =
                isFocused
                  ? 'storefront'
                  : 'storefront-outline';
            }

            /* =================================================
               ACTIVE SCALE
            ================================================= */

            const scale =
              animation.interpolate({
                inputRange: [
                  0,
                  1,
                ],
                outputRange: [
                  1,
                  1.08,
                ],
              });

            /* =================================================
               ACTIVE VERTICAL MOVEMENT
            ================================================= */

            const translateY =
              animation.interpolate({
                inputRange: [
                  0,
                  1,
                ],
                outputRange: [
                  0,
                  -2,
                ],
              });

            /* =================================================
               ICON SCALE
            ================================================= */

            const iconScale =
              animation.interpolate({
                inputRange: [
                  0,
                  1,
                ],
                outputRange: [
                  1,
                  1.16,
                ],
              });

            /* =================================================
               LABEL OPACITY
            ================================================= */

            const labelOpacity =
              animation.interpolate({
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
              });

            /* =================================================
               LABEL MOVEMENT
            ================================================= */

            const labelTranslate =
              animation.interpolate({
                inputRange: [
                  0,
                  1,
                ],
                outputRange: [
                  5,
                  0,
                ],
              });

            /* =================================================
               TAB PRESS
            ================================================= */

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

            /* =================================================
               LONG PRESS
            ================================================= */

            const onLongPress =
              () => {
                navigation.emit({
                  type:
                    'tabLongPress',
                  target:
                    route.key,
                });
              };

            /* =================================================
               TAB LABEL
            ================================================= */

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
                  {/* =================================================
                     ACTIVE GREEN PILL
                  ================================================= */}

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

                  {/* =================================================
                     ICON
                  ================================================= */}

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
                      size={21}
                      color={
                        isFocused
                          ? '#FFFFFF'
                          : '#7B8790'
                      }
                    />
                  </Animated.View>

                  {/* =================================================
                     LABEL
                  ================================================= */}

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
   STORE OWNER TAB NAVIGATOR
========================================================= */

function StoreTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <AnimatedStoreTabBar
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
        name="OrdersTab"
        component={
          StoreOrdersScreen
        }
        options={{
          tabBarLabel: 'Orders',
        }}
      />

      <Tab.Screen
        name="CatalogTab"
        component={
          StoreInventoryScreen
        }
        options={{
          tabBarLabel: 'Catalog',
        }}
      />

      <Tab.Screen
        name="AnalyticsTab"
        component={
          StoreAnalyticsScreen
        }
        options={{
          tabBarLabel: 'Analytics',
        }}
      />

      <Tab.Screen
        name="WalletTab"
        component={
          StoreWalletScreen
        }
        options={{
          tabBarLabel: 'Wallet',
        }}
      />

      <Tab.Screen
        name="StoreProfileTab"
        component={
          StoreProfileScreen
        }
        options={{
          tabBarLabel: 'My Store',
        }}
      />
    </Tab.Navigator>
  );
}

/* =========================================================
   STORE NAVIGATOR
========================================================= */

export default function StoreNavigator() {
  return (
    <StoreTabNavigator />
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

      paddingHorizontal: 1,
    },

    /* =====================================================
       TAB ITEM
    ===================================================== */

    tabItem: {
      minWidth: 65,

      height: 48,

      borderRadius: 15,

      alignItems:
        'center',

      justifyContent:
        'center',

      position:
        'relative',

      paddingHorizontal: 7,
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

      textAlign: 'center',
    },
  });