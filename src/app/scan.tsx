import { useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { colors, fontSize, spacing } from '@/lib/constants';
import { relayClient } from '@/lib/websocket';
import { useConnectionStore } from '@/stores/connection';

const STORAGE_KEY_URL = 'relay-url';
const STORAGE_KEY_TOKEN = 'relay-token';

interface QRPayload {
  url: string;
  token: string;
}

function isValidPayload(data: unknown): data is QRPayload {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as QRPayload).url === 'string' &&
    typeof (data as QRPayload).token === 'string' &&
    (data as QRPayload).url.length > 0 &&
    (data as QRPayload).token.length > 0
  );
}

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);
  const { setRelayUrl, setToken } = useConnectionStore();
  const [processing, setProcessing] = useState(false);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setProcessing(true);

    try {
      const parsed: unknown = JSON.parse(data);
      if (!isValidPayload(parsed)) {
        Alert.alert('Invalid QR Code', 'The QR code does not contain valid pairing data.');
        scannedRef.current = false;
        setProcessing(false);
        return;
      }

      Vibration.vibrate();

      // Save to SecureStore
      await SecureStore.setItemAsync(STORAGE_KEY_URL, parsed.url);
      await SecureStore.setItemAsync(STORAGE_KEY_TOKEN, parsed.token);

      // Update Zustand store
      setRelayUrl(parsed.url);
      setToken(parsed.token);

      // Reconnect
      relayClient.disconnect();
      relayClient.connect(parsed.url, parsed.token);

      // Register device metadata with relay
      const httpUrl = parsed.url
        .replace('ws://', 'http://')
        .replace('wss://', 'https://')
        .replace('/ws', '');

      fetch(`${httpUrl}/devices/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${parsed.token}`,
        },
        body: JSON.stringify({
          deviceName: Device.deviceName ?? Device.modelName ?? undefined,
          platform: Platform.OS,
          appVersion: Constants.expoConfig?.version ?? undefined,
        }),
      }).catch((err) => console.warn('[scan] Failed to register device metadata:', err));

      Alert.alert('Paired!', 'Successfully connected to your bridge.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Invalid QR Code', 'Could not parse QR code data.');
      scannedRef.current = false;
      setProcessing(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Loading camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Camera access is needed to scan QR codes for pairing.</Text>
        <Pressable
          style={({ pressed }) => [styles.permissionButton, pressed && styles.buttonPressed]}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scannedRef.current ? undefined : handleBarcodeScanned}
      >
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.hint}>
            {processing ? 'Connecting...' : 'Point at the QR code shown in your bridge terminal'}
          </Text>
        </View>
      </CameraView>

      <Pressable
        style={({ pressed }) => [styles.closeButton, pressed && styles.buttonPressed]}
        onPress={() => router.back()}
      >
        <Text style={styles.closeButtonText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 16,
  },
  hint: {
    color: colors.text,
    fontSize: fontSize.md,
    marginTop: spacing.xl,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  message: {
    color: colors.text,
    fontSize: fontSize.lg,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  permissionButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  permissionButtonText: {
    color: '#ffffff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
});
