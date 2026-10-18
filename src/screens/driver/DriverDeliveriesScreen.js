import React, {
  useEffect,
  useState,
  useCallback,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';

const TABS = [
  {
    id: 'active',
    label: 'Pending / Active',
  },
  {
    id: 'completed',
    label: 'Completed',
  },
  {
    id: 'all',
    label: 'All Deliveries',
  },
];

const parseCustomDescription = (
  rawText
) => {
  if (!rawText) {
    return {
      type: 'Custom Request',
      details: 'General Item Request',
      cost: null,
      payment: 'Cash on Delivery (COD)',
      instructions: null,
    };
  }

  let type = 'Custom Request';

  if (
    rawText.includes(
      'PACKAGE PICKUP'
    )
  ) {
    type = 'Package Pickup';
  } else if (
    rawText.includes(
      'ITEM REQUEST'
    )
  ) {
    type = 'Item Request';
  }

  let cost = null;

  const costMatch = rawText.match(
    /ESTIMATED ITEM COST: ₱([0-9.]+)/
  );

  if (costMatch) {
    cost = costMatch[1];
  }

  let payment =
    'Cash on Delivery (COD)';

  const payMatch =
    rawText.match(
      /PAYMENT METHOD: ([^\n]+)/
    );

  if (payMatch) {
    payment =
      payMatch[1].trim();
  }

  let instructions = null;

  const instMatch =
    rawText.match(
      /RIDER INSTRUCTIONS: ([^\n]+)/
    );

  if (instMatch) {
    instructions =
      instMatch[1].trim();
  }

  const cleanDetails = rawText
    .replace(
      /\[(PACKAGE PICKUP|ITEM REQUEST|ESTIMATED ITEM COST:[^\]]+)\]/g,
      ''
    )
    .replace(
      /💳 PAYMENT METHOD: [^\n]+/g,
      ''
    )
    .replace(
      /RIDER INSTRUCTIONS: [^\n]+/g,
      ''
    )
    .trim();

  return {
    type,
    details:
      cleanDetails || rawText,
    cost,
    payment,
    instructions,
  };
};

