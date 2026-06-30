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

export const startTracking = async () => {
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
      notificationTitle: 'Al Sahal Tracker',
      notificationBody: 'Your location is being tracked',
      notificationColor: '#1a73e8',
    },
  });

  await updateTrackingStatus(true);
  return true;
};

export const stopTracking = async () => {
  try {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    await updateTrackingStatus(false);
  } catch (e) {
    console.log('Stop tracking error:', e.message);
  }
};

export const isTracking = async () => {
  return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
};