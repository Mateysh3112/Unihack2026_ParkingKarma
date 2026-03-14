import * as Location from 'expo-location';

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentLocation(): Promise<Location.LocationObject | null> {
  try {
    return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  } catch {
    return null;
  }
}

export async function watchLocation(
  callback: (location: Location.LocationObject) => void,
): Promise<Location.LocationSubscription> {
  return Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, distanceInterval: 10 },
    callback,
  );
}
