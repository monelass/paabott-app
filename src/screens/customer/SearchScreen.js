import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Keyboard,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../config/supabase';

const PRIMARY_GREEN = '#059669';
const DARK_GREEN = '#047857';

export default function SearchScreen({
  navigation,
}) {
  const inputRef = useRef(null);

  const [searchQuery, setSearchQuery] =
    useState('');

  const [products, setProducts] =
    useState([]);

  const [stores, setStores] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    loadSearchData();

    setTimeout(() => {
      inputRef.current?.focus();
    }, 250);
  }, []);

  const loadSearchData = async () => {
    try {
      setLoading(true);

      const [
        productsResult,
        storesResult,
      ] = await Promise.all([
        supabase
          .from('products')
          .select('*')
          .eq(
            'is_available',
            true
          )
          .order(
            'created_at',
            {
              ascending: false,
            }
          )
          .limit(50),

        supabase
          .from('stores')
          .select('*')
          .eq(
            'is_open',
            true
          )
          .limit(50),
      ]);

      if (!productsResult.error) {
        setProducts(
          productsResult.data || []
        );
      }

      if (!storesResult.error) {
        setStores(
          storesResult.data || []
        );
      }
    } catch (error) {
      console.error(
        'Search data error:',
        error
      );
    } finally {
      setLoading(false);
    }
  };

  const normalizedQuery =
    searchQuery
      .trim()
      .toLowerCase();

  const filteredProducts =
    useMemo(() => {
      if (!normalizedQuery) {
        return products;
      }

      return products.filter(
        (item) => {
          const name =
            item.name
              ?.toString()
              .toLowerCase() || '';

          const category =
            item.category
              ?.toString()
              .toLowerCase() || '';

          const description =
            item.item_description
              ?.toString()
              .toLowerCase() || '';

          return (
            name.includes(
              normalizedQuery
            ) ||
            category.includes(
              normalizedQuery
            ) ||
            description.includes(
              normalizedQuery
            )
          );
        }
      );
    }, [
      products,
      normalizedQuery,
    ]);

  const filteredStores =
    useMemo(() => {
      if (!normalizedQuery) {
        return stores;
      }

      return stores.filter(
        (store) => {
          const name =
            store.name
              ?.toString()
              .toLowerCase() || '';

          const address =
            store.address
              ?.toString()
              .toLowerCase() || '';

          return (
            name.includes(
              normalizedQuery
            ) ||
            address.includes(
              normalizedQuery
            )
          );
        }
      );
    }, [
      stores,
      normalizedQuery,
    ]);

  const clearSearch = () => {
    setSearchQuery('');
    inputRef.current?.focus();
  };

  const storeImage = (
    store
  ) => {
    return (
      store.image_pic ||
      store.image_url ||
      store.store_image ||
      store.banner_url
    );
  };

  if (loading) {
    return (
      <SafeAreaView
        style={styles.container}
      >
        <StatusBar
          barStyle="dark-content"
          backgroundColor="#FFFFFF"
        />

        <View
          style={
            styles.loadingHeader
          }
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() =>
              navigation.goBack()
            }
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color="#1F2937"
            />
          </TouchableOpacity>

          <Text
            style={
              styles.loadingHeaderTitle
            }
          >
            Search
          </Text>
        </View>

        <View
          style={styles.loadingContainer}
        >
          <ActivityIndicator
            size="large"
            color={PRIMARY_GREEN}
          />

          <Text
            style={
              styles.loadingTitle
            }
          >
            Ginapangita ta...
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Ginakuha pa namon ang
            available products kag stores.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.container}
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
      />

      {/* HEADER */}

      <View
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            Keyboard.dismiss();
            navigation.goBack();
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color="#1F2937"
          />
        </TouchableOpacity>

        <View
          style={
            styles.headerTitleWrap
          }
        >
          <Text
            style={styles.headerTitle}
          >
            Search
          </Text>

          <Text
            style={
              styles.headerSubtitle
            }
          >
            Pangitaon ta ang gusto mo
          </Text>
        </View>
      </View>

      {/* SEARCH FIELD */}

      <View
        style={styles.searchSection}
      >
        <View
          style={styles.searchBox}
        >
          <View
            style={
              styles.searchIcon
            }
          >
            <Ionicons
              name="search"
              size={20}
              color={PRIMARY_GREEN}
            />
          </View>

          <TextInput
            ref={inputRef}
            value={searchQuery}
            onChangeText={
              setSearchQuery
            }
            placeholder="Ano ang ginapangita mo?"
            placeholderTextColor="#9CA3AF"
            style={
              styles.input
            }
            autoCorrect={false}
            returnKeyType="search"
          />

          {searchQuery.length >
            0 && (
            <TouchableOpacity
              style={
                styles.clearButton
              }
              onPress={
                clearSearch
              }
            >
              <Ionicons
                name="close-circle"
                size={20}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={
          styles.scrollContent
        }
      >
        {/* RESULTS HEADER */}

        <View
          style={
            styles.resultHeader
          }
        >
          <View>
            <Text
              style={
                styles.resultTitle
              }
            >
              {normalizedQuery
                ? `Results for "${searchQuery}"`
                : 'Explore'}
            </Text>

            <Text
              style={
                styles.resultSubtitle
              }
            >
              {normalizedQuery
                ? 'Mga nakita namon nga bagay para sa imo'
                : 'Start typing to search'}
            </Text>
          </View>
        </View>

        {/* PRODUCTS */}

        <View
          style={styles.section}
        >
          <View
            style={
              styles.sectionHeader
            }
          >
            <View
              style={
                styles.sectionTitleRow
              }
            >
              <View
                style={
                  styles.productSectionIcon
                }
              >
                <Ionicons
                  name="fast-food-outline"
                  size={18}
                  color="#EA580C"
                />
              </View>

              <View>
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Products
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Mga pagkaon kag drinks
                </Text>
              </View>
            </View>

            <Text
              style={
                styles.countText
              }
            >
              {filteredProducts.length}
            </Text>
          </View>

          {filteredProducts.length ===
          0 ? (
            <View
              style={
                styles.emptyCard
              }
            >
              <Ionicons
                name="search-outline"
                size={27}
                color="#9CA3AF"
              />

              <Text
                style={
                  styles.emptyTitle
                }
              >
                Wala may product nga nakita
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                Try another word or category.
              </Text>
            </View>
          ) : (
            filteredProducts.map(
              (item) => (
                <TouchableOpacity
                  key={
                    item.id?.toString()
                  }
                  style={
                    styles.productResultCard
                  }
                  activeOpacity={0.85}
                  onPress={() =>
                    navigation.navigate(
                      'ProductDetails',
                      {
                        product:
                          item,
                      }
                    )
                  }
                >
                  {item.image_url ? (
                    <Image
                      source={{
                        uri: item.image_url,
                      }}
                      style={
                        styles.productResultImage
                      }
                    />
                  ) : (
                    <View
                      style={
                        styles.productResultFallback
                      }
                    >
                      <Ionicons
                        name="fast-food-outline"
                        size={24}
                        color="#A7F3D0"
                      />
                    </View>
                  )}

                  <View
                    style={
                      styles.resultInfo
                    }
                  >
                    <Text
                      style={
                        styles.resultItemName
                      }
                      numberOfLines={1}
                    >
                      {item.name ||
                        'Product'}
                    </Text>

                    <Text
                      style={
                        styles.resultItemCategory
                      }
                    >
                      {item.category ||
                        'Food'}
                    </Text>

                    {item.item_description ? (
                      <Text
                        style={
                          styles.resultItemDescription
                        }
                        numberOfLines={2}
                      >
                        {
                          item.item_description
                        }
                      </Text>
                    ) : null}

                    <Text
                      style={
                        styles.resultPrice
                      }
                    >
                      ₱
                      {parseFloat(
                        item.price ||
                          0
                      ).toFixed(2)}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.resultArrow
                    }
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={17}
                      color={
                        PRIMARY_GREEN
                      }
                    />
                  </View>
                </TouchableOpacity>
              )
            )
          )}
        </View>

        {/* STORES */}

        <View
          style={styles.section}
        >
          <View
            style={
              styles.sectionHeader
            }
          >
            <View
              style={
                styles.sectionTitleRow
              }
            >
              <View
                style={
                  styles.storeSectionIcon
                }
              >
                <Ionicons
                  name="storefront-outline"
                  size={18}
                  color="#059669"
                />
              </View>

              <View>
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Stores
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Mga local stores nga open
                </Text>
              </View>
            </View>

            <Text
              style={
                styles.countText
              }
            >
              {filteredStores.length}
            </Text>
          </View>

          {filteredStores.length ===
          0 ? (
            <View
              style={
                styles.emptyCard
              }
            >
              <Ionicons
                name="storefront-outline"
                size={27}
                color="#9CA3AF"
              />

              <Text
                style={
                  styles.emptyTitle
                }
              >
                Wala may store nga nakita
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                Try searching another store name.
              </Text>
            </View>
          ) : (
            filteredStores.map(
              (store) => (
                <TouchableOpacity
                  key={
                    store.id?.toString()
                  }
                  style={
                    styles.storeResultCard
                  }
                  activeOpacity={0.85}
                  onPress={() =>
                    navigation.navigate(
                      'StoreMenuScreen',
                      {
                        storeId:
                          store.id,
                        storeName:
                          store.name ||
                          'Store',
                      }
                    )
                  }
                >
                  {storeImage(
                    store
                  ) ? (
                    <Image
                      source={{
                        uri: storeImage(
                          store
                        ),
                      }}
                      style={
                        styles.storeResultImage
                      }
                    />
                  ) : (
                    <View
                      style={
                        styles.storeResultFallback
                      }
                    >
                      <Ionicons
                        name="storefront-outline"
                        size={25}
                        color={
                          PRIMARY_GREEN
                        }
                      />
                    </View>
                  )}

                  <View
                    style={
                      styles.resultInfo
                    }
                  >
                    <View
                      style={
                        styles.storeNameRow
                      }
                    >
                      <Text
                        style={
                          styles.resultItemName
                        }
                        numberOfLines={1}
                      >
                        {store.name ||
                          'Store'}
                      </Text>

                      <View
                        style={
                          styles.openMiniBadge
                        }
                      >
                        <View
                          style={
                            styles.openMiniDot
                          }
                        />

                        <Text
                          style={
                            styles.openMiniText
                          }
                        >
                          OPEN
                        </Text>
                      </View>
                    </View>

                    <View
                      style={
                        styles.addressRow
                      }
                    >
                      <Ionicons
                        name="location-outline"
                        size={13}
                        color="#9CA3AF"
                      />

                      <Text
                        style={
                          styles.addressText
                        }
                        numberOfLines={2}
                      >
                        {store.address ||
                          'Binalbagan, Negros Occidental'}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.storeMetaRow
                      }
                    >
                      <View
                        style={
                          styles.ratingBadge
                        }
                      >
                        <Ionicons
                          name="star"
                          size={10}
                          color="#D97706"
                        />

                        <Text
                          style={
                            styles.ratingText
                          }
                        >
                          4.9
                        </Text>
                      </View>

                      <Text
                        style={
                          styles.fastText
                        }
                      >
                        Fast delivery
                      </Text>
                    </View>
                  </View>

                  <View
                    style={
                      styles.resultArrow
                    }
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={17}
                      color={
                        PRIMARY_GREEN
                      }
                    />
                  </View>
                </TouchableOpacity>
              )
            )
          )}
        </View>

        <View
          style={
            styles.bottomSpace
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#F6F9F7',
    },

    header: {
      minHeight: 68,
      backgroundColor:
        '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor:
        '#E5E7EB',
      flexDirection:
        'row',
      alignItems:
        'center',
      paddingHorizontal: 15,
    },

    loadingHeader: {
      minHeight: 68,
      backgroundColor:
        '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor:
        '#E5E7EB',
      flexDirection:
        'row',
      alignItems:
        'center',
      paddingHorizontal: 15,
    },

    backButton: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor:
        '#F1F5F3',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    headerTitleWrap: {
      flex: 1,
      minWidth: 0,
      marginLeft: 11,
    },

    headerTitle: {
      fontSize: 18,
      fontWeight: '900',
      color: '#111827',
    },

    loadingHeaderTitle: {
      marginLeft: 11,
      fontSize: 18,
      fontWeight: '900',
      color: '#111827',
    },

    headerSubtitle: {
      marginTop: 2,
      fontSize: 10.5,
      color: '#7B857F',
      fontWeight: '600',
    },

    searchSection: {
      backgroundColor:
        '#FFFFFF',
      paddingHorizontal: 15,
      paddingTop: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor:
        '#E8EEEB',
    },

    searchBox: {
      height: 56,
      backgroundColor:
        '#F7FAF8',
      borderWidth: 1,
      borderColor:
        '#DCE7E1',
      borderRadius: 16,
      flexDirection:
        'row',
      alignItems:
        'center',
      paddingHorizontal: 8,
    },

    searchIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor:
        '#ECFDF5',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    input: {
      flex: 1,
      minWidth: 0,
      height: 50,
      marginLeft: 10,
      fontSize: 14,
      fontWeight: '600',
      color: '#111827',
    },

    clearButton: {
      width: 38,
      height: 38,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    scrollContent: {
      paddingHorizontal: 15,
      paddingTop: 18,
      paddingBottom: 30,
    },

    resultHeader: {
      marginBottom: 20,
    },

    resultTitle: {
      fontSize: 20,
      fontWeight: '900',
      color: '#111827',
    },

    resultSubtitle: {
      marginTop: 3,
      fontSize: 11,
      color: '#7B857F',
      lineHeight: 16,
    },

    section: {
      marginBottom: 25,
    },

    sectionHeader: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
      marginBottom: 11,
    },

    sectionTitleRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    productSectionIcon: {
      width: 38,
      height: 38,
      borderRadius: 11,
      backgroundColor:
        '#FFF7ED',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginRight: 9,
    },

    storeSectionIcon: {
      width: 38,
      height: 38,
      borderRadius: 11,
      backgroundColor:
        '#ECFDF5',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginRight: 9,
    },

    sectionTitle: {
      fontSize: 17,
      fontWeight: '900',
      color: '#111827',
    },

    sectionSubtitle: {
      marginTop: 2,
      fontSize: 10.5,
      color: '#8A938E',
      fontWeight: '600',
    },

    countText: {
      minWidth: 28,
      textAlign: 'center',
      paddingHorizontal: 7,
      paddingVertical: 5,
      borderRadius: 9,
      backgroundColor:
        '#ECFDF5',
      color: PRIMARY_GREEN,
      fontSize: 10,
      fontWeight: '900',
    },

    productResultCard: {
      backgroundColor:
        '#FFFFFF',
      minHeight: 94,
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        '#E4EAE6',
      padding: 9,
      marginBottom: 9,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    productResultImage: {
      width: 76,
      height: 76,
      borderRadius: 12,
      backgroundColor:
        '#EEF2F0',
    },

    productResultFallback: {
      width: 76,
      height: 76,
      borderRadius: 12,
      backgroundColor:
        '#ECFDF5',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    resultInfo: {
      flex: 1,
      minWidth: 0,
      marginHorizontal: 10,
    },

    resultItemName: {
      fontSize: 14,
      fontWeight: '900',
      color: '#111827',
    },

    resultItemCategory: {
      marginTop: 2,
      fontSize: 10,
      color: PRIMARY_GREEN,
      fontWeight: '800',
    },

    resultItemDescription: {
      marginTop: 3,
      fontSize: 10,
      lineHeight: 14,
      color: '#7B857F',
    },

    resultPrice: {
      marginTop: 4,
      fontSize: 14,
      color: PRIMARY_GREEN,
      fontWeight: '900',
    },

    resultArrow: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor:
        '#ECFDF5',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    storeResultCard: {
      backgroundColor:
        '#FFFFFF',
      minHeight: 96,
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        '#E4EAE6',
      padding: 9,
      marginBottom: 9,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    storeResultImage: {
      width: 76,
      height: 76,
      borderRadius: 12,
      backgroundColor:
        '#EEF2F0',
    },

    storeResultFallback: {
      width: 76,
      height: 76,
      borderRadius: 12,
      backgroundColor:
        '#ECFDF5',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    storeNameRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      minWidth: 0,
    },

    openMiniBadge: {
      flexDirection:
        'row',
      alignItems:
        'center',
      backgroundColor:
        '#ECFDF5',
      borderRadius: 7,
      paddingHorizontal: 5,
      paddingVertical: 3,
      marginLeft: 6,
    },

    openMiniDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor:
        '#10B981',
      marginRight: 3,
    },

    openMiniText: {
      fontSize: 6.5,
      color: PRIMARY_GREEN,
      fontWeight: '900',
    },

    addressRow: {
      flexDirection:
        'row',
      alignItems:
        'flex-start',
      marginTop: 5,
    },

    addressText: {
      flex: 1,
      fontSize: 10,
      lineHeight: 14,
      color: '#6B7280',
      marginLeft: 4,
    },

    storeMetaRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      marginTop: 6,
    },

    ratingBadge: {
      flexDirection:
        'row',
      alignItems:
        'center',
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor:
        '#FEF3C7',
    },

    ratingText: {
      marginLeft: 3,
      fontSize: 9,
      fontWeight: '900',
      color: '#B45309',
    },

    fastText: {
      marginLeft: 7,
      fontSize: 9,
      fontWeight: '700',
      color: PRIMARY_GREEN,
    },

    emptyCard: {
      minHeight: 145,
      borderRadius: 16,
      backgroundColor:
        '#FFFFFF',
      borderWidth: 1,
      borderColor:
        '#E5E7EB',
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingHorizontal: 20,
    },

    emptyTitle: {
      marginTop: 9,
      fontSize: 13,
      fontWeight: '900',
      color: '#374151',
      textAlign: 'center',
    },

    emptyText: {
      marginTop: 3,
      fontSize: 10.5,
      color: '#9CA3AF',
      textAlign: 'center',
    },

    loadingContainer: {
      flex: 1,
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingHorizontal: 30,
    },

    loadingTitle: {
      marginTop: 13,
      fontSize: 15,
      fontWeight: '900',
      color: '#1F2937',
    },

    loadingText: {
      marginTop: 5,
      fontSize: 11,
      lineHeight: 17,
      color: '#8A938E',
      textAlign: 'center',
    },

    bottomSpace: {
      height: 20,
    },
  });