import { useRef, useMemo, useCallback } from 'react';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import type {
  CameraDevice,
  PhysicalCameraDeviceType,
  CodeType,
  Code,
} from 'react-native-vision-camera';
import type { GestureResponderEvent } from 'react-native';

let Haptics: any = null;
try {
  Haptics = require('expo-haptics');
} catch {}

const REGION_PRESETS = {
  center: { x: 0.1, y: 0.3, width: 0.8, height: 0.4 },
  narrow: { x: 0.15, y: 0.35, width: 0.7, height: 0.3 },
  wide: { x: 0.05, y: 0.2, width: 0.9, height: 0.6 },
} as const;

type RegionPreset = keyof typeof REGION_PRESETS;

export type ScanRegion =
  | RegionPreset
  | 'full'
  | { x: number; y: number; width: number; height: number };

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'none';

export interface SmartScanOptions {
  /** Called when a barcode is confirmed (passed temporal fusion + dedup). */
  onScan: (value: string, code: Code) => void;

  /** Barcode types to detect. @default ['ean-13','ean-8','upc-a','upc-e'] */
  codeTypes?: CodeType[];

  /** Consecutive matching frames required before accepting. @default 2 */
  confirmFrames?: number;

  /** Cooldown between accepted scans in ms. @default 2000 */
  cooldownMs?: number;

  /** Restrict scanning to a region of the frame (iOS only). @default 'center' */
  scanRegion?: ScanRegion;

  /** Haptic feedback on confirmed scan. Requires expo-haptics. @default 'light' */
  haptic?: HapticStyle;

  /** Enable low-light boost when the device supports it. @default true */
  lowLightBoost?: boolean;

  /** Start at device.neutralZoom for optimal wide-angle framing. @default true */
  smartZoom?: boolean;

  /** Enable native pinch-to-zoom gesture. @default true */
  enableZoomGesture?: boolean;

  /** Enable tap-to-focus. User taps a point on screen and the camera focuses there. @default true */
  tapToFocus?: boolean;

  /** Physical camera preference for multi-cam device selection. @default ['ultra-wide-angle-camera','wide-angle-camera','telephoto-camera'] */
  physicalDevices?: PhysicalCameraDeviceType[];
}

export interface SmartScanResult {
  /** The selected camera device, or undefined if unavailable. */
  device: CameraDevice | undefined;

  /** Spread these onto the <Camera> component. */
  cameraProps: {
    zoom?: number;
    lowLightBoost?: boolean;
    enableZoomGesture?: boolean;
    onTouchEnd?: (e: GestureResponderEvent) => void;
  };

  /** Ref to pass to the <Camera> component. Required for tap-to-focus. */
  cameraRef: React.RefObject<Camera | null>;

  /** Pass to Camera's codeScanner prop. */
  codeScanner: ReturnType<typeof useCodeScanner>;

  /** Reset temporal fusion state. Call when re-enabling scanning after dismissing a result. */
  reset: () => void;
}

export function useSmartScan(options: SmartScanOptions): SmartScanResult {
  const {
    onScan,
    codeTypes = ['ean-13', 'ean-8', 'upc-a', 'upc-e'],
    confirmFrames = 2,
    cooldownMs = 2000,
    scanRegion = 'center',
    haptic = 'light',
    lowLightBoost: enableLowLight = true,
    smartZoom = true,
    enableZoomGesture = true,
    tapToFocus = true,
    physicalDevices = [
      'ultra-wide-angle-camera',
      'wide-angle-camera',
      'telephoto-camera',
    ],
  } = options;

  const device = useCameraDevice('back', { physicalDevices });
  const cameraRef = useRef<Camera>(null);

  const pendingCodeRef = useRef<string | null>(null);
  const pendingCountRef = useRef(0);
  const lastScanRef = useRef(0);

  const reset = useCallback(() => {
    pendingCodeRef.current = null;
    pendingCountRef.current = 0;
  }, []);

  const regionOfInterest = useMemo(() => {
    if (scanRegion === 'full') return undefined;
    if (typeof scanRegion === 'string')
      return REGION_PRESETS[scanRegion as RegionPreset];
    return scanRegion;
  }, [scanRegion]);

  const triggerHaptic = useCallback(
    (style: HapticStyle) => {
      if (style === 'none' || !Haptics) return;
      const map: Record<string, number> = {
        light: Haptics.ImpactFeedbackStyle.Light,
        medium: Haptics.ImpactFeedbackStyle.Medium,
        heavy: Haptics.ImpactFeedbackStyle.Heavy,
      };
      Haptics.impactAsync(map[style]);
    },
    [],
  );

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const codeScanner = useCodeScanner({
    codeTypes,
    regionOfInterest,
    onCodeScanned: (codes: Code[]) => {
      if (codes.length === 0) return;
      const now = Date.now();
      if (now - lastScanRef.current < cooldownMs) return;

      const rawValue = codes[0].value;
      if (!rawValue) return;

      if (pendingCodeRef.current === rawValue) {
        pendingCountRef.current += 1;
      } else {
        pendingCodeRef.current = rawValue;
        pendingCountRef.current = 1;
      }
      if (pendingCountRef.current < confirmFrames) return;

      pendingCodeRef.current = null;
      pendingCountRef.current = 0;
      lastScanRef.current = now;
      triggerHaptic(haptic);
      onScanRef.current(rawValue, codes[0]);
    },
  });

  const handleTouchToFocus = useCallback(
    (e: GestureResponderEvent) => {
      if (!tapToFocus || !cameraRef.current || !device?.supportsFocus) return;
      cameraRef.current
        .focus({
          x: e.nativeEvent.locationX,
          y: e.nativeEvent.locationY,
        })
        .catch(() => {});
    },
    [tapToFocus, device],
  );

  const cameraProps = useMemo(
    () => ({
      zoom: smartZoom && device ? device.neutralZoom : undefined,
      lowLightBoost:
        enableLowLight && device?.supportsLowLightBoost ? true : undefined,
      enableZoomGesture: enableZoomGesture || undefined,
      onTouchEnd: tapToFocus ? handleTouchToFocus : undefined,
    }),
    [smartZoom, enableLowLight, enableZoomGesture, tapToFocus, handleTouchToFocus, device],
  );

  return { device, cameraProps, cameraRef, codeScanner, reset };
}
