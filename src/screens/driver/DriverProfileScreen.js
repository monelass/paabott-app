import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  Animated,
  Easing,
  RefreshControl,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';

/* =========================================================
   DESIGN TOKENS
========================================================= */

const C = {
  brand: '#059669',
  brandDark: '#064E3B',
  brandSoft: '#E7F6EF',
  brandLine: '#BFE8D5',
  ink: '#10231B',
  body: '#4A5A52',
  muted: '#7B8A82',
  line: '#E6ECE8',
  bg: '#F4F7F5',
  card: '#FFFFFF',
  amber: '#B45309',
  amberSoft: '#FEF6E0',
  amberLine: '#F8DFA0',
  red: '#DC2626',
  redSoft: '#FEF2F2',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
};

const ALERT_TYPES = {
  success: { icon: 'checkmark-circle', color: C.brand, soft: C.brandSoft },
  warning: { icon: 'alert-circle', color: C.amber, soft: C.amberSoft },
  error: { icon: 'close-circle', color: C.red, soft: C.redSoft },
  info: { icon: 'information-circle', color: C.blue, soft: C.blueSoft },
};

const STATUS = {
  verified: {
    label: 'Verified',
    icon: 'shield-checkmark',
    color: C.brand,
    soft: C.brandSoft,
    line: C.brandLine,
  },
  pending: {
    label: 'Under review',
    icon: 'time',
    color: C.amber,
    soft: C.amberSoft,
    line: C.amberLine,
  },
  unverified: {
    label: 'Not verified',
    icon: 'shield-outline',
    color: C.amber,
    soft: C.amberSoft,
    line: C.amberLine,
  },
};

const DOCUMENTS = [
  {
    key: 'driversLicense',
    title: "Professional driver's license",
    subtitle: 'Front side of your valid license',
  },
  {
    key: 'ltoRegistration',
    title: 'LTO registration',
    subtitle: 'Valid for-hire registration',
  },
  {
    key: 'ltfrbFranchise',
    title: 'LTFRB franchise / CPC',
    subtitle: 'Franchise or certificate',
  },
  {
    key: 'nbiClearance',
    title: 'NBI / police clearance',
    subtitle: 'Current clearance document',
  },
  {
    key: 'validId',
    title: 'Government-issued ID',
    subtitle: 'Any valid government ID',
  },
];

/* =========================================================
   TERMS CONTENT
========================================================= */