export default function DriverDeliveriesScreen({
  navigation,
}) {
  const { profile, user } =
    useAuth();

  const driverId =
    profile?.id ||
    user?.id;

  const [deliveries, setDeliveries] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [activeTab, setActiveTab] =
    useState('active');

  const [summary, setSummary] =
    useState({
      totalEarnings: 0,
      completedCount: 0,
    });

  // ✨ UPDATED: Now receives the true ledger earnings to set the state
  const calculateSummary =
    (dataList, ledgerEarnings = null) => {
      const completed =
        dataList.filter(
          (item) => {
            const status =
              item.status?.toLowerCase();

            return (
              status === 'delivered' ||
              status === 'completed'
            );
          }
        );

      setSummary((prev) => ({
        totalEarnings: ledgerEarnings !== null ? ledgerEarnings : prev.totalEarnings,
        completedCount: completed.length,
      }));
    };

  const fetchDriverHistory =
    useCallback(
      async () => {
        try {
          if (driverId) {
            const {
              data: deliveryRequests,
              error: reqErr,
            } = await supabase
              .from(
                'delivery_requests'
              )
              .select(
                '*, orders(status)'
              )
              .eq(
                'driver_id',
                driverId
              )
              .order(
                'created_at',
                {
                  ascending: false,
                }
              );

            if (reqErr) {
              console.error(
                'Error fetching delivery requests history:',
                reqErr.message
              );
            }

            const {
              data: storeOrders,
              error: storeErr,
            } =
              await supabase
                .from(
                  'orders'
                )
                .select('*')
                .eq(
                  'driver_id',
                  driverId
                )
                .order(
                  'created_at',
                  {
                    ascending:
                      false,
                  }
                );

            if (storeErr) {
              console.error(
                'Error fetching store orders history:',
                storeErr.message
              );
            }

            // ✨ NEW: Fetch the exact ledger earnings to match the Rider Wallet Screen!
            let trueLedgerEarnings = 0;
            const { data: walletData } = await supabase
              .from('wallets')
              .select('id')
              .eq('user_id', driverId)
              .maybeSingle();

            if (walletData) {
              const { data: ledgerData } = await supabase
                .from('ledger_transactions')
                .select('amount')
                .eq('wallet_id', walletData.id)
                .eq('transaction_type', 'earning');

              if (ledgerData) {
                trueLedgerEarnings = ledgerData.reduce(
                  (sum, tx) => sum + Number(tx.amount || 0),
                  0
                );
              }
            }

            const allCustomerIds =
              [
                ...new Set([
                  ...(deliveryRequests ||
                    [])
                    .map(
                      (j) =>
                        j.customer_id
                    )
                    .filter(
                      Boolean
                    ),

                  ...(storeOrders ||
                    [])
                    .map(
                      (o) =>
                        o.customer_id ||
                        o.user_id
                    )
                    .filter(
                      Boolean
                    ),
                ]),
              ];

            let profileMap = {};

            if (
              allCustomerIds.length >
              0
            ) {
              const {
                data:
                  profilesData,
              } =
                await supabase
                  .from(
                    'profiles'
                  )
                  .select(
                    'id, full_name, phone'
                  )
                  .in(
                    'id',
                    allCustomerIds
                  );

              if (
                profilesData
              ) {
                profileMap =
                  Object.fromEntries(
                    profilesData.map(
                      (p) => [
                        p.id,
                        p,
                      ]
                    )
                  );
              }
            }

            let formattedStoreOrders =
              [];

            if (
              storeOrders &&
              storeOrders.length >
                0
            ) {
              const storeIds =
                [
                  ...new Set(
                    storeOrders
                      .map(
                        (o) =>
                          o.store_id
                      )
                      .filter(
                        Boolean
                      )
                  ),
                ];

              let storeMap = {};

              if (
                storeIds.length >
                0
              ) {
                const {
                  data:
                    storesData,
                } =
                  await supabase
                    .from(
                      'stores'
                    )
                    .select(
                      'id, name, address, lat, lng'
                    )
                    .in(
                      'id',
                      storeIds
                    );

                if (
                  storesData
                ) {
                  storeMap =
                    Object.fromEntries(
                      storesData.map(
                        (s) => [
                          s.id,
                          s,
                        ]
                      )
                    );
                }
              }

              formattedStoreOrders =
                storeOrders.map(
                  (order) => {
                    const storeObj =
                      storeMap[
                        order.store_id
                      ] ||
                      {};

                    const custId =
                      order.customer_id ||
                      order.user_id;

                    const custProfile =
                      profileMap[
                        custId
                      ] ||
                      {};

                    return {
                      ...order,
                      request_type:
                        'store_order',

                      customer_name:
                        custProfile.full_name ||
                        order.customer_name ||
                        'Valued Customer',

                      customer_phone:
                        custProfile.phone ||
                        order.customer_phone ||
                        '',

                      pickup_address:
                        storeObj.address ||
                        order.pickup_address ||
                        'Store Address',

                      dropoff_address:
                        order.delivery_address ||
                        order.address ||
                        order.dropoff_address ||
                        'Customer Address',

                      item_description:
                        order.description ||
                        `Store Order #${order.id
                          ?.toString()
                          .slice(-4)}`,
                    };
                  }
                );
            }

            const formattedDeliveryRequests =
              (
                deliveryRequests ||
                []
              )
                .filter(
                  (item) =>
                    item.request_type !==
                      'store_order' &&
                    !item.order_id
                )
                .map(
                  (item) => {
                    const custProfile =
                      profileMap[
                        item
                          .customer_id
                      ] ||
                      {};

                    const desc =
                      item.description ||
                      item.item_description ||
                      '';

                    const isPackagePickup =
                      desc.includes(
                        'PACKAGE PICKUP'
                      ) ||
                      item.request_type ===
                        'pickup_item';

                    return {
                      ...item,

                      request_type:
                        isPackagePickup
                          ? 'pickup_item'
                          : item.request_type ===
                              'request_item'
                            ? 'request_item'
                            : desc.includes(
                                  'ITEM REQUEST'
                                )
                              ? 'request_item'
                              : 'pickup_item',

                      customer_name:
                        custProfile.full_name ||
                        item.customer_name ||
                        'Valued Customer',

                      customer_phone:
                        custProfile.phone ||
                        item.customer_phone ||
                        '',

                      pickup_address:
                        isPackagePickup
                          ? item.pickup_address ||
                            item.pickup
                              ?.address ||
                            'Pickup Location'
                          : null,

                      dropoff_address:
                        item.dropoff_address ||
                        item.delivery_address ||
                        item.dropoff
                          ?.address ||
                        'Customer Address',
                    };
                  }
                );

            const combinedMap =
              new Map();

            [
              ...formattedDeliveryRequests,
              ...formattedStoreOrders,
            ].forEach(
              (item) => {
                if (
                  item &&
                  item.id
                ) {
                  combinedMap.set(
                    item.id.toString(),
                    item
                  );
                }
              }
            );

            const finalList =
              Array.from(
                combinedMap.values()
              ).sort(
                (a, b) =>
                  new Date(
                    b.created_at ||
                      0
                  ) -
                  new Date(
                    a.created_at ||
                      0
                  )
              );

            setDeliveries(
              finalList
            );

            // ✨ Pass the true ledger earnings into our summary state!
            calculateSummary(
              finalList,
              trueLedgerEarnings
            );
          } else {
            setDeliveries([]);
            calculateSummary([], 0);
          }
        } catch (err) {
          console.error(
            'Error fetching driver delivery history:',
            err.message
          );

          setDeliveries([]);
          calculateSummary([], 0);
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [driverId]
    );

  useFocusEffect(
    useCallback(() => {
      fetchDriverHistory();
    }, [fetchDriverHistory])
  );

  useEffect(() => {
    if (!driverId) return;

    // ✨ REAL-TIME LISTENER FOR HISTORY UPDATES ✨
    const orderHistoryChannel = supabase
      .channel(`driver_history_orders_${driverId}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `driver_id=eq.${driverId}`,
        },
        () => {
          fetchDriverHistory();
        }
      )
      .subscribe();

    const requestHistoryChannel = supabase
      .channel(`driver_history_requests_${driverId}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_requests',
          filter: `driver_id=eq.${driverId}`,
        },
        () => {
          fetchDriverHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(orderHistoryChannel);
      supabase.removeChannel(requestHistoryChannel);
    };
  }, [driverId, fetchDriverHistory]);

  const handleDeliveryPress =
    (item) => {
      navigation.navigate(
        'ActiveDelivery',
        {
          deliveryId:
            item.id,
          delivery: item,
        }
      );
    };

  const filteredDeliveries =
    deliveries.filter(
      (item) => {
        const status =
          item.status?.toLowerCase();

        const isCompleted =
          status ===
            'delivered' ||
          status ===
            'completed';

        const isCancelled =
          status ===
          'cancelled';

        if (
          activeTab ===
          'active'
        ) {
          return (
            !isCompleted &&
            !isCancelled
          );
        }

        if (
          activeTab ===
          'completed'
        ) {
          return isCompleted;
        }

        return true;
      }
    );

  const getStatusBadgeConfig =
    (
      status,
      isCustomRequest
    ) => {
      switch (
        status?.toLowerCase()
      ) {
        case 'delivered':
        case 'completed':
          return {
            label: 'Delivered',
            bg: '#ECFDF5',
            text: '#047857',
            icon:
              'checkmark-circle',
          };

        case 'cancelled':
          return {
            label: 'Cancelled',
            bg: '#FEF2F2',
            text: '#B91C1C',
            icon:
              'close-circle',
          };

        case 'in_transit':
          return {
            label: 'In Transit',
            bg: '#EFF6FF',
            text: '#1D4ED8',
            icon: 'navigate',
          };

        case 'picked_up':
        case 'picking_up':
          if (
            isCustomRequest
          ) {
            return {
              label:
                'Please prepare the order',
              bg: '#E0F2FE',
              text: '#0284C7',
              icon: 'cube',
            };
          }

          return {
            label: 'Picked Up',
            bg: '#EFF6FF',
            text: '#1D4ED8',
            icon: 'cube',
          };

        case 'preparing':
          return {
            label:
              'Store Preparing',
            bg: '#FFF7ED',
            text: '#C2410C',
            icon: 'restaurant',
          };

        case 'ready_for_pickup':
          return {
            label:
              'Ready for Pickup',
            bg: '#F0FDF4',
            text: '#166534',
            icon:
              'bag-check',
          };

        case 'accepted':
          return {
            label: 'Accepted',
            bg: '#EFF6FF',
            text: '#1D4ED8',
            icon:
              'checkmark-circle-outline',
          };

        case 'pending':
        default:
          return {
            label: 'Pending',
            bg: '#FFFBEB',
            text: '#B45309',
            icon: 'time',
          };
      }
    };

  const renderItem = ({
    item,
  }) => {
    const isStoreOrPickup =
      [
        'store',
        'store_order',
        'pickup_item',
      ].includes(
        item.request_type
      );

    const parsedDesc =
      parseCustomDescription(
        item.item_description ||
          item.description
      );

    let displayStatus =
      item.status;

    if (
      item.request_type ===
        'store_order' &&
      item.status ===
        'accepted' &&
      item.orders?.status
    ) {
      if (
        [
          'preparing',
          'ready_for_pickup',
        ].includes(
          item.orders
            .status
        )
      ) {
        displayStatus =
          item.orders.status;
      }
    }

    const badge =
      getStatusBadgeConfig(
        displayStatus,
        !isStoreOrPickup
      );

    const dateFormatted =
      item.created_at
        ? new Date(
            item.created_at
          ).toLocaleDateString(
            'en-US',
            {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute:
                '2-digit',
            }
          )
        : '';

    const isCompleted =
      [
        'delivered',
        'completed',
      ].includes(
        displayStatus?.toLowerCase()
      );

    const isPabakal =
      item.request_type ===
      'request_item';

    const displayCost =
      isPabakal
        ? isCompleted &&
          Number(
            item.subtotal
          ) > 0
          ? item.subtotal
          : parsedDesc.cost
        : null;

    const costLabel =
      isPabakal
        ? isCompleted &&
          Number(
            item.subtotal
          ) > 0
          ? 'Final Item Cost'
          : 'Est. Store Cost'
        : null;
        
    const payoutAmount = Math.max(0, Number(item.delivery_fee || 0) - Number(item.app_fee || 0));

    // ✨ GRAB THE CORRECT ID AND FORMAT AS 5 CHARACTERS ✨
    const activeId = (item.request_type === 'store_order' && item.order_id) ? item.order_id : item.id;
    const shortId = activeId ? String(activeId).substring(0, 5).toUpperCase() : '';

    return (
      <TouchableOpacity
        style={
          styles.card
        }
        activeOpacity={0.92}
        onPress={() =>
          handleDeliveryPress(
            item
          )
        }
      >
        {/* TOP LINE */}

        <View
          style={
            styles.cardTopLine
          }
        />

        {/* HEADER */}

        <View
          style={
            styles.cardHeader
          }
        >
          <View
            style={
              styles.jobTypeBadge
            }
          >
            <View
              style={
                styles.jobTypeIcon
              }
            >
              <Ionicons
                name={
                  isStoreOrPickup
                    ? 'storefront-outline'
                    : 'basket-outline'
                }
                size={15}
                color="#059669"
              />
            </View>

            <View
              style={
                styles.jobTypeTextWrap
              }
            >
              <Text
                style={
                  styles.jobTypeLabel
                }
              >
                DELIVERY TYPE
              </Text>

              <Text
                style={
                  styles.jobTypeText
                }
                numberOfLines={1}
              >
                {item.request_type === 'request_item'
                  ? 'Pabakal'
                  : item.request_type === 'pickup_item'
                  ? 'Pakuha'
                  : 'Store Delivery'}
                {' • #'}{shortId}
              </Text>
            </View>
          </View>

          <View
            style={
              styles.payoutArea
            }
          >
            <Text
              style={
                styles.payoutLabel
              }
            >
              PAYOUT
            </Text>

            <Text
              style={
                styles.payoutText
              }
            >
             ₱{payoutAmount.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* CUSTOMER */}

        <View
          style={
            styles.customerSection
          }
        >
          <View
            style={
              styles.customerIcon
            }
          >
            <Ionicons
              name="person-outline"
              size={17}
              color="#059669"
            />
          </View>

          <View
            style={
              styles.customerTextContainer
            }
          >
            <Text
              style={
                styles.customerLabel
              }
            >
              CUSTOMER
            </Text>

            <Text
              style={
                styles.customerNameCardText
              }
              numberOfLines={1}
            >
              {item.customer_name ||
                'Valued Customer'}
            </Text>
          </View>

          <View
            style={
              styles.customerArrow
            }
          >
            <Ionicons
              name="chevron-forward"
              size={15}
              color="#9CA3AF"
            />
          </View>
        </View>

        {/* ITEM DESCRIPTION */}

        <View
          style={
            styles.descriptionContainer
          }
        >
          <View
            style={
              styles.descriptionIcon
            }
          >
            <Ionicons
              name="cube-outline"
              size={17}
              color="#059669"
            />
          </View>

          <View
            style={
              styles.descriptionContent
            }
          >
            <Text
              style={
                styles.descriptionLabel
              }
            >
              REQUEST
            </Text>

            <Text
              style={
                styles.itemTitle
              }
              numberOfLines={2}
            >
              {parsedDesc.details ||
                'Package Delivery'}
            </Text>
          </View>
        </View>

        {/* COST */}

        {displayCost &&
        isPabakal ? (
          <View
            style={
              styles.cardMetaRow
            }
          >
            <View
              style={[
                styles.cardCostPill,
                isCompleted && {
                  backgroundColor:
                    '#ECFDF5',
                  borderColor:
                    '#A7F3D0',
                },
              ]}
            >
              <Ionicons
                name="wallet-outline"
                size={13}
                color={
                  isCompleted
                    ? '#059669'
                    : '#D97706'
                }
              />

              <Text
                style={[
                  styles.cardCostText,
                  isCompleted && {
                    color:
                      '#059669',
                  },
                ]}
              >
                {costLabel}: ₱
                {Number(
                  displayCost
                ).toFixed(2)}
              </Text>
            </View>

            {isCompleted &&
              item.total_amount >
                0 &&
              item.payment_method ===
                'cod' && (
                <View
                  style={[
                    styles.cardCostPill,
                    styles.collectPill,
                  ]}
                >
                  <Ionicons
                    name="cash-outline"
                    size={13}
                    color="#1D4ED8"
                  />

                  <Text
                    style={[
                      styles.cardCostText,
                      styles.collectText,
                    ]}
                  >
                    Total Collect:
                    {' '}
                    ₱
                    {Number(
                      item.total_amount
                    ).toFixed(
                      2
                    )}
                  </Text>
                </View>
              )}
          </View>
        ) : null}

        {/* ROUTE */}

        <View
          style={
            styles.routeContainer
          }
        >
          <View
            style={
              styles.routeHeader
            }
          >
            <View
              style={
                styles.routeHeaderIcon
              }
            >
              <Ionicons
                name="navigate-outline"
                size={14}
                color="#059669"
              />
            </View>

            <Text
              style={
                styles.routeHeaderText
              }
            >
              DELIVERY ROUTE
            </Text>
          </View>

          {isStoreOrPickup && (
            <View
              style={
                styles.routePointRow
              }
            >
              <View
                style={
                  styles.timelineColumn
                }
              >
                <View
                  style={[
                    styles.routeMarker,
                    styles.pickupMarker,
                  ]}
                >
                  <Ionicons
                    name="location"
                    size={13}
                    color="#059669"
                  />
                </View>

                <View
                  style={
                    styles.timelineLine
                  }
                />
              </View>

              <View
                style={
                  styles.addressTextContainer
                }
              >
                <Text
                  style={
                    styles.routePointLabel
                  }
                >
                  PICKUP
                </Text>

                <Text
                  style={
                    styles.routePointValue
                  }
                  numberOfLines={2}
                >
                  {item.pickup_address ||
                    item.pickup
                      ?.address ||
                    'Store / Landmark'}
                </Text>
              </View>
            </View>
          )}

          <View
            style={
              styles.routePointRow
            }
          >
            <View
              style={
                styles.timelineColumn
              }
            >
              <View
                style={[
                  styles.routeMarker,
                  styles.dropoffMarker,
                ]}
              >
                <Ionicons
                  name="flag"
                  size={12}
                  color="#EF4444"
                />
              </View>
            </View>

            <View
              style={
                styles.addressTextContainer
              }
            >
              <Text
                style={
                  styles.routePointLabel
                }
              >
                DROP-OFF
              </Text>

              <Text
                style={
                  styles.routePointValue
                }
                numberOfLines={2}
              >
                {item.dropoff_address ||
                  item.dropoff
                    ?.address ||
                  'Customer Address'}
              </Text>
            </View>
          </View>
        </View>

        {/* FOOTER */}

        <View
          style={
            styles.cardFooter
          }
        >
          <View
            style={
              styles.footerLeft
            }
          >
            <View
              style={[
                styles.badgeContainer,
                {
                  backgroundColor:
                    badge.bg,
                },
              ]}
            >
              <Ionicons
                name={
                  badge.icon
                }
                size={13}
                color={
                  badge.text
                }
              />

              <Text
                style={[
                  styles.badgeText,
                  {
                    color:
                      badge.text,
                  },
                ]}
                numberOfLines={1}
              >
                {badge.label}
              </Text>
            </View>

            {dateFormatted ? (
              <View
                style={
                  styles.dateContainer
                }
              >
                <Ionicons
                  name="time-outline"
                  size={12}
                  color="#9CA3AF"
                />

                <Text
                  style={
                    styles.dateText
                  }
                >
                  {dateFormatted}
                </Text>
              </View>
            ) : null}
          </View>

          <View
            style={
              styles.viewDetailsButton
            }
          >
            <Text
              style={
                styles.viewDetailsText
              }
            >
              Details
            </Text>

            <View
              style={
                styles.arrowCircle
              }
            >
              <Ionicons
                name="arrow-forward"
                size={13}
                color="#FFFFFF"
              />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      style={
        styles.container
      }
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
        translucent={false}
      />

      {/* HEADER */}

      <View
        style={
          styles.header
        }
      >
        <View
          style={
            styles.headerTitleRow
          }
        >
          <View
            style={
              styles.headerIcon
            }
          >
            <Ionicons
              name="cube-outline"
              size={21}
              color="#059669"
            />
          </View>

          <View
            style={
              styles.headerTextGroup
            }
          >
            <Text
              style={
                styles.headerEyebrow
              }
            >
              RIDER ACTIVITY
            </Text>

            <Text
              style={
                styles.pageTitle
              }
            >
              My Deliveries
            </Text>

            <Text
              style={
                styles.pageSubtitle
              }
            >
              Track your routes and completed trips
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={
            styles.headerCount
          }
          activeOpacity={0.8}
        >
          <Text
            style={
              styles.headerCountValue
            }
          >
            {deliveries.length}
          </Text>

          <Text
            style={
              styles.headerCountLabel
            }
          >
            TRIPS
          </Text>
        </TouchableOpacity>
      </View>

      {/* TABS */}

      <View
        style={
          styles.tabBar
        }
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.tabContent
          }
        >
          {TABS.map(
            (tab) => {
              const isActive =
                activeTab ===
                tab.id;

              return (
                <TouchableOpacity
                  key={
                    tab.id
                  }
                  style={[
                    styles.tabItem,
                    isActive &&
                      styles.tabItemActive,
                  ]}
                  onPress={() =>
                    setActiveTab(
                      tab.id
                    )
                  }
                  activeOpacity={
                    0.8
                  }
                >
                  <Text
                    style={[
                      styles.tabText,
                      isActive &&
                        styles.tabTextActive,
                    ]}
                  >
                    {
                      tab.label
                    }
                  </Text>
                </TouchableOpacity>
              );
            }
          )}
        </ScrollView>
      </View>

      {/* LOADING */}

      {loading &&
      !refreshing ? (
        <View
          style={
            styles.centerContainer
          }
        >
          <View
            style={
              styles.loadingCard
            }
          >
            <View
              style={
                styles.loadingIcon
              }
            >
              <Ionicons
                name="cube-outline"
                size={27}
                color="#059669"
              />
            </View>

            <ActivityIndicator
              size="small"
              color="#059669"
            />

            <Text
              style={
                styles.loadingText
              }
            >
              Loading deliveries
            </Text>

            <Text
              style={
                styles.loadingSubtext
              }
            >
              Getting your latest delivery history
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={
            filteredDeliveries
          }
          keyExtractor={(
            item
          ) =>
            item.id.toString()
          }
          renderItem={
            renderItem
          }
          contentContainerStyle={
            styles.listContainer
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
                setRefreshing(
                  true
                );

                fetchDriverHistory();
              }}
              colors={[
                '#059669',
              ]}
              tintColor="#059669"
            />
          }
          ListHeaderComponent={
            <View
              style={
                styles.summaryCard
              }
            >
              {/* SUMMARY HEADER */}

              <View
                style={
                  styles.summaryHeader
                }
              >
                <View>
                  <Text
                    style={
                      styles.summaryEyebrow
                    }
                  >
                    PERFORMANCE
                  </Text>

                  <Text
                    style={
                      styles.summaryTitle
                    }
                  >
                    Earnings Overview
                  </Text>

                  <Text
                    style={
                      styles.summarySubtitle
                    }
                  >
                    Your delivery performance
                  </Text>
                </View>

                <View
                  style={
                    styles.summaryHeaderIcon
                  }
                >
                  <Ionicons
                    name="stats-chart-outline"
                    size={18}
                    color="#FFFFFF"
                  />
                </View>
              </View>

              {/* SUMMARY STATS */}

              <View
                style={
                  styles.summaryStats
                }
              >
                <View
                  style={
                    styles.summaryBox
                  }
                >
                  <View
                    style={
                      styles.summaryIconCircle
                    }
                  >
                    <Ionicons
                      name="wallet-outline"
                      size={18}
                      color="#FFFFFF"
                    />
                  </View>

                  <View
                    style={
                      styles.summaryStatText
                    }
                  >
                    <Text
                      style={
                        styles.summaryLabel
                      }
                    >
                      TOTAL EARNINGS
                    </Text>

                    <Text
                      style={
                        styles.summaryValue
                      }
                    >
                      ₱
                      {Number(
                        summary.totalEarnings
                      ).toFixed(
                        2
                      )}
                    </Text>
                  </View>
                </View>

                <View
                  style={
                    styles.summaryDivider
                  }
                />

                <View
                  style={
                    styles.summaryBox
                  }
                >
                  <View
                    style={
                      styles.summaryIconCircle
                    }
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={19}
                      color="#FFFFFF"
                    />
                  </View>

                  <View
                    style={
                      styles.summaryStatText
                    }
                  >
                    <Text
                      style={
                        styles.summaryLabel
                      }
                    >
                      COMPLETED TRIPS
                    </Text>

                    <Text
                      style={
                        styles.summaryValue
                      }
                    >
                      {
                        summary.completedCount
                      }
                    </Text>
                  </View>
                </View>
              </View>

              {/* CURRENT FILTER */}

              <View
                style={
                  styles.summaryFooter
                }
              >
                <View
                  style={
                    styles.summaryFooterIcon
                  }
                >
                  <Ionicons
                    name={
                      activeTab ===
                      'completed'
                        ? 'checkmark-done-outline'
                        : activeTab ===
                            'active'
                          ? 'navigate-outline'
                          : 'layers-outline'
                    }
                    size={13}
                    color="#A7F3D0"
                  />
                </View>

                <Text
                  style={
                    styles.summaryFooterText
                  }
                >
                  Showing{' '}
                  {activeTab ===
                  'completed'
                    ? 'completed deliveries'
                    : activeTab ===
                        'active'
                      ? 'pending and active deliveries'
                      : 'all delivery records'}
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View
              style={
                styles.emptyContainer
              }
            >
              <View
                style={
                  styles.emptyIconBg
                }
              >
                <Ionicons
                  name={
                    activeTab ===
                    'completed'
                      ? 'checkmark-done-circle-outline'
                      : activeTab ===
                          'active'
                        ? 'navigate-outline'
                        : 'cube-outline'
                  }
                  size={38}
                  color="#059669"
                />
              </View>

              <Text
                style={
                  styles.emptyTitle
                }
              >
                {activeTab ===
                'completed'
                  ? 'No Completed Deliveries'
                  : activeTab ===
                      'active'
                    ? 'No Active Deliveries'
                    : 'No Trip History'}
              </Text>

              <Text
                style={
                  styles.emptySub
                }
              >
                {activeTab ===
                'completed'
                  ? 'Completed trips will appear here once you fulfill order requests.'
                  : activeTab ===
                      'active'
                    ? 'You currently have no active or pending delivery tasks.'
                    : 'Your delivery history and earnings summary will be displayed here.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#F4F7F5',
    },

    /* ===================================
       HEADER
    =================================== */

    header: {
      backgroundColor:
        '#FFFFFF',
      minHeight: 83,
      paddingHorizontal: 16,
      paddingTop:
        Platform.OS ===
        'android'
          ? (StatusBar.currentHeight ||
              20) +
            8
          : 12,
      paddingBottom: 11,
      borderBottomWidth: 1,
      borderBottomColor:
        '#E8EEEB',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
    },

    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },

    headerIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor:
        '#EAF8F2',
      borderWidth: 1,
      borderColor:
        '#D4EEE4',
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 10,
    },

    headerTextGroup: {
      flex: 1,
    },

    headerEyebrow: {
      fontSize: 7.5,
      fontWeight: '900',
      letterSpacing: 0.9,
      color: '#98A49F',
      marginBottom: 1,
    },

    pageTitle: {
      fontSize: 20,
      fontWeight: '900',
      color: '#17221D',
    },

    pageSubtitle: {
      fontSize: 9.5,
      color: '#89958F',
      fontWeight: '500',
      marginTop: 2,
    },

    headerCount: {
      minWidth: 48,
      height: 42,
      borderRadius: 12,
      backgroundColor:
        '#F7FAF8',
      borderWidth: 1,
      borderColor:
        '#DDE7E2',
      alignItems: 'center',
      justifyContent:
        'center',
      marginLeft: 8,
    },

    headerCountValue: {
      fontSize: 14,
      fontWeight: '900',
      lineHeight: 16,
      color: '#059669',
    },

    headerCountLabel: {
      fontSize: 6.5,
      fontWeight: '900',
      color: '#98A49F',
      letterSpacing: 0.7,
    },

    /* ===================================
       TABS
    =================================== */

    tabBar: {
      backgroundColor:
        '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor:
        '#E8EEEB',
      paddingVertical: 10,
    },

    tabContent: {
      paddingHorizontal: 15,
    },

    tabItem: {
      minHeight: 36,
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor:
        '#F4F6F5',
      marginRight: 7,
      borderWidth: 1,
      borderColor:
        '#E1E7E4',
      justifyContent:
        'center',
      alignItems: 'center',
    },

    tabItemActive: {
      backgroundColor:
        '#059669',
      borderColor:
        '#059669',
      shadowColor:
        '#059669',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity:
        0.13,
      shadowRadius: 4,
      elevation: 2,
    },

    tabText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#737F79',
    },

    tabTextActive: {
      color: '#FFFFFF',
      fontWeight: '900',
    },

    /* ===================================
       LOADING
    =================================== */

    centerContainer: {
      flex: 1,
      justifyContent:
        'center',
      alignItems: 'center',
      backgroundColor:
        '#F4F7F5',
    },

    loadingCard: {
      alignItems: 'center',
      justifyContent:
        'center',
      padding: 28,
    },

    loadingIcon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor:
        '#EAF8F2',
      alignItems: 'center',
      justifyContent:
        'center',
      marginBottom: 13,
    },

    loadingText: {
      marginTop: 11,
      fontSize: 14,
      fontWeight: '900',
      color: '#26342E',
    },

    loadingSubtext: {
      marginTop: 4,
      fontSize: 10.5,
      color: '#98A49E',
      fontWeight: '500',
    },

    /* ===================================
       LIST
    =================================== */

    listContainer: {
      paddingHorizontal: 15,
      paddingTop: 14,
      paddingBottom: 100,
    },

    /* ===================================
       SUMMARY
    =================================== */

    summaryCard: {
      backgroundColor:
        '#087F5B',
      borderRadius: 21,
      padding: 17,
      marginBottom: 15,
      overflow: 'hidden',

      shadowColor:
        '#047857',
      shadowOffset: {
        width: 0,
        height: 5,
      },
      shadowOpacity:
        0.15,
      shadowRadius: 10,
      elevation: 4,
    },

    summaryHeader: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },

    summaryEyebrow: {
      fontSize: 7.5,
      fontWeight: '900',
      color: '#A7E8D3',
      letterSpacing: 0.9,
      marginBottom: 2,
    },

    summaryTitle: {
      fontSize: 17,
      fontWeight: '900',
      color: '#FFFFFF',
    },

    summarySubtitle: {
      fontSize: 10.5,
      color: '#C9F4E4',
      marginTop: 2,
      fontWeight: '500',
    },

    summaryHeaderIcon: {
      width: 39,
      height: 39,
      borderRadius: 12,
      backgroundColor:
        'rgba(255,255,255,0.14)',
      alignItems: 'center',
      justifyContent:
        'center',
    },

    summaryStats: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    summaryBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
    },

    summaryStatText: {
      flex: 1,
    },

    summaryIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor:
        'rgba(255,255,255,0.14)',
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 8,
    },

    summaryDivider: {
      width: 1,
      height: 43,
      backgroundColor:
        'rgba(255,255,255,0.22)',
      marginHorizontal: 11,
    },

    summaryLabel: {
      fontSize: 8,
      color: '#BCEAD9',
      fontWeight: '800',
      letterSpacing: 0.45,
      marginBottom: 3,
    },

    summaryValue: {
      fontSize: 19,
      fontWeight: '900',
      color: '#FFFFFF',
    },

    summaryFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 15,
      paddingTop: 11,
      borderTopWidth: 1,
      borderTopColor:
        'rgba(255,255,255,0.14)',
    },

    summaryFooterIcon: {
      width: 24,
      height: 24,
      borderRadius: 7,
      backgroundColor:
        'rgba(255,255,255,0.10)',
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 6,
    },

    summaryFooterText: {
      flex: 1,
      fontSize: 9.5,
      color: '#C8F2E3',
      fontWeight: '600',
    },

    /* ===================================
       CARD
    =================================== */

    card: {
      position: 'relative',
      backgroundColor:
        '#FFFFFF',
      borderRadius: 19,
      padding: 15,
      marginBottom: 13,
      borderWidth: 1,
      borderColor:
        '#E1E8E4',
      overflow: 'hidden',

      shadowColor:
        '#10372B',
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity:
        0.05,
      shadowRadius: 8,
      elevation: 2,
    },

    cardTopLine: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      backgroundColor:
        '#059669',
    },

    /* ===================================
       CARD HEADER
    =================================== */

    cardHeader: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
      marginBottom: 13,
    },

    jobTypeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor:
        '#F0FAF5',
      borderRadius: 11,
      paddingHorizontal: 8,
      paddingVertical: 6,
      maxWidth: '63%',
    },

    jobTypeIcon: {
      width: 27,
      height: 27,
      borderRadius: 8,
      backgroundColor:
        '#DDF4E9',
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 7,
    },

    jobTypeTextWrap: {
      flex: 1,
    },

    jobTypeLabel: {
      fontSize: 7,
      fontWeight: '900',
      color: '#91A09A',
      letterSpacing: 0.7,
      marginBottom: 1,
    },

    jobTypeText: {
      fontSize: 11.5,
      fontWeight: '900',
      color: '#087F5B',
    },

    payoutArea: {
      alignItems: 'flex-end',
      marginLeft: 8,
    },

    payoutLabel: {
      fontSize: 7,
      fontWeight: '900',
      color: '#9AA49F',
      letterSpacing: 0.7,
      marginBottom: 1,
    },

    payoutText: {
      fontSize: 18,
      fontWeight: '900',
      color: '#047857',
    },

    /* ===================================
       CUSTOMER
    =================================== */

    customerSection: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor:
        '#EEF2F0',
    },

    customerIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor:
        '#EAF8F2',
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 9,
    },

    customerTextContainer: {
      flex: 1,
    },

    customerLabel: {
      fontSize: 7.5,
      fontWeight: '900',
      color: '#9AA6A1',
      letterSpacing: 0.7,
      marginBottom: 2,
    },

    customerNameCardText: {
      fontSize: 14,
      fontWeight: '900',
      color: '#1C2823',
    },

    customerArrow: {
      width: 28,
      height: 28,
      borderRadius: 9,
      backgroundColor:
        '#F5F7F6',
      alignItems: 'center',
      justifyContent:
        'center',
      marginLeft: 7,
    },

    /* ===================================
       DESCRIPTION
    =================================== */

    descriptionContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor:
        '#F7FAF8',
      borderRadius: 12,
      padding: 10,
      marginTop: 10,
      marginBottom: 9,
      borderWidth: 1,
      borderColor:
        '#EDF2EF',
    },

    descriptionIcon: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor:
        '#EAF8F2',
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 8,
    },

    descriptionContent: {
      flex: 1,
    },

    descriptionLabel: {
      fontSize: 7.5,
      fontWeight: '900',
      color: '#98A49F',
      letterSpacing: 0.65,
      marginBottom: 2,
    },

    itemTitle: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#34433D',
      lineHeight: 18,
    },

    /* ===================================
       COST
    =================================== */

    cardMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginBottom: 9,
    },

    cardCostPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor:
        '#FFF8E8',
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        '#FDE4A6',
      marginBottom: 3,
      marginRight: 5,
    },

    cardCostText: {
      fontSize: 10,
      fontWeight: '900',
      color: '#92400E',
      marginLeft: 5,
    },

    collectPill: {
      backgroundColor:
        '#EFF6FF',
      borderColor:
        '#BFDBFE',
    },

    collectText: {
      color: '#1D4ED8',
    },

    /* ===================================
       ROUTE
    =================================== */

    routeContainer: {
      backgroundColor:
        '#F8FAF9',
      padding: 11,
      borderRadius: 14,
      marginBottom: 11,
      borderWidth: 1,
      borderColor:
        '#E9EFEC',
    },

    routeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor:
        '#E8EEEB',
      marginBottom: 8,
    },

    routeHeaderIcon: {
      width: 25,
      height: 25,
      borderRadius: 7,
      backgroundColor:
        '#EAF8F2',
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 6,
    },

    routeHeaderText: {
      fontSize: 7.5,
      fontWeight: '900',
      color: '#7B8781',
      letterSpacing: 0.8,
    },

    routePointRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      minHeight: 39,
    },

    timelineColumn: {
      width: 28,
      alignItems: 'center',
    },

    routeMarker: {
      width: 27,
      height: 27,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent:
        'center',
      zIndex: 2,
    },

    pickupMarker: {
      backgroundColor:
        '#DCFCE7',
    },

    dropoffMarker: {
      backgroundColor:
        '#FEE2E2',
    },

    timelineLine: {
      position: 'absolute',
      top: 27,
      width: 1.5,
      bottom: -5,
      backgroundColor:
        '#CFE2D9',
    },

    addressTextContainer: {
      flex: 1,
      marginLeft: 8,
      paddingTop: 1,
      paddingBottom: 5,
    },

    routePointLabel: {
      fontSize: 7.5,
      fontWeight: '900',
      color: '#9AA6A1',
      letterSpacing: 0.7,
    },

    routePointValue: {
      fontSize: 11.5,
      color: '#26342E',
      fontWeight: '700',
      marginTop: 2,
      lineHeight: 17,
    },

    /* ===================================
       FOOTER
    =================================== */

    cardFooter: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor:
        '#EEF2F0',
    },

    footerLeft: {
      flex: 1,
      marginRight: 7,
    },

    badgeContainer: {
      alignSelf:
        'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 8,
      maxWidth:
        '100%',
    },

    badgeText: {
      fontSize: 9.5,
      fontWeight: '900',
      marginLeft: 5,
    },

    dateContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 5,
    },

    dateText: {
      fontSize: 9.5,
      color: '#9CA3AF',
      fontWeight: '600',
      marginLeft: 4,
    },

    viewDetailsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor:
        '#EAF8F2',
      borderRadius: 10,
      paddingLeft: 9,
      paddingRight: 5,
      paddingVertical: 4,
    },

    viewDetailsText: {
      fontSize: 10,
      color: '#059669',
      fontWeight: '900',
      marginRight: 6,
    },

    arrowCircle: {
      width: 23,
      height: 23,
      borderRadius: 8,
      backgroundColor:
        '#059669',
      alignItems: 'center',
      justifyContent:
        'center',
    },

    /* ===================================
       EMPTY
    =================================== */

    emptyContainer: {
      alignItems: 'center',
      justifyContent:
        'center',
      paddingHorizontal: 25,
      paddingTop: 38,
      paddingBottom: 35,
    },

    emptyIconBg: {
      width: 82,
      height: 82,
      borderRadius: 25,
      backgroundColor:
        '#EAF8F2',
      borderWidth: 1,
      borderColor:
        '#CFEADF',
      alignItems: 'center',
      justifyContent:
        'center',
      marginBottom: 16,
    },

    emptyTitle: {
      fontSize: 17,
      fontWeight: '900',
      color: '#202C27',
      marginBottom: 6,
      textAlign: 'center',
    },

    emptySub: {
      fontSize: 11.5,
      color: '#89958F',
      textAlign: 'center',
      lineHeight: 18,
      fontWeight: '500',
      maxWidth: 320,
    },
  });