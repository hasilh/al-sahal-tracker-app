import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { pingLocation, updateTrackingStatus } from './api';

const LOCATION_TASK = 'background-location-task';

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  if (data) {
    const { locations } = data;
    const { latitude, longitude } = locations[0].coords;
    try {
      await pingLocation(latitude, longitude);
    } catch (e) {
      console.log('Ping failed:', e.message);
    }
  }
});

export const startTracking = async (vehicle, start_km) => {
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return false;

  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  if (bg !== 'granted') return false;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 60000,
    distanceInterval: 50,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Al Sahal · Work Started',
      notificationBody: 'Your work day is currently active',
      notificationColor: '#C0392B',
    },
  });

  await updateTrackingStatus(true, { vehicle, start_km });
  return true;
};

export const stopTracking = async (vehicle, start_km, end_km) => {
  try {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    await updateTrackingStatus(false, { vehicle, start_km, end_km });
  } catch (e) {
    console.log('Stop tracking error:', e.message);
  }
};

export const isTracking = async () => {
  return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
};