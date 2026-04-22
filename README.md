# vision-camera-smart-scan

Drop-in barcode scanning upgrade for [react-native-vision-camera](https://github.com/mrousavy/react-native-vision-camera). Takes scan success rate from **~60% to 90%+** with zero native code changes.

## The Problem

Default `useCodeScanner` in react-native-vision-camera works, but in real-world conditions &mdash; dim grocery stores, angled barcodes, small cosmetic labels, iPhone 14 Pro+ close-focus issues &mdash; success rate drops to ~60%. Users have to carefully align barcodes and hold perfectly still.

Every production barcode app rebuilds the same camera pipeline fixes from scratch. This package bundles them into a single hook.

## What It Does

| Technique | What it solves |
|-----------|---------------|
| **Multi-camera device selection** | iPhone 14 Pro+ can't focus closer than ~20cm on the main lens. Multi-cam enables automatic ultra-wide fallback for close shots. |
| **Temporal fusion** | Requires the same barcode across N consecutive frames before accepting. Eliminates phantom reads from partially-decoded frames. |
| **Region of interest** | Restricts detection to the center of the frame. Kills adjacent-barcode misreads and speeds up decode. |
| **Low-light boost** | Enables platform-native low-light enhancement. Essential for fluorescent-lit store aisles. |
| **Smart zoom** | Starts at `device.neutralZoom` so multi-cam devices begin on the wide-angle lens, not ultra-wide. |
| **Haptic feedback** | Configurable haptic tap on confirmed scan. Light impact feels instant vs. heavy notification vibration. |

## Install

```bash
npm install vision-camera-smart-scan react-native-vision-camera

# Optional: haptic feedback
npm install expo-haptics
```

## Quick Start

```tsx
import { Camera } from 'react-native-vision-camera';
import { useSmartScan } from 'vision-camera-smart-scan';

function Scanner() {
  const { device, cameraProps, cameraRef, codeScanner } = useSmartScan({
    onScan: (value) => {
      console.log('Scanned:', value);
    },
  });

  if (!device) return <Text>No camera available</Text>;

  return (
    <Camera
      ref={cameraRef}
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={true}
      {...cameraProps}
      codeScanner={codeScanner}
    />
  );
}
```

## Full Example

```tsx
import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Camera } from 'react-native-vision-camera';
import { useFocusEffect } from 'expo-router';
import { useSmartScan } from 'vision-camera-smart-scan';

function BarcodeScanner() {
  const [isActive, setIsActive] = useState(true);
  const [lastBarcode, setLastBarcode] = useState<string | null>(null);

  const { device, cameraProps, cameraRef, codeScanner, reset } = useSmartScan({
    onScan: (value) => {
      setIsActive(false);
      setLastBarcode(value);
    },
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'qr'],
    confirmFrames: 2,
    cooldownMs: 2000,
    scanRegion: 'center',
    haptic: 'light',
  });

  // Reset when screen regains focus
  useFocusEffect(
    useCallback(() => {
      setIsActive(true);
      reset();
    }, [reset])
  );

  function dismiss() {
    setLastBarcode(null);
    setIsActive(true);
    reset();
  }

  if (!device) return <Text>No camera available</Text>;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        {...cameraProps}
        codeScanner={codeScanner}
      />
      {lastBarcode && (
        <Pressable style={styles.result} onPress={dismiss}>
          <Text style={styles.barcode}>{lastBarcode}</Text>
          <Text style={styles.hint}>Tap to scan again</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  result: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  barcode: { color: '#fff', fontSize: 20, fontWeight: '600' },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 4 },
});
```

## API

### `useSmartScan(options)`

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `onScan` | `(value: string, code: Code) => void` | **required** | Called when a barcode is confirmed |
| `codeTypes` | `CodeType[]` | `['ean-13', 'ean-8', 'upc-a', 'upc-e']` | Barcode symbologies to detect |
| `confirmFrames` | `number` | `2` | Consecutive matching frames required |
| `cooldownMs` | `number` | `2000` | Minimum ms between accepted scans |
| `scanRegion` | `'center' \| 'narrow' \| 'wide' \| 'full' \| Region` | `'center'` | Detection area (iOS only) |
| `haptic` | `'light' \| 'medium' \| 'heavy' \| 'none'` | `'light'` | Haptic feedback style |
| `lowLightBoost` | `boolean` | `true` | Enable low-light enhancement |
| `smartZoom` | `boolean` | `true` | Start at optimal zoom level |
| `enableZoomGesture` | `boolean` | `true` | Enable native pinch-to-zoom |
| `tapToFocus` | `boolean` | `true` | Tap a point to focus there |
| `physicalDevices` | `PhysicalCameraDeviceType[]` | `['ultra-wide-angle-camera', 'wide-angle-camera', 'telephoto-camera']` | Camera lens preference |

#### Region Presets

| Preset | Area | Best for |
|--------|------|----------|
| `'center'` | 80% x 40% centered | General barcode scanning |
| `'narrow'` | 70% x 30% centered | Dense shelves, adjacent products |
| `'wide'` | 90% x 60% centered | Large labels, QR codes |
| `'full'` | Entire frame | No restriction |

#### Returns

| Property | Type | Description |
|----------|------|-------------|
| `device` | `CameraDevice \| undefined` | Selected camera device (multi-cam optimized) |
| `cameraProps` | `{ zoom?, lowLightBoost?, enableZoomGesture?, onTouchEnd? }` | Spread onto `<Camera>` |
| `cameraRef` | `RefObject<Camera>` | Pass as `ref` to `<Camera>` (required for tap-to-focus) |
| `codeScanner` | `CodeScanner` | Pass to Camera's `codeScanner` prop |
| `reset()` | `() => void` | Reset temporal fusion state |

## How It Works

### Multi-Camera Device Selection

On iPhones with multiple back cameras (11+), the hook requests a multi-camera device. This lets iOS automatically switch between lenses based on subject distance. The **iPhone 14 Pro and later** have a minimum focus distance of ~20cm on the main (wide-angle) lens. Without multi-cam, barcodes held closer than 20cm simply won't focus. With multi-cam enabled, the system falls back to the ultra-wide camera which can focus at ~2cm.

### Temporal Fusion

Instead of accepting the first decoded barcode, `useSmartScan` requires the same value across N consecutive `onCodeScanned` callbacks (default: 2). This eliminates:

- Phantom reads from partially-visible barcodes at frame edges
- Transient misreads when the camera is in motion
- Incorrect decodes from damaged or low-contrast labels

The overhead is one extra frame (~33ms at 30fps). Unnoticeable to the user, but eliminates the #1 source of wrong-product lookups.

### Region of Interest

The `center` preset restricts barcode detection to the middle 80% x 40% of the camera frame. Benefits:

- Adjacent products on a grocery shelf won't trigger false scans
- The decoder processes less of each frame, improving throughput
- Users intuitively point the center of their phone at the barcode anyway

`regionOfInterest` is iOS-only in react-native-vision-camera v4. On Android, the full frame is always scanned.

## Requirements

- `react-native-vision-camera` v4.0+
- React Native 0.73+
- React 18+
- `expo-haptics` (optional, for haptic feedback)

## Tested In Production

This package powers barcode scanning in [Melu](https://heymelu.com), a food safety scanner app used by parents to check products at the grocery store. The techniques were developed and validated through real-world testing across hundreds of products in varying lighting conditions.

## License

MIT &copy; [Aashish Takkala](https://github.com/aashishtak)
