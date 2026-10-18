import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';

import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import CustomerNavigator from './CustomerNavigator';
import DriverNavigator from './DriverNavigator';
import StoreNavigator from './StoreNavigator';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session || !profile ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        ) : profile.role === 'driver' ? (
          <Stack.Screen name="DriverApp" component={DriverNavigator} />
        ) : profile.role === 'store_owner' ? (
          <Stack.Screen name="StoreApp" component={StoreNavigator} />
        ) : (
          <Stack.Screen name="CustomerApp" component={CustomerNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
