
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
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../config/supabase';

const {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
} = Dimensions.get('screen');

const BACKGROUND_IMAGE = require('../../assets/images/login-bg.jpg');

export default function SignupScreen({
  navigation,
}) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('customer');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);

  /* =========================================================
     OTP VERIFICATION STATE
  ========================================================= */
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  /* =========================================================
     CUSTOM ALERT STATE
  ========================================================= */
  const [appAlert, setAppAlert] = useState({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    buttonText: 'OK',
    onPress: null,
  });

  const roles = [
    {
      label: 'Customer',
      value: 'customer',
    },
    {
      label: 'Driver',
      value: 'driver',
    },
    {
      label: 'Store',
      value: 'store_owner',
    },
  ];

  // ── Animation values ──────────────────────────────────────

  const titleAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const footerAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const nameFocusAnim = useRef(new Animated.Value(0)).current;
  const usernameFocusAnim = useRef(new Animated.Value(0)).current;
  const emailFocusAnim = useRef(new Animated.Value(0)).current;
  const phoneFocusAnim = useRef(new Animated.Value(0)).current;
  const passwordFocusAnim = useRef(new Animated.Value(0)).current;

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
  }, [
    titleAnim,
    cardAnim,
    footerAnim,
  ]);

  const animateFocus = (anim, toValue) => {
    Animated.timing(anim, {
      toValue,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  };

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

  /* =========================================================
     CUSTOM ALERT HELPERS
  ========================================================= */

  const showAppAlert = (type, title, message, onPress = null, buttonText = 'OK') => {
    // 🌟 FIX: Instantly trigger the alert (no more timeouts needed!)
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
  /* =========================================================
     AUTH LOGIC & OTP TRIGGER
  ========================================================= */

  const handleSignup = async () => {
    if (!fullName.trim() || !username.trim() || !email.trim() || !password || !phone.trim()) {
      showAppAlert('warning', 'Missing Fields', 'Please complete all fields.');
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    if (cleanUsername.length < 3) {
      showAppAlert('warning', 'Invalid Username', 'Username must be at least 3 characters.');
      return;
    }

    if (!/^[a-z0-9._]+$/.test(cleanUsername)) {
      showAppAlert('warning', 'Invalid Username', 'Username can only contain letters, numbers, dots, and underscores.');
      return;
    }

    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!gmailRegex.test(cleanEmail)) {
      showAppAlert('warning', 'Invalid Email', 'Please check your email address.');
      return;
    }

    const phoneRegex = /^09\d{9}$/;
    if (!phoneRegex.test(cleanPhone)) {
      showAppAlert('warning', 'Invalid Phone Number', 'Phone number must be exactly 11 digits and start with 09 (e.g., 09123456789).');
      return;
    }

    setLoading(true);

    try {
      // 1. Check if the phone number is already registered
      const { data: phoneExists, error: checkError } = await supabase.rpc(
        'check_phone_exists',
        { p_phone: cleanPhone }
      );

      if (phoneExists) {
        setLoading(false);
        showAppAlert(
          'warning', 
          'Already Registered', 
          'This phone number is already linked to an account. Please go to the Login screen.',
          () => navigation.navigate('Login'),
          'Go to Login'
        );
        return;
      }

      // 2. Trigger the Edge Function to send the OTP via TextBee
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { phone: cleanPhone },
      });

      if (error || data?.error) {
        throw error || new Error(data?.error);
      }

      setLoading(false);
      
      // 🌟 FIX: Wait for Loading Modal to close completely before opening OTP Modal
      setTimeout(() => {
        setOtpModalVisible(true);
      }, 500);

    } catch (error) {
      setLoading(false);
      showAppAlert('error', 'Failed to Send Code', error?.message || 'We could not send the verification code to your phone. Please try again.');
    }
  };
  /* =========================================================
     VERIFY OTP & REGISTER USER
  ========================================================= */

  const verifyAndRegister = async () => {
    if (otpCode.length !== 6) {
      showAppAlert('warning', 'Invalid Code', 'Please enter the 6-digit code sent to your phone.');
      return;
    }

    setVerifyingOtp(true);

    try {
      const cleanPhone = phone.trim();
      const cleanEmail = email.trim().toLowerCase();
      const cleanUsername = username.trim().toLowerCase();

      // 1. Verify the OTP in the database
      const { data: verificationData, error: verificationError } = await supabase
        .from('otp_verifications')
        .select('*')
        .eq('phone_number', cleanPhone)
        .eq('otp_code', otpCode)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (verificationError || !verificationData) {
        throw new Error('Invalid or expired verification code.');
      }

      // 2. Code is valid! Proceed with actual Supabase registration
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          data: {
            username: cleanUsername,
            full_name: fullName.trim(),
            phone: cleanPhone,
            role: role,
          },
        },
      });

      if (error) throw error;

      // 3. Prevent Auto-Login from messing with the screen
      try {
        if (data?.session) {
          await supabase.auth.signOut();
        }
      } catch (e) {
        console.log("Signout skip", e);
      }

      // 4. Close the OTP window
      setVerifyingOtp(false);
      setOtpModalVisible(false);

      // 🌟 FIX: Wait exactly 400ms for the OTP Modal to finish its fade-out animation 
      // before popping up the success message!
      setTimeout(() => {
        showAppAlert(
          'success',
          'Account Created',
          'Your account has been verified and registered successfully. Please sign in.',
          () => navigation.navigate('Login'),
          'Continue'
        );
      }, 400);

    } catch (error) {
      setVerifyingOtp(false);
      setOtpModalVisible(false);
      
      // 🌟 FIX: Wait 400ms here too if it fails, so the error message doesn't get hidden
      setTimeout(() => {
        showAppAlert(
          'error',
          'Verification Failed',
          error?.message || 'An error occurred during verification.'
        );
      }, 400);
    }
  };
  // ── Derived animated styles ───────────────────────────────

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

  const nameBorderColor = nameFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E2E8F0', '#059669'],
  });

  const usernameBorderColor = usernameFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E2E8F0', '#059669'],
  });

  const emailBorderColor = emailFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E2E8F0', '#059669'],
  });

  const phoneBorderColor = phoneFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E2E8F0', '#059669'],
  });

  const passwordBorderColor = passwordFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E2E8F0', '#059669'],
  });

  return (
    <View style={styles.outerContainer}>
      <ImageBackground
        source={BACKGROUND_IMAGE}
        resizeMode="cover"
        style={styles.fixedBackground}
      />

      <LinearGradient
        colors={[
          'rgba(4,30,20,0.75)',
          'rgba(4,30,20,0.55)',
          'rgba(255,255,255,0.95)',
        ]}
        locations={[0, 0.45, 0.85]}
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
              <View style={styles.loadingAccountBadge}>
                <Ionicons
                  name="person-add-outline"
                  size={26}
                  color="#059669"
                />
              </View>

              <ActivityIndicator
                size="large"
                color="#059669"
                style={{
                  marginVertical: 9,
                }}
              />

              <Text style={styles.loadingText}>
                Sending OTP...
              </Text>

              <Text style={styles.loadingSubtext}>
                Please wait a moment
              </Text>
            </View>
          </View>
        </Modal>

        {/* ===================================================
            OTP VERIFICATION MODAL
        =================================================== */}

        <Modal
          transparent
          visible={otpModalVisible}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setOtpModalVisible(false)}
        >
          <View style={styles.alertOverlay}>
            <View style={styles.alertCard}>
              <View style={[styles.alertIconCircle, styles.alertIconInfo]}>
                <Ionicons name="chatbubble-ellipses" size={30} color="#2563EB" />
              </View>

              <Text style={styles.alertTitle}>Verify Your Number</Text>
              
              <Text style={styles.alertMessage}>
                We sent a 6-digit verification code to {phone}. Please enter it below.
              </Text>

              <View style={[styles.inputContainer, { marginTop: 20, marginBottom: 5, width: '100%' }]}>
                <Ionicons name="keypad-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="000000"
                  placeholderTextColor="#CBD5E1"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otpCode}
                  onChangeText={setOtpCode}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryButtonWrapper, { marginTop: 15, width: '100%' }]}
                onPress={verifyAndRegister}
                disabled={verifyingOtp}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#059669', '#047857']}
                  style={styles.primaryButton}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {verifyingOtp ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Verify & Register</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ marginTop: 18 }}
                onPress={() => setOtpModalVisible(false)}
                disabled={verifyingOtp}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '800' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ===================================================
            CUSTOM ALERT OVERLAY (100% Bulletproof)
        =================================================== */}

        {appAlert.visible && (
          <View
            style={[
              StyleSheet.absoluteFill,
              { zIndex: 9999, elevation: 9999 } // Forces it to the very front
            ]}
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

                <Text style={styles.alertTitle} numberOfLines={2}>
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

                  <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.headerContainer}>
              <Animated.Text style={[styles.title, titleStyle]}>
                Create Account
              </Animated.Text>

              <Animated.View style={[styles.subtitleRow, titleStyle]}>
                <Text style={styles.subtitle}>
                  Sign up to start using
                </Text>

                <Text style={styles.brandText}>
                  Paabot
                </Text>
              </Animated.View>
            </View>

            <Animated.View style={[styles.formCard, cardStyle]}>
              <Text style={styles.sectionLabel}>
                Select Account Type
              </Text>

              <View style={styles.roleContainer}>
                {roles.map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={[
                      styles.roleTab,
                      role === item.value && styles.roleTabActive,
                    ]}
                    onPress={() => setRole(item.value)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.roleText,
                        role === item.value && styles.roleTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>
                Full Name
              </Text>

              <Animated.View
                style={[
                  styles.inputContainer,
                  { borderColor: nameBorderColor },
                ]}
              >
                <Ionicons
                  name="person-circle-outline"
                  size={20}
                  color={focusedInput === 'fullName' ? '#059669' : '#9CA3AF'}
                  style={styles.inputIcon}
                />

                <TextInput
                  style={styles.input}
                  placeholder="John Doe"
                  placeholderTextColor="#CBD5E1"
                  value={fullName}
                  onChangeText={setFullName}
                  onFocus={() => {
                    setFocusedInput('fullName');
                    animateFocus(nameFocusAnim, 1);
                  }}
                  onBlur={() => {
                    setFocusedInput(null);
                    animateFocus(nameFocusAnim, 0);
                  }}
                />
              </Animated.View>

              <Text style={styles.inputLabel}>
                Username
              </Text>

              <Animated.View
                style={[
                  styles.inputContainer,
                  { borderColor: usernameBorderColor },
                ]}
              >
                <Ionicons
                  name="at-outline"
                  size={20}
                  color={focusedInput === 'username' ? '#059669' : '#9CA3AF'}
                  style={styles.inputIcon}
                />

                <TextInput
                  style={styles.input}
                  placeholder="e.g. juan_delacruz"
                  placeholderTextColor="#CBD5E1"
                  value={username}
                  onChangeText={setUsername}
                  onFocus={() => {
                    setFocusedInput('username');
                    animateFocus(usernameFocusAnim, 1);
                  }}
                  onBlur={() => {
                    setFocusedInput(null);
                    animateFocus(usernameFocusAnim, 0);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Animated.View>

              <Text style={styles.inputLabel}>
                Email Address
              </Text>

              <Animated.View
                style={[
                  styles.inputContainer,
                  { borderColor: emailBorderColor },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={focusedInput === 'email' ? '#059669' : '#9CA3AF'}
                  style={styles.inputIcon}
                />

                <TextInput
                  style={styles.input}
                  placeholder="name@gmail.com"
                  placeholderTextColor="#CBD5E1"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => {
                    setFocusedInput('email');
                    animateFocus(emailFocusAnim, 1);
                  }}
                  onBlur={() => {
                    setFocusedInput(null);
                    animateFocus(emailFocusAnim, 0);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                />
              </Animated.View>

              <Text style={styles.inputLabel}>
                Phone Number
              </Text>

              <Animated.View
                style={[
                  styles.inputContainer,
                  { borderColor: phoneBorderColor },
                ]}
              >
                <Ionicons
                  name="call-outline"
                  size={20}
                  color={focusedInput === 'phone' ? '#059669' : '#9CA3AF'}
                  style={styles.inputIcon}
                />

                <TextInput
                  style={styles.input}
                  placeholder="09123456789"
                  placeholderTextColor="#CBD5E1"
                  value={phone}
                  onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ''))}
                  maxLength={11}
                  onFocus={() => {
                    setFocusedInput('phone');
                    animateFocus(phoneFocusAnim, 1);
                  }}
                  onBlur={() => {
                    setFocusedInput(null);
                    animateFocus(phoneFocusAnim, 0);
                  }}
                  keyboardType="number-pad"
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
                  placeholder="Create a password"
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
                />

                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIconBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              </Animated.View>

              <Animated.View
                style={{
                  transform: [{ scale: buttonScale }],
                  marginTop: 8,
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.primaryButtonWrapper,
                    loading && styles.buttonDisabled,
                  ]}
                  onPress={handleSignup}
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
                    <Text style={styles.primaryButtonText}>
                      Register Account
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>

            <Animated.View style={[styles.footerContainer, footerStyle]}>
              <View style={styles.footerPill}>
                <Text style={styles.footerText}>
                  Already have an account?{' '}
                </Text>

                <TouchableOpacity
                  onPress={() => navigation.navigate('Login')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.linkText}>
                    Sign In
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

  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal:
      SCREEN_WIDTH < 380 ? 16 : 20,
    paddingTop:
      Platform.OS === 'ios' ? 24 : 18,
    paddingBottom: 24,
    justifyContent: 'center',
  },

  headerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
  },

  title: {
    fontSize:
      SCREEN_WIDTH < 380 ? 28 : 33,
    lineHeight:
      SCREEN_WIDTH < 380 ? 34 : 39,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    textAlign: 'center',
    textShadowColor:
      'rgba(0,0,0,0.34)',
    textShadowRadius: 10,
    textShadowOffset: {
      width: 0,
      height: 3,
    },
  },

  subtitleRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 7,
    maxWidth: 330,
  },

  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#ECFDF5',
    fontWeight: '600',
    textAlign: 'center',
  },

  brandText: {
    fontSize: 25,
    lineHeight: 30,
    color: '#6EE7B7',
    fontWeight: '900',
    letterSpacing: 0.2,
    textAlign: 'center',
    marginTop: 1,
    textShadowColor:
      'rgba(0,0,0,0.20)',
    textShadowRadius: 5,
  },

  formCard: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal:
      SCREEN_WIDTH < 380 ? 17 : 21,
    paddingTop:
      SCREEN_WIDTH < 380 ? 19 : 22,
    paddingBottom:
      SCREEN_WIDTH < 380 ? 17 : 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor:
      'rgba(255,255,255,0.95)',
    shadowColor: '#021C13',
    shadowOffset: {
      width: 0,
      height: 16,
    },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 10,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#475569',
    marginBottom: 8,
    textAlign: 'left',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },

  roleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    padding: 4,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  roleTab: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },

  roleTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.09,
    shadowRadius: 5,
    elevation: 2,
  },

  roleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },

  roleTextActive: {
    color: '#047857',
    fontWeight: '900',
  },

  inputLabel: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
    marginLeft: 2,
    letterSpacing: 0.1,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 15,
    paddingHorizontal: 13,
    height: 53,
    marginBottom: 13,
  },

  inputIcon: {
    marginRight: 10,
  },

  input: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 0,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
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

  primaryButtonWrapper: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#047857',
    shadowOffset: {
      width: 0,
      height: 7,
    },
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

  buttonDisabled: {
    opacity: 0.62,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  footerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  footerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    backgroundColor:
      'rgba(255,255,255,0.96)',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 15,
    borderWidth: 1,
    borderColor:
      'rgba(255,255,255,0.86)',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.10,
    shadowRadius: 7,
    elevation: 3,
  },

  footerText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
    textAlign: 'center',
  },

  linkText: {
    fontSize: 11.5,
    color: '#059669',
    fontWeight: '900',
    textAlign: 'center',
    marginLeft: 3,
  },

  /* =========================================================
     LOADING MODAL
  ========================================================= */

  loadingOverlay: {
    flex: 1,
    backgroundColor:
      'rgba(2,18,13,0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },

  loadingCard: {
    width: '100%',
    maxWidth: 215,
    paddingVertical: 25,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 14,
    },
    shadowOpacity: 0.25,
    shadowRadius: 22,
    elevation: 12,
  },

  loadingAccountBadge: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
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

  /* =========================================================
     CUSTOM ALERT / OTP
  ========================================================= */

  alertOverlay: {
    flex: 1,
    backgroundColor:
      'rgba(15,23,42,0.64)',
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
    borderColor:
      'rgba(255,255,255,0.95)',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 16,
    },
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