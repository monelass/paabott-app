import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';

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
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { createPaymentLink } from '../../services/paymongoService';

/* =========================================================
   CUSTOM FEEDBACK MODAL
========================================================= */

function FeedbackModal({
  visible,
  type = 'info',
  title,
  message,
  primaryText = 'OK',
  secondaryText,
  onPrimary,
  onSecondary,
  onRequestClose,
}) {
  const config = {
    success: {
      icon: 'checkmark-circle',
      iconColor: '#059669',
      iconBackground: '#E9F9F1',
      accent: '#059669',
    },

    error: {
      icon: 'close-circle',
      iconColor: '#DC2626',
      iconBackground: '#FEF2F2',
      accent: '#DC2626',
    },

    warning: {
      icon: 'warning',
      iconColor: '#D97706',
      iconBackground: '#FFF7E8',
      accent: '#D97706',
    },

    info: {
      icon: 'information-circle',
      iconColor: '#0284C7',
      iconBackground: '#EFF8FF',
      accent: '#0284C7',
    },

    confirm: {
      icon: 'card',
      iconColor: '#059669',
      iconBackground: '#E9F9F1',
      accent: '#059669',
    },

    loading: {
      icon: 'ellipsis-horizontal',
      iconColor: '#059669',
      iconBackground: '#E9F9F1',
      accent: '#059669',
    },
  };

  const current = config[type] || config.info;

  const isLoading = type === 'loading';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!isLoading) {
          if (onSecondary) {
            onSecondary();
          } else if (onRequestClose) {
            onRequestClose();
          }
        }
      }}
    >
      <View style={styles.feedbackOverlay}>
        <View style={styles.feedbackCard}>

          <View
            style={[
              styles.feedbackIconOuter,
              {
                backgroundColor:
                  current.iconBackground,
              },
            ]}
          >
            {isLoading ? (
              <ActivityIndicator
                size="small"
                color={current.iconColor}
              />
            ) : (
              <Ionicons
                name={current.icon}
                size={30}
                color={current.iconColor}
              />
            )}
          </View>

          <Text style={styles.feedbackTitle}>
            {title}
          </Text>

          <Text style={styles.feedbackMessage}>
            {message}
          </Text>

          {!isLoading && (
            <View style={styles.feedbackActions}>

              {secondaryText && (
                <TouchableOpacity
                  style={styles.feedbackSecondaryBtn}
                  onPress={() => {
                    if (onSecondary) {
                      onSecondary();
                    } else if (onRequestClose) {
                      onRequestClose();
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.feedbackSecondaryText}>
                    {secondaryText}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.feedbackPrimaryBtn,
                  {
                    backgroundColor:
                      current.accent,
                  },
                  !secondaryText &&
                    styles.feedbackPrimaryBtnFull,
                ]}
                onPress={() => {
                  if (onPrimary) {
                    onPrimary();
                  } else if (onRequestClose) {
                    onRequestClose();
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.feedbackPrimaryText}>
                  {primaryText}
                </Text>

                {type === 'confirm' && (
                  <Ionicons
                    name="arrow-forward"
                    size={17}
                    color="#FFFFFF"
                  />
                )}
              </TouchableOpacity>

            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

/* =========================================================
   SCREEN
========================================================= */

export default function RiderWalletScreen({
  navigation,
}) {
  const { profile } = useAuth();

  const [wallet, setWallet] =
    useState(null);

  const [transactions, setTransactions] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [analyticsTab, setAnalyticsTab] =
    useState('overall');

  const [remittanceLimit, setRemittanceLimit] =
    useState(1000);

  // 🌟 NEW: State to hold the rider's minimum payout threshold
  const [minPayoutThreshold, setMinPayoutThreshold] = 
    useState(150);

  const [showCashoutModal, setShowCashoutModal] =
    useState(false);

  const [gcashName, setGcashName] =
    useState('');

  const [gcashNumber, setGcashNumber] =
    useState('');

  const [requestingCashout, setRequestingCashout] =
    useState(false);

  /* =========================================================
     CUSTOM ALERT STATE
  ========================================================= */

  const [feedback, setFeedback] =
    useState({
      visible: false,
      type: 'info',
      title: '',
      message: '',
      primaryText: 'OK',
      secondaryText: null,
      onPrimary: null,
      onSecondary: null,
    });

  const showFeedback = useCallback(
    ({
      type = 'info',
      title,
      message,
      primaryText = 'OK',
      secondaryText = null,
      onPrimary = null,
      onSecondary = null,
    }) => {
      setFeedback({
        visible: true,
        type,
        title,
        message,
        primaryText,
        secondaryText,
        onPrimary,
        onSecondary,
      });
    },
    []
  );

  const closeFeedback = useCallback(() => {
    setFeedback({
      visible: false,
      type: 'info',
      title: '',
      message: '',
      primaryText: 'OK',
      secondaryText: null,
      onPrimary: null,
      onSecondary: null,
    });
  }, []);

  const handleFeedbackPrimary = useCallback(() => {
    const action = feedback.onPrimary;

    closeFeedback();

    if (action) {
      setTimeout(() => {
        action();
      }, 50);
    }
  }, [
    feedback.onPrimary,
    closeFeedback,
  ]);

  const handleFeedbackSecondary = useCallback(() => {
    const action = feedback.onSecondary;

    closeFeedback();

    if (action) {
      setTimeout(() => {
        action();
      }, 50);
    }
  }, [
    feedback.onSecondary,
    closeFeedback,
  ]);

  /* =========================================================
     FETCH WALLET
  ========================================================= */

  const fetchWalletData = useCallback(
    async () => {
      if (!profile?.id) return;

      try {
        setLoading(true);

        const { data: settingsData } =
          await supabase
            .from('settings')
            .select('key, value')
            .in('key', ['remittance_limit', 'driver_minimum_payout_amount']);

        if (settingsData && settingsData.length > 0) {
          settingsData.forEach((setting) => {
            if (setting.key === 'remittance_limit' && setting.value) {
              setRemittanceLimit(Number(setting.value));
            }
            // 🌟 NEW: Fetch and set the driver minimum payout
            if (setting.key === 'driver_minimum_payout_amount' && setting.value) {
              setMinPayoutThreshold(Number(setting.value));
            }
          });
        }

        const { data: walletData } =
          await supabase
            .from('wallets')
            .select('*')
            .eq('user_id', profile.id)
            .maybeSingle();

        if (walletData) {
          setWallet(walletData);

          const { data: ledgerData } =
            await supabase
              .from('ledger_transactions')
              .select('*')
              .eq(
                'wallet_id',
                walletData.id
              )
              .order(
                'created_at',
                {
                  ascending: false,
                }
              );

          if (ledgerData) {
            setTransactions(
              ledgerData
            );
          }
        }
      } catch (err) {
        console.error(
          'Error fetching rider wallet details:',
          err
        );

        showFeedback({
          type: 'error',
          title: 'Wallet Update Failed',
          message:
            'We could not refresh your wallet information. Please try again.',
          primaryText: 'Try Again',
          onPrimary: fetchWalletData,
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      profile?.id,
      showFeedback,
    ]
  );

  /* =========================================================
     PROCESS REMITTANCE
  ========================================================= */

  const processSuccessfulRemittance =
    async (userId) => {
      try {
        const {
          data: currentWallet,
        } = await supabase
          .from('wallets')
          .select(
            'id, cash_on_hand'
          )
          .eq(
            'user_id',
            userId
          )
          .single();

        if (
          currentWallet &&
          currentWallet.cash_on_hand > 0
        ) {
          const amountPaid =
            currentWallet.cash_on_hand;

          await supabase
            .from('wallets')
            .update({
              cash_on_hand: 0,
            })
            .eq(
              'id',
              currentWallet.id
            );

          await supabase
            .from('ledger_transactions')
            .insert({
              wallet_id:
                currentWallet.id,
              user_id: userId,
              amount: amountPaid,
              transaction_type:
                'remittance_paid',
              payment_reference:
                'PayMongo Remittance',
              status: 'completed',
            });

          return true;
        }

        return false;
      } catch (error) {
        console.error(
          'Failed to process remittance deep link:',
          error
        );

        return false;
      }
    };

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  /* =========================================================
     DEEP LINK PAYMENT CALLBACK
  ========================================================= */

  useEffect(() => {
    const handleDeepLink =
      async (event) => {
        if (
          event?.url?.includes(
            'wallet'
          ) ||
          event?.url?.includes(
            'remit-success'
          )
        ) {
          if (profile?.id) {
            await processSuccessfulRemittance(
              profile.id
            );
          }

          showFeedback({
            type: 'success',
            title: 'Remittance Successful',
            message:
              'Your remittance payment was processed successfully. Your wallet and cash collection are now updated.',
            primaryText: 'Done',
          });

          fetchWalletData();
        }
      };

    const subscription =
      Linking.addEventListener(
        'url',
        handleDeepLink
      );

    Linking.getInitialURL()
      .then(async (url) => {
        if (
          url?.includes(
            'wallet'
          ) ||
          url?.includes(
            'remit-success'
          )
        ) {
          if (profile?.id) {
            await processSuccessfulRemittance(
              profile.id
            );
          }

          showFeedback({
            type: 'success',
            title: 'Remittance Successful',
            message:
              'Your remittance payment was processed successfully. Your wallet and cash collection are now updated.',
            primaryText: 'Done',
          });

          fetchWalletData();
        }
      })
      .catch((err) =>
        console.error(
          'Failed to get initial URL:',
          err
        )
      );

    return () => {
      subscription.remove();
    };
  }, [
    fetchWalletData,
    profile?.id,
    showFeedback,
  ]);

  /* =========================================================
     ANALYTICS
  ========================================================= */

  const {
    codEarnings,
    onlineEarnings,
  } = useMemo(() => {
    const now = new Date();

    const filteredTx =
      transactions.filter((t) => {
        if (!t.created_at)
          return false;

        const txDate =
          new Date(t.created_at);

        if (
          analyticsTab ===
          '7days'
        ) {
          const sevenDaysAgo =
            new Date();

          sevenDaysAgo.setDate(
            now.getDate() - 7
          );

          return (
            txDate >= sevenDaysAgo
          );
        }

        if (
          analyticsTab ===
          'month'
        ) {
          return (
            txDate.getMonth() ===
              now.getMonth() &&
            txDate.getFullYear() ===
              now.getFullYear()
          );
        }

        return true;
      });

    const codSum =
      filteredTx
        .filter(
          (t) =>
            t.transaction_type ===
              'earning' &&
            (
              t.payment_reference ||
              ''
            )
              .toLowerCase()
              .includes('cod')
        )
        .reduce(
          (sum, t) =>
            sum +
            Number(
              t.amount || 0
            ),
          0
        );

    const onlineSum =
      filteredTx
        .filter(
          (t) =>
            t.transaction_type ===
              'earning' &&
            (
              t.payment_reference ||
              ''
            )
              .toLowerCase()
              .includes(
                'online'
              )
        )
        .reduce(
          (sum, t) =>
            sum +
            Number(
              t.amount || 0
            ),
          0
        );

    return {
      codEarnings: codSum,
      onlineEarnings:
        onlineSum,
    };
  }, [
    transactions,
    analyticsTab,
  ]);

  /* =========================================================
     LOADING SCREEN
  ========================================================= */

  if (
    loading &&
    !refreshing
  ) {
    return (
      <View
        style={
          styles.loadingScreen
        }
      >
        <View
          style={
            styles.loadingIcon
          }
        >
          <Ionicons
            name="wallet-outline"
            size={28}
            color="#059669"
          />
        </View>

        <ActivityIndicator
          size="small"
          color="#059669"
        />

        <Text
          style={
            styles.loadingTitle
          }
        >
          Loading your wallet
        </Text>

        <Text
          style={
            styles.loadingSubtitle
          }
        >
          Getting your latest balance
          and transactions
        </Text>
      </View>
    );
  }

  const availableBalance =
    wallet?.available_balance || 0;

  const cashInHand =
    wallet?.cash_on_hand || 0;

  const isLimitReached =
    cashInHand >=
    remittanceLimit;

  // 🌟 NEW: Enforce the dynamic threshold
  const canRequestPayout = availableBalance >= minPayoutThreshold;

  /* =========================================================
     CASHOUT REQUEST
  ========================================================= */

  const submitCashoutRequest =
    async () => {
      if (availableBalance < minPayoutThreshold) {
        showFeedback({
          type: 'warning',
          title: 'Below Minimum Payout',
          message: `You must have at least ₱${minPayoutThreshold.toFixed(2)} in available earnings to request a payout.`,
          primaryText: 'Got It',
        });
        return;
      }
      if (
        !gcashName.trim() ||
        !gcashNumber.trim()
      ) {
        showFeedback({
          type: 'warning',
          title: 'Details Required',
          message:
            'Please enter both the GCash account name and GCash number before submitting your cashout request.',
          primaryText: 'Got It',
        });

        return;
      }

      setRequestingCashout(
        true
      );

      try {
        const {
          error,
        } = await supabase
          .from(
            'financial_requests'
          )
          .insert([
            {
              user_id:
                profile.id,
              request_type:
                'cashout',
              amount:
                availableBalance,
              payment_method:
                'GCash',
              account_name:
                gcashName.trim(),
              account_number:
                gcashNumber.trim(),
              status:
                'pending',
            },
          ]);

        if (error)
          throw error;

        setShowCashoutModal(
          false
        );

        setGcashName('');
        setGcashNumber('');

        showFeedback({
          type: 'success',
          title: 'Request Sent',
          message:
            'Your GCash cashout request has been submitted successfully and is now pending administrator approval.',
          primaryText: 'Done',
        });
      } catch (error) {
        showFeedback({
          type: 'error',
          title: 'Cashout Failed',
          message:
            'We could not submit your cashout request.\n\n' +
            (error?.message ||
              'Please try again later.'),
          primaryText: 'Close',
        });
      } finally {
        setRequestingCashout(
          false
        );
      }
    };

  /* =========================================================
     REMITTANCE PAYMENT
  ========================================================= */

  const confirmRemittancePayment =
    async () => {
      try {
        const dynamicReturnUrl =
          Linking.createURL(
            'remit-success'
          );

        const payMongoAmount =
          Number(
            cashInHand
          );

        const checkoutUrl =
          await createPaymentLink(
            payMongoAmount,
            `Rider Cash Remittance (User: ${profile?.id})`,
            dynamicReturnUrl,
            profile?.email,
            profile?.full_name
          );

        if (checkoutUrl) {
          await Linking.openURL(
            checkoutUrl
          );
        }
      } catch (error) {
        showFeedback({
          type: 'error',
          title: 'Remittance Error',
          message:
            error?.message ||
            'We were unable to create the PayMongo payment link. Please try again.',
          primaryText: 'Close',
        });
      }
    };

  const handleRemit = () => {
    if (
      cashInHand <= 0
    ) {
      showFeedback({
        type: 'info',
        title: 'Nothing to Remit',
        message:
          'You currently have no COD cash collection that needs to be remitted.',
        primaryText: 'Okay',
      });

      return;
    }

    showFeedback({
      type: 'confirm',
      title: 'Remit Cash Collection?',
      message:
        `You currently hold ₱${Number(
          cashInHand
        ).toFixed(
          2
        )} in physical COD cash.\n\n` +
        'Continue to PayMongo to settle this amount securely?',
      primaryText: 'Pay Online',
      secondaryText: 'Cancel',
      onPrimary: confirmRemittancePayment,
      onSecondary: closeFeedback,
    });
  };

  /* =========================================================
     TRANSACTION STYLE
  ========================================================= */

  const getTransactionStyle =
    (item) => {
      const ref = (
        item.payment_reference ||
        ''
      ).toLowerCase();

      if (
        item.transaction_type ===
        'earning'
      ) {
        if (
          ref.includes('cod')
        ) {
          return {
            icon: 'cash-outline',
            color: '#059669',
            bg: '#ECFDF5',
            sign: '+',
          };
        }

        return {
          icon: 'card-outline',
          color: '#059669',
          bg: '#ECFDF5',
          sign: '+',
        };
      }

      if (
        item.transaction_type ===
        'remittance_due'
      ) {
        if (
          ref.includes(
            'store'
          )
        ) {
          return {
            icon:
              'storefront-outline',
            color: '#DC2626',
            bg: '#FEF2F2',
            sign: '-',
          };
        }

        if (
          ref.includes('app')
        ) {
          return {
            icon:
              'phone-portrait-outline',
            color: '#DC2626',
            bg: '#FEF2F2',
            sign: '-',
          };
        }

        return {
          icon:
            'arrow-down-outline',
          color: '#DC2626',
          bg: '#FEF2F2',
          sign: '-',
        };
      }

      if (
        item.transaction_type ===
        'remittance_paid'
      ) {
        return {
          icon:
            'checkmark-done-circle-outline',
          color: '#0284C7',
          bg: '#E0F2FE',
          sign: '',
        };
      }

      return {
        icon:
          'receipt-outline',
        color: '#6B7280',
        bg: '#F3F4F6',
        sign: '',
      };
    };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <SafeAreaView
      style={styles.container}
    >

      {/* HEADER */}

      <View
        style={styles.header}
      >
        <View
          style={
            styles.headerLeft
          }
        >
          <View
            style={
              styles.headerIcon
            }
          >
            <Ionicons
              name="wallet-outline"
              size={21}
              color="#059669"
            />
          </View>

          <View>
            <Text
              style={
                styles.headerEyebrow
              }
            >
              RIDER FINANCES
            </Text>

            <Text
              style={
                styles.headerTitle
              }
            >
              My Wallet
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={
            styles.headerRefresh
          }
          onPress={() => {
            setRefreshing(true);
            fetchWalletData();
          }}
          activeOpacity={0.7}
        >
          <Ionicons
            name="refresh-outline"
            size={19}
            color="#374151"
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={() => {
              setRefreshing(true);
              fetchWalletData();
            }}
            colors={[
              '#059669',
            ]}
            tintColor="#059669"
          />
        }
      >

        {/* WALLET OVERVIEW */}

        <View
          style={
            styles.overviewCard
          }
        >
          <View
            style={
              styles.overviewTop
            }
          >
            <View>
              <Text
                style={
                  styles.overviewEyebrow
                }
              >
                AVAILABLE EARNINGS
              </Text>

              <Text
                style={
                  styles.overviewAmount
                }
              >
                ₱
                {Number(
                  availableBalance
                ).toFixed(2)}
              </Text>
            </View>

            <View
              style={
                styles.overviewWalletIcon
              }
            >
              <Ionicons
                name="cash-outline"
                size={22}
                color="#FFFFFF"
              />
            </View>
          </View>

          <View
            style={
              styles.overviewDivider
            }
          />

          <View
            style={
              styles.overviewBottom
            }
          >
            <View
              style={
                styles.overviewInfo
              }
            >
              <View
                style={
                  styles.overviewStatusDot
                }
              />

              <Text
                style={
                  styles.overviewInfoText
                }
              >
                Earnings from online
                payments
              </Text>
            </View>

            <Text
              style={
                styles.overviewReadyText
              }
            >
              Available
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.primaryCashoutBtn,
              !canRequestPayout &&
                styles.disabledPrimaryBtn,
            ]}
            onPress={() =>
              setShowCashoutModal(
                true
              )
            }
            disabled={!canRequestPayout}
            activeOpacity={0.85}
          >
            <Ionicons
              name="arrow-up-circle-outline"
              size={19}
              color={canRequestPayout ? "#059669" : "#9CA3AF"}
            />

            <Text
              style={[
                styles.primaryCashoutText,
                !canRequestPayout && { color: '#9CA3AF' }
              ]}
            >
              {canRequestPayout 
                ? 'Cash Out via GCash' 
                : `Minimum Payout: ₱${minPayoutThreshold.toFixed(2)}`}
            </Text>

            <Ionicons
              name="chevron-forward"
              size={17}
              color={canRequestPayout ? "#059669" : "#9CA3AF"}
            />
          </TouchableOpacity>
        </View>

        {/* CASH REMITTANCE */}

        <View
          style={[
            styles.remittanceCard,
            isLimitReached &&
              styles.remittanceCardWarning,
          ]}
        >
          <View
            style={
              styles.remittanceHeader
            }
          >
            <View
              style={
                styles.remittanceTitleArea
              }
            >
              <View
                style={[
                  styles.remittanceIcon,
                  isLimitReached &&
                    styles.remittanceIconWarning,
                ]}
              >
                <Ionicons
                  name="cash-outline"
                  size={20}
                  color={
                    isLimitReached
                      ? '#DC2626'
                      : '#B45309'
                  }
                />
              </View>

              <View
                style={
                  styles.remittanceHeading
                }
              >
                <Text
                  style={
                    styles.remittanceEyebrow
                  }
                >
                  COD COLLECTION
                </Text>

                <Text
                  style={
                    styles.remittanceTitle
                  }
                >
                  Cash to Remit
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.limitBadge,
                isLimitReached &&
                  styles.limitBadgeWarning,
              ]}
            >
              <Text
                style={[
                  styles.limitText,
                  isLimitReached &&
                    styles.limitTextWarning,
                ]}
              >
                Limit ₱
                {Number(
                  remittanceLimit
                ).toFixed(0)}
              </Text>
            </View>
          </View>

          <Text
            style={[
              styles.remittanceAmount,
              isLimitReached &&
                styles.remittanceAmountWarning,
              cashInHand <= 0 &&
                styles.remittanceAmountEmpty,
            ]}
          >
            ₱
            {Number(
              cashInHand
            ).toFixed(2)}
          </Text>

          <View
            style={
              styles.remittanceExplanation
            }
          >
            <Ionicons
              name={
                isLimitReached
                  ? 'warning-outline'
                  : 'information-circle-outline'
              }
              size={16}
              color={
                isLimitReached
                  ? '#DC2626'
                  : '#B45309'
              }
            />

            <Text
              style={[
                styles.remittanceExplanationText,
                isLimitReached &&
                  styles.remittanceExplanationWarningText,
              ]}
            >
              {isLimitReached
                ? 'Your remittance limit has been reached. Please settle your COD cash before accepting new jobs.'
                : 'Physical cash collected from COD deliveries must be remitted through PayMongo.'}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.remitBtn,
              cashInHand <=
                0 &&
                styles.disabledRemitBtn,
              isLimitReached &&
                styles.remitBtnWarning,
            ]}
            onPress={
              handleRemit
            }
            disabled={
              cashInHand <= 0
            }
            activeOpacity={0.85}
          >
            <Ionicons
              name="card-outline"
              size={18}
              color="#FFFFFF"
            />

            <Text
              style={
                styles.remitBtnText
              }
            >
              Remit Cash via PayMongo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={
              styles.verifyBtn
            }
            onPress={() => {
              fetchWalletData();

              showFeedback({
                type: 'info',
                title: 'Checking Payment',
                message:
                  'Your wallet is being refreshed. Any completed payment will appear in your updated balance.',
                primaryText: 'Got It',
              });
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="refresh-outline"
              size={15}
              color="#059669"
            />

            <Text
              style={
                styles.verifyBtnText
              }
            >
              I've Paid, Refresh Balance
            </Text>
          </TouchableOpacity>
        </View>

        {/* ANALYTICS */}

        <View
          style={
            styles.sectionHeader
          }
        >
          <View>
            <Text
              style={
                styles.sectionEyebrow
              }
            >
              EARNINGS INSIGHTS
            </Text>

            <Text
              style={
                styles.sectionTitle
              }
            >
              Earnings Overview
            </Text>
          </View>
        </View>

        <View
          style={
            styles.analyticsTabBar
          }
        >
          <TouchableOpacity
            style={[
              styles.analyticsTabBtn,
              analyticsTab ===
                '7days' &&
                styles.analyticsTabActive,
            ]}
            onPress={() =>
              setAnalyticsTab(
                '7days'
              )
            }
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.analyticsTabTxt,
                analyticsTab ===
                  '7days' &&
                  styles.analyticsTabTxtActive,
              ]}
            >
              7 Days
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.analyticsTabBtn,
              analyticsTab ===
                'month' &&
                styles.analyticsTabActive,
            ]}
            onPress={() =>
              setAnalyticsTab(
                'month'
              )
            }
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.analyticsTabTxt,
                analyticsTab ===
                  'month' &&
                  styles.analyticsTabTxtActive,
              ]}
            >
              This Month
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.analyticsTabBtn,
              analyticsTab ===
                'overall' &&
                styles.analyticsTabActive,
            ]}
            onPress={() =>
              setAnalyticsTab(
                'overall'
              )
            }
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.analyticsTabTxt,
                analyticsTab ===
                  'overall' &&
                  styles.analyticsTabTxtActive,
              ]}
            >
              Overall
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={
            styles.analyticsContainer
          }
        >
          <View
            style={
              styles.analyticsCard
            }
          >
            <View
              style={
                styles.analyticsCardTop
              }
            >
              <View
                style={[
                  styles.analyticsIconBox,
                  {
                    backgroundColor:
                      '#ECFDF5',
                  },
                ]}
              >
                <Ionicons
                  name="cash-outline"
                  size={18}
                  color="#059669"
                />
              </View>

              <View
                style={
                  styles.analyticsArrow
                }
              >
                <Ionicons
                  name="trending-up-outline"
                  size={14}
                  color="#059669"
                />
              </View>
            </View>

            <Text
              style={
                styles.analyticsLabel
              }
            >
              COD EARNINGS
            </Text>

            <Text
              style={
                styles.analyticsAmount
              }
            >
              ₱
              {codEarnings.toFixed(
                2
              )}
            </Text>
          </View>

          <View
            style={
              styles.analyticsCard
            }
          >
            <View
              style={
                styles.analyticsCardTop
              }
            >
              <View
                style={[
                  styles.analyticsIconBox,
                  {
                    backgroundColor:
                      '#E0F2FE',
                  },
                ]}
              >
                <Ionicons
                  name="card-outline"
                  size={18}
                  color="#0284C7"
                />
              </View>

              <View
                style={[
                  styles.analyticsArrow,
                  {
                    backgroundColor:
                      '#F0F9FF',
                  },
                ]}
              >
                <Ionicons
                  name="trending-up-outline"
                  size={14}
                  color="#0284C7"
                />
              </View>
            </View>

            <Text
              style={
                styles.analyticsLabel
              }
            >
              ONLINE EARNINGS
            </Text>

            <Text
              style={
                styles.analyticsAmount
              }
            >
              ₱
              {onlineEarnings.toFixed(
                2
              )}
            </Text>
          </View>
        </View>

        {/* TRANSACTION HISTORY */}

        <View
          style={
            styles.ledgerSection
          }
        >
          <View
            style={
              styles.ledgerHeader
            }
          >
            <View>
              <Text
                style={
                  styles.sectionEyebrow
                }
              >
                WALLET ACTIVITY
              </Text>

              <Text
                style={
                  styles.sectionTitle
                }
              >
                Transaction History
              </Text>
            </View>

            <View
              style={
                styles.transactionCount
              }
            >
              <Text
                style={
                  styles.transactionCountText
                }
              >
                {transactions.length}
              </Text>
            </View>
          </View>

          {transactions.length ===
          0 ? (
            <View
              style={
                styles.emptyLedger
              }
            >
              <View
                style={
                  styles.emptyIcon
                }
              >
                <Ionicons
                  name="receipt-outline"
                  size={27}
                  color="#9CA3AF"
                />
              </View>

              <Text
                style={
                  styles.emptyTitle
                }
              >
                No transactions yet
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                Your earnings and remittance
                records will appear here.
              </Text>
            </View>
          ) : (
            <View>
              {transactions.map(
                (
                  item,
                  index
                ) => {
                  const ui =
                    getTransactionStyle(
                      item
                    );

                  const isLast =
                    index ===
                    transactions.length -
                      1;

                  return (
                    <View
                      key={
                        item.id ||
                        index
                      }
                      style={[
                        styles.transactionRow,
                        isLast &&
                          styles.transactionRowLast,
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
                          name={
                            ui.icon
                          }
                          size={18}
                          color={
                            ui.color
                          }
                        />
                      </View>

                      <View
                        style={
                          styles.txDetails
                        }
                      >
                        <Text
                          style={
                            styles.txReference
                          }
                          numberOfLines={
                            2
                          }
                        >
                          {item.payment_reference ||
                            'Delivery Record'}
                        </Text>

                        <View
                          style={
                            styles.txMetaRow
                          }
                        >
                          <View
                            style={[
                              styles.txTypeDot,
                              {
                                backgroundColor:
                                  ui.color,
                              },
                            ]}
                          />

                          <Text
                            style={[
                              styles.txType,
                              {
                                color:
                                  ui.color,
                              },
                            ]}
                          >
                            {item.transaction_type ===
                            'earning'
                              ? 'ADDED TO EARNINGS'
                              : item.transaction_type ===
                                  'remittance_due'
                                ? 'ADDED TO COD DEBT'
                                : item.transaction_type ===
                                    'remittance_paid'
                                  ? 'DEBT CLEARED'
                                  : 'WALLET RECORD'}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={
                          styles.txAmountArea
                        }
                      >
                        <Text
                          style={[
                            styles.txAmount,
                            {
                              color:
                                ui.color,
                            },
                          ]}
                        >
                          {ui.sign}₱
                          {Number(
                            item.amount
                          ).toFixed(
                            2
                          )}
                        </Text>

                        <Ionicons
                          name="chevron-forward"
                          size={14}
                          color="#C7CFCC"
                        />
                      </View>
                    </View>
                  );
                }
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* =====================================================
          CASHOUT MODAL
      ===================================================== */}

      <Modal
        visible={
          showCashoutModal
        }
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() =>
          setShowCashoutModal(
            false
          )
        }
      >
        <View
          style={
            styles.modalOverlay
          }
        >
          <View
            style={
              styles.modalContent
            }
          >
            <View
              style={
                styles.modalGrabber
              }
            />

            <View
              style={
                styles.modalHeader
              }
            >
              <View
                style={
                  styles.modalHeaderLeft
                }
              >
                <View
                  style={
                    styles.modalIcon
                  }
                >
                  <Ionicons
                    name="wallet-outline"
                    size={21}
                    color="#059669"
                  />
                </View>

                <View>
                  <Text
                    style={
                      styles.modalEyebrow
                    }
                  >
                    CASHOUT
                  </Text>

                  <Text
                    style={
                      styles.modalTitle
                    }
                  >
                    Request Cash Out
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={
                  styles.modalCloseBtn
                }
                onPress={() =>
                  setShowCashoutModal(
                    false
                  )
                }
                activeOpacity={0.7}
              >
                <Ionicons
                  name="close"
                  size={21}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>

            <View
              style={
                styles.cashoutAmountCard
              }
            >
              <Text
                style={
                  styles.cashoutAmountLabel
                }
              >
                AMOUNT TO WITHDRAW
              </Text>

              <Text
                style={
                  styles.cashoutAmount
                }
              >
                ₱
                {Number(
                  availableBalance
                ).toFixed(2)}
              </Text>
            </View>

            <Text
              style={
                styles.modalSub
              }
            >
              Enter the GCash account details
              where you want to receive your
              approved cashout.
            </Text>

            <Text
              style={
                styles.inputLabel
              }
            >
              GCASH ACCOUNT NAME
            </Text>

            <View
              style={
                styles.inputWrapper
              }
            >
              <Ionicons
                name="person-outline"
                size={17}
                color="#9CA3AF"
              />

              <TextInput
                style={
                  styles.modalInput
                }
                placeholder="e.g. Juan Dela Cruz"
                placeholderTextColor="#9CA3AF"
                value={gcashName}
                onChangeText={
                  setGcashName
                }
              />
            </View>

            <Text
              style={
                styles.inputLabel
              }
            >
              GCASH NUMBER
            </Text>

            <View
              style={
                styles.inputWrapper
              }
            >
              <Ionicons
                name="call-outline"
                size={17}
                color="#9CA3AF"
              />

              <TextInput
                style={
                  styles.modalInput
                }
                placeholder="e.g. 09123456789"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                value={
                  gcashNumber
                }
                onChangeText={
                  setGcashNumber
                }
              />
            </View>

            <View
              style={
                styles.modalNotice
              }
            >
              <Ionicons
                name="information-circle-outline"
                size={17}
                color="#059669"
              />

              <Text
                style={
                  styles.modalNoticeText
                }
              >
                Your request will be reviewed
                and approved by the administrator.
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.modalSubmitBtn,
                requestingCashout &&
                  styles.modalSubmitDisabled,
              ]}
              onPress={
                submitCashoutRequest
              }
              disabled={
                requestingCashout
              }
              activeOpacity={0.85}
            >
              {requestingCashout ? (
                <ActivityIndicator
                  color="#FFFFFF"
                  size="small"
                />
              ) : (
                <>
                  <Text
                    style={
                      styles.modalSubmitTxt
                    }
                  >
                    Submit Cashout Request
                  </Text>

                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color="#FFFFFF"
                  />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* =====================================================
          CUSTOM FEEDBACK / ALERT
      ===================================================== */}

      <FeedbackModal
        visible={
          feedback.visible
        }
        type={
          feedback.type
        }
        title={
          feedback.title
        }
        message={
          feedback.message
        }
        primaryText={
          feedback.primaryText
        }
        secondaryText={
          feedback.secondaryText
        }
        onPrimary={
          handleFeedbackPrimary
        }
        onSecondary={
          handleFeedbackSecondary
        }
        onRequestClose={
          closeFeedback
        }
      />

    </SafeAreaView>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7F5',
  },

  /* =======================================================
     LOADING
  ======================================================= */

  loadingScreen: {
    flex: 1,
    backgroundColor: '#F4F7F5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },

  loadingIcon: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: '#E7F7F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },

  loadingTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '900',
    color: '#17231E',
  },

  loadingSubtitle: {
    marginTop: 4,
    fontSize: 11.5,
    color: '#8A9690',
    textAlign: 'center',
  },

  /* =======================================================
     HEADER
  ======================================================= */

  header: {
    minHeight: 72,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E4EBE7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#E9F8F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  headerEyebrow: {
    fontSize: 8,
    color: '#8E9A94',
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 2,
  },

  headerTitle: {
    fontSize: 20,
    color: '#17221D',
    fontWeight: '900',
  },

  headerRefresh: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F4F7F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* =======================================================
     CONTENT
  ======================================================= */

  content: {
    padding: 15,
    paddingBottom: 35,
  },

  /* =======================================================
     WALLET OVERVIEW
  ======================================================= */

  overviewCard: {
    backgroundColor: '#087F5B',
    borderRadius: 22,
    padding: 18,
    marginBottom: 15,
    overflow: 'hidden',
    shadowColor: '#0C6B4D',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 5,
  },

  overviewTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  overviewEyebrow: {
    fontSize: 8.5,
    color: '#A7F3D0',
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },

  overviewAmount: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  overviewWalletIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor:
      'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  overviewDivider: {
    height: 1,
    backgroundColor:
      'rgba(255,255,255,0.16)',
    marginVertical: 15,
  },

  overviewBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  overviewInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  overviewStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#6EE7B7',
    marginRight: 7,
  },

  overviewInfoText: {
    color: '#D1FAE5',
    fontSize: 11,
    fontWeight: '600',
  },

  overviewReadyText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    backgroundColor:
      'rgba(255,255,255,0.13)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
  },

  primaryCashoutBtn: {
    minHeight: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryCashoutText: {
    flex: 1,
    textAlign: 'center',
    color: '#047857',
    fontSize: 12.5,
    fontWeight: '900',
    marginLeft: 7,
  },

  disabledPrimaryBtn: {
    opacity: 0.5,
  },

  /* =======================================================
     REMITTANCE
  ======================================================= */

  remittanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 21,
    padding: 17,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#E6ECE9',
    shadowColor: '#17382C',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  remittanceCardWarning: {
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    backgroundColor: '#FFFBFB',
  },

  remittanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  remittanceTitleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  remittanceIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#FFF7E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  remittanceIconWarning: {
    backgroundColor: '#FEF2F2',
  },

  remittanceHeading: {
    flex: 1,
  },

  remittanceEyebrow: {
    fontSize: 8,
    color: '#9AA59F',
    fontWeight: '900',
    letterSpacing: 0.9,
    marginBottom: 2,
  },

  remittanceTitle: {
    fontSize: 16,
    color: '#17231E',
    fontWeight: '900',
  },

  limitBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 8,
  },

  limitBadgeWarning: {
    backgroundColor: '#FEF2F2',
  },

  limitText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#6B7280',
  },

  limitTextWarning: {
    color: '#991B1B',
  },

  remittanceAmount: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    color: '#B45309',
    marginTop: 17,
    marginBottom: 8,
  },

  remittanceAmountWarning: {
    color: '#991B1B',
  },

  remittanceAmountEmpty: {
    color: '#374151',
  },

  remittanceExplanation: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 11,
    borderRadius: 12,
    backgroundColor: '#FFFAEB',
    borderWidth: 1,
    borderColor: '#FDE7B0',
    marginBottom: 12,
  },

  remittanceExplanationWarningText: {
    color: '#991B1B',
  },

  remittanceExplanationText: {
    flex: 1,
    marginLeft: 7,
    fontSize: 11,
    lineHeight: 16,
    color: '#92400E',
    fontWeight: '600',
  },

  remitBtn: {
    minHeight: 48,
    backgroundColor: '#111827',
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  remitBtnWarning: {
    backgroundColor: '#991B1B',
  },

  disabledRemitBtn: {
    backgroundColor: '#9CA3AF',
  },

  remitBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '900',
    marginLeft: 7,
  },

  verifyBtn: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },

  verifyBtnText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 5,
  },

  /* =======================================================
     SECTION HEADER
  ======================================================= */

  sectionHeader: {
    marginBottom: 10,
  },

  sectionEyebrow: {
    fontSize: 8,
    color: '#98A49E',
    fontWeight: '900',
    letterSpacing: 0.9,
    marginBottom: 2,
  },

  sectionTitle: {
    fontSize: 17,
    color: '#17221D',
    fontWeight: '900',
  },

  /* =======================================================
     ANALYTICS
  ======================================================= */

  analyticsTabBar: {
    flexDirection: 'row',
    backgroundColor: '#E8EEEB',
    borderRadius: 13,
    padding: 4,
    marginBottom: 11,
  },

  analyticsTabBtn: {
    flex: 1,
    minHeight: 37,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },

  analyticsTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },

  analyticsTabTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },

  analyticsTabTxtActive: {
    color: '#059669',
    fontWeight: '900',
  },

  analyticsContainer: {
    flexDirection: 'row',
    marginBottom: 22,
  },

  analyticsCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3EAE6',
    marginHorizontal: 4,
    minHeight: 132,
  },

  analyticsCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },

  analyticsIconBox: {
    width: 37,
    height: 37,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  analyticsArrow: {
    width: 25,
    height: 25,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  analyticsLabel: {
    fontSize: 8.5,
    color: '#7C8782',
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 5,
  },

  analyticsAmount: {
    fontSize: 18,
    color: '#17221D',
    fontWeight: '900',
  },

  /* =======================================================
     LEDGER
  ======================================================= */

  ledgerSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 19,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E1E8E4',
  },

  ledgerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },

  transactionCount: {
    minWidth: 31,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#F1F5F3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },

  transactionCountText: {
    fontSize: 10,
    color: '#64716B',
    fontWeight: '900',
  },

  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1EF',
  },

  transactionRowLast: {
    borderBottomWidth: 0,
  },

  txIconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  txDetails: {
    flex: 1,
    minWidth: 0,
  },

  txReference: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    color: '#1F2937',
  },

  txMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },

  txTypeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginRight: 5,
  },

  txType: {
    fontSize: 7.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  txAmountArea: {
    alignItems: 'flex-end',
    marginLeft: 7,
  },

  txAmount: {
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 3,
  },

  /* =======================================================
     EMPTY
  ======================================================= */

  emptyLedger: {
    alignItems: 'center',
    paddingVertical: 27,
    paddingHorizontal: 15,
  },

  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 17,
    backgroundColor: '#F3F5F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  emptyTitle: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '800',
  },

  emptyText: {
    fontSize: 11,
    lineHeight: 17,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
  },

  /* =======================================================
     CASHOUT MODAL
  ======================================================= */

  modalOverlay: {
    flex: 1,
    backgroundColor:
      'rgba(15,23,42,0.58)',
    justifyContent: 'flex-end',
  },

  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
  },

  modalGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
    marginBottom: 16,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  modalIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: '#EAF8F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  modalEyebrow: {
    fontSize: 8,
    color: '#059669',
    fontWeight: '900',
    letterSpacing: 0.9,
    marginBottom: 2,
  },

  modalTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#17221D',
  },

  modalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cashoutAmountCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 15,
    padding: 14,
    marginBottom: 13,
  },

  cashoutAmountLabel: {
    fontSize: 8,
    color: '#059669',
    fontWeight: '900',
    letterSpacing: 0.7,
    marginBottom: 3,
  },

  cashoutAmount: {
    fontSize: 24,
    color: '#047857',
    fontWeight: '900',
  },

  modalSub: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 18,
  },

  inputLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#4B5563',
    letterSpacing: 0.6,
    marginBottom: 7,
  },

  inputWrapper: {
    minHeight: 51,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9F8',
    borderWidth: 1,
    borderColor: '#DFE6E2',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
  },

  modalInput: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 9,
    fontSize: 14,
    color: '#111827',
  },

  modalNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderRadius: 11,
    padding: 10,
    marginTop: 1,
    marginBottom: 15,
  },

  modalNoticeText: {
    flex: 1,
    fontSize: 10.5,
    lineHeight: 15,
    color: '#047857',
    marginLeft: 6,
    fontWeight: '600',
  },

  modalSubmitBtn: {
    minHeight: 51,
    backgroundColor: '#059669',
    borderRadius: 13,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalSubmitDisabled: {
    opacity: 0.7,
  },

  modalSubmitTxt: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    marginRight: 7,
  },

  /* =======================================================
     CUSTOM ALERT / FEEDBACK
  ======================================================= */

  feedbackOverlay: {
    flex: 1,
    backgroundColor:
      'rgba(15,23,42,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  feedbackCard: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },

  feedbackIconOuter: {
    width: 67,
    height: 67,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },

  feedbackTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    color: '#17221D',
    textAlign: 'center',
    paddingHorizontal: 10,
  },

  feedbackMessage: {
    marginTop: 8,
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 7,
  },

  feedbackActions: {
    width: '100%',
    flexDirection: 'row',
    marginTop: 21,
  },

  feedbackSecondaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: '#F3F5F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
    borderWidth: 1,
    borderColor: '#E3E8E5',
  },

  feedbackSecondaryText: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '900',
  },

  feedbackPrimaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 13,
  },

  feedbackPrimaryBtnFull: {
    width: '100%',
  },

  feedbackPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
});