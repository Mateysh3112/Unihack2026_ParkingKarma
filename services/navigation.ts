import { Linking, Platform, Alert } from 'react-native';

export const openGoogleMapsNavigation = async (
  lat: number,
  lng: number,
  label?: string
): Promise<void> => {
  // Try Google Maps first, fall back to Apple Maps on iOS
  const googleMapsUrl = Platform.select({
    ios: `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`,
    android: `google.navigation:q=${lat},${lng}&mode=d`,
  });

  const googleMapsWebUrl =
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

  const appleMapsUrl = `maps://?daddr=${lat},${lng}`;

  try {
    if (googleMapsUrl) {
      const canOpenGoogleMaps = await Linking.canOpenURL(googleMapsUrl);
      if (canOpenGoogleMaps) {
        await Linking.openURL(googleMapsUrl);
        return;
      }
    }

    // Fallback to Apple Maps on iOS
    if (Platform.OS === 'ios') {
      const canOpenAppleMaps = await Linking.canOpenURL(appleMapsUrl);
      if (canOpenAppleMaps) {
        await Linking.openURL(appleMapsUrl);
        return;
      }
    }

    // Final fallback — open Google Maps in browser
    await Linking.openURL(googleMapsWebUrl);

  } catch (error) {
    console.error('Navigation error:', error);
    Alert.alert(
      'Navigation Error',
      'Could not open maps. Please try again.',
      [{ text: 'OK' }]
    );
  }
};

export const getDirectionsUrl = (lat: number, lng: number): string => {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
};