const TERMS = [
  ['h1', 'PART I: TERMS AND CONDITIONS'],
  ['h2', '1. Acceptance of Terms'],
  ['p', 'By downloading, accessing, or using Paabot (the "App"), you agree to be bound by these Terms and Conditions ("Terms"). If you do not agree, you must not use the App.'],
  ['h2', '2. About the Service'],
  ['p', 'Paabot is a delivery platform operated by Titech that connects customers, merchants, and delivery riders to facilitate the ordering and delivery of products ("Services"). We act as an intermediary platform and are not the manufacturer, seller, or owner of the products delivered.'],
  ['h2', '3. Eligibility'],
  ['p', 'You must be at least 18 years old, or the legal age of majority in your jurisdiction, to use the App. By using the App, you represent that you meet this requirement.'],
  ['h2', '4. Account Registration'],
  ['p', '• You must provide accurate, current, and complete information.'],
  ['p', '• You are responsible for maintaining the confidentiality of your account and password.'],
  ['p', '• You are responsible for all activity that occurs under your account.'],
  ['p', '• We reserve the right to suspend or terminate accounts that violate these Terms.'],
  ['h2', '5. Onboarding Verification and Document Submission'],
  ['s', '(a) Merchant Verification', 'Before listing any merchant on Paabot, Titech shall require submission of valid business registration documents, including:'],
  ['p', '• DTI Business Name Registration (sole proprietorship) or SEC Registration (corporation/partnership)'],
  ['p', "• Mayor's Permit / Business Permit from the LGU"],
  ['p', '• BIR Certificate of Registration (Form 2303)'],
  ['p', '• Barangay Clearance (if required by LGU)'],
  ['p', '• Valid government-issued ID of the business owner or authorized representative'],
  ['p', '• Food safety license (FDA LTO) for food businesses'],
  ['s', '(b) Rider Verification', 'All delivery riders must submit before activation:'],
  ['p', "• Valid Professional Driver's License"],
  ['p', '• Proof of "For-Hire" LTO registration (not private)'],
  ['p', '• LTFRB franchise/CPC for motorcycle-for-hire operations'],
  ['p', '• NBI or Police Clearance'],
  ['p', '• Valid government-issued ID (UMID, passport, etc.)'],
  ['s', '(c) Document Validity', 'All submitted documents must be current and valid. Riders and merchants are responsible for promptly updating expired documents. Paabot reserves the right to suspend accounts with expired or invalid documents.'],
  ['s', '(d) Record-Keeping', 'Paabot shall maintain a database of all registered merchants and riders, including copies of submitted documents, in compliance with the Internet Transactions Act of 2023 (RA 11967) and applicable BIR regulations.'],
  ['h2', '6. Orders and Delivery'],
  ['p', '• All orders are subject to acceptance and availability.'],
  ['p', '• Delivery times are estimates and may vary due to weather, traffic, or other factors beyond our control.'],
  ['p', '• You must provide a complete and accurate delivery address and contact number.'],
  ['p', '• If you are unavailable at the delivery location, the order may be cancelled or returned, and fees may still apply.'],
  ['p', '• Risk of loss passes to you upon delivery (or upon handover to a third party you designate).'],
  ['h2', '7. Vehicle Fleet Restrictions and Capacity Limits'],
  ['s', '(a) Motorcycle Delivery Limits (Customer-Declared)', 'Motorcycle deliveries are subject to a maximum weight of 20 kilograms and maximum dimensions of 40cm x 40cm x 32cm (L x W x H). Because Paabot does not automatically measure or verify the weight or dimensions of items at checkout, the customer is solely responsible for ensuring that their order does not exceed these limits before booking.'],
  ['s', '(b) Tricycle Delivery Limits (Customer-Declared)', 'Tricycle deliveries are subject to the maximum allowable gross vehicle weight prescribed by the Land Transportation Office (LTO) and the applicable Local Government Unit (LGU) franchise. The customer is solely responsible for ensuring that their order does not exceed the safe carrying capacity of the assigned tricycle.'],
  ['s', '(c) Oversized or Heavy Items', 'If a rider reasonably determines that an order exceeds the applicable weight or size limits for their vehicle: The rider has the right to refuse the order without penalty. The order may be cancelled, and the customer may still be charged for the delivery attempt.'],
  ['s', '(d) Customer Responsibility for Accuracy', "Because Paabot does not gather weight or dimension data, the customer bears full responsibility for accurately assessing and declaring the size and weight of their items. Providing false or inaccurate information to bypass limits, or attempting to ship an item that exceeds the vehicle's capacity, may result in Account suspension or termination, Liability for any resulting injury, damage, or loss to the rider, the vehicle, or third parties, and Charges for any additional costs incurred."],
  ['s', '(e) Rider Protection', 'Delivery riders have the right to refuse any order that they reasonably believe exceeds safe weight or size limits, or that cannot be safely transported on their assigned vehicle. Such refusal shall not be grounds for penalty or account suspension.'],
  ['s', '(f) Regulatory Compliance', 'All delivery riders using motorcycles must have "for-hire" LTO registration and valid LTFRB franchise. All tricycle operators must have valid LGU franchise. Paabot reserves the right to verify compliance and suspend riders who fail to meet these requirements.'],
  ['h2', '8. Location Data'],
  ['p', '• Paabot collects and uses location data to facilitate deliveries, match you with riders/merchants, and provide real-time tracking.'],
  ['p', '• Disabling location permissions may prevent the App from functioning properly.'],
  ['p', '• Location data is handled in accordance with our Privacy Policy.'],
  ['h2', '9. Payments and Payment Processing'],
  ['s', '(a) Accepted Payment Methods', 'Paabot accepts payments through GCash, Maya (formerly PayMaya), Credit and debit cards (Visa, Mastercard), QR Ph, Cash-on-Delivery (COD), and other methods as displayed at checkout.'],
  ['s', '(b) Third-Party Payment Processors', 'Payments are processed through licensed third-party payment gateways and financial institutions. Paabot does not store full card numbers or e-wallet credentials on its servers. All payment transactions are subject to the terms and conditions of the applicable payment provider.'],
  ['s', '(c) Currency', 'All prices, fees, and charges are displayed in Philippine Peso (PHP) unless otherwise stated. Currency conversion fees, if any, are borne by the customer.'],
  ['s', '(d) Authorization', 'By placing an order and providing payment information, you authorize Paabot and its payment processors to charge the total amount of your order, including product costs, delivery fees, and applicable taxes.'],
  ['s', '(e) Failed or Declined Payments', 'If a payment is declined or fails, the order may not be processed or dispatched. You may be asked to provide an alternative payment method. Repeated failed payments may result in account suspension or termination.'],
  ['s', '(f) Refunds', 'Refunds, where applicable, will be processed through the original payment method used. Processing times vary by payment provider and may take up to [X] business days. Refunds are governed by our Refund & Cancellation Policy.'],
  ['s', '(g) Chargebacks', 'If you initiate a chargeback or payment dispute with your bank or e-wallet provider without first attempting to resolve the issue through our in-app support, we reserve the right to suspend or terminate your account pending investigation, provide transaction records and delivery evidence to the payment provider, and recover the disputed amount plus any associated fees if the chargeback is found to be invalid.'],
  ['s', '(h) Pricing Errors', 'If an order is placed at an incorrect price due to a technical error, Paabot reserves the right to cancel the order and issue a full refund, or contact you to confirm the correct price before proceeding.'],
  ['h2', '10. Cash-on-Delivery (COD) Remittance and Accountability'],
  ['s', '(a) Remittance Obligation', 'Delivery riders who accept Cash-on-Delivery (COD) orders are acting as agents entrusted with the collection and remittance of customer payments. By accepting a COD order, the rider agrees to remit the full collected amount to Paabot or its authorized payment partner within the time period specified in the App.'],
  ['s', '(b) Failure to Remit', "Failure to remit COD payments within the prescribed period is a serious violation of these Terms. Consequences may include immediate suspension of the rider's account until the unremitted amount is fully settled, permanent deactivation of the rider's account for repeated failure, and legal action."],
  ['s', '(c) Criminal Liability Warning', 'The rider acknowledges that misappropriating COD funds may constitute Qualified Theft under Article 310 of the Revised Penal Code. Paabot will cooperate fully with law enforcement in such cases.'],
  ['s', '(d) No Unauthorized Wage Deduction', 'Paabot shall not unilaterally deduct unremitted COD amounts from rider earnings or wages unless such deduction is expressly authorized by law or by written agreement with the rider in accordance with DOLE regulations.'],
  ['s', '(e) Rider Protection Against Prank Orders', 'If a rider fails to remit COD payment due to a prank order, the rider shall not be penalized if they can provide evidence of the fraudulent order.'],
  ['h2', '11. Delivery Partner Cancellation Policy'],
  ['s', '(a) Cancellation Rate Monitoring', 'Delivery partners are expected to maintain a cancellation rate below the threshold set by Paabot.'],
  ['s', '(b) Consequences of Excessive Cancellation', 'Repeated unjustified cancellations may result in reduced order allocation priority, temporary suspension, permanent deactivation, forfeiture of incentives, or reporting to the LTFRB.'],
  ['s', '(c) Valid Reasons for Cancellation', 'Valid reasons include natural calamities, vehicle breakdown, safety concerns at the location, or customer behavior posing a risk.'],
  ['s', '(d) Appeal Process', 'A delivery partner may file an appeal through the App within [X] days if they believe a cancellation was justified.'],
  ['s', '(e) Reporting Obligations', 'Where required by LTFRB regulations, Paabot shall submit reports on driver cancellations and actions taken.'],
  ['h2', '12. Damaged or Lost Items'],
  ['s', '(a) Reporting Window', 'Perishable items: Report within 24 hours of delivery. Non-perishable items: Report within 3 business days of delivery.'],
  ['s', '(b) Required Documents', 'Customer must submit photos of the damaged item/proof of loss, purchase invoice, repair/replacement invoice, and delivery receipt.'],
  ['s', '(c) Claims Process', 'Claims must be filed through Paabot within the reporting window. Paabot will investigate and assess liability based on circumstances.'],
  ['s', '(d) Limitation of Liability for Goods', 'To the extent permitted by law, the total liability of Paabot shall not exceed the lesser of the value declared by the customer or the actual invoice value.'],
  ['s', '(e) No Insurance Coverage', 'Paabot does not currently provide automatic goods-in-transit insurance. Customers requiring insurance for high-value items should arrange it independently.'],
  ['s', '(f) Presumption of Liability', 'Under Philippine law, common carriers are presumed at fault when goods are lost or damaged during transit. Paabot will assess each claim on its merits.'],
  ['h2', '13. Prank Orders and Fraudulent Transactions'],
  ['p', 'Placing an order with no genuine intention to purchase, receive, or pay for the goods or services is strictly prohibited. This includes providing false info, fictitious addresses, cancelling after costs are incurred, or harassing riders. Violation may result in immediate account suspension/termination, banning from future use, reporting to DTI/PNP/NBI, civil liability, and criminal liability under applicable laws.'],
  ['h2', '14. Protection for Delivery Riders'],
  ['p', 'Paabot is committed to protecting delivery riders from fraudulent or abusive orders. We reserve the right to require identity verification for high-value orders, suspend accounts associated with prank orders, and recover compensation from the offending customer.'],
  ['h2', '15. Prohibited Items'],
  ['p', 'The following may not be ordered or delivered through Paabot: Illegal drugs, weapons, explosives, live animals (unless permitted), hazardous materials, human remains, counterfeit goods, pornographic materials, and items prohibited by Philippine law or local ordinances.'],
  ['h2', '16. User Conduct'],
  ['p', "You agree not to use Paabot for any unlawful purpose, provide false information, harass or harm riders/merchants/users, interfere with Paabot's operation/security, or use Paabot to deliver prohibited items."],
  ['h2', '17. Intellectual Property'],
  ['p', 'All content, logos, trademarks, and software in Paabot are owned by Titech or its licensors. You may not copy, modify, or distribute them without permission.'],
  ['h2', '18. Limitation of Liability'],
  ['p', 'To the maximum extent permitted by law, Titech is not liable for indirect, incidental, or consequential damages, loss or damage to goods caused by third parties, delays caused by force majeure, or loss of data/profits. Our total liability shall not exceed the amount you paid for the affected order.'],
  ['h2', '19. Indemnification'],
  ['p', 'You agree to indemnify and hold harmless Titech, its officers, and employees from any claims, damages, or expenses arising from your use of Paabot or violation of these Terms.'],
  ['h2', '20. Suspension and Termination'],
  ['p', 'We may suspend or terminate your access at any time, without notice, if you violate these Terms or applicable law.'],
  ['h2', '21. Dispute Resolution'],
  ['p', 'These Terms are governed by the laws of the Republic of the Philippines. Disputes shall first be resolved through good-faith negotiation. If unresolved, disputes shall be submitted to the proper courts of Binalbagan, Philippines. Consumer complaints may be filed through our in-app support.'],
  ['h2', '22. Changes to These Terms'],
  ['p', 'We may update these Terms from time to time. Continued use of Paabot after changes constitutes acceptance. We will notify you of material changes.'],
  ['h2', '23. Contact Us'],
  ['p', 'Titech\nBinalbagan Negros Occidental\nEmail: Paabot@email.com\nPhone: 09123456789'],
];

