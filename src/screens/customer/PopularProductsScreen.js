import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  FlatList,
  Image,
  TouchableOpacity,
  StatusBar,
  Platform,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../config/supabase';
import { useCart } from '../../context/CartContext';

export default function PopularProductsScreen({ navigation }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const { addToCart } = useCart();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      // ✨ CHANGED: Added stores(name) to fetch the store name alongside the product
      const { data, error } = await supabase
        .from('products')
        .select('*, stores(name)')
        .eq('is_available', true)
        .order('created_at', { ascending: false });

      if (error) console.error(error.message);
      else if (data) setProducts(data);
    } catch (err) {
      console.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const categories = ['All', 'Meals', 'Drinks', 'Snacks', 'Desserts'];

  const filtered = products.filter((p) => {
    const matchesCat =
      category === 'All' ||
      p.category?.toLowerCase() === category.toLowerCase();

    const matchesQuery = p.name
      .toLowerCase()
      .includes(search.toLowerCase());

    return matchesCat && matchesQuery;
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.75}
        >
          <Ionicons
            name="arrow-back"
            size={21}
            color="#111827"
          />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Popular Items</Text>
          <Text style={styles.headerSubtitle}>
            Discover something delicious
          </Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      {/* Search & Categories */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <View style={styles.searchIconContainer}>
            <Ionicons
              name="search"
              size={17}
              color="#059669"
            />
          </View>

          <TextInput
            placeholder="Search dishes, drinks, snacks..."
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            placeholderTextColor="#9CA3AF"
            returnKeyType="search"
          />

          {search ? (
            <TouchableOpacity
              onPress={() => setSearch('')}
              style={styles.clearSearch}
              activeOpacity={0.7}
            >
              <Ionicons
                name="close-circle"
                size={19}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          ) : null}
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categories}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.categoryList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.chip,
                category === item && styles.chipActive,
              ]}
              onPress={() => setCategory(item)}
              activeOpacity={0.8}
            >
              {category === item && (
                <Ionicons
                  name="checkmark"
                  size={13}
                  color="#FFFFFF"
                  style={styles.chipIcon}
                />
              )}

              <Text
                style={[
                  styles.chipText,
                  category === item && styles.chipTextActive,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Results Header */}
      {!loading && (
        <View style={styles.resultsHeader}>
          <View>
            <Text style={styles.resultsTitle}>
              {category === 'All' ? 'Popular near you' : category}
            </Text>
            <Text style={styles.resultsSubtitle}>
              {filtered.length}{' '}
              {filtered.length === 1 ? 'item' : 'items'} available
            </Text>
          </View>

          <View style={styles.resultsIcon}>
            <Ionicons
              name="restaurant-outline"
              size={18}
              color="#059669"
            />
          </View>
        </View>
      )}

      {/* Products Grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <View style={styles.loadingCircle}>
            <ActivityIndicator
              size="small"
              color="#059669"
            />
          </View>
          <Text style={styles.loadingText}>
            Finding popular items...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          numColumns={2}
          keyExtractor={(item) => item.id.toString()}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="search-outline"
                  size={34}
                  color="#059669"
                />
              </View>

              <Text style={styles.emptyTitle}>
                No items found
              </Text>

              <Text style={styles.emptyDescription}>
                Try searching for something else or choose
                another category.
              </Text>

              {search ? (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={() => setSearch('')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.clearButtonText}>
                    Clear Search
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            // Safely retrieve the store name from the joined query
            const storeName = item?.stores?.name || item?.store_name || 'Store Partner';

            return (
              <TouchableOpacity
                style={styles.productCard}
                activeOpacity={0.92}
                onPress={() =>
                  navigation.navigate('ProductDetails', {
                    product: item,
                  })
                }
              >
                <View style={styles.imageWrap}>
                  {item.image_url ? (
                    <Image
                      source={{ uri: item.image_url }}
                      style={styles.cardImg}
                    />
                  ) : (
                    <View style={styles.fallbackImg}>
                      <Ionicons
                        name="fast-food-outline"
                        size={34}
                        color="#CBD5E1"
                      />
                    </View>
                  )}

                  <View style={styles.imageShade} />

                  <View style={styles.badge}>
                    <Text
                      style={styles.badgeText}
                      numberOfLines={1}
                    >
                      {item.category || 'Special'}
                    </Text>
                  </View>

                  <View style={styles.popularBadge}>
                    <Ionicons
                      name="star"
                      size={10}
                      color="#FFFFFF"
                    />
                    <Text style={styles.popularBadgeText}>
                      Popular
                    </Text>
                  </View>
                </View>

                <View style={styles.cardInfo}>
                  <Text
                    style={styles.itemName}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>

                  {/* ✨ NEW: Store Name Display */}
                  <View style={styles.storeNameRow}>
                    <Ionicons name="storefront-outline" size={10} color="#9CA3AF" />
                    <Text style={styles.storeNameText} numberOfLines={1}>
                      {storeName}
                    </Text>
                  </View>

                  {item.item_description ? (
                    <Text
                      style={styles.itemDesc}
                      numberOfLines={2}
                    >
                      {item.item_description}
                    </Text>
                  ) : (
                    <Text
                      style={styles.itemDescPlaceholder}
                      numberOfLines={1}
                    >
                      Delicious and freshly prepared
                    </Text>
                  )}

                  <View style={styles.bottomRow}>
                    <View style={styles.priceSection}>
                     
                      <Text style={styles.itemPrice}>
                        ₱{item.price}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.addBtn}
                      onPress={() =>
                        addToCart && addToCart(item, 1)
                      }
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="add"
                        size={19}
                        color="#FFFFFF"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAF8',
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F0',
  },

  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F1F5F3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  headerTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.3,
  },

  headerSubtitle: {
    fontSize: 11,
    color: '#8A9690',
    marginTop: 2,
    fontWeight: '500',
  },

  headerSpacer: {
    width: 42,
  },

  /* Search */
  searchSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F0',
  },

  searchBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F6F4',
    borderRadius: 14,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: '#E9EFEB',
  },

  searchIconContainer: {
    width: 35,
    height: 35,
    borderRadius: 11,
    backgroundColor: '#E4F7EE',
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    marginLeft: 8,
    fontSize: 13.5,
    color: '#111827',
    paddingVertical: 0,
  },

  clearSearch: {
    width: 35,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },

  categoryList: {
    paddingTop: 11,
    paddingRight: 8,
    gap: 8,
  },

  chip: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: '#F1F4F2',
    borderWidth: 1,
    borderColor: '#E8EDE9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  chipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },

  chipIcon: {
    marginRight: 4,
  },

  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#52605A',
  },

  chipTextActive: {
    color: '#FFFFFF',
  },

  /* Results */
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 17,
    paddingBottom: 10,
  },

  resultsTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#17201B',
  },

  resultsSubtitle: {
    fontSize: 11,
    color: '#87928C',
    marginTop: 2,
  },

  resultsIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#E8F8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Grid */
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 35,
  },

  columnWrapper: {
    justifyContent: 'space-between',
  },

  productCard: {
    width: '48.2%',
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E9EEEB',

    shadowColor: '#0F3D2E',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  imageWrap: {
    height: 138,
    width: '100%',
    position: 'relative',
    backgroundColor: '#F1F4F2',
  },

  cardImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  fallbackImg: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F1F4F2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  imageShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 42,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },

  badge: {
    position: 'absolute',
    top: 9,
    left: 9,
    maxWidth: '62%',
    backgroundColor: 'rgba(17,24,39,0.72)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },

  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  popularBadge: {
    position: 'absolute',
    right: 9,
    top: 9,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
  },

  popularBadgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '800',
    marginLeft: 3,
  },

  cardInfo: {
    padding: 11,
    paddingBottom: 12,
  },

  itemName: {
    fontSize: 14,
    fontWeight: '850',
    color: '#17201B',
    lineHeight: 18,
    minHeight: 22,
  },

  /* NEW STORE ROW STYLES */
  storeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },

  storeNameText: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 3,
    flex: 1,
  },

  itemDesc: {
    fontSize: 10.5,
    color: '#7A8580',
    lineHeight: 15,
    marginTop: 3,
    minHeight: 30,
  },

  itemDescPlaceholder: {
    fontSize: 10.5,
    color: '#A3ADA7',
    lineHeight: 15,
    marginTop: 3,
    minHeight: 30,
  },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 8,
  },

  priceSection: {
    flex: 1,
    minWidth: 0,
  },

  priceLabel: {
    fontSize: 9,
    color: '#9AA39E',
    fontWeight: '600',
    marginBottom: 1,
  },

  itemPrice: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
  },

  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#059669',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },

  /* Loading */
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },

  loadingCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#E8F8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    fontSize: 12,
    color: '#7A8580',
    marginTop: 12,
    fontWeight: '600',
  },

  /* Empty */
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 35,
    paddingTop: 75,
  },

  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: '#E8F8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#17201B',
  },

  emptyDescription: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 19,
    color: '#7A8580',
    marginTop: 6,
  },

  clearButton: {
    marginTop: 17,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: '#059669',
  },

  clearButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});