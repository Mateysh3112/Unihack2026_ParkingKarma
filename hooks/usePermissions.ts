import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';

export interface PermissionsState {
  location: boolean | null;
  sensors: boolean | null;
  allGranted: boolean;
}

export function usePermissions(): PermissionsState {
  const [location, setLocation] = useState<boolean | null>(null);
  const [sensors, setSensors] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocation(status === 'granted');
    })();

    (async () => {
      const { status } = await Accelerometer.requestPermissionsAsync();
      setSensors(status === 'granted');
    })();
  }, []);

  return { location, sensors, allGranted: location === true && sensors === true };
}
