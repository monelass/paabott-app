import React, { createContext, useState, useContext } from 'react';
import { Alert } from 'react-native';

const CartContext = createContext(null);

export const CartProvider = ({ children }) => {
  // Store Cart Items
  const [cartItems, setCartItems] = useState([]);
  
  // Custom Errand/Delivery Requests
  const [customRequests, setCustomRequests] = useState([]);

  /* ========================================================================
     STORE CART METHODS (Multi-Store Supported)
     ======================================================================== */
  const addToCart = (product, quantity = 1) => {
    if (!product || !product.id) return false;

    const itemStoreId = product.store_id || product.storeId || product.vendor_id;
    const itemStoreName = product.store_name || product.storeName || product.merchant_name || 'Store Partner';

    if (!itemStoreId) {
      Alert.alert('Invalid Item', 'This item does not have a valid Store ID attached.');
      return false;
    }

    setCartItems((prevItems) => {
      const existingIndex = prevItems.findIndex((item) => item && item.id === product.id);

      if (existingIndex > -1) {
        const updated = [...prevItems];
        // Ensure accurate number addition
        const currentQty = Number(updated[existingIndex].quantity) || 1;
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: currentQty + Number(quantity),
        };
        return updated;
      } else {
        return [
          ...prevItems, 
          { 
            ...product, 
            store_id: itemStoreId, 
            store_name: itemStoreName, 
            quantity: Number(quantity) || 1 
          }
        ];
      }
    });

    return true;
  };

  // 👈 Bulletproof Quantity Update Handler
  const updateQuantity = (productId, amount) => {
    if (!productId) return;
    setCartItems((prevItems) => {
      return prevItems
        .map((item) => {
          if (item && item.id === productId) {
            const currentQty = Number(item.quantity) || 1;
            const newQty = currentQty + Number(amount);
            // If new quantity drops below 1, filter it out (remove item)
            if (newQty <= 0) return null;
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter(Boolean);
    });
  };

  const removeFromCart = (productId) => {
    if (!productId) return;
    setCartItems((prevItems) => prevItems.filter((item) => item && item.id !== productId));
  };

  const clearCart = () => setCartItems([]);

  const getCartTotal = () => {
    return cartItems
      .reduce((sum, item) => sum + (parseFloat(item?.price) || 0) * (Number(item?.quantity) || 1), 0)
      .toFixed(2);
  };

  const getCartCount = () => {
    return cartItems.reduce((sum, item) => sum + (Number(item?.quantity) || 1), 0);
  };

  /* ========================================================================
     CUSTOM REQUESTS METHODS
     ======================================================================== */
  const addCustomRequest = (request) => {
    if (!request) return false;
    setCustomRequests((prev) => [...prev, request]);
    return true;
  };

  const removeCustomRequest = (requestId) => {
    if (!requestId) return;
    setCustomRequests((prev) => prev.filter((item) => item && item.id !== requestId));
  };

  const clearCustomRequests = () => setCustomRequests([]);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        getCartTotal,
        getCartCount,
        customRequests,
        addCustomRequest,
        removeCustomRequest,
        clearCustomRequests,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

// Safe Context Hook
export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    console.warn('⚠️ useCart was called outside of <CartProvider>. Returning fallback defaults.');
    return {
      cartItems: [],
      addToCart: () => {},
      updateQuantity: () => {},
      removeFromCart: () => {},
      clearCart: () => {},
      getCartTotal: () => '0.00',
      getCartCount: () => 0,
      customRequests: [],
      addCustomRequest: () => {},
      removeCustomRequest: () => {},
      clearCustomRequests: () => {},
    };
  }
  return context;
};