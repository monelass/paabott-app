import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const formatTransactionReference = (referenceText) => {
  if (!referenceText) return 'Store Earning';

  const match = referenceText.match(/#([a-zA-Z0-9-]+)/);

  if (match && match[1]) {
    const rawId = match[1];
    const shortId = rawId.substring(0, 5).toUpperCase();

    return referenceText.replace(`#${rawId}`, `#${shortId}`);
  }

  return referenceText;
};

const formatCurrency = (amount) => {
  const value = Number(amount || 0);

  return `₱${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatTransactionDate = (dateValue) => {
  if (!dateValue) return 'Date unavailable';

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTransactionTime = (dateValue) => {
  if (!dateValue) return '';

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

// --------------------------------------------------
// MODERN POPUP
// --------------------------------------------------

const ModernPopup = ({
  visible,
  type = 'info',
  title,
  message,
  buttonText = 'Okay',
  onClose,
}) => {
  const configs = {
    success: {
      icon: 'checkmark-circle',
      iconColor: '#059669',
      iconBg: '#ECFDF5',
      button: '#059669',
      label: 'Success',
    },
    error: {
      icon: 'close-circle',
      iconColor: '#DC2626',
      iconBg: '#FEF2F2',
      button: '#DC2626',
      label: 'Error',
    },
    warning: {
      icon: 'warning',
      iconColor: '#D97706',
      iconBg: '#FFFBEB',
      button: '#D97706',
      label: 'Attention',
    },
    info: {
      icon: 'information-circle',
      iconColor: '#2563EB',
      iconBg: '#EFF6FF',
      button: '#2563EB',
      label: 'Information',
    },
  };

  const config = configs[type] || configs.info;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.popupOverlay}>
        <View style={styles.popupCard}>
          <View
            style={[
              styles.popupIconBox,
              { backgroundColor: config.iconBg },
            ]}
          >
            <Ionicons
              name={config.icon}
              size={32}
              color={config.iconColor}
            />
          </View>

          <Text style={styles.popupLabel}>{config.label}</Text>

          <Text style={styles.popupTitle}>
            {title}
          </Text>

          <Text style={styles.popupMessage}>
            {message}
          </Text>

          <TouchableOpacity
            style={[
              styles.popupButton,
              { backgroundColor: config.button },
            ]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.popupButtonText}>
              {buttonText}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// --------------------------------------------------
// MAIN SCREEN
// --------------------------------------------------

export default function StoreWalletScreen({ navigation }) {
  const { profile } = useAuth();

  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [analyticsTab, setAnalyticsTab] = useState('overall');

  // ----------------------------------------------
  // PAYOUT LOCK
  // ----------------------------------------------

  const [isPayoutLocked, setIsPayoutLocked] = useState(false);
  const [nextAvailableDate, setNextAvailableDate] = useState(null);

  // ----------------------------------------------
  // CASHOUT MODAL
  // ----------------------------------------------

  const [showCashoutModal, setShowCashoutModal] = useState(false);
  const [gcashName, setGcashName] = useState('');
  const [gcashNumber, setGcashNumber] = useState('');
  const [requestingCashout, setRequestingCashout] = useState(false);

  // ----------------------------------------------
  // POPUP
  // ----------------------------------------------

  const [popup, setPopup] = useState({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    buttonText: 'Okay',
  });

  const showPopup = useCallback(
    ({
      type = 'info',
      title,
      message,
      buttonText = 'Okay',
    }) => {
      setPopup({
        visible: true,
        type,
        title,
        message,
        buttonText,
      });
    },
    []
  );

  const closePopup = useCallback(() => {
    setPopup((prev) => ({
      ...prev,
      visible: false,
    }));
  }, []);

  // ----------------------------------------------
  // FETCH WALLET DATA
  // ----------------------------------------------

  // 🌟 NEW: State to hold the minimum payout threshold (Defaults to 500)
  const [minPayoutThreshold, setMinPayoutThreshold] = useState(500);

  const fetchWalletData = useCallback(async () => {
    if (!profile?.id) return;

    try {
      setLoading(true);

      // 🌟 Fetch the minimum payout setting from Supabase
      const { data: setRow } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'minimum_payout_amount')
        .maybeSingle();

      if (setRow && !isNaN(parseFloat(setRow.value))) {
        setMinPayoutThreshold(parseFloat(setRow.value));
      }

      let { data: walletData } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (walletData) {
        setWallet(walletData);

        const { data: ledgerData } = await supabase
          .from('ledger_transactions')
          .select('*')
          .eq('wallet_id', walletData.id)
          .order('created_at', { ascending: false });

        if (ledgerData) {
          setTransactions(ledgerData);
        } else {
          setTransactions([]);
        }
      } else {
        setWallet(null);
        setTransactions([]);
      }

      
    } catch (err) {
      console.error(
        'Error fetching store wallet details:',
        err
      );

      showPopup({
        type: 'error',
        title: 'Unable to Load Wallet',
        message:
          'We could not load your wallet information right now. Please try refreshing again.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id, showPopup]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  // ----------------------------------------------
  // ANALYTICS
  // ----------------------------------------------

  const {
    totalSales,
    earningCount,
    payoutCount,
  } = useMemo(() => {
    const now = new Date();

    const filteredTx = transactions.filter((t) => {
      if (!t.created_at) return false;

      const txDate = new Date(t.created_at);

      if (analyticsTab === '7days') {
        const sevenDaysAgo = new Date();

        sevenDaysAgo.setDate(
          now.getDate() - 7
        );

        return txDate >= sevenDaysAgo;
      }

      if (analyticsTab === 'month') {
        return (
          txDate.getMonth() === now.getMonth() &&
          txDate.getFullYear() === now.getFullYear()
        );
      }

      return true;
    });

    const salesSum = filteredTx
      .filter(
        (t) => t.transaction_type === 'earning'
      )
      .reduce(
        (sum, t) => sum + Number(t.amount || 0),
        0
      );

    const earnings = filteredTx.filter(
      (t) => t.transaction_type === 'earning'
    ).length;

    const payouts = filteredTx.filter(
      (t) => t.transaction_type === 'cashout_paid'
    ).length;

    return {
      totalSales: salesSum,
      earningCount: earnings,
      payoutCount: payouts,
    };
  }, [transactions, analyticsTab]);

  
// ----------------------------------------------
  // BALANCE
  // ----------------------------------------------

  const availableBalance = Number(
    wallet?.available_balance || 0
  );

  // 🌟 Enforce the new dynamic threshold
  const canRequestPayout = availableBalance >= minPayoutThreshold;

  // ----------------------------------------------
  // CASHOUT REQUEST
  // ----------------------------------------------

  const submitCashoutRequest = async () => {
    const cleanName = gcashName.trim();
    const cleanNumber = gcashNumber.trim();

    if (!cleanName || !cleanNumber) {
      showPopup({
        type: 'warning',
        title: 'Missing Information',
        message:
          'Please provide both your GCash account name and GCash number before submitting your payout request.',
      });
      return;
    }

  if (!cleanNumber.startsWith('09') || cleanNumber.length !== 11) {
      showPopup({
        type: 'warning',
        title: 'Invalid GCash Number',
        message:
          'Please enter a valid 11-digit GCash mobile number starting with 09.',
      });
      return;
    }

  if (availableBalance < minPayoutThreshold) {
      showPopup({
        type: 'warning',
        title: 'Below Minimum Payout',
        message:
          `You must have at least ₱${minPayoutThreshold.toLocaleString('en-US', { minimumFractionDigits: 2 })} in available earnings to request a payout.`,
      });
      return;
    }

    setRequestingCashout(true);

    try {
      const { error } = await supabase
        .from('financial_requests')
        .insert([
          {
            user_id: profile.id,
            request_type: 'cashout',
            amount: availableBalance,
            payment_method: 'GCash',
            account_name: cleanName,
            account_number: cleanNumber,
            status: 'pending',
          },
        ]);

      if (error) throw error;

      setShowCashoutModal(false);
      setGcashName('');
      setGcashNumber('');

      await fetchWalletData();

      showPopup({
        type: 'success',
        title: 'Payout Request Sent',
        message:
          'Your GCash payout request has been submitted and is now pending admin approval.',
      });
    } catch (error) {
      console.error(
        'Cashout request error:',
        error
      );

      showPopup({
        type: 'error',
        title: 'Request Failed',
        message:
          error?.message ||
          'We could not submit your payout request. Please try again.',
      });
    } finally {
      setRequestingCashout(false);
    }
  };

  // ----------------------------------------------
  // TRANSACTION STYLE
  // ----------------------------------------------

  const getTransactionStyle = (item) => {
    if (
      item.transaction_type === 'earning'
    ) {
      return {
        icon: 'storefront-outline',
        color: '#059669',
        bg: '#ECFDF5',
        sign: '+',
        label: 'SALE CREDITED',
      };
    }

    if (
      item.transaction_type === 'cashout_paid'
    ) {
      return {
        icon: 'cash-outline',
        color: '#0284C7',
        bg: '#E0F2FE',
        sign: '-',
        label: 'PAYOUT SENT',
      };
    }

    return {
      icon: 'receipt-outline',
      color: '#6B7280',
      bg: '#F3F4F6',
      sign: '',
      label: 'TRANSACTION',
    };
  };

  // ----------------------------------------------
  // LOADING STATE
  // ----------------------------------------------

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor="#FFFFFF"
        />

        <View style={styles.loadingScreen}>
          <View style={styles.loadingIconBox}>
            <Ionicons
              name="wallet-outline"
              size={30}
              color="#059669"
            />
          </View>

          <ActivityIndicator
            size="small"
            color="#059669"
            style={styles.loadingSpinner}
          />

          <Text style={styles.loadingTitle}>
            Loading your wallet
          </Text>

          <Text style={styles.loadingText}>
            Retrieving your latest earnings and payout information.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ----------------------------------------------
  // RENDER
  // ----------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
      />

      {/* ------------------------------------------
          HEADER
      ------------------------------------------ */}

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconBox}>
            <Ionicons
              name="wallet-outline"
              size={22}
              color="#059669"
            />
          </View>

          <View>
            <Text style={styles.headerEyebrow}>
              STORE FINANCE
            </Text>

            <Text style={styles.headerTitle}>
              Store Wallet
            </Text>
          </View>
        </View>

        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>
            LIVE
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchWalletData();
            }}
            colors={['#059669']}
            tintColor="#059669"
          />
        }
      >
        {/* ----------------------------------------
            WALLET HERO
        ---------------------------------------- */}

        <View style={styles.walletHero}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroEyebrow}>
                AVAILABLE PAYOUT
              </Text>

              <Text style={styles.heroAmount}>
                {formatCurrency(availableBalance)}
              </Text>

              <Text style={styles.heroSubtext}>
                Current earnings available for withdrawal
              </Text>
            </View>

            <View style={styles.heroWalletIcon}>
              <Ionicons
                name="wallet"
                size={30}
                color="#A7F3D0"
              />
            </View>
          </View>

          {/* --------------------------------------
              STATUS
          -------------------------------------- */}

          <View style={styles.heroDivider} />

          {isPayoutLocked ? (
            <View style={styles.lockedContainer}>
              <View style={styles.lockedIconBox}>
                <Ionicons
                  name="time-outline"
                  size={22}
                  color="#D97706"
                />
              </View>

              <View style={styles.lockedTextArea}>
                <Text style={styles.lockedTitle}>
                  Payout temporarily locked
                </Text>

                <Text style={styles.lockedText}>
                  Your next payout request becomes available on
                </Text>

                <Text style={styles.lockedDate}>
                  {nextAvailableDate}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.availableStatusContainer}>
              <View style={styles.availableIconBox}>
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color="#065F46"
                />
              </View>

              <View style={styles.availableTextArea}>
                <Text style={styles.availableTitle}>
                  Payout is available
                </Text>

                <Text style={styles.availableText}>
                  You can request your available earnings through GCash.
                </Text>
              </View>
            </View>
          )}

          {/* --------------------------------------
              PAYOUT BUTTON
          -------------------------------------- */}

          <TouchableOpacity
            style={[
              styles.heroButton,
              !canRequestPayout &&
                styles.heroButtonDisabled,
            ]}
            onPress={() =>
              setShowCashoutModal(true)
            }
            disabled={!canRequestPayout}
            activeOpacity={0.88}
          >
            <Ionicons
              name={
                isPayoutLocked
                  ? 'lock-closed-outline'
                  : 'arrow-up-circle-outline'
              }
              size={21}
              color={
                !canRequestPayout
                  ? '#9CA3AF'
                  : '#047857'
              }
            />

            <Text
              style={[
                styles.heroButtonText,
                !canRequestPayout &&
                  styles.heroButtonTextDisabled,
              ]}
            >
              {availableBalance >= minPayoutThreshold
                ? 'Request GCash Payout'
                : `Minimum Payout: ₱${minPayoutThreshold.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            </Text>
          </TouchableOpacity>

         <View style={styles.policyRow}>
            <Ionicons
              name="information-circle-outline"
              size={15}
              color="#A7F3D0"
            />

            <Text style={styles.policyText}>
              Store payouts are subject to admin approval.
            </Text>
          </View>
        </View>

        {/* ----------------------------------------
            ANALYTICS TITLE
        ---------------------------------------- */}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>
              PERFORMANCE
            </Text>

            <Text style={styles.sectionTitle}>
              Sales Overview
            </Text>
          </View>

          <View style={styles.sectionIconBox}>
            <Ionicons
              name="analytics-outline"
              size={21}
              color="#059669"
            />
          </View>
        </View>

        {/* ----------------------------------------
            FILTER TABS
        ---------------------------------------- */}

        <View style={styles.analyticsTabBar}>
          {[
            { key: '7days', label: 'Last 7 Days' },
            { key: 'month', label: 'This Month' },
            { key: 'overall', label: 'Overall' },
          ].map((tab) => {
            const isActive =
              analyticsTab === tab.key;

            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.analyticsTabBtn,
                  isActive &&
                    styles.analyticsTabActive,
                ]}
                onPress={() =>
                  setAnalyticsTab(tab.key)
                }
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.analyticsTabTxt,
                    isActive &&
                      styles.analyticsTabTxtActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ----------------------------------------
            ANALYTICS MAIN CARD
        ---------------------------------------- */}

        <View style={styles.analyticsCard}>
          <View style={styles.analyticsMainRow}>
            <View style={styles.analyticsIconBox}>
              <Ionicons
                name="trending-up-outline"
                size={23}
                color="#059669"
              />
            </View>

            <View style={styles.analyticsMainText}>
              <Text style={styles.analyticsLabel}>
                NET SALES REVENUE
              </Text>

              <Text style={styles.analyticsAmount}>
                {formatCurrency(totalSales)}
              </Text>

              <Text style={styles.analyticsPeriod}>
                {analyticsTab === '7days'
                  ? 'Sales from the last 7 days'
                  : analyticsTab === 'month'
                  ? 'Sales recorded this month'
                  : 'All recorded sales'}
              </Text>
            </View>
          </View>

          <View style={styles.analyticsStatsRow}>
            <View style={styles.analyticsStat}>
              <Text style={styles.analyticsStatValue}>
                {earningCount}
              </Text>

              <Text style={styles.analyticsStatLabel}>
                Sales
              </Text>
            </View>

            <View style={styles.analyticsStatDivider} />

            <View style={styles.analyticsStat}>
              <Text style={styles.analyticsStatValue}>
                {payoutCount}
              </Text>

              <Text style={styles.analyticsStatLabel}>
                Payouts
              </Text>
            </View>

            <View style={styles.analyticsStatDivider} />

            <View style={styles.analyticsStat}>
              <Text style={styles.analyticsStatValue}>
                {transactions.length}
              </Text>

              <Text style={styles.analyticsStatLabel}>
                Transactions
              </Text>
            </View>
          </View>
        </View>

        {/* ----------------------------------------
            TRANSACTION HISTORY
        ---------------------------------------- */}

        <View style={styles.transactionSectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>
              LEDGER
            </Text>

            <Text style={styles.transactionSectionTitle}>
              Sales & Payout History
            </Text>
          </View>

          <View style={styles.transactionCountBadge}>
            <Text style={styles.transactionCountText}>
              {transactions.length}
            </Text>
          </View>
        </View>

        <View style={styles.ledgerSection}>
          {transactions.length === 0 ? (
            <View style={styles.emptyLedger}>
              <View style={styles.emptyIconBox}>
                <Ionicons
                  name="receipt-outline"
                  size={30}
                  color="#9CA3AF"
                />
              </View>

              <Text style={styles.emptyTitle}>
                No transactions yet
              </Text>

              <Text style={styles.emptyText}>
                Your sales and payout activity will appear here once transactions are recorded.
              </Text>
            </View>
          ) : (
            transactions.map((item, index) => {
              const ui = getTransactionStyle(item);

              const isLast =
                index === transactions.length - 1;

              return (
                <View
                  key={item.id || index}
                  style={[
                    styles.transactionRow,
                    !isLast &&
                      styles.transactionRowBorder,
                  ]}
                >
                  <View
                    style={[
                      styles.txIconBox,
                      {
                        backgroundColor:
                          ui.bg,
                      },
                    ]}
                  >
                    <Ionicons
                      name={ui.icon}
                      size={21}
                      color={ui.color}
                    />
                  </View>

                  <View style={styles.txDetails}>
                    <Text
                      style={styles.txReference}
                      numberOfLines={2}
                    >
                      {formatTransactionReference(
                        item.payment_reference
                      )}
                    </Text>

                    <View style={styles.txMetaRow}>
                      <Text
                        style={[
                          styles.txType,
                          {
                            color: ui.color,
                          },
                        ]}
                      >
                        {ui.label}
                      </Text>

                      <View
                        style={styles.txMetaDot}
                      />

                      <Text
                        style={styles.txDate}
                      >
                        {formatTransactionDate(
                          item.created_at
                        )}
                      </Text>
                    </View>

                    <Text
                      style={styles.txTime}
                    >
                      {formatTransactionTime(
                        item.created_at
                      )}
                    </Text>
                  </View>

                  <View style={styles.txAmountArea}>
                    <Text
                      style={[
                        styles.txAmount,
                        {
                          color: ui.color,
                        },
                      ]}
                    >
                      {ui.sign}
                      {formatCurrency(
                        item.amount
                      )}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ----------------------------------------
            FOOTER INFO
        ---------------------------------------- */}

        <View style={styles.securityNotice}>
          <View style={styles.securityIconBox}>
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color="#059669"
            />
          </View>

          <View style={styles.securityTextArea}>
            <Text style={styles.securityTitle}>
              Secure wallet records
            </Text>

            <Text style={styles.securityText}>
              Your transaction history and payout requests are recorded securely for store financial tracking.
            </Text>
          </View>
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>

      {/* ==========================================
          CASHOUT MODAL
      ========================================== */}

      <Modal
        visible={showCashoutModal}
        animationType="slide"
        transparent
        onRequestClose={() =>
          !requestingCashout &&
          setShowCashoutModal(false)
        }
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : undefined
          }
        >
          <View style={styles.modalSheet}>
            {/* Handle */}
            <View style={styles.sheetHandle} />

            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalIconBox}>
                  <Ionicons
                    name="cash-outline"
                    size={24}
                    color="#059669"
                  />
                </View>

                <View>
                  <Text style={styles.modalEyebrow}>
                    PAYOUT REQUEST
                  </Text>

                  <Text style={styles.modalTitle}>
                    Store Payout
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() =>
                  !requestingCashout &&
                  setShowCashoutModal(false)
                }
                disabled={requestingCashout}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color="#4B5563"
                />
              </TouchableOpacity>
            </View>

            {/* Amount Summary */}
            <View style={styles.payoutSummaryCard}>
              <View style={styles.payoutSummaryIcon}>
                <Ionicons
                  name="wallet-outline"
                  size={21}
                  color="#059669"
                />
              </View>

              <View
                style={styles.payoutSummaryText}
              >
                <Text
                  style={styles.payoutSummaryLabel}
                >
                  REQUESTING AMOUNT
                </Text>

                <Text
                  style={styles.payoutSummaryAmount}
                >
                  {formatCurrency(
                    availableBalance
                  )}
                </Text>
              </View>

              <View
                style={styles.weeklyBadge}
              >
                <Ionicons
                  name="calendar-outline"
                  size={13}
                  color="#047857"
                />

                <Text
                  style={styles.weeklyBadgeText}
                >
                  Weekly
                </Text>
              </View>
            </View>

            <Text style={styles.modalDescription}>
              Enter the GCash account where you want your store payout to be sent. Make sure the information is correct before submitting.
            </Text>

            {/* GCash Name */}
            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>
                GCash Account Name
              </Text>

              <View style={styles.inputWrapper}>
                <Ionicons
                  name="person-outline"
                  size={19}
                  color="#6B7280"
                />

                <TextInput
                  style={styles.modalInput}
                  placeholder="Enter account name"
                  placeholderTextColor="#9CA3AF"
                  value={gcashName}
                  onChangeText={setGcashName}
                  autoCapitalize="words"
                  editable={!requestingCashout}
                />
              </View>
            </View>

            {/* GCash Number */}
            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>
                GCash Mobile Number
              </Text>

              <View style={styles.inputWrapper}>
                <Ionicons
                  name="phone-portrait-outline"
                  size={19}
                  color="#6B7280"
                />

                <TextInput
                  style={styles.modalInput}
                  placeholder="09XXXXXXXXX"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  value={gcashNumber}
                  onChangeText={setGcashNumber}
                  maxLength={11}
                  editable={!requestingCashout}
                />
              </View>
            </View>

            {/* Important Notice */}
           <View style={styles.modalNotice}>
              <Ionicons
                name="information-circle-outline"
                size={19}
                color="#2563EB"
              />

              <Text style={styles.modalNoticeText}>
                Payout requests are subject to admin approval. Please ensure your GCash details are correct.
              </Text>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[
                styles.modalSubmitBtn,
                requestingCashout &&
                  styles.modalSubmitBtnLoading,
              ]}
              onPress={submitCashoutRequest}
              disabled={requestingCashout}
              activeOpacity={0.85}
            >
              {requestingCashout ? (
                <>
                  <ActivityIndicator
                    color="#FFFFFF"
                    size="small"
                  />

                  <Text
                    style={
                      styles.modalSubmitTxt
                    }
                  >
                    Submitting Request...
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name="send-outline"
                    size={19}
                    color="#FFFFFF"
                  />

                  <Text
                    style={
                      styles.modalSubmitTxt
                    }
                  >
                    Confirm Payout Request
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() =>
                !requestingCashout &&
                setShowCashoutModal(false)
              }
              disabled={requestingCashout}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ==========================================
          GLOBAL POPUP
      ========================================== */}

      <ModernPopup
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        buttonText={popup.buttonText}
        onClose={closePopup}
      />
    </SafeAreaView>
  );
}

// ==================================================
// STYLES
// ==================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F6',
  },

  // ------------------------------------------------
  // LOADING
  // ------------------------------------------------

  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    backgroundColor: '#F5F7F6',
  },

  loadingIconBox: {
    width: 66,
    height: 66,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  loadingSpinner: {
    marginBottom: 14,
  },

  loadingTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },

  loadingText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 5,
  },

  // ------------------------------------------------
  // HEADER
  // ------------------------------------------------

  header: {
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  headerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  headerEyebrow: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#059669',
    marginBottom: 2,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.3,
  },

  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },

  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },

  liveText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 0.8,
  },

  // ------------------------------------------------
  // CONTENT
  // ------------------------------------------------

  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 30,
  },

  // ------------------------------------------------
  // WALLET HERO
  // ------------------------------------------------

  walletHero: {
    backgroundColor: '#047857',
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#047857',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 7,
  },

  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  heroEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: '#A7F3D0',
    marginBottom: 5,
  },

  heroAmount: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1.2,
  },

  heroSubtext: {
    fontSize: 11.5,
    lineHeight: 17,
    color: '#D1FAE5',
    marginTop: 3,
    maxWidth: 250,
  },

  heroWalletIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: 18,
  },

  availableStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    borderRadius: 15,
    padding: 12,
  },

  availableIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#A7F3D0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },

  availableTextArea: {
    flex: 1,
  },

  availableTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#065F46',
  },

  availableText: {
    fontSize: 10.5,
    lineHeight: 15,
    color: '#047857',
    marginTop: 2,
  },

  lockedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 15,
    padding: 12,
  },

  lockedIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FED7AA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },

  lockedTextArea: {
    flex: 1,
  },

  lockedTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#9A3412',
  },

  lockedText: {
    fontSize: 10.5,
    color: '#C2410C',
    lineHeight: 15,
    marginTop: 2,
  },

  lockedDate: {
    fontSize: 11,
    fontWeight: '900',
    color: '#9A3412',
    marginTop: 3,
  },

  heroButton: {
    minHeight: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  heroButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },

  heroButtonText: {
    color: '#047857',
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 8,
  },

  heroButtonTextDisabled: {
    color: '#9CA3AF',
  },

  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  policyText: {
    fontSize: 10,
    color: '#A7F3D0',
    marginLeft: 5,
    fontWeight: '600',
  },

  // ------------------------------------------------
  // SECTION HEADER
  // ------------------------------------------------

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },

  sectionEyebrow: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#059669',
    marginBottom: 2,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.2,
  },

  sectionIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ------------------------------------------------
  // ANALYTICS TABS
  // ------------------------------------------------

  analyticsTabBar: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 13,
    padding: 4,
    marginBottom: 12,
  },

  analyticsTabBtn: {
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 8,
  },

  analyticsTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 2,
  },

  analyticsTabTxt: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#6B7280',
  },

  analyticsTabTxtActive: {
    color: '#059669',
    fontWeight: '900',
  },

  // ------------------------------------------------
  // ANALYTICS CARD
  // ------------------------------------------------

  analyticsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 25,
  },

  analyticsMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 17,
  },

  analyticsIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13,
  },

  analyticsMainText: {
    flex: 1,
  },

  analyticsLabel: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: '#6B7280',
    marginBottom: 2,
  },

  analyticsAmount: {
    fontSize: 25,
    fontWeight: '900',
    color: '#111827',
  },

  analyticsPeriod: {
    fontSize: 10.5,
    color: '#9CA3AF',
    marginTop: 1,
  },

  analyticsStatsRow: {
    minHeight: 72,
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },

  analyticsStat: {
    flex: 1,
    alignItems: 'center',
  },

  analyticsStatValue: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
  },

  analyticsStatLabel: {
    fontSize: 9.5,
    color: '#6B7280',
    fontWeight: '700',
    marginTop: 2,
  },

  analyticsStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E5E7EB',
  },

  // ------------------------------------------------
  // TRANSACTION HEADER
  // ------------------------------------------------

  transactionSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },

  transactionSectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },

  transactionCountBadge: {
    minWidth: 32,
    height: 29,
    borderRadius: 10,
    paddingHorizontal: 8,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },

  transactionCountText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#047857',
  },

  // ------------------------------------------------
  // LEDGER
  // ------------------------------------------------

  ledgerSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },

  emptyLedger: {
    paddingHorizontal: 24,
    paddingVertical: 38,
    alignItems: 'center',
  },

  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#374151',
    marginBottom: 5,
  },

  emptyText: {
    fontSize: 11.5,
    lineHeight: 18,
    color: '#9CA3AF',
    textAlign: 'center',
    maxWidth: 285,
  },

  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 15,
  },

  transactionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },

  txIconBox: {
    width: 46,
    height: 46,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },

  txDetails: {
    flex: 1,
    paddingRight: 8,
  },

  txReference: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#111827',
  },

  txMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },

  txType: {
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  txMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginHorizontal: 6,
  },

  txDate: {
    fontSize: 9.5,
    color: '#6B7280',
    fontWeight: '600',
  },

  txTime: {
    fontSize: 9.5,
    color: '#9CA3AF',
    marginTop: 2,
  },

  txAmountArea: {
    alignItems: 'flex-end',
  },

  txAmount: {
    fontSize: 14,
    fontWeight: '900',
  },

  // ------------------------------------------------
  // SECURITY NOTICE
  // ------------------------------------------------

  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 17,
    padding: 13,
    marginTop: 14,
  },

  securityIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  securityTextArea: {
    flex: 1,
  },

  securityTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#111827',
  },

  securityText: {
    fontSize: 10,
    lineHeight: 15,
    color: '#6B7280',
    marginTop: 2,
  },

  bottomSpace: {
    height: 10,
  },

  // ------------------------------------------------
  // CASHOUT MODAL
  // ------------------------------------------------

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.58)',
    justifyContent: 'flex-end',
  },

  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
  },

  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 16,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  modalIconBox: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },

  modalEyebrow: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.9,
    marginBottom: 2,
  },

  modalTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#111827',
  },

  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },

  payoutSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 17,
    padding: 13,
    marginBottom: 15,
  },

  payoutSummaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },

  payoutSummaryText: {
    flex: 1,
  },

  payoutSummaryLabel: {
    fontSize: 8.5,
    letterSpacing: 0.7,
    fontWeight: '900',
    color: '#047857',
  },

  payoutSummaryAmount: {
    fontSize: 21,
    fontWeight: '900',
    color: '#065F46',
    marginTop: 1,
  },

  weeklyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

  weeklyBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#047857',
    marginLeft: 4,
  },

  modalDescription: {
    fontSize: 11.5,
    lineHeight: 18,
    color: '#6B7280',
    marginBottom: 17,
  },

  formGroup: {
    marginBottom: 14,
  },

  inputLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#374151',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 7,
  },

  inputWrapper: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 13,
  },

  modalInput: {
    flex: 1,
    minHeight: 50,
    fontSize: 14,
    color: '#111827',
    marginLeft: 9,
    paddingVertical: 0,
  },

  modalNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 13,
    padding: 11,
    marginTop: 1,
    marginBottom: 15,
  },

  modalNoticeText: {
    flex: 1,
    fontSize: 10.5,
    lineHeight: 16,
    color: '#1D4ED8',
    marginLeft: 8,
  },

  modalSubmitBtn: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  modalSubmitBtnLoading: {
    opacity: 0.8,
  },

  modalSubmitTxt: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 8,
  },

  cancelButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },

  cancelButtonText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '800',
  },

  // ------------------------------------------------
  // GLOBAL POPUP
  // ------------------------------------------------

  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  popupCard: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },

  popupIconBox: {
    width: 68,
    height: 68,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },

  popupLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#9CA3AF',
    marginBottom: 4,
  },

  popupTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },

  popupMessage: {
    fontSize: 13,
    lineHeight: 20,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },

  popupButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },

  popupButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});