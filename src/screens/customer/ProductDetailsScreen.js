import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  memo,
} from 'react';

import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  Image,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
  Animated,
  Modal,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';

const GREEN = '#059669';
const DARK_GREEN = '#047857';
const LIGHT_GREEN = '#ECFDF5';
const BACKGROUND = '#F7F9F8';

// ============================================================
// MODERN POPUP
// ============================================================

const ModernPopup = memo(
  ({
    visible,
    type = 'info',
    title,
    message,
    primaryText = 'OK',
    secondaryText = null,
    onPrimary,
    onSecondary,
  }) => {
    const palette = {
      success: {
        icon: 'checkmark-circle',
        color: '#059669',
        soft: '#ECFDF5',
        border: '#A7F3D0',
        label: 'SUCCESS',
      },
      error: {
        icon: 'alert-circle',
        color: '#DC2626',
        soft: '#FEF2F2',
        border: '#FECACA',
        label: 'ERROR',
      },
      warning: {
        icon: 'warning',
        color: '#D97706',
        soft: '#FFFBEB',
        border: '#FDE68A',
        label: 'NOTICE',
      },
      info: {
        icon: 'information-circle',
        color: '#059669', // Changed from Blue to Brand Green
        soft: '#ECFDF5',  // Changed from Soft Blue to Light Green
        border: '#A7F3D0', // Changed to matching green border
        label: 'NOTICE',
      },
    };
          
    const current = palette[type] || palette.info;

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={onSecondary || onPrimary}
      >
        <View style={popupStyles.popupOverlay}>
          <View style={popupStyles.popupCard}>
            <View
              style={[
                popupStyles.popupAccent,
                { backgroundColor: current.color },
              ]}
            />
            <View
              style={[
                popupStyles.popupIconCircle,
                {
                  backgroundColor: current.soft,
                  borderColor: current.border,
                },
              ]}
            >
              <Ionicons
                name={current.icon}
                size={29}
                color={current.color}
              />
            </View>
            <Text
              style={[
                popupStyles.popupEyebrow,
                { color: current.color },
              ]}
            >
              {current.label}
            </Text>
            <Text
              style={popupStyles.popupTitle}
              numberOfLines={2}
            >
              {title}
            </Text>
            <Text style={popupStyles.popupMessage}>
              {message}
            </Text>
            <View style={popupStyles.popupButtons}>
              {secondaryText ? (
                <TouchableOpacity
                  style={popupStyles.popupSecondaryButton}
                  onPress={onSecondary}
                  activeOpacity={0.85}
                >
                  <Text style={popupStyles.popupSecondaryText}>
                    {secondaryText}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  popupStyles.popupPrimaryButton,
                  {
                    backgroundColor: current.color,
                  },
                  !secondaryText &&
                    popupStyles.popupPrimaryButtonSingle,
                ]}
                onPress={onPrimary}
                activeOpacity={0.85}
              >
                <Text style={popupStyles.popupPrimaryText}>
                  {primaryText}
                </Text>
                <Ionicons
                  name={
                    secondaryText
                      ? 'arrow-forward'
                      : 'checkmark'
                  }
                  size={17}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }
);


