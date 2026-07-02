import React, { useEffect, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getToken, removeToken } from './services/api';

import LoginScreen from './screens/LoginScreen';
import SalesmanDashboard from './screens/SalesmanDashboard';
import AdminDashboard from './screens/AdminDashboard';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();
export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [initialParams, setInitialParams] = useState({});

  useEffect(() => {
    checkToken();
  }, []);

  useEffect(() => {
  const sub = Notifications.addNotificationResponseReceivedListener(() => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('SalesmanDashboard');
    }
  });
  return () => sub.remove();
}, []);

  const checkToken = async () => {
    try {
      const token = await getToken();
      if (!token) {
        setInitialRoute('Login');
        return;
      }
      const parts = token.split('.');
      if (parts.length !== 3) {
        await removeToken();
        setInitialRoute('Login');
        return;
      }
      const payload = JSON.parse(atob(parts[1]));
      // If token is expired, clear it and go to login
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        await removeToken();
        setInitialRoute('Login');
        return;
      }
      if (payload.role === 'admin') {
        setInitialRoute('AdminDashboard');
      } else {
        setInitialRoute('SalesmanDashboard');
        setInitialParams({ name: payload.name });
      }
    } catch {
      await removeToken();
      setInitialRoute('Login');
    }
  };

  if (!initialRoute) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F5F7' }}>
          <ActivityIndicator size="large" color="#C0392B" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen
            name="SalesmanDashboard"
            component={SalesmanDashboard}
            initialParams={initialParams}
          />
          <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
