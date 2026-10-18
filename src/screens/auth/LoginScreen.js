import React, {
  useState,
  useRef,
  useEffect,
} from 'react';

import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Animated,
  Easing,
  ImageBackground,
  Modal,
  StatusBar,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../config/supabase';

const {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
} = Dimensions.get('screen');

const BACKGROUND_IMAGE = require('../../assets/images/login-bg.jpg');

export default function LoginScreen({ navigation }) {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);

  // =========================================================
  // FORGOT PASSWORD STATE
  // =========================================================
  const [forgotPassModalVisible, setForgotPassModalVisible] = useState(false);
  const [forgotPassStep, setForgotPassStep] = useState('phone'); // 'phone' | 'otp' | 'new_password'
  const [resetPhone, setResetPhone] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // =========================================================
  // CUSTOM ALERT STATE
  // =========================================================

  const [appAlert, setAppAlert] = useState({
      visible: false,
      type: 'info',
      title: '',
      message: '',
      buttonText: 'OK',
      onPress: null,
    });

  // =========================================================
  // Animation values
  // =========================================================

  const titleAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const footerAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const emailFocusAnim = useRef(new Animated.Value(0)).current;
  const passwordFocusAnim = useRef(new Animated.Value(0)).current;

  // =========================================================
  // Intro animation
  // =========================================================

  useEffect(() => {
    Animated.stagger(90, [
      Animated.timing(titleAnim, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardAnim, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(footerAnim, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [titleAnim, cardAnim, footerAnim]);

  // =========================================================
  // Input focus animation
  // =========================================================

  const animateFocus = (animation, value) => {
    Animated.timing(animation, {
      toValue: value,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  };

  // =========================================================
  // Button press animation
  // =========================================================

  const handlePressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.96,
      speed: 40,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      speed: 40,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  };

  // =========================================================
  // CUSTOM ALERT HELPERS
  // =========================================================

  const showAppAlert = (type, title, message, onPress = null, buttonText = 'OK') => {
    setAppAlert({
      visible: true,
      type,
      title,
      message,
      buttonText,
      onPress,
    });
  };

  const closeAppAlert = () => {
    const callback = appAlert.onPress;

    setAppAlert((current) => ({
      ...current,
      visible: false,
      onPress: null,
    }));

    if (callback) {
      setTimeout(() => {
        callback();
      }, 80);
    }
  };

  // =========================================================
  // FORGOT PASSWORD LOGIC
  // =========================================================

  const openForgotPassword = () => {
    setForgotPassStep('phone');
    setResetPhone('');
    setResetOtp('');
    setNewPassword('');
    setForgotPassModalVisible(true);
  };

  const handleSendResetOtp = async () => {
    const cleanPhone = resetPhone.trim();
    const phoneRegex = /^09\d{9}$/;
    
    if (!phoneRegex.test(cleanPhone)) {
      showAppAlert('warning', 'Invalid Number', 'Phone number must be exactly 11 digits and start with 09 (e.g., 09123456789).');
      return;
    }

    setResetLoading(true);
    try {
     // 1. Securely check if the phone number is registered (Bypasses RLS)
      const { data: phoneExists, error: profileError } = await supabase.rpc(
        'check_phone_exists',
        { p_phone: cleanPhone }
      );

      if (profileError || !phoneExists) {
        throw new Error('This phone number is not registered to any account.');
      }
      // 2. Send the OTP using your existing Edge Function!
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { phone: cleanPhone },
      });

      if (error || data?.error) {
        throw error || new Error(data?.error);
      }

      setForgotPassStep('otp');
    } catch (error) {
      showAppAlert('error', 'Request Failed', error?.message || 'Could not send verification code.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyResetOtp = async () => {
    if (resetOtp.length !== 6) {
      showAppAlert('warning', 'Invalid Code', 'Please enter the 6-digit code.');
      return;
    }

    setResetLoading(true);
    try {
      const cleanPhone = resetPhone.trim();

      // Verify OTP strictly against the database
      const { data: verificationData, error: verificationError } = await supabase
        .from('otp_verifications')
        .select('*')
        .eq('phone_number', cleanPhone)
        .eq('otp_code', resetOtp)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (verificationError || !verificationData) {
        throw new Error('Invalid or expired verification code.');
      }

      setForgotPassStep('new_password');
    } catch (error) {
      showAppAlert('error', 'Verification Failed', error?.message || 'Invalid code.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      showAppAlert('warning', 'Weak Password', 'Your new password must be at least 6 characters long.');
      return;
    }

    setResetLoading(true);
    try {
      const cleanPhone = resetPhone.trim();

      // Overwrite the password securely via Admin Edge Function
      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: { phone: cleanPhone, newPassword: newPassword },
      });

      if (error || data?.error) {
        throw error || new Error(data?.error);
      }

      setForgotPassModalVisible(false);
      showAppAlert('success', 'Password Updated', 'Your password has been reset successfully. You can now sign in.');
    } catch (error) {
      showAppAlert('error', 'Update Failed', error?.message || 'Could not update your password. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  // =========================================================
  // LOGIN LOGIC (Username to Email Lookup)
  // =========================================================

  const handleLogin = async () => {
    if (!emailOrUsername.trim() || !password) {
      showAppAlert('warning', 'Missing Fields', 'Please fill in all fields.');
      return;
    }

    let loginIdentifier = emailOrUsername.trim().toLowerCase();
    let targetEmail = loginIdentifier;

    setLoading(true);

    try {
      // ✨ If it's a username (no @), look up the associated email securely
      if (!loginIdentifier.includes('@')) {
        const { data: foundEmail, error: rpcError } = await supabase.rpc(
          'get_email_by_username',
          { p_username: loginIdentifier }
        );

        if (rpcError || !foundEmail) {
          throw new Error('Username not found. Please check your username or try your email address.');
        }

        targetEmail = foundEmail;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('Incorrect password. Please try again.');
        }
        throw error;
      }
    } catch (error) {
      showAppAlert('error', 'Login Failed', error?.message || 'An error occurred during login.');
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // Animated styles
  // =========================================================

  const titleStyle = {
    opacity: titleAnim,
    transform: [
      {
        translateY: titleAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0],
        }),
      },
    ],
  };

  const cardStyle = {
    opacity: cardAnim,
    transform: [
      {
        translateY: cardAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [28, 0],
        }),
      },
    ],
  };

  const footerStyle = {
    opacity: footerAnim,
    transform: [
      {
        translateY: footerAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  };

  const emailBorderColor = emailFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E2E8F0', '#059669'],
  });

  const passwordBorderColor = passwordFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E2E8F0', '#059669'],
  });

  // =========================================================
  // UI
  // =========================================================

  return (
    <View style={styles.outerContainer}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#052E21"
        translucent={false}
      />

      <ImageBackground
        source={BACKGROUND_IMAGE}
        resizeMode="cover"
        style={styles.fixedBackground}
      />

      <LinearGradient
        colors={[
          'rgba(4,30,20,0.82)',
          'rgba(4,30,20,0.64)',
          'rgba(255,255,255,0.97)',
        ]}
        locations={[0, 0.46, 0.88]}
        style={styles.fixedBackground}
      />

      <SafeAreaView style={styles.container}>
        {/* ===================================================
            LOADING MODAL
        =================================================== */}

        <Modal
          transparent
          visible={loading}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {}}
        >
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <View style={styles.loadingIconContainer}>
                <Ionicons
                  name="log-in-outline"
                  size={27}
                  color="#059669"
                />
              </View>

              <ActivityIndicator
                size="large"
                color="#059669"
                style={styles.loadingIndicator}
              />

              <Text style={styles.loadingText}>
                Signing in...
              </Text>

              <Text style={styles.loadingSubtext}>
                Please wait
              </Text>
            </View>
          </View>
        </Modal>

        {/* ===================================================
            CUSTOM ALERT MODAL
        =================================================== */}

        <Modal
          transparent
          visible={appAlert.visible}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={closeAppAlert}
        >
          <View style={styles.alertOverlay}>
            <View style={styles.alertCard}>
              <View
                style={[
                  styles.alertIconCircle,
                  appAlert.type === 'success' && styles.alertIconSuccess,
                  appAlert.type === 'error' && styles.alertIconError,
                  appAlert.type === 'warning' && styles.alertIconWarning,
                  appAlert.type === 'info' && styles.alertIconInfo,
                ]}
              >
                <Ionicons
                  name={
                    appAlert.type === 'success'
                      ? 'checkmark-circle'
                      : appAlert.type === 'error'
                      ? 'close-circle'
                      : appAlert.type === 'warning'
                      ? 'warning'
                      : 'information-circle'
                  }
                  size={30}
                  color={
                    appAlert.type === 'success'
                      ? '#059669'
                      : appAlert.type === 'error'
                      ? '#DC2626'
                      : appAlert.type === 'warning'
                      ? '#D97706'
                      : '#2563EB'
                  }
                />
              </View>

              <Text
                style={styles.alertTitle}
                numberOfLines={2}
              >
                {appAlert.title}
              </Text>

              <Text style={styles.alertMessage}>
                {appAlert.message}
              </Text>

              <TouchableOpacity
                style={[
                  styles.alertButton,
                  appAlert.type === 'success' && styles.alertButtonSuccess,
                  appAlert.type === 'error' && styles.alertButtonError,
                  appAlert.type === 'warning' && styles.alertButtonWarning,
                  appAlert.type === 'info' && styles.alertButtonInfo,
                ]}
                onPress={closeAppAlert}
                activeOpacity={0.85}
              >
                <Text style={styles.alertButtonText}>
                  {appAlert.buttonText}
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={17}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ===================================================
            FORGOT PASSWORD MODAL
        =================================================== */}
        <Modal
          transparent
          visible={forgotPassModalVisible}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setForgotPassModalVisible(false)}
        >
          <View style={styles.alertOverlay}>
            <View style={styles.alertCard}>
              <View style={[styles.alertIconCircle, styles.alertIconInfo]}>
                <Ionicons 
                  name={forgotPassStep === 'phone' ? 'phone-portrait-outline' : forgotPassStep === 'otp' ? 'chatbubble-ellipses' : 'lock-closed'} 
                  size={30} 
                  color="#2563EB" 
                />
              </View>

              <Text style={styles.alertTitle}>
                {forgotPassStep === 'phone' ? 'Reset Password' : forgotPassStep === 'otp' ? 'Verify Your Number' : 'New Password'}
              </Text>

              <Text style={styles.alertMessage}>
                {forgotPassStep === 'phone' 
                  ? 'Enter your registered phone number to receive a verification code.'
                  : forgotPassStep === 'otp'
                  ? `We sent a 6-digit code to ${resetPhone}. Please enter it below.`
                  : 'Enter your new password to secure your account.'}
              </Text>

              <View style={[styles.inputContainer, { marginTop: 20, marginBottom: 5, width: '100%', borderColor: '#E2E8F0' }]}>
                <Ionicons 
                  name={forgotPassStep === 'phone' ? 'call-outline' : forgotPassStep === 'otp' ? 'keypad-outline' : 'key-outline'} 
                  size={20} color="#9CA3AF" style={styles.inputIcon} 
                />
                
                {forgotPassStep === 'phone' && (
                  <TextInput
                    style={styles.input}
                    placeholder="09123456789"
                    placeholderTextColor="#CBD5E1"
                    keyboardType="number-pad"
                    maxLength={11}
                    value={resetPhone}
                    onChangeText={(text) => setResetPhone(text.replace(/[^0-9]/g, ''))}
                  />
                )}

                {forgotPassStep === 'otp' && (
                  <TextInput
                    style={styles.input}
                    placeholder="000000"
                    placeholderTextColor="#CBD5E1"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={resetOtp}
                    onChangeText={setResetOtp}
                  />
                )}

                {forgotPassStep === 'new_password' && (
                  <TextInput
                    style={styles.input}
                    placeholder="Create new password"
                    placeholderTextColor="#CBD5E1"
                    secureTextEntry={true}
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                )}
              </View>

              <TouchableOpacity
                style={[styles.primaryButtonWrapper, { marginTop: 15, width: '100%' }]}
                onPress={
                  forgotPassStep === 'phone' ? handleSendResetOtp 
                  : forgotPassStep === 'otp' ? handleVerifyResetOtp 
                  : handleUpdatePassword
                }
                disabled={resetLoading}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#059669', '#047857']}
                  style={styles.primaryButton}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {resetLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {forgotPassStep === 'phone' ? 'Send Code' : forgotPassStep === 'otp' ? 'Verify Code' : 'Update Password'}
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ marginTop: 18 }}
                onPress={() => setForgotPassModalVisible(false)}
                disabled={resetLoading}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '800' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardContainer}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.headerContainer}>
              <Animated.Text
                style={[styles.title, titleStyle]}
              >
                Welcome Back!
              </Animated.Text>

              <Animated.View
                style={[styles.subtitleRow, titleStyle]}
              >
                <Text style={styles.subtitle}>
                  Padala mo, halongon ta!{' '}
                  Mag-login na sa
                </Text>
                <Text style={styles.brandText}>
                  Paabot
                </Text>
              </Animated.View>
            </View>

            <Animated.View
              style={[styles.formCard, cardStyle]}
            >
              <View style={styles.formHeader}>
                <View style={styles.formIconContainer}>
                  <Ionicons
                    name="person-outline"
                    size={22}
                    color="#059669"
                  />
                </View>

                <View style={styles.formHeaderText}>
                  <Text style={styles.formTitle}>
                    Sign in to your account
                  </Text>
                  <Text style={styles.formSubtitle}>
                    Enter your details to continue
                  </Text>
                </View>
              </View>

              <Text style={styles.inputLabel}>
                Username or Email Address
              </Text>

              <Animated.View
                style={[
                  styles.inputContainer,
                  { borderColor: emailBorderColor },
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={focusedInput === 'email' ? '#059669' : '#9CA3AF'}
                  style={styles.inputIcon}
                />

                <TextInput
                  style={styles.input}
                  placeholder="e.g. juan123 or name@example.com"
                  placeholderTextColor="#CBD5E1"
                  value={emailOrUsername}
                  onChangeText={setEmailOrUsername}
                  onFocus={() => {
                    setFocusedInput('email');
                    animateFocus(emailFocusAnim, 1);
                  }}
                  onBlur={() => {
                    setFocusedInput(null);
                    animateFocus(emailFocusAnim, 0);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Animated.View>

              <Text style={styles.inputLabel}>
                Password
              </Text>

              <Animated.View
                style={[
                  styles.inputContainer,
                  { borderColor: passwordBorderColor },
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={focusedInput === 'password' ? '#059669' : '#9CA3AF'}
                  style={styles.inputIcon}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#CBD5E1"
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => {
                    setFocusedInput('password');
                    animateFocus(passwordFocusAnim, 1);
                  }}
                  onBlur={() => {
                    setFocusedInput(null);
                    animateFocus(passwordFocusAnim, 0);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  accessibilityLabel="Password Input"
                />

                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIconBtn}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </Animated.View>

              <TouchableOpacity
                style={styles.forgotPassBtn}
                activeOpacity={0.7}
                onPress={openForgotPassword}
              >
                <Text style={styles.forgotPassText}>
                  Forgot Password?
                </Text>
              </TouchableOpacity>

              <Animated.View
                style={{
                  transform: [{ scale: buttonScale }],
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.primaryButtonWrapper,
                    loading && styles.buttonDisabled,
                  ]}
                  onPress={handleLogin}
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                  disabled={loading}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={['#059669', '#047857']}
                    style={styles.primaryButton}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Ionicons
                      name="log-in-outline"
                      size={20}
                      color="#FFFFFF"
                      style={styles.buttonIcon}
                    />
                    <Text style={styles.primaryButtonText}>
                      Sign In
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>

              <View style={styles.secureNotice}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={15}
                  color="#059669"
                />
                <Text style={styles.secureNoticeText}>
                  Your account information is protected
                </Text>
              </View>
            </Animated.View>

            <Animated.View
              style={[styles.footerContainer, footerStyle]}
            >
              <View style={styles.footerPill}>
                <Text style={styles.footerText}>
                  Wala kapa account?{' '}
                </Text>

                <TouchableOpacity
                  onPress={() => navigation.navigate('Signup')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.linkText}>
                    Create Account
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#052E21',
  },

  fixedBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },

  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  keyboardContainer: {
    flex: 1,
  },

  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 28 : 20,
    paddingBottom: 24,
    justifyContent: 'center',
  },

  headerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    paddingHorizontal: 8,
  },

  title: {
    fontSize: SCREEN_WIDTH < 380 ? 29 : 34,
    lineHeight: SCREEN_WIDTH < 380 ? 35 : 40,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.6,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.34)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 3 },
  },

  subtitleRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    maxWidth: 330,
  },

  subtitle: {
    fontSize: 13,
    color: '#ECFDF5',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
    letterSpacing: 0.05,
  },

  brandText: {
    fontSize: 26,
    color: '#6EE7B7',
    fontWeight: '900',
    letterSpacing: 0.2,
    textAlign: 'center',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.20)',
    textShadowRadius: 5,
  },

  formCard: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: SCREEN_WIDTH < 380 ? 18 : 22,
    paddingTop: SCREEN_WIDTH < 380 ? 20 : 23,
    paddingBottom: SCREEN_WIDTH < 380 ? 18 : 21,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#021C13',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 10,
  },

  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },

  formIconContainer: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  formHeaderText: {
    flex: 1,
    paddingRight: 2,
  },

  formTitle: {
    color: '#0F172A',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  formSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    marginTop: 2,
  },

  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 7,
    marginLeft: 2,
    letterSpacing: 0.15,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 56,
    marginBottom: 16,
  },

  inputIcon: {
    marginRight: 10,
  },

  input: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
    paddingVertical: 0,
    minHeight: 40,
  },

  eyeIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    backgroundColor: '#F1F5F9',
  },

  forgotPassBtn: {
    alignSelf: 'flex-end',
    marginTop: -3,
    marginBottom: 19,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },

  forgotPassText: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '800',
    letterSpacing: 0.05,
  },

  primaryButtonWrapper: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.28,
    shadowRadius: 13,
    elevation: 7,
  },

  primaryButton: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  buttonIcon: {
    marginRight: 8,
  },

  buttonDisabled: {
    opacity: 0.62,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.35,
  },

  secureNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 8,
  },

  secureNoticeText: {
    color: '#94A3B8',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    marginLeft: 5,
    textAlign: 'center',
  },

  footerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    paddingHorizontal: 8,
  },

  footerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.86)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 7,
    elevation: 3,
  },

  footerText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    textAlign: 'center',
  },

  linkText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '900',
    textAlign: 'center',
    marginLeft: 3,
  },

  // =========================================================
  // LOADING MODAL
  // =========================================================

  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,18,13,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  loadingCard: {
    width: '100%',
    maxWidth: 210,
    paddingVertical: 25,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.25,
    shadowRadius: 22,
    elevation: 12,
  },

  loadingIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },

  loadingIndicator: {
    marginVertical: 9,
  },

  loadingText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
    color: '#0F172A',
  },

  loadingSubtext: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 3,
  },

  // =========================================================
  // CUSTOM ALERT
  // =========================================================

  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.64)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  alertCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 27,
    paddingBottom: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.24,
    shadowRadius: 28,
    elevation: 14,
  },

  alertIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    borderWidth: 1,
  },

  alertIconSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },

  alertIconError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },

  alertIconWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },

  alertIconInfo: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },

  alertTitle: {
    width: '100%',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.25,
  },

  alertMessage: {
    width: '100%',
    maxWidth: 335,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
  },

  alertButton: {
    width: '100%',
    minHeight: 51,
    borderRadius: 15,
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  alertButtonSuccess: {
    backgroundColor: '#059669',
  },

  alertButtonError: {
    backgroundColor: '#DC2626',
  },

  alertButtonWarning: {
    backgroundColor: '#D97706',
  },

  alertButtonInfo: {
    backgroundColor: '#2563EB',
  },

  alertButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
});