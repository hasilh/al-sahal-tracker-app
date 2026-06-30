import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, StatusBar
} from 'react-native';
import { signin, saveToken } from '../services/api';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) return Alert.alert('Error', 'Please fill all fields');
    setLoading(true);
    try {
      const data = await signin(email, password);
      await saveToken(data.token);
      if (data.role === 'admin') {
        navigation.replace('AdminDashboard');
      } else {
        navigation.replace('SalesmanDashboard', { name: data.name });
      }
    } catch (err) {
      Alert.alert('Sign in failed', err.response?.data?.error || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F5F7" />

      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>AS</Text>
          </View>
          <Text style={styles.brandName}>Al Sahal</Text>
          <Text style={styles.brandTag}>Al Sahal Printing Press · Sales Tracker</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <View style={styles.inputWrap}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@alsahal.com"
              placeholderTextColor="#BBC4CE"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.inputWrap}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#BBC4CE"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && { opacity: 0.7 }]}
            onPress={handleSignIn}
            disabled={loading}
            activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Sign In</Text>}
          </TouchableOpacity>

          <Text style={styles.footer}>
            Access is granted by your admin only
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const C = {
  red: '#C0392B', redLight: '#FADBD8', navy: '#2C3E50',
  bg: '#F4F5F7', white: '#FFFFFF',
  t1: '#1A252F', t2: '#5D6D7E', t3: '#AAB7C4',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoBox: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: C.red,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  logoText: { color: '#fff', fontSize: 26, fontWeight: '900' },
  brandName: { fontSize: 26, fontWeight: '900', color: C.red, letterSpacing: 0.5 },
  brandTag: { fontSize: 12, color: C.t2, marginTop: 4, letterSpacing: 0.2 },
  card: {
    backgroundColor: C.white, borderRadius: 20,
    padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 12, elevation: 4,
  },
  inputWrap: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: C.t2, marginBottom: 6, letterSpacing: 0.3 },
  input: {
    height: 48, backgroundColor: '#F4F5F7', borderRadius: 12,
    paddingHorizontal: 14, fontSize: 14, color: C.t1,
    borderWidth: 1, borderColor: '#E8EAED',
  },
  btn: {
    height: 52, backgroundColor: C.red, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  footer: { textAlign: 'center', color: C.t3, marginTop: 18, fontSize: 12 },
});