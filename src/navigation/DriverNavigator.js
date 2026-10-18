// DriverNavigator.js

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

import DriverHomeScreen from '../screens/driver/DriverHomeScreen';
import ActiveDeliveryScreen from '../screens/driver/ActiveDeliveryScreen';
import DriverDeliveriesScreen from '../screens/driver/DriverDeliveriesScreen';
import RiderWalletScreen from '../screens/driver/RiderWalletScreen';
import DriverProfileScreen from '../screens/driver/DriverProfileScreen';

import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/* =========================================================
   ANIMATED TAB BAR
   (logic — which route is focused, navigation.emit calls,
   route -> icon mapping, tabBarLabel resolution — is
   unchanged from the original file. Only the animation
   values used and the JSX/styles below were redesigned.)
========================================================= */

function AnimatedTabBar({ state, descriptors, navigation }) {
  const animations = useRef({}).current;
  const pressAnimations = useRef({}).current;
  const popAnimations = useRef({}).current;

  const getAnimation = (key) => {
    if (!animations[key]) {
      animations[key] = new Animated.Value(0);
    }

    return animations[key];
  };

  const getPressAnimation = (key) => {
    if (!pressAnimations[key]) {
      pressAnimations[key] = new Animated.Value(1);
    }

    return pressAnimations[key];
  };

  const getPopAnimation = (key) => {
    if (!popAnimations[key]) {
      popAnimations[key] = new Animated.Value(1);
    }

    return popAnimations[key];
  };

  useEffect(() => {
    state.routes.forEach((route, index) => {
      const isFocused = state.index === index;
      const animation = getAnimation(route.key);

      Animated.spring(animation, {
        toValue: isFocused ? 1 : 0,
        useNativeDriver: true,
        friction: 7,
        tension: 80,
      }).start();

      // Little "pop" on the icon whenever this tab becomes focused —
      // purely a visual flourish, doesn't touch navigation state.
      if (isFocused) {
        const pop = getPopAnimation(route.key);

        pop.setValue(0.82);

        Animated.spring(pop, {
          toValue: 1,
          useNativeDriver: true,
          friction: 5,
          tension: 170,
        }).start();
      }
    });
  }, [state.index, state.routes]);

  return (
    <View style={styles.tabBarWrapper}>
      <View style={styles.tabBarShadowCatcher}>
        <View style={styles.tabBar}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;

            const animation = getAnimation(route.key);
            const pressAnim = getPressAnimation(route.key);
            const popAnim = getPopAnimation(route.key);

            let iconName;

            if (route.name === 'HomeTab') {
              iconName = isFocused
                ? 'home'
                : 'home-outline';
            } else if (route.name === 'DeliveriesTab') {
              iconName = isFocused
                ? 'receipt'
                : 'receipt-outline';
            } else if (route.name === 'WalletTab') {
              iconName = isFocused
                ? 'wallet'
                : 'wallet-outline';
            } else if (route.name === 'ProfileTab') {
              iconName = isFocused
                ? 'person'
                : 'person-outline';
            }

            const translateY = animation.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -3],
            });

            const iconScale = animation.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.14],
            });

            const pillScale = animation.interpolate({
              inputRange: [0, 1],
              outputRange: [0.6, 1],
            });

            const glowOpacity = animation.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.45],
            });

            const labelOpacity = animation.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, 0.4, 1],
            });

            const labelTranslate = animation.interpolate({
              inputRange: [0, 1],
              outputRange: [4, 0],
            });

            const dotScale = animation.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 1],
            });

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (
                !isFocused &&
                !event.defaultPrevented
              ) {
                navigation.navigate(route.name);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            const onPressIn = () => {
              Animated.spring(pressAnim, {
                toValue: 0.88,
                useNativeDriver: true,
                friction: 9,
                tension: 160,
              }).start();
            };

            const onPressOut = () => {
              Animated.spring(pressAnim, {
                toValue: 1,
                useNativeDriver: true,
                friction: 6,
                tension: 140,
              }).start();
            };

            const label =
              options.tabBarLabel !== undefined
                ? options.tabBarLabel
                : options.title !== undefined
                ? options.title
                : route.name;

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                onLongPress={onLongPress}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                style={styles.tabButton}
                android_ripple={{
                  color: 'rgba(5,150,105,0.08)',
                  borderless: true,
                }}
              >
                <Animated.View
                  style={[
                    styles.tabItem,
                    {
                      transform: [
                        { translateY },
                        { scale: pressAnim },
                      ],
                    },
                  ]}
                >
                  {/* SOFT GLOW BEHIND ACTIVE PILL */}
                  <Animated.View
                    style={[
                      styles.activeGlow,
                      {
                        opacity: glowOpacity,
                        transform: [{ scale: pillScale }],
                      },
                    ]}
                  />

                  {/* ACTIVE PILL */}
                  <Animated.View
                    style={[
                      styles.activePill,
                      {
                        opacity: animation,
                        transform: [{ scale: pillScale }],
                      },
                    ]}
                  />

                  {/* ICON */}
                  <Animated.View
                    style={[
                      styles.iconCircle,
                      {
                        transform: [
                          { scale: iconScale },
                          { scale: popAnim },
                        ],
                      },
                    ]}
                  >
                    <Ionicons
                      name={iconName}
                      size={21}
                      color={
                        isFocused
                          ? '#FFFFFF'
                          : '#8B968F'
                      }
                    />
                  </Animated.View>

                  {/* LABEL */}
                  <Animated.Text
                    style={[
                      styles.tabLabel,
                      {
                        opacity: labelOpacity,
                        transform: [
                          {
                            translateY:
                              labelTranslate,
                          },
                        ],
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Animated.Text>

                  {/* FOCUS INDICATOR DOT (shown when the bar is
                      compact / label is hidden by app styling) */}
                  <Animated.View
                    style={[
                      styles.focusDot,
                      {
                        opacity: animation,
                        transform: [{ scale: dotScale }],
                      },
                    ]}
                  />
                </Animated.View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/* =========================================================
   DRIVER TABS
========================================================= */

function DriverTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <AnimatedTabBar {...props} />
      )}
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        lazy: true,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={DriverHomeScreen}
        options={{
          tabBarLabel: 'Jobs',
        }}
      />

      <Tab.Screen
        name="DeliveriesTab"
        component={DriverDeliveriesScreen}
        options={{
          tabBarLabel: 'Deliveries',
        }}
      />

      <Tab.Screen
        name="WalletTab"
        component={RiderWalletScreen}
        options={{
          tabBarLabel: 'Wallet',
        }}
      />

      <Tab.Screen
        name="ProfileTab"
        component={DriverProfileScreen}
        options={{
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
}

/* =========================================================
   DRIVER NAVIGATOR
========================================================= */

export default function DriverNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 260,
        gestureEnabled: true,
        contentStyle: {
          backgroundColor: '#F3F6F4',
        },
      }}
    >
      {/* DRIVER MAIN TABS */}
      <Stack.Screen
        name="DriverTabs"
        component={DriverTabNavigator}
        options={{
          animation: 'fade',
        }}
      />

      {/* ACTIVE DELIVERY
          Header removed so there will be NO
          green "Active Delivery" navigation bar.
      */}
      <Stack.Screen
        name="ActiveDelivery"
        component={ActiveDeliveryScreen}
        options={{
          headerShown: false,
          animation: 'slide_from_right',
          gestureEnabled: true,
        }}
      />
    </Stack.Navigator>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  /* =========================
     TAB BAR WRAPPER
  ========================= */

  tabBarWrapper: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingBottom:
      Platform.OS === 'ios' ? 8 : 10,
    paddingTop: 6,
  },

  tabBarShadowCatcher: {
    borderRadius: 22,
    shadowColor: '#0A6B50',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 10,
  },

  /* =========================
     TAB BAR
  ========================= */

  tabBar: {
    height: 66,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',

    paddingHorizontal: 6,

    borderWidth: 1,
    borderColor: '#EAF0ED',
  },

  /* =========================
     TAB BUTTON
  ========================= */

  tabButton: {
    flex: 1,
    height: 58,

    alignItems: 'center',
    justifyContent: 'center',

    paddingHorizontal: 2,
  },

  /* =========================
     TAB ITEM
  ========================= */

  tabItem: {
    minWidth: 68,
    height: 50,

    borderRadius: 16,

    alignItems: 'center',
    justifyContent: 'center',

    position: 'relative',

    paddingHorizontal: 8,
  },

  /* =========================
     GLOW BEHIND ACTIVE PILL
  ========================= */

  activeGlow: {
    position: 'absolute',

    top: -6,
    bottom: -6,
    left: -6,
    right: -6,

    borderRadius: 22,

    backgroundColor:
      colors?.primary || '#059669',
  },

  /* =========================
     ACTIVE PILL
  ========================= */

  activePill: {
    position: 'absolute',

    top: 2,
    bottom: 2,
    left: 1,
    right: 1,

    borderRadius: 16,

    backgroundColor:
      colors?.primary || '#059669',

    shadowColor:
      colors?.primary || '#059669',

    shadowOffset: {
      width: 0,
      height: 4,
    },

    shadowOpacity: 0.22,
    shadowRadius: 7,

    elevation: 4,
  },

  /* =========================
     ICON
  ========================= */

  iconCircle: {
    width: 24,
    height: 24,

    alignItems: 'center',
    justifyContent: 'center',

    zIndex: 2,
  },

  /* =========================
     LABEL
  ========================= */

  tabLabel: {
    marginTop: 2,

    fontSize: 8.5,
    lineHeight: 11,

    fontWeight: '800',

    color: '#FFFFFF',

    zIndex: 2,
  },

  /* =========================
     FOCUS INDICATOR DOT
  ========================= */

  focusDot: {
    position: 'absolute',
    bottom: -1,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    zIndex: 2,
  },
});