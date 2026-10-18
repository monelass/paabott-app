import React from 'react';
import { TouchableOpacity, Text, TextInput, View, StyleSheet, ActivityIndicator } from 'react-native';

export const Button = ({ title, onPress, variant = 'primary', loading, disabled, style }) => {
  const isOutline = variant === 'outline';
  return (
    <TouchableOpacity
      style={[
        styles.button,
        isOutline ? styles.btnOutline : styles.btnPrimary,
        disabled && styles.btnDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={isOutline ? '#059669' : '#FFFFFF'} />
      ) : (
        <Text style={[styles.btnText, isOutline ? styles.textOutline : styles.textPrimary]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

export const Input = ({ label, value, onChangeText, placeholder, multiline }) => (
  <View style={styles.inputWrap}>
    {label && <Text style={styles.label}>{label}</Text>}
    <TextInput
      style={[styles.input, multiline && styles.multilineInput]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      multiline={multiline}
    />
  </View>
);

export const Card = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  btnOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  textPrimary: { color: '#FFFFFF' },
  textOutline: { color: '#059669' },
  inputWrap: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#111827',
  },
  multilineInput: {
    height: 70,
    textAlignVertical: 'top',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
});