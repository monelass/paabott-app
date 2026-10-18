import React, {
  useEffect,
  useState,
  useRef,
} from 'react';

import {
  View,
  ActivityIndicator,
  Alert,
} from 'react-native';

import {
  SafeAreaProvider,
} from 'react-native-safe-area-context';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

import { supabase } from './src/config/supabase';

import {
  AuthProvider,
  useAuth,
} from './src/context/AuthContext';

import {
  CartProvider,
} from './src/context/CartContext';

import RootNavigator from './src/navigation/RootNavigator';

import OpeningAnimation from './src/components/OpeningAnimation';
import ShortIntro from './src/components/ShortIntro';

const INTRO_SHOWN_KEY =
  '@paabot_intro_shown';

function MainContent() {
  const {
    profile,
    loading: authLoading,
  } = useAuth();

  /*
  =========================================================
  STARTUP PHASES

  opening
      ↓
  intro
      ↓
  app
  =========================================================
  */

  const [appPhase, setAppPhase] =
    useState('opening');

  const [
    hasSeenIntro,
    setHasSeenIntro,
  ] = useState(false);

  const [
    checkingStorage,
    setCheckingStorage,
  ] = useState(true);

  /*
  =========================================================
  NEW:
  Remember when the opening animation has finished.

  This prevents auth/storage checks from skipping
  the opening animation.
  =========================================================
  */

  const [
    openingFinished,
    setOpeningFinished,
  ] = useState(false);

  /*
  =========================================================
  GLOBAL DEEP LINK CATCHER (Lightweight Cleaner)
  Cleaned up to prevent duplicate SMS and racing conditions.
  =========================================================
  */
  useEffect(() => {
    const handleDeepLink = async (event) => {
      const url = event?.url || event;
      if (!url) return;

      if (url.includes('checkout-cancelled')) {
        try {
          const savedIds = await AsyncStorage.getItem('pending_checkout_orders');
          if (savedIds) {
            const orderIds = JSON.parse(savedIds);
            await supabase.from('delivery_requests').delete().in('order_id', orderIds);
            await supabase.from('orders').delete().in('id', orderIds);
            await AsyncStorage.removeItem('pending_checkout_orders');
            await AsyncStorage.removeItem('pending_checkout_amount');
          }
        } catch (e) {}
      }
    };

    // Listen for incoming links while app is open
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check initial URL on cold start
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    }).catch(err => {});

    return () => {
      subscription.remove();
    };
  }, []);

  /*
  =========================================================
  CHECK INTRO STATUS
  =========================================================
  */

  useEffect(() => {
    let mounted = true;

    const checkIntroStatus =
      async () => {
        try {
          const value =
            await AsyncStorage.getItem(
              INTRO_SHOWN_KEY
            );

          if (!mounted) {
            return;
          }

          setHasSeenIntro(
            value === 'true'
          );
        } catch (error) {
          console.error(
            'Failed to load intro status:',
            error
          );

          if (mounted) {
            setHasSeenIntro(false);
          }
        } finally {
          if (mounted) {
            setCheckingStorage(
              false
            );
          }
        }
      };

    checkIntroStatus();

    return () => {
      mounted = false;
    };
  }, []);

  /*
  =========================================================
  DECIDE WHAT TO SHOW

  IMPORTANT:
  The app MUST NOT leave the opening phase until
  OpeningAnimation itself has completed.
  =========================================================
  */

  useEffect(() => {
    if (
      !openingFinished ||
      authLoading ||
      checkingStorage
    ) {
      return;
    }

    /*
    Already determined
    */
    if (
      appPhase === 'app' ||
      appPhase === 'intro'
    ) {
      return;
    }

    /*
    Logged-in user
    */
    if (profile) {
      setAppPhase('app');
      return;
    }

    /*
    Returning logged-out user
    */
    if (hasSeenIntro) {
      setAppPhase('app');
      return;
    }

    /*
    First-time logged-out user
    */
    setAppPhase('intro');
  }, [
    openingFinished,
    authLoading,
    checkingStorage,
    profile,
    hasSeenIntro,
    appPhase,
  ]);

  /*
  =========================================================
  OPENING ANIMATION FINISHED
  =========================================================
  */

  const handleOpeningFinish =
    () => {
      if (openingFinished) {
        return;
      }

      setOpeningFinished(true);
    };

  /*
  =========================================================
  SHORT INTRO FINISHED
  =========================================================
  */

  const handleFinishIntro =
    async () => {
      try {
        await AsyncStorage.setItem(
          INTRO_SHOWN_KEY,
          'true'
        );

        setHasSeenIntro(true);

        setAppPhase('app');
      } catch (error) {
        console.error(
          'Failed to save intro status:',
          error
        );

        /*
        Even if AsyncStorage fails,
        still allow the user into the app.
        */
        setAppPhase('app');
      }
    };

  /*
  =========================================================
  IMPORTANT:

  We DO NOT show the loading spinner before the opening
  animation anymore.

  The animation should appear immediately when the app
  starts while Auth + AsyncStorage load in the background.
  =========================================================
  */

  if (appPhase === 'opening') {
    return (
      <OpeningAnimation
        onFinish={
          handleOpeningFinish
        }
      />
    );
  }

  /*
  =========================================================
  PHASE 2 — SHORT INTRO

  Only shown to a first-time logged-out user.
  =========================================================
  */

  if (appPhase === 'intro') {
    return (
      <ShortIntro
        onFinish={
          handleFinishIntro
        }
      />
    );
  }

  /*
  =========================================================
  PHASE 3 — ACTUAL APPLICATION
  =========================================================
  */

  return (
    <RootNavigator />
  );
}

/*
=========================================================
ROOT APP
=========================================================
*/

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CartProvider>
          <MainContent />
        </CartProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}