export default function ProductDetailsScreen({
  route,
  navigation,
}) {
  const { product } = route.params || {};
  const { addToCart } = useCart();
  const { user, profile } = useAuth();

  const [quantity, setQuantity] = useState(1);

  // ── NEW STATE — customer verification status ─────────────
  const [
    verificationStatus,
    setVerificationStatus,
  ] = useState('unverified');
  // 'unverified' | 'pending' | 'rejected' | 'verified'

  const imageOpacity = useRef(
    new Animated.Value(0)
  ).current;

  const imageScale = useRef(
    new Animated.Value(1.04)
  ).current;

  const contentOpacity = useRef(
    new Animated.Value(0)
  ).current;

  const contentTranslate = useRef(
    new Animated.Value(20)
  ).current;

  const backScale = useRef(
    new Animated.Value(1)
  ).current;

  const minusScale = useRef(
    new Animated.Value(1)
  ).current;

  const plusScale = useRef(
    new Animated.Value(1)
  ).current;

  const cartScale = useRef(
    new Animated.Value(1)
  ).current;

  const checkoutScale = useRef(
    new Animated.Value(1)
  ).current;

  // Modern Popup State
  const [popup, setPopup] = useState({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    primaryText: 'OK',
    secondaryText: null,
    onPrimary: null,
    onSecondary: null,
  });

  const showPopup = useCallback(
    ({
      type = 'info',
      title,
      message,
      primaryText = 'OK',
      secondaryText = null,
      onPrimary = null,
      onSecondary = null,
    }) => {
      setPopup({
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

  const closePopup = useCallback(() => {
    setPopup((current) => ({
      ...current,
      visible: false,
      onPrimary: null,
      onSecondary: null,
    }));
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(imageOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),

      Animated.timing(imageScale, {
        toValue: 1,
        duration: 650,
        useNativeDriver: true,
      }),

      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 450,
        delay: 120,
        useNativeDriver: true,
      }),

      Animated.spring(contentTranslate, {
        toValue: 0,
        delay: 120,
        friction: 8,
        tension: 65,
        useNativeDriver: true,
      }),
    ]).start();
  }, [
    imageOpacity,
    imageScale,
    contentOpacity,
    contentTranslate,
  ]);

  // ── NEW EFFECT — fetch customer verification status ──────
  useEffect(() => {
    const fetchVerificationStatus = async () => {
      const currentUserId = user?.id || profile?.id;

      if (!currentUserId) {
        return;
      }

      try {
        const { data, error } = await supabase
          .from('customer_verifications')
          .select('is_verified, verification_status')
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (error) {
          console.log(
            'Verification status fetch error:',
            error
          );
          return;
        }

        if (!data) {
          setVerificationStatus('unverified');
        } else if (data.is_verified) {
          setVerificationStatus('verified');
        } else {
          setVerificationStatus(
            data.verification_status || 'pending'
          );
        }
      } catch (error) {
        console.log(
          'Fetch verification status error:',
          error
        );
      }
    };

    fetchVerificationStatus();
  }, [user?.id, profile?.id]);

  if (!product) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <View style={styles.errorIcon}>
          <Ionicons
            name="alert-circle-outline"
            size={38}
            color={GREEN}
          />
        </View>

        <Text style={styles.errorTitle}>
          Product not available
        </Text>

        <Text style={styles.errorText}>
          We couldn't load this product.
          Please go back and try again.
        </Text>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.errorBtn}
          activeOpacity={0.85}
        >
          <Ionicons
            name="arrow-back"
            size={17}
            color="#FFFFFF"
          />

          <Text style={styles.errorBtnText}>
            Go Back
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const incrementQuantity = () =>
    setQuantity((prev) => prev + 1);

  const decrementQuantity = () => {
    if (quantity > 1) {
      setQuantity((prev) => prev - 1);
    }
  };

  const unitPrice =
    parseFloat(product.price) || 0;

  const totalPrice = (
    unitPrice * quantity
  ).toFixed(2);

  const handleAddToCart = () => {
    addToCart(product, quantity);

    showPopup({
      type: 'success',
      title: 'Added to Cart',
      message: `Added ${quantity}x "${product.name}" (₱${totalPrice}) to your cart!`,
      primaryText: 'View Cart',
      secondaryText: 'Keep Shopping',
      onPrimary: () => {
        closePopup();
        navigation.navigate('Cart');
      },
      onSecondary: () => {
        closePopup();
        navigation.goBack();
      }
    });
  };

  // ── UPDATED — checkout now gated by verification status ──
  const handleProceedCheckout = () => {
    if (verificationStatus !== 'verified') {
      const isPending = verificationStatus === 'pending';

      showPopup({
        type: 'warning',
        title: isPending ? 'Verification Pending' : 'Verify Your Account',
        message: isPending
          ? 'Your ID is currently under review. You will be able to check out once your account is approved.'
          : 'You need to verify your account with a valid ID before you can check out.',
        primaryText: isPending ? 'Close' : 'Verify Now',
        secondaryText: isPending ? null : 'Not Now',
        onPrimary: () => {
          closePopup();
          if (!isPending) {
            navigation.navigate('CustomerVerification');
          }
        },
        onSecondary: closePopup
      });

      return;
    }

    const itemsToCheckout = [
      {
        ...product,
        quantity: quantity,
      },
    ];

    navigation.navigate('Checkout', {
      itemsToCheckout,
    });
  };

  const animateButton = (
    animatedValue
  ) => {
    Animated.sequence([
      Animated.spring(animatedValue, {
        toValue: 0.93,
        friction: 7,
        tension: 130,
        useNativeDriver: true,
      }),

      Animated.spring(animatedValue, {
        toValue: 1,
        friction: 7,
        tension: 110,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // ✨ NEW: Safely get the store name if joined via Supabase
  const storeName = product?.stores?.name || product?.store_name || 'Store Partner';

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
        translucent={false}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          styles.scrollContent
        }
      >
        {/* PRODUCT IMAGE */}
        <Animated.View
          style={[
            styles.imageContainer,
            {
              opacity: imageOpacity,
            },
          ]}
        >
          <Animated.View
            style={{
              flex: 1,
              transform: [
                {
                  scale: imageScale,
                },
              ],
            }}
          >
            {product.image_url ? (
              <Image
                source={{
                  uri: product.image_url,
                }}
                style={styles.productImage}
              />
            ) : (
              <View
                style={
                  styles.placeholderImage
                }
              >
                <View
                  style={
                    styles.placeholderCircle
                  }
                >
                  <Ionicons
                    name="fast-food-outline"
                    size={60}
                    color={GREEN}
                  />
                </View>

                <Text
                  style={
                    styles.placeholderText
                  }
                >
                  Product Image
                </Text>
              </View>
            )}
          </Animated.View>

          {/* IMAGE OVERLAY */}
          <Animated.View
            style={styles.imageOverlayBottom}
          >
            <LinearGradient
              colors={[
                'transparent',
                'rgba(0,0,0,0.30)',
              ]}
              start={{
                x: 0,
                y: 0,
              }}
              end={{
                x: 0,
                y: 1,
              }}
              style={
                StyleSheet.absoluteFillObject
              }
            />
          </Animated.View>

          {/* BACK BUTTON */}
          <Animated.View
            style={[
              styles.floatingBackWrapper,
              {
                transform: [
                  {
                    scale: backScale,
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity
              style={
                styles.floatingBackBtn
              }
              onPress={() =>
                navigation.goBack()
              }
              onPressIn={() => {
                Animated.spring(backScale, {
                  toValue: 0.9,
                  friction: 7,
                  tension: 130,
                  useNativeDriver: true,
                }).start();
              }}
              onPressOut={() => {
                Animated.spring(backScale, {
                  toValue: 1,
                  friction: 7,
                  tension: 100,
                  useNativeDriver: true,
                }).start();
              }}
              activeOpacity={0.9}
            >
              <Ionicons
                name="arrow-back"
                size={21}
                color="#111827"
              />
            </TouchableOpacity>
          </Animated.View>

          {/* AVAILABLE BADGE */}
          <View
            style={styles.availableBadge}
          >
            <View
              style={styles.availableDot}
            />

            <Text
              style={styles.availableText}
            >
              Available
            </Text>
          </View>
        </Animated.View>

        {/* PRODUCT INFORMATION */}
        <Animated.View
          style={[
            styles.detailsCard,
            {
              opacity: contentOpacity,
              transform: [
                {
                  translateY:
                    contentTranslate,
                },
              ],
            },
          ]}
        >
          {/* CATEGORY */}
          <View
            style={styles.categoryBadge}
          >
            <Ionicons
              name="restaurant-outline"
              size={12}
              color={GREEN}
            />

            <Text
              style={styles.categoryText}
              numberOfLines={1}
            >
              {product.category ||
                'General'}
            </Text>
          </View>

          {/* PRODUCT NAME */}
          <Text
            style={styles.productName}
            numberOfLines={3}
          >
            {product.name}
          </Text>

          {/* ✨ NEW: Store Name Row */}
          <View style={styles.storeNameRow}>
            <Ionicons name="storefront-outline" size={14} color="#9CA3AF" />
            <Text style={styles.storeNameText} numberOfLines={1}>
              {storeName}
            </Text>
          </View>

          {/* PRICE */}
          <Text
            style={styles.productPrice}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            ₱{product.price}
          </Text>

          <View
            style={styles.priceHintRow}
          >
            <Ionicons
              name="checkmark-circle"
              size={13}
              color={GREEN}
            />

            <Text
              style={styles.priceHint}
            >
              Available for local delivery
            </Text>
          </View>

          <View style={styles.divider} />

          {/* DESCRIPTION */}
          <View
            style={styles.sectionHeader}
          >
            <View
              style={styles.sectionIcon}
            >
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={GREEN}
              />
            </View>

            <Text
              style={styles.sectionTitle}
            >
              Description
            </Text>
          </View>

          <Text
            style={styles.descriptionText}
          >
            {product.item_description ||
              product.description ||
              'Freshly prepared and made to order. Available for local delivery.'}
          </Text>

          <View style={styles.divider} />

          {/* QUANTITY */}
          <View
            style={styles.quantityRow}
          >
            <View
              style={
                styles.quantityTextContainer
              }
            >
              <View
                style={styles.sectionHeader}
              >
                <View
                  style={styles.sectionIcon}
                >
                  <Ionicons
                    name="layers-outline"
                    size={16}
                    color={GREEN}
                  />
                </View>

                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Quantity
                </Text>
              </View>

              <Text
                style={
                  styles.quantitySubtitle
                }
              >
                Choose how many you want
              </Text>
            </View>

            <View
              style={
                styles.quantityControls
              }
            >
              <Animated.View
                style={{
                  transform: [
                    {
                      scale: minusScale,
                    },
                  ],
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.qtyBtn,
                    quantity === 1 &&
                      styles.qtyBtnDisabled,
                  ]}
                  onPress={() => {
                    animateButton(
                      minusScale
                    );
                    decrementQuantity();
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="remove"
                    size={18}
                    color={
                      quantity === 1
                        ? '#B8C0BC'
                        : '#111827'
                    }
                  />
                </TouchableOpacity>
              </Animated.View>

              <Text
                style={styles.qtyText}
              >
                {quantity}
              </Text>

              <Animated.View
                style={{
                  transform: [
                    {
                      scale: plusScale,
                    },
                  ],
                }}
              >
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => {
                    animateButton(
                      plusScale
                    );
                    incrementQuantity();
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="add"
                    size={18}
                    color={GREEN}
                  />
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>

          {/* ORDER SUMMARY */}
          <View
            style={styles.summaryCard}
          >
            <View
              style={styles.summaryHeader}
            >
              <View>
                <Text
                  style={
                    styles.summaryTitle
                  }
                >
                  Order Summary
                </Text>

                <Text
                  style={
                    styles.summarySubtitle
                  }
                >
                  Your selected item
                </Text>
              </View>

              <View
                style={styles.summaryIcon}
              >
                <Ionicons
                  name="receipt-outline"
                  size={17}
                  color={GREEN}
                />
              </View>
            </View>

            <View
              style={styles.summaryRow}
            >
              <Text
                style={styles.summaryLabel}
              >
                Price
              </Text>

              <Text
                style={styles.summaryValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                ₱{unitPrice.toFixed(2)}
              </Text>
            </View>

            <View
              style={styles.summaryRow}
            >
              <Text
                style={styles.summaryLabel}
              >
                Quantity
              </Text>

              <Text
                style={styles.summaryValue}
              >
                {quantity}
              </Text>
            </View>

            <View
              style={styles.summaryDivider}
            />

            <View
              style={styles.summaryRow}
            >
              <Text
                style={
                  styles.summaryTotalLabel
                }
              >
                Total
              </Text>

              <Text
                style={styles.summaryTotal}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                ₱{totalPrice}
              </Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>

      {/* BOTTOM ACTION BAR */}
      <SafeAreaView
        style={styles.bottomBarWrapper}
      >
        <View
          style={styles.bottomBar}
        >
          <View
            style={styles.priceContainer}
          >
            <Text
              style={styles.totalLabel}
            >
              Total
            </Text>

            <Text
              style={styles.totalPrice}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.55}
            >
              ₱{totalPrice}
            </Text>
          </View>

          <View
            style={styles.actionButtonsRow}
          >
            {/* ADD TO CART */}
            <Animated.View
              style={{
                transform: [
                  {
                    scale: cartScale,
                  },
                ],
              }}
            >
              <TouchableOpacity
                style={
                  styles.addToCartBtn
                }
                onPress={() => {
                  animateButton(
                    cartScale
                  );
                  handleAddToCart();
                }}
                activeOpacity={0.9}
              >
                <Ionicons
                  name="basket-outline"
                  size={18}
                  color={GREEN}
                />

                <Text
                  style={
                    styles.addToCartBtnText
                  }
                >
                  Add to Cart
                </Text>
              </TouchableOpacity>
            </Animated.View>

            {/* CHECKOUT */}
            <Animated.View
              style={{
                transform: [
                  {
                    scale:
                      checkoutScale,
                  },
                ],
              }}
            >
              <TouchableOpacity
                style={
                  styles.checkoutBtn
                }
                onPress={() => {
                  animateButton(
                    checkoutScale
                  );
                  handleProceedCheckout();
                }}
                activeOpacity={0.9}
              >
                <Text
                  style={
                    styles.checkoutBtnText
                  }
                >
                  Checkout
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color="#FFFFFF"
                  style={
                    styles.checkoutIcon
                  }
                />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </SafeAreaView>

      <ModernPopup
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        primaryText={popup.primaryText}
        secondaryText={popup.secondaryText}
        onPrimary={popup.onPrimary || closePopup}
        onSecondary={popup.onSecondary || closePopup}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },

  scrollContent: {
    paddingBottom: 155,
  },

  /* PRODUCT IMAGE */

  imageContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#EEF1EF',
    position: 'relative',
    overflow: 'hidden',
  },

  productImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  placeholderImage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
  },

  placeholderCircle: {
    width: 92,
    height: 92,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },

  placeholderText: {
    fontSize: 11,
    fontWeight: '700',
    color: GREEN,
    marginTop: 10,
  },

  imageOverlayBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 95,
  },

  floatingBackWrapper: {
    position: 'absolute',
    top:
      Platform.OS === 'android'
        ? 16
        : 12,
    left: 16,
    zIndex: 5,
  },

  floatingBackBtn: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 5,
  },

  availableBadge: {
    position: 'absolute',
    right: 16,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor:
      'rgba(4,120,87,0.90)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    zIndex: 4,
  },

  availableDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#A7F3D0',
    marginRight: 6,
  },

  availableText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  /* DETAILS */

  detailsCard: {
    backgroundColor: '#FFFFFF',
    marginTop: -19,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 19,
    paddingTop: 21,
    paddingBottom: 27,
    zIndex: 2,
  },

  categoryBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },

  categoryText: {
    color: DARK_GREEN,
    fontSize: 9.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    marginLeft: 5,
  },

  productName: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.45,
  },

  /* ✨ NEW STORE ROW STYLES ✨ */
  storeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 2,
  },

  storeNameText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 5,
    flex: 1,
  },

  productPrice: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    color: GREEN,
    marginTop: 8,
  },

  priceHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },

  priceHint: {
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 5,
  },

  divider: {
    height: 1,
    backgroundColor: '#EEF1EF',
    marginVertical: 18,
  },

  /* SECTION */

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },

  sectionIcon: {
    width: 29,
    height: 29,
    borderRadius: 9,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1F2937',
  },

  descriptionText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 21,
    paddingLeft: 1,
  },

  /* QUANTITY */

  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  quantityTextContainer: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },

  quantitySubtitle: {
    fontSize: 11,
    lineHeight: 16,
    color: '#9CA3AF',
    marginTop: -1,
  },

  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F5F4',
    borderRadius: 12,
    padding: 4,
    marginLeft: 8,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#E5EAE7',
  },

  qtyBtn: {
    width: 37,
    height: 37,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  qtyBtnDisabled: {
    backgroundColor: '#F8F9F8',
  },

  qtyText: {
    minWidth: 38,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },

  /* SUMMARY */

  summaryCard: {
    backgroundColor: '#F7F9F8',
    borderWidth: 1,
    borderColor: '#E5EBE7',
    borderRadius: 15,
    padding: 14,
    marginTop: 21,
  },

  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  summaryTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1F2937',
  },

  summarySubtitle: {
    fontSize: 9.5,
    color: '#9CA3AF',
    fontWeight: '600',
    marginTop: 2,
  },

  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
  },

  summaryLabel: {
    flexShrink: 0,
    fontSize: 12,
    color: '#6B7280',
  },

  summaryValue: {
    flexShrink: 1,
    maxWidth: '65%',
    textAlign: 'right',
    fontSize: 12,
    color: '#374151',
    fontWeight: '700',
  },

  summaryDivider: {
    height: 1,
    backgroundColor: '#E1E7E3',
    marginVertical: 9,
  },

  summaryTotalLabel: {
    flexShrink: 0,
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
  },

  summaryTotal: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    marginLeft: 15,
    fontSize: 18,
    fontWeight: '900',
    color: GREEN,
  },

  /* BOTTOM BAR */

  bottomBarWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8EDE9',

    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: -3,
    },
    shadowOpacity: 0.08,
    shadowRadius: 7,

    elevation: 10,
  },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom:
      Platform.OS === 'android'
        ? 10
        : 6,
  },

  priceContainer: {
    flex: 1,
    minWidth: 0,
    marginRight: 9,
  },

  totalLabel: {
    fontSize: 9.5,
    color: '#8A938E',
    fontWeight: '600',
    marginBottom: 1,
  },

  totalPrice: {
    width: '100%',
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
    color: '#111827',
  },

  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },

  addToCartBtn: {
    height: 45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LIGHT_GREEN,
    borderWidth: 1,
    borderColor: GREEN,
    borderRadius: 11,
    paddingHorizontal: 11,
    marginRight: 7,
    flexShrink: 1,
  },

  addToCartBtnText: {
    color: GREEN,
    fontSize: 11.5,
    fontWeight: '800',
    marginLeft: 5,
    flexShrink: 1,
  },

  checkoutBtn: {
    height: 45,
    minWidth: 94,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GREEN,
    borderRadius: 11,
    paddingHorizontal: 14,
    flexShrink: 0,

    shadowColor: GREEN,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.17,
    shadowRadius: 5,
    elevation: 3,
  },

  checkoutBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  checkoutIcon: {
    marginLeft: 6,
  },

  /* ERROR */

  errorContainer: {
    flex: 1,
    backgroundColor: BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 35,
  },

  errorIcon: {
    width: 74,
    height: 74,
    borderRadius: 23,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },

  errorTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },

  errorText: {
    fontSize: 12.5,
    lineHeight: 19,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
  },

  errorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GREEN,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 11,

    shadowColor: GREEN,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 2,
  },

  errorBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 6,
  },
});

// POPUP STYLES EXTRACTED FOR CLARITY
const popupStyles = StyleSheet.create({
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  popupCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 20,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 14,
  },
  popupAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
  },
  popupIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  popupEyebrow: {
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 1.25,
    marginBottom: 6,
  },
  popupTitle: {
    width: '100%',
    fontSize: 21,
    lineHeight: 27,
    color: '#0F172A',
    fontWeight: '900',
    textAlign: 'center',
  },
  popupMessage: {
    width: '100%',
    maxWidth: 330,
    fontSize: 12,
    lineHeight: 19,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 9,
  },
  popupButtons: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  popupSecondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  popupSecondaryText: {
    color: '#475569',
    fontSize: 11.5,
    fontWeight: '900',
  },
  popupPrimaryButton: {
    flex: 1.3,
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
  },
  popupPrimaryButtonSingle: {
    flex: 1,
  },
  popupPrimaryText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '900',
  },
});