/* =========================================================
   SMALL SHARED PIECES
========================================================= */

function Section({ title, actionLabel, actionIcon, onAction, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {actionLabel ? (
          <TouchableOpacity
            onPress={onAction}
            activeOpacity={0.7}
            style={styles.sectionAction}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={actionIcon} size={15} color={C.brand} />
            <Text style={styles.sectionActionText}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function IconBox({ name, color = C.brand, bg = C.brandSoft, size = 20, box = 40 }) {
  return (
    <View
      style={[
        styles.iconBox,
        { width: box, height: box, borderRadius: box * 0.3, backgroundColor: bg },
      ]}
    >
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
}

/* =========================================================
   ALERT MODAL
========================================================= */

function ModernAlertModal({
  visible,
  type = 'info',
  title,
  message,
  buttonText = 'Okay',
  onClose,
}) {
  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const current = ALERT_TYPES[type] || ALERT_TYPES.info;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.94);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 90,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, scale, opacity]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Animated.View style={[styles.dialog, { transform: [{ scale }] }]}>
          <View style={[styles.dialogIcon, { backgroundColor: current.soft }]}>
            <Ionicons name={current.icon} size={30} color={current.color} />
          </View>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogMessage}>{message}</Text>
          <TouchableOpacity
            style={[styles.dialogButton, { backgroundColor: current.color }]}
            activeOpacity={0.85}
            onPress={onClose}
          >
            <Text style={styles.dialogButtonText}>{buttonText}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/* =========================================================
   SCREEN
========================================================= */

export default function DriverProfileScreen({ navigation }) {
  const { user, profile, signOut } = useAuth();

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Driver verification
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId, setDriverId] = useState(null);
  const [isVerified, setIsVerified] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState('unverified');

  // ── NEW STATE — Editable Phone Number ─────────────
  const [phoneState, setPhoneState] = useState(profile?.phone_number || profile?.phone || user?.phone || '');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [editPhoneValue, setEditPhoneValue] = useState('');
  const [updatingPhone, setUpdatingPhone] = useState(false);

  // Modals
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [submittingVerification, setSubmittingVerification] = useState(false);

  // Alert
  const [alertState, setAlertState] = useState({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    buttonText: 'Okay',
  });

  const showModernAlert = (type, title, message, buttonText = 'Okay') => {
    setAlertState({ visible: true, type, title, message, buttonText });
  };

  const closeModernAlert = () => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  };

  // Form
  const [vehicleType, setVehicleType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Documents
  const [docs, setDocs] = useState({
    driversLicense: null,
    ltoRegistration: null,
    ltfrbFranchise: null,
    nbiClearance: null,
    validId: null,
  });

  /* ---------------- FETCH DRIVER DATA ---------------- */

  const fetchDriverData = async (showRefreshing = false) => {
    const currentUserId = user?.id || profile?.id;

    if (!currentUserId) {
      setLoadingInitial(false);
      setRefreshing(false);
      return;
    }

    if (showRefreshing) setRefreshing(true);

    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url, phone')
        .eq('id', currentUserId)
        .maybeSingle();

      if (profileData?.avatar_url) setAvatarUrl(profileData.avatar_url);
      if (profileData?.phone) setPhoneState(profileData.phone);

      const { data: driverData } = await supabase
        .from('drivers')
        .select('*')
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (driverData) {
        setDriverId(driverData.id);
        setIsVerified(driverData.is_verified || false);
        setVerificationStatus(
          driverData.verification_status ||
            (driverData.is_verified ? 'verified' : 'unverified')
        );
        setVehicleType(driverData.vehicle_type || '');
        setPlateNumber(driverData.plate_number || '');
      } else {
        setDriverId(null);
        setIsVerified(false);
        setVerificationStatus('unverified');
        setVehicleType('');
        setPlateNumber('');
      }
    } catch (err) {
      console.error('Error fetching driver profile:', err);
      if (showRefreshing) {
        showModernAlert(
          'error',
          'Refresh failed',
          'We could not refresh your driver profile. Check your connection and try again.'
        );
      }
    } finally {
      setLoadingInitial(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDriverData();
    }, [user?.id, profile?.id])
  );

  const handleRefresh = async () => {
    if (refreshing) return;
    await fetchDriverData(true);  
  };

  /* ---------------- EDIT PHONE HELPERS ---------------- */

  const handleEditPhonePress = () => {
    setEditPhoneValue(phoneState || '');
    setIsEditingPhone(true);
  };

  const handleCancelEditPhone = () => {
    setIsEditingPhone(false);
    setEditPhoneValue('');
  };

  const handleSavePhone = async () => {
    const currentUserId = user?.id || profile?.id;
    if (!currentUserId) return;

    const cleanedPhone = editPhoneValue.trim();
    if (!cleanedPhone || cleanedPhone.length < 10) {
      showModernAlert('warning', 'Invalid Phone', 'Please enter a valid phone number.');
      return;
    }

    setUpdatingPhone(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ phone: cleanedPhone })
        .eq('id', currentUserId);

      if (error) throw error;

      setPhoneState(cleanedPhone);
      setIsEditingPhone(false);
      showModernAlert('success', 'Phone Updated', 'Your phone number has been saved successfully.');
    } catch (error) {
      console.error('Error updating phone:', error);
      showModernAlert('error', 'Update Failed', 'Could not save your new phone number. Please try again.');
    } finally {
      setUpdatingPhone(false);
    }
  };

  /* ---------------- IMAGE HELPERS ---------------- */

  const uriToDataUri = async (uri) => {
    const base64String = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    return `data:image/${ext === 'png' ? 'png' : 'jpeg'};base64,${base64String}`;
  };

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showModernAlert(
          'warning',
          'Photo access needed',
          'Allow access to your photo library to update your profile picture.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploadingAvatar(true);

        const dataUri = await uriToDataUri(result.assets[0].uri);
        setAvatarUrl(dataUri);

        const currentUserId = user?.id || profile?.id;

        if (currentUserId) {
          const { error } = await supabase
            .from('profiles')
            .update({ avatar_url: dataUri })
            .eq('id', currentUserId);

          if (error) throw error;
        }

        setUploadingAvatar(false);

        showModernAlert(
          'success',
          'Profile picture updated',
          'Your new profile picture has been saved.'
        );
      }
    } catch (error) {
      setUploadingAvatar(false);
      showModernAlert(
        'error',
        'Upload failed',
        'We could not update your profile picture. Please try again.'
      );
    }
  };

  const pickDocumentImage = async (docKey) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showModernAlert(
          'warning',
          'Photo access needed',
          'Allow access to your photos to attach verification documents.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const dataUri = await uriToDataUri(result.assets[0].uri);
        setDocs((prev) => ({ ...prev, [docKey]: dataUri }));
      }
    } catch (error) {
      showModernAlert(
        'error',
        'Could not attach document',
        'Something went wrong while attaching this document. Please try again.'
      );
    }
  };

  /* ---------------- SUBMIT VERIFICATION ---------------- */

  const submitVerification = async () => {
    const currentUserId = user?.id || profile?.id;

    if (!currentUserId) {
      showModernAlert(
        'error',
        'Session not found',
        'We could not find your session. Please log in again.'
      );
      return;
    }

    if (!vehicleType.trim() || !plateNumber.trim()) {
      showModernAlert(
        'warning',
        'Vehicle details required',
        'Enter your vehicle type and plate number before submitting.'
      );
      return;
    }

    if (
      !docs.driversLicense ||
      !docs.ltoRegistration ||
      !docs.ltfrbFranchise ||
      !docs.nbiClearance ||
      !docs.validId
    ) {
      showModernAlert(
        'warning',
        'Documents required',
        'Upload all 5 required documents before submitting.'
      );
      return;
    }

    if (!agreedToTerms) {
      showModernAlert(
        'warning',
        'Agree to the terms',
        'You must agree to the Terms and Conditions and Platform Policies to submit.'
      );
      return;
    }

    setSubmittingVerification(true);

    try {
      const driverPayload = {
        user_id: currentUserId,
        vehicle_type: vehicleType.trim(),
        plate_number: plateNumber.trim(),
        verification_status: 'pending',
        is_verified: false,
        verification_documents: {
          drivers_license_url: docs.driversLicense,
          lto_registration_url: docs.ltoRegistration,
          ltfrb_franchise_url: docs.ltfrbFranchise,
          nbi_clearance_url: docs.nbiClearance,
          valid_id_url: docs.validId,
          submitted_at: new Date().toISOString(),
        },
      };

      if (driverId) {
        const { error } = await supabase
          .from('drivers')
          .update(driverPayload)
          .eq('id', driverId);

        if (error) throw error;
      } else {
        const { data: newDriver, error } = await supabase
          .from('drivers')
          .insert(driverPayload)
          .select()
          .single();

        if (error) throw error;
        if (newDriver) setDriverId(newDriver.id);
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          agreed_to_terms: true,
          terms_accepted_at: new Date().toISOString(),
        })
        .eq('id', currentUserId);

      if (profileError) {
        console.error('Profile terms update failed:', profileError.message);
      }

      setVerificationStatus('pending');
      setVerifyModalVisible(false);

      showModernAlert(
        'success',
        'Application submitted',
        'Your documents were sent to the admin team for review.'
      );
    } catch (error) {
      showModernAlert(
        'error',
        'Submission failed',
        error?.message || 'Something went wrong while submitting your verification.'
      );
    } finally {
      setSubmittingVerification(false);
    }
  };

  /* ---------------- LOGOUT ---------------- */

  const handleLogoutRequest = () => {
    if (loggingOut) return;
    setLogoutModalVisible(true);
  };

  const confirmLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      setLogoutModalVisible(false);
      await signOut();
    } catch (error) {
      console.error('Logout error:', error);
      setLoggingOut(false);
      showModernAlert(
        'error',
        'Log out failed',
        'Something went wrong while logging out. Please try again.'
      );
    }
  };

  const cancelLogout = () => {
    if (loggingOut) return;
    setLogoutModalVisible(false);
  };

  /* ---------------- DERIVED ---------------- */

  const status = STATUS[verificationStatus] || STATUS.unverified;
  const isLocked = verificationStatus !== 'unverified';
  const attachedCount = Object.values(docs).filter(Boolean).length;
  const displayPhone = phoneState || 'Not provided';

  const menuItems = [
    {
      icon: 'document-text-outline',
      title: 'Vehicle & documents',
      subtitle: 'Manage your verification details',
      onPress: () => setVerifyModalVisible(true),
    },
  ];

  const notice = {
    unverified: {
      icon: 'shield-outline',
      title: 'Finish your verification',
      text: 'Add your vehicle details and documents to start accepting delivery jobs.',
    },
    pending: {
      icon: 'time-outline',
      title: 'Your application is under review',
      text: 'The admin team is checking your documents. We will update this screen once a decision is made.',
    },
    verified: {
      icon: 'checkmark-circle',
      title: "You're cleared for delivery jobs",
      text: 'Your credentials are approved and your account is ready for delivery work.',
    },
  }[verificationStatus] || null;

  /* ---------------- DOCUMENT ROW ---------------- */

  const renderDocumentRow = ({ key, title, subtitle }) => {
    const attached = !!docs[key];

    return (
      <TouchableOpacity
        key={key}
        style={[styles.docRow, attached && styles.docRowAttached]}
        onPress={() => pickDocumentImage(key)}
        activeOpacity={0.75}
      >
        <IconBox
          name={attached ? 'checkmark' : 'document-text-outline'}
          color={attached ? C.brand : C.muted}
          bg={attached ? '#D5F0E3' : '#EEF2F0'}
          size={19}
          box={38}
        />

        <View style={styles.flex}>
          <Text style={styles.docTitle}>{title}</Text>
          <Text style={styles.docSubtitle}>
            {attached ? 'Attached · tap to replace' : subtitle}
          </Text>
        </View>

        {attached ? (
          <Image source={{ uri: docs[key] }} style={styles.docThumb} />
        ) : (
          <View style={styles.docAdd}>
            <Ionicons name="add" size={18} color={C.brand} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  /* ---------------- LOADING ---------------- */

  if (loadingInitial) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={styles.loadingTitle}>Loading your profile</Text>
        <Text style={styles.loadingSubtitle}>Getting your driver account ready</Text>
      </View>
    );
  }

  /* ---------------- MAIN ---------------- */

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={C.brandDark}
        translucent={false}
      />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { flexGrow: 1 }]}
        alwaysBounceVertical={true}
        nestedScrollEnabled={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#FFFFFF"
            colors={[C.brand]}
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        {/* HERO */}
        <LinearGradient
          colors={[C.brandDark, '#0A6B4E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroKicker}>Paabot driver</Text>

          <View style={styles.heroRow}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatarRing}>
                {uploadingAvatar ? (
                  <View style={styles.avatarFill}>
                    <ActivityIndicator size="small" color={C.brand} />
                  </View>
                ) : avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.avatarFill}>
                    <Ionicons name="person" size={38} color={C.brand} />
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.avatarEdit}
                activeOpacity={0.85}
                onPress={handlePickImage}
                disabled={uploadingAvatar}
              >
                <Ionicons name="camera" size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.flex}>
              <Text style={styles.heroName} numberOfLines={2}>
                {profile?.full_name || 'Driver'}
              </Text>
              <Text style={styles.heroEmail} numberOfLines={1}>
                {user?.email || 'No email provided'}
              </Text>

              <View style={styles.heroChip}>
                <Ionicons name={status.icon} size={13} color={status.color} />
                <Text style={[styles.heroChipText, { color: status.color }]}>
                  {status.label}
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* CONTENT */}
        <View style={styles.content}>
          
          {/* QUICK FACTS VERTICAL LAYOUT (ACCOUNT ON TOP, PHONE ON BOTTOM) */}
          <View style={styles.factsCard}>
            
            {/* Account Verification Row (TOP) */}
            <View style={styles.factItem}>
              <IconBox
                name={isVerified ? 'shield-checkmark-outline' : 'shield-outline'}
                size={20}
                box={42}
              />
              <View style={styles.flex}>
                <Text style={styles.factLabel}>Account Verification</Text>
                <Text style={styles.factValue} numberOfLines={1}>
                  {verificationStatus === 'verified'
                    ? 'Active'
                    : verificationStatus === 'pending'
                      ? 'Under review'
                      : 'Setup needed'}
                </Text>
              </View>
            </View>

            <View style={styles.factDivider} />

            {/* Phone Number Fact Row (BOTTOM) */}
            <View style={styles.factItem}>
              <IconBox name="call-outline" size={20} box={42} />
              <View style={styles.infoTextArea}>
                <View style={styles.phoneHeaderRow}>
                  <Text style={styles.factLabel}>Phone Number</Text>
                  {!isEditingPhone && (
                    <TouchableOpacity 
                      onPress={handleEditPhonePress} 
                      style={styles.editPhoneButton}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.editTextBtn}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>
                
                {isEditingPhone ? (
                  <View style={styles.phoneEditContainer}>
                    <TextInput
                      style={styles.inlinePhoneInput}
                      value={editPhoneValue}
                      onChangeText={setEditPhoneValue}
                      placeholder="Enter phone number"
                      keyboardType="phone-pad"
                      autoFocus
                      editable={!updatingPhone}
                    />
                    <View style={styles.phoneEditActions}>
                      <TouchableOpacity 
                        onPress={handleCancelEditPhone} 
                        style={[styles.phoneActionIconBtn, styles.cancelActionBtn]}
                        disabled={updatingPhone}
                        activeOpacity={0.8}
                      >
                         <Ionicons name="close" size={18} color="#475569" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={handleSavePhone} 
                        style={[styles.phoneActionIconBtn, styles.saveActionBtn]}
                        disabled={updatingPhone}
                        activeOpacity={0.8}
                      >
                        {updatingPhone ? (
                           <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity 
                    onPress={handleEditPhonePress} 
                    activeOpacity={0.7}
                  >
                    <Text style={styles.factValue} numberOfLines={1}>
                      {displayPhone}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* STATUS NOTICE */}
          {notice && (
            <View
              style={[
                styles.notice,
                { backgroundColor: status.soft, borderColor: status.line },
              ]}
            >
              <IconBox
                name={notice.icon}
                color={status.color}
                bg="#FFFFFF"
                size={21}
                box={40}
              />
              <View style={styles.flex}>
                <Text style={[styles.noticeTitle, { color: C.ink }]}>
                  {notice.title}
                </Text>
                <Text style={styles.noticeText}>{notice.text}</Text>

                {verificationStatus === 'unverified' && (
                  <TouchableOpacity
                    style={styles.noticeButton}
                    onPress={() => setVerifyModalVisible(true)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.noticeButtonText}>Start verification</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* VEHICLE */}
          <Section
            title="Vehicle"
            actionLabel="Edit"
            actionIcon="create-outline"
            onAction={() => setVerifyModalVisible(true)}
          >
            <View style={styles.listCard}>
              <View style={styles.listRow}>
                <IconBox name="car-outline" size={20} />
                <View style={styles.flex}>
                  <Text style={styles.rowLabel}>Vehicle type</Text>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {vehicleType || 'Not set'}
                  </Text>
                </View>
              </View>

              <View style={[styles.listRow, styles.listRowLast]}>
                <IconBox name="pricetag-outline" size={20} />
                <View style={styles.flex}>
                  <Text style={styles.rowLabel}>Plate number</Text>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {plateNumber || 'Not set'}
                  </Text>
                </View>
              </View>
            </View>
          </Section>

          {/* SETTINGS */}
          <Section title="Settings">
            <View style={styles.listCard}>
              {menuItems.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.listRow,
                    index === menuItems.length - 1 && styles.listRowLast,
                  ]}
                  onPress={() => {
                    if (item.onPress) item.onPress();
                    else if (item.nav) navigation.navigate(item.nav);
                  }}
                  activeOpacity={0.7}
                >
                  <IconBox name={item.icon} size={20} />
                  <View style={styles.flex}>
                    <Text style={styles.rowValue}>{item.title}</Text>
                    <Text style={styles.rowLabel}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#B8C4BD" />
                </TouchableOpacity>
              ))}
            </View>
          </Section>

          {/* LOGOUT */}
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogoutRequest}
            activeOpacity={0.8}
            disabled={loggingOut}
          >
            <Ionicons name="log-out-outline" size={20} color={C.red} />
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>

          <Text style={styles.footer}>Paabot · Driver account</Text>
        </View>
      </ScrollView>

      {/* ALERT */}
      <ModernAlertModal
        visible={alertState.visible}
        type={alertState.type}
        title={alertState.title}
        message={alertState.message}
        buttonText={alertState.buttonText}
        onClose={closeModernAlert}
      />

      {/* LOGOUT CONFIRM */}
      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelLogout}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <View style={[styles.dialogIcon, { backgroundColor: C.redSoft }]}>
              <Ionicons name="log-out-outline" size={29} color={C.red} />
            </View>
            <Text style={styles.dialogTitle}>Log out?</Text>
            <Text style={styles.dialogMessage}>
              You will need to sign in again to accept delivery jobs.
            </Text>

            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={styles.dialogGhost}
                onPress={cancelLogout}
                activeOpacity={0.8}
                disabled={loggingOut}
              >
                <Text style={styles.dialogGhostText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dialogButton, styles.dialogButtonHalf, { backgroundColor: C.red }]}
                onPress={confirmLogout}
                activeOpacity={0.85}
                disabled={loggingOut}
              >
                {loggingOut ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.dialogButtonText}>Log out</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* VERIFICATION MODAL */}
      <Modal
        visible={verifyModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setVerifyModalVisible(false)}
      >
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity
              onPress={() => setVerifyModalVisible(false)}
              style={styles.closeBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={C.ink} />
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>Driver verification</Text>
            <View style={styles.closeBtn} />
          </View>

          <ScrollView
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Status */}
            <View
              style={[
                styles.notice,
                { backgroundColor: status.soft, borderColor: status.line },
              ]}
            >
              <IconBox
                name={status.icon}
                color={status.color}
                bg="#FFFFFF"
                size={21}
                box={40}
              />
              <View style={styles.flex}>
                <Text style={styles.noticeTitle}>
                  {verificationStatus === 'verified'
                    ? 'Account approved'
                    : verificationStatus === 'pending'
                      ? 'Application under review'
                      : 'Complete your verification'}
                </Text>
                <Text style={styles.noticeText}>
                  {verificationStatus === 'verified'
                    ? 'Your credentials have been approved.'
                    : verificationStatus === 'pending'
                      ? 'Your submitted documents are being reviewed.'
                      : 'Submit your vehicle details and documents to start accepting jobs.'}
                </Text>
              </View>
            </View>

            {/* Step 1 */}
            <View style={styles.formCard}>
              <View style={styles.formHead}>
                <View style={styles.stepDot}>
                  <Text style={styles.stepDotText}>1</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.formTitle}>Vehicle information</Text>
                  <Text style={styles.formSubtitle}>Details about your delivery vehicle</Text>
                </View>
              </View>

              <Text style={styles.label}>Vehicle type</Text>
              <View style={[styles.inputWrap, isLocked && styles.inputDisabled]}>
                <Ionicons name="car-outline" size={18} color={C.brand} />
                <TextInput
                  style={styles.input}
                  value={vehicleType}
                  onChangeText={setVehicleType}
                  placeholder="Motorcycle, tricycle, etc."
                  placeholderTextColor="#A0ABA5"
                  editable={!isLocked}
                />
              </View>

              <Text style={styles.label}>Plate number</Text>
              <View style={[styles.inputWrap, isLocked && styles.inputDisabled]}>
                <Ionicons name="pricetag-outline" size={18} color={C.brand} />
                <TextInput
                  style={styles.input}
                  value={plateNumber}
                  onChangeText={setPlateNumber}
                  placeholder="ABC 1234"
                  placeholderTextColor="#A0ABA5"
                  autoCapitalize="characters"
                  editable={!isLocked}
                />
              </View>
            </View>

            {/* Step 2 */}
            {!isLocked && (
              <View style={styles.formCard}>
                <View style={styles.formHead}>
                  <View style={styles.stepDot}>
                    <Text style={styles.stepDotText}>2</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.formTitle}>Official documents</Text>
                    <Text style={styles.formSubtitle}>Upload clear photos of each one</Text>
                  </View>
                  <Text style={styles.countText}>{attachedCount}/5</Text>
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${(attachedCount / 5) * 100}%` },
                    ]}
                  />
                </View>

                <View style={styles.docList}>{DOCUMENTS.map(renderDocumentRow)}</View>
              </View>
            )}

            {/* Terms */}
            {!isLocked && (
              <TouchableOpacity
                style={styles.termsRow}
                activeOpacity={0.8}
                onPress={() => setAgreedToTerms(!agreedToTerms)}
              >
                <View style={[styles.checkbox, agreedToTerms && styles.checkboxOn]}>
                  {agreedToTerms && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
                </View>
                <Text style={styles.termsText}>
                  I agree to the{' '}
                  <Text style={styles.termsLink} onPress={() => setTermsModalVisible(true)}>
                    Terms and Conditions
                  </Text>{' '}
                  and{' '}
                  <Text style={styles.termsLink} onPress={() => setTermsModalVisible(true)}>
                    Platform Policies
                  </Text>
                  .
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Sticky action */}
          <View style={styles.sheetFooter}>
            {!isLocked ? (
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (!agreedToTerms || submittingVerification) && styles.primaryBtnDisabled,
                ]}
                onPress={submitVerification}
                disabled={submittingVerification || !agreedToTerms}
                activeOpacity={0.85}
              >
                {submittingVerification ? (
                  <>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.primaryBtnText}>Submitting...</Text>
                  </>
                ) : (
                  <Text style={styles.primaryBtnText}>Submit for review</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => setVerifyModalVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Close</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* TERMS MODAL */}
      <Modal
        visible={termsModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setTermsModalVisible(false)}
      >
        <SafeAreaView style={[styles.sheet, { backgroundColor: '#FFFFFF' }]}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity
              onPress={() => setTermsModalVisible(false)}
              style={styles.closeBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={C.ink} />
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>Terms & policies</Text>
            <View style={styles.closeBtn} />
          </View>

          <ScrollView
            contentContainerStyle={styles.termsScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.notice, { backgroundColor: C.brandSoft, borderColor: C.brandLine }]}>
              <IconBox name="document-text-outline" bg="#FFFFFF" size={21} box={40} />
              <View style={styles.flex}>
                <Text style={styles.noticeTitle}>Please review carefully</Text>
                <Text style={styles.noticeText}>
                  These terms explain your responsibilities as a Paabot delivery partner.
                </Text>
              </View>
            </View>

            {TERMS.map((item, i) => {
              if (item[0] === 'h1') {
                return (
                  <Text key={i} style={styles.termsH1}>
                    {item[1]}
                  </Text>
                );
              }
              if (item[0] === 'h2') {
                return (
                  <Text key={i} style={styles.termsH2}>
                    {item[1]}
                  </Text>
                );
              }
              if (item[0] === 's') {
                return (
                  <Text key={i} style={styles.termsP}>
                    <Text style={styles.termsBold}>{item[1]}</Text>
                    {'\n'}
                    {item[2]}
                  </Text>
                );
              }
              return (
                <Text key={i} style={styles.termsP}>
                  {item[1]}
                </Text>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/* =========================================================
   STYLES
========================================================= */

const cardShadow = {
  shadowColor: '#14382B',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  infoTextArea: { flex: 1, minWidth: 0 },
  iconBox: { alignItems: 'center', justifyContent: 'center' },

  container: {
    flex: 1,
    backgroundColor: C.brandDark,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },

  scroll: { flex: 1, backgroundColor: C.bg },
  scrollContent: { paddingBottom: 40 },

  /* Loading */
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
    paddingHorizontal: 30,
  },
  loadingTitle: { marginTop: 16, color: C.ink, fontSize: 16, fontWeight: '700' },
  loadingSubtitle: { marginTop: 4, color: C.muted, fontSize: 13 },

  /* Hero */
  hero: {
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 56,
  },
  heroKicker: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarWrap: { width: 88, height: 88 },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    padding: 3,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 41 },
  avatarFill: {
    width: '100%',
    height: '100%',
    borderRadius: 41,
    backgroundColor: C.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEdit: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.brand,
    borderWidth: 3,
    borderColor: C.brandDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  heroEmail: { marginTop: 2, color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  heroChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  heroChipText: { fontSize: 12, fontWeight: '700' },

  /* Content */
  content: { paddingHorizontal: 16, marginTop: -32 },

  /* Column Layout for Facts Card */
  factsCard: {
    flexDirection: 'column',
    backgroundColor: C.card,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
    ...cardShadow,
  },
  factItem: { 
    width: '100%', 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12 
  },
  factLabel: { color: C.muted, fontSize: 12.5, fontWeight: '600' },
  factValue: { color: C.ink, fontSize: 15, fontWeight: '700', marginTop: 2 },
  factDivider: { 
    width: '100%', 
    height: 1, 
    backgroundColor: C.line, 
    marginVertical: 14 
  },

  /* Editable Phone Number Styles */
  phoneHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  
  editPhoneButton: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },

  editTextBtn: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#059669',
  },

  phoneEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    width: '100%',
  },
  
  inlinePhoneInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginRight: 8,
  },
  
  phoneEditActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  phoneActionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },

  cancelActionBtn: {
    backgroundColor: '#F1F5F9',
  },

  saveActionBtn: {
    backgroundColor: '#059669',
  },

  /* Notice */
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
  },
  noticeTitle: { color: C.ink, fontSize: 15, fontWeight: '700' },
  noticeText: { marginTop: 3, color: C.body, fontSize: 13, lineHeight: 19 },
  noticeButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 10,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  /* Sections */
  section: { marginBottom: 22 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: { color: C.ink, fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionActionText: { color: C.brand, fontSize: 14, fontWeight: '700' },

  listCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    overflow: 'hidden',
    ...cardShadow,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  listRowLast: { borderBottomWidth: 0 },
  rowLabel: { color: C.muted, fontSize: 12.5 },
  rowValue: { color: C.ink, fontSize: 15, fontWeight: '700', marginTop: 1 },

  /* Logout */
  logoutButton: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F7D1D1',
    backgroundColor: C.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutText: { color: C.red, fontSize: 15, fontWeight: '700' },
  footer: { textAlign: 'center', color: '#A0ABA5', fontSize: 12, marginTop: 20 },

  /* Dialogs */
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10,25,19,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
  },
  dialogIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  dialogTitle: { color: C.ink, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  dialogMessage: {
    color: C.body,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 6,
  },
  dialogButton: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogButtonHalf: { flex: 1, width: undefined, marginTop: 0 },
  dialogButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  dialogButtons: { flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' },
  dialogGhost: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F0F3F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogGhostText: { color: C.body, fontSize: 15, fontWeight: '700' },

  /* Sheets */
  sheet: { flex: 1, backgroundColor: C.bg },
  sheetHeader: {
    height: 58,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F3F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: { color: C.ink, fontSize: 16, fontWeight: '800' },
  sheetContent: { padding: 16, paddingBottom: 24 },
  sheetFooter: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: C.line,
  },

  formCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    ...cardShadow,
  },
  formHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  formTitle: { color: C.ink, fontSize: 15, fontWeight: '800' },
  formSubtitle: { color: C.muted, fontSize: 12.5, marginTop: 1 },
  countText: { color: C.brand, fontSize: 13, fontWeight: '800' },

  label: { color: C.body, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  inputWrap: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5DDD8',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  inputDisabled: { backgroundColor: '#F0F3F1', borderColor: C.line },
  input: { flex: 1, height: '100%', color: C.ink, fontSize: 15, fontWeight: '500' },

  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E8EEEA',
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: C.brand },

  docList: { gap: 10 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: '#FAFBFA',
  },
  docRowAttached: { borderColor: C.brandLine, backgroundColor: '#F2FBF6' },
  docTitle: { color: C.ink, fontSize: 14, fontWeight: '700' },
  docSubtitle: { color: C.muted, fontSize: 12, marginTop: 2 },
  docThumb: { width: 40, height: 40, borderRadius: 8 },
  docAdd: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    ...cardShadow,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#C6D0CA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: C.brand, borderColor: C.brand },
  termsText: { flex: 1, color: C.body, fontSize: 13, lineHeight: 19 },
  termsLink: { color: C.brand, fontWeight: '700', textDecorationLine: 'underline' },

  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: C.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnDisabled: { backgroundColor: '#A9B6AF' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  /* Terms */
  termsScroll: { padding: 16, paddingBottom: 40 },
  termsH1: {
    color: C.ink,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 6,
  },
  termsH2: {
    color: C.ink,
    fontSize: 14.5,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 6,
  },
  termsP: { color: C.body, fontSize: 13.5, lineHeight: 21, marginBottom: 8 },
  termsBold: { color: C.ink, fontWeight: '700' },